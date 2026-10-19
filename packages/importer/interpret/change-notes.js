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
const { cellAt } = require( "#raw" );
const { DEFAULT_NOTE_FONTS, NOTE_FONTS, matchLegend } = require( "#legend" );

// Lenient on purpose: a newest heading typed "версия 1.2" or "Version 1.2.0" used to be filed as a note, leaving the
// workbook at its previous version with no anomaly (final review). It is read, and a warning says it was not in form.
const VERSION_HEADING = /^(?:версия|version)\s*:?\s*v?(\d+(?:\.\d+){0,2})(?![\d.])/iu;
const CANONICAL_HEADING = /^Версия \d+\.\d+\.\d+/u;

const normalise = ( version ) => {
    const parts = version.split( "." );
    while ( parts.length < 3 ) {
        parts.push( "0" );
    }
    return parts.join( "." );
};

const compareVersions = ( a, b ) => {
    const left = a.split( "." ).map( Number );
    const right = b.split( "." ).map( Number );
    for ( let index = 0; index < 3; index++ ) {
        if ( left[ index ] !== right[ index ] ) {
            return left[ index ] - right[ index ];
        }
    }
    return 0;
};

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
 * workbook's version — the highest heading, not merely the last.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{versions: import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion[], latest: import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion|null, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readChangeNotes = ( sheet ) => {
    const anomalies = [];
    const versions = [];
    let current = null;
    for ( const row of sheet.rows ) {
        const cell = cellAt( row, 1 );
        if ( !cell.text ) {
            continue;
        }
        const source = { sheet: sheet.name, row: row.number };
        const heading = VERSION_HEADING.exec( cell.text );
        if ( heading ) {
            current = { version: normalise( heading[ 1 ] ), notes: [], source: source };
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
