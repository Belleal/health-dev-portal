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

const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { cellAt, findRow } = require( "#raw" );
const { compareVersions, isNone, noneToNull, parseVersionCell } = require( "#cells" );
const { findMixedScriptWords, foldCode, foldLookAlikes } = require( "#scripts" );

// Each role's titles, in order of preference. Nomenclatures 1.5.33 has 63 header layouts; these titles cover them all
// (design record §4.6). Whatever a role does not take is a list-specific column — CL007's own "Description" beside its
// "Description BG" among them.
const ROLES = Object.freeze( {
    key: [ "Key" ],
    descriptionBg: [ "Description BG", "Description" ],
    descriptionEn: [ "Description EN", "Language EN" ],
    displayBg: [ "Display value BG", "Display Value (Bulgarian)" ],
    displayEn: [ "Display value EN", "Display Value (English)" ],
    since: [ "Since" ],
    validUntil: [ "Valid Until" ]
} );

const TITLE = /^CL[A-Z0-9]+\s*[-–]\s*(.*)$/u;
const CODE_VALUE = /^[\x21-\x7E]+$/;
const LISTED_ROWS = 10;

// "Display Value BG" and "Display value BG" are one title; so are titles that differ only in spacing.
const normaliseTitle = ( text ) => text.replace( /\s+/g, " " ).trim().toLowerCase();

function columnRoles( header ) {
    const titles = header.cells.map( ( cell ) => normaliseTitle( cell.text ) );
    const roles = {};
    const claimed = new Set();
    for ( const [ role, aliases ] of Object.entries( ROLES ) ) {
        for ( const alias of aliases ) {
            const index = titles.findIndex( ( title, at ) => title === normaliseTitle( alias ) && !claimed.has( at ) );
            if ( index >= 0 ) {
                roles[ role ] = index + 1;
                claimed.add( index );
                break;
            }
        }
    }
    const columns = header.cells.map( ( cell, index ) => ( { title: cell.text, column: index + 1 } ) )
        .filter( ( column ) => column.title && !claimed.has( column.column - 1 ) );
    return { roles: roles, columns: columns };
}

// A footnote typed into the Key column ("* За лекари, завършили…"), a placeholder ("...", "---") and the keyless second
// row of a merged key (CL006) are not entries: none of them is a key a message could carry.
const usableKey = ( text ) => !isNone( text ) && /[\p{L}\p{N}]/u.test( text ) && !/\s/u.test( text );

const listRows = ( rows ) => rows.slice( 0, LISTED_ROWS ).join( ", " ) + ( rows.length > LISTED_ROWS ? ", …" : "" );

function readVersion( row, column, at, anomalies ) {
    if ( !column ) {
        return null;
    }
    const value = cellAt( row, column ).text;
    const { version, form } = parseVersionCell( value );
    if ( form === "lenient" ) {
        anomalies.push( createAnomaly( "non-canonical-version", at( column ), { value: value, version: version } ) );
    } else if ( form === "date" ) {
        anomalies.push( createAnomaly( "date-instead-of-version", at( column ), { value: value } ) );
    } else if ( form === "invalid" ) {
        anomalies.push( createAnomaly( "invalid-version", at( column ), { value: value } ) );
    }
    return version;
}

// Plan 2, Decision 2: a list-specific column holds codes when every value in it, once folded, is printable ASCII
// without whitespace. CL024's "CL022 Mapping" (01-00А) must fold with CL022's keys or point at keys that no longer
// exist; CL127's "Risk Group definition" (b. Не) is text and stays as written.
function foldCodeColumns( sheet, columns, entries, anomalies ) {
    columns.forEach( ( column, index ) => {
        const values = entries.map( ( entry ) => entry.values[ index ] ).filter( ( value ) => value !== null );
        if ( values.length === 0 || !values.every( ( value ) => CODE_VALUE.test( foldLookAlikes( value ).folded ) ) ) {
            return;
        }
        for ( const entry of entries ) {
            if ( entry.values[ index ] !== null ) {
                entry.values[ index ] = foldCode( entry.values[ index ], { sheet: sheet.name, row: entry.source.row, column: column.column }, anomalies );
            }
        }
    } );
}

/**
 * Reads one code-list sheet of the nomenclatures workbook (design record §4.6): the name from its title row, the note
 * rows above the header, the list-specific columns, and every entry with a usable key. The list's status, flags and
 * remark come from the index sheet, so they are `null` here.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{codeList: import( "@health-dev-portal/spec-model/definitions" ).CodeList, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readCodeListSheet = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === "Key" );
    const above = sheet.rows.filter( ( row ) => !header || row.number < header.number );
    const titleRow = above.find( ( row ) => TITLE.test( cellAt( row, 1 ).text ) ) || null;
    const codeList = {
        id: sheet.name.trim(),
        name: { bg: titleRow ? TITLE.exec( cellAt( titleRow, 1 ).text )[ 1 ].trim() || null : null, en: null },
        status: null,
        dynamic: null,
        visibility: null,
        remark: null,
        notes: [],
        columns: [],
        entries: [],
        source: { sheet: sheet.name, row: header ? header.number : null }
    };
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { codeList: codeList, anomalies: anomalies };
    }
    // A note has text in column A alone; the column-group row ("Entity | … | Meta Data") has several cells.
    codeList.notes = above.filter( ( row ) => row !== titleRow && cellAt( row, 1 ).text && row.cells.filter( ( cell ) => cell.text ).length === 1 )
        .map( ( row ) => cellAt( row, 1 ).text );
    const { roles, columns } = columnRoles( header );
    codeList.columns = columns;

    const skipped = [];
    const firstRows = new Map();
    for ( const row of sheet.rows.filter( ( candidate ) => candidate.number > header.number ) ) {
        if ( row.cells.every( ( cell ) => !cell.text ) ) {
            continue;
        }
        const keyText = cellAt( row, 1 ).text;
        if ( !usableKey( keyText ) ) {
            skipped.push( row.number );
            continue;
        }
        const at = ( column ) => ( { sheet: sheet.name, row: row.number, column: column } );
        const key = foldCode( keyText, at( 1 ), anomalies );
        const repeated = firstRows.has( key );
        if ( repeated ) {
            anomalies.push( createAnomaly( "duplicate-key", { sheet: sheet.name, row: row.number }, { key: key, firstRow: firstRows.get( key ), row: row.number } ) );
        } else {
            firstRows.set( key, row.number );
        }
        const text = ( column ) => {
            const value = column ? noneToNull( cellAt( row, column ).text ) : null;
            for ( const word of value ? findMixedScriptWords( value ) : [] ) {
                anomalies.push( createAnomaly( "mixed-script-word", at( column ), { word: word } ) );
            }
            return value;
        };
        const entry = {
            key: key,
            description: { bg: text( roles.descriptionBg ), en: text( roles.descriptionEn ) },
            display: { bg: text( roles.displayBg ), en: text( roles.displayEn ) },
            values: columns.map( ( column ) => noneToNull( cellAt( row, column.column ).text ) ),
            since: readVersion( row, roles.since, at, anomalies ),
            validUntil: readVersion( row, roles.validUntil, at, anomalies ),
            source: { sheet: sheet.name, row: row.number }
        };
        if ( entry.since && entry.validUntil && compareVersions( entry.validUntil, entry.since ) < 0 ) {
            anomalies.push( createAnomaly( "valid-until-before-since", { sheet: sheet.name, row: row.number }, { since: entry.since, validUntil: entry.validUntil } ) );
        }
        // A repeat is checked like any row, so its own defects are reported, but the first entry under the key stands.
        if ( !repeated ) {
            codeList.entries.push( entry );
        }
    }
    foldCodeColumns( sheet, columns, codeList.entries, anomalies );
    if ( skipped.length ) {
        anomalies.push( createAnomaly( "skipped-rows", { sheet: sheet.name, row: skipped[ 0 ] }, { count: skipped.length, rows: listRows( skipped ) } ) );
    }
    return { codeList: codeList, anomalies: anomalies };
};
