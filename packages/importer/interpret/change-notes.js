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
const { CHANGE_CATEGORY } = require( "@health-dev-portal/spec-model/kinds" );
const { cellAt, findRow } = require( "#raw" );
const { compareVersions } = require( "#cells" );
const { DEFAULT_NOTE_FONTS, NOTE_FONTS, matchLegend } = require( "#legend" );

// Lenient on purpose: a newest heading typed "версия 1.2" or "Version 1.2.0" used to be filed as a note, leaving the
// workbook at its previous version with no anomaly (final review). It is read, and a warning says it was not in form.
// The lookahead refuses only a further numeric part, so "Версия 1.5.1." still reads while "1.2.3.4" does not
// (CodeRabbit on #4).
const VERSION_HEADING = /^(?:версия|version)\s*:?\s*v?(\d+(?:\.\d+){0,2})(?!\.?\d)/iu;
const CANONICAL_HEADING = /^Версия \d+\.\d+\.\d+/u;

const normalise = ( version ) => {
    const parts = version.split( "." );
    while ( parts.length < 3 ) {
        parts.push( "0" );
    }
    return parts.join( "." );
};

// The nomenclatures workbook heads its sheet "Версия / промени | Дата на тестова | Дата на прод"; read as a note, that
// header was a notes-before-version warning on every import. Only columns after A count, so a note that happens to
// begin "Дата на тест…" is not taken for the header.
const STAGING_TITLE = /^дата на тест/iu;
const PRODUCTION_TITLE = /^дата на прод/iu;

function dateColumns( sheet ) {
    const titled = ( pattern ) => ( row ) => row.cells.findIndex( ( cell, index ) => index > 0 && pattern.test( cell.text ) ) + 1;
    const header = findRow( sheet, ( row ) => titled( STAGING_TITLE )( row ) > 0 || titled( PRODUCTION_TITLE )( row ) > 0 );
    if ( !header ) {
        return { header: null, staging: null, production: null };
    }
    return { header: header, staging: titled( STAGING_TITLE )( header ) || null, production: titled( PRODUCTION_TITLE )( header ) || null };
}

const DOTTED_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A date is round-tripped through Date.UTC, so 31.02.2026 is refused rather than read as 3 March.
function isoDate( text ) {
    const dotted = DOTTED_DATE.exec( text );
    const iso = ISO_DATE.exec( text );
    const parts = dotted ? [ dotted[ 3 ], dotted[ 2 ], dotted[ 1 ] ] : iso ? [ iso[ 1 ], iso[ 2 ], iso[ 3 ] ] : null;
    if ( !parts ) {
        return null;
    }
    const [ year, month, day ] = parts.map( Number );
    const date = new Date( Date.UTC( year, month - 1, day ) );
    if ( date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ) {
        return null;
    }
    return date.toISOString().slice( 0, 10 );
}

function readDate( row, column, sheet, anomalies ) {
    const text = column ? cellAt( row, column ).text : "";
    if ( !text ) {
        return null;
    }
    const date = isoDate( text );
    if ( !date ) {
        anomalies.push( createAnomaly( "invalid-date", { sheet: sheet.name, row: row.number, column: column }, { value: text } ) );
    }
    return date;
}

function categoryOf( cell, source, anomalies ) {
    const category = matchLegend( cell.fontColour, NOTE_FONTS );
    if ( category ) {
        return category;
    }
    // A colour outside the legend may be a breaking change painted in a near shade; it must not pass as non-breaking
    // without a word.
    if ( cell.fontColour && !matchLegend( cell.fontColour, DEFAULT_NOTE_FONTS ) ) {
        anomalies.push( createAnomaly( "unknown-note-colour", source, { colour: cell.fontColour } ) );
    }
    return CHANGE_CATEGORY.NON_BREAKING;
}

/**
 * Reads the "Change Notes" sheet: version headings in order, each note categorised by its font colour, and the
 * workbook's version — the highest heading, not merely the last. Where the sheet has a header row with date columns
 * (the nomenclatures workbook does), each heading also carries its staging and production dates.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{versions: import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion[], latest: import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion|null, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readChangeNotes = ( sheet ) => {
    const anomalies = [];
    const versions = [];
    const dates = dateColumns( sheet );
    let current = null;
    for ( const row of sheet.rows ) {
        const cell = cellAt( row, 1 );
        if ( !cell.text || row === dates.header ) {
            continue;
        }
        const source = { sheet: sheet.name, row: row.number };
        const heading = VERSION_HEADING.exec( cell.text );
        if ( heading ) {
            current = {
                version: normalise( heading[ 1 ] ),
                stagingDate: readDate( row, dates.staging, sheet, anomalies ),
                productionDate: readDate( row, dates.production, sheet, anomalies ),
                notes: [],
                source: source
            };
            if ( !CANONICAL_HEADING.test( cell.text ) ) {
                anomalies.push( createAnomaly( "non-canonical-version-heading", source, { text: cell.text, version: current.version } ) );
            }
            versions.push( current );
            continue;
        }
        if ( !current ) {
            anomalies.push( createAnomaly( "notes-before-version", source ) );
            continue;
        }
        current.notes.push( { category: categoryOf( cell, source, anomalies ), text: cell.text, source: source } );
    }

    let latest = null;
    let disorder = null;
    versions.forEach( ( entry, index ) => {
        if ( index > 0 && !disorder && compareVersions( entry.version, versions[ index - 1 ].version ) <= 0 ) {
            disorder = { entry: entry, previous: versions[ index - 1 ] };
        }
        if ( !latest || compareVersions( entry.version, latest.version ) > 0 ) {
            latest = entry;
        }
    } );
    if ( disorder ) {
        anomalies.push( createAnomaly( "versions-out-of-order", disorder.entry.source,
            { version: disorder.entry.version, previous: disorder.previous.version, latest: latest.version } ) );
    }
    return { versions: versions, latest: latest, anomalies: anomalies };
};
