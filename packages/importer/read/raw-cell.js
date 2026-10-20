/*
 * health-dev-portal — the developer portal of the Bulgarian National Health Information System (НЗИС).
 * Copyright © 2026 the health-dev-portal contributors
 *
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent
 * versions of the EUPL (the "Licence"); you may not use this work except in compliance with the Licence.
 * You may obtain a copy of the Licence at:
 *
 *     https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed
 * on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the Licence for the specific language governing permissions and limitations under the Licence.
 *
 * SPDX-License-Identifier: EUPL-1.2
 */

/*
 * Turning exceljs cells and rows into raw cells and rows. Both readers use it — the full reader for module and rules
 * workbooks, the streaming reader for nomenclatures — so the pure stages see the same shape whichever read the file.
 */

const ExcelJS = require( "exceljs" );
const { EMPTY_CELL } = require( "#raw" );
const { UNRESOLVED, resolveColour } = require( "#colours" );

/**
 * Converts an exceljs cell value to trimmed text.
 *
 * @method
 * @param {*} value
 * @returns {string}
 * @public
 */
function cellText( value ) {
    if ( value === null || value === undefined ) {
        return "";
    }
    if ( typeof value === "string" ) {
        return value.replace( /\r\n?/g, "\n" ).trim();
    }
    if ( typeof value === "number" || typeof value === "boolean" ) {
        return String( value );
    }
    if ( value instanceof Date ) {
        return value.toISOString().slice( 0, 10 );
    }
    if ( Array.isArray( value.richText ) ) {
        return cellText( value.richText.map( ( part ) => part.text ).join( "" ) );
    }
    if ( "result" in value ) {
        // A formula: its cached result. Nothing in an uploaded workbook is ever evaluated.
        return cellText( value.result );
    }
    if ( "text" in value ) {
        return cellText( value.text );
    }
    return "";
}
module.exports.cellText = cellText;

/**
 * Resolves a colour to six hex digits. A colour that is set but cannot be resolved is marked, never read as no colour:
 * an indexed fill would otherwise turn a group row into a plain field without a word (final review).
 *
 * @method
 * @param {{argb?: string, theme?: number, tint?: number}|undefined} colour
 * @param {Object<string, string>} themeColours
 * @returns {string|null} `null` when no colour is set; `UNRESOLVED` when one is set but cannot be resolved.
 * @public
 */
const colourOf = ( colour, themeColours ) => ( colour ? resolveColour( colour, themeColours ) || UNRESOLVED : null );
module.exports.colourOf = colourOf;

function toRawCell( cell, themeColours ) {
    const patterned = cell.fill && cell.fill.type === "pattern" && cell.fill.pattern !== "none";
    // exceljs gives every cell a merge covers the first cell's value. Read that way, a note merged across a row became
    // an element with an invalid requirement, and a condition ID merged down its lines split it into several.
    const covered = cell.type === ExcelJS.ValueType.Merge && cell.master !== cell;
    return Object.freeze( {
        text: covered ? "" : cellText( cell.value ),
        fill: patterned ? colourOf( cell.fill.fgColor, themeColours ) : null,
        fontColour: cell.font ? colourOf( cell.font.color, themeColours ) : null,
        indent: cell.alignment && Number.isInteger( cell.alignment.indent ) ? cell.alignment.indent : 0
    } );
}

/**
 * Converts an exceljs row to a raw row: every cell from column A to the last one the row holds.
 *
 * @method
 * @param {Object} row An exceljs row, from either reader.
 * @param {Object<string, string>} themeColours
 * @returns {import( "#workbook-reader" ).RawRow}
 * @public
 */
module.exports.toRawRow = ( row, themeColours ) => {
    const cells = [];
    row.eachCell( { includeEmpty: true }, ( cell, column ) => {
        cells[ column - 1 ] = toRawCell( cell, themeColours );
    } );
    return Object.freeze( { number: row.number, cells: Object.freeze( Array.from( cells, ( cell ) => cell || EMPTY_CELL ) ) } );
};
