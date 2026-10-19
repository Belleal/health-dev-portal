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

const ExcelJS = require( "exceljs" );
const { EMPTY_CELL } = require( "#raw" );
const { parseThemeColours, resolveColour } = require( "#colours" );

/**
 * @typedef {Object} RawCell
 * @property {string} text The value as trimmed text; a formula's cached result, never evaluated.
 * @property {string|null} fill Six hex digits of a pattern fill, or `null`.
 * @property {string|null} fontColour
 * @property {number} indent
 */

/**
 * @typedef {Object} RawRow
 * @property {number} number The Excel row number.
 * @property {RawCell[]} cells Index 0 is column A.
 */

/**
 * @typedef {Object} RawSheet
 * @property {string} name
 * @property {string|null} tabColour
 * @property {RawRow[]} rows Only rows with values.
 */

/**
 * @typedef {Object} RawWorkbook
 * @property {RawSheet[]} sheets
 * @property {Object<string, string>} themeColours
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

function toRawCell( cell, themeColours ) {
    const patterned = cell.fill && cell.fill.type === "pattern" && cell.fill.pattern !== "none";
    return Object.freeze( {
        text: cellText( cell.value ),
        fill: patterned ? resolveColour( cell.fill.fgColor, themeColours ) : null,
        fontColour: cell.font && cell.font.color ? resolveColour( cell.font.color, themeColours ) : null,
        indent: cell.alignment && Number.isInteger( cell.alignment.indent ) ? cell.alignment.indent : 0
    } );
}

function toRawSheet( worksheet, themeColours ) {
    const rows = [];
    worksheet.eachRow( { includeEmpty: false }, ( row, number ) => {
        const cells = [];
        row.eachCell( { includeEmpty: true }, ( cell, column ) => {
            cells[ column - 1 ] = toRawCell( cell, themeColours );
        } );
        rows.push( Object.freeze( { number: number, cells: Object.freeze( Array.from( cells, ( cell ) => cell || EMPTY_CELL ) ) } ) );
    } );
    return Object.freeze( {
        name: worksheet.name,
        tabColour: resolveColour( worksheet.properties.tabColor, themeColours ),
        rows: Object.freeze( rows )
    } );
}

/**
 * Reads a workbook into raw sheets: values as text plus the formatting that carries meaning in the specification
 * template (design record §5.1, §5.7).
 *
 * @method
 * @param {string|Buffer} source A file path or the file's bytes.
 * @returns {Promise<RawWorkbook>}
 * @throws {Error} When the file cannot be read as a workbook.
 * @public
 */
module.exports.readWorkbook = async ( source ) => {
    const workbook = new ExcelJS.Workbook();
    if ( Buffer.isBuffer( source ) ) {
        await workbook.xlsx.load( source );
    } else {
        await workbook.xlsx.readFile( source );
    }
    // exceljs keeps the theme part only as raw XML on this field; it is the only way theme-indexed colours resolve.
    const themeColours = Object.freeze( parseThemeColours( workbook._themes && workbook._themes.theme1 ) );
    return Object.freeze( {
        sheets: Object.freeze( workbook.worksheets.map( ( worksheet ) => toRawSheet( worksheet, themeColours ) ) ),
        themeColours: themeColours
    } );
};
