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
const { NOTE_FONTS } = require( "#legend" );

const VERSION_HEADING = /^Версия\s+(\d+\.\d+\.\d+)/;

/**
 * Reads the "Change Notes" sheet: version headings in order, each note categorised by its font colour.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{versions: import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
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
            current = { version: heading[ 1 ], notes: [], source: source };
            versions.push( current );
            continue;
        }
        if ( !current ) {
            anomalies.push( createAnomaly( "notes-before-version", source ) );
            continue;
        }
        const category = cell.fontColour && Object.hasOwn( NOTE_FONTS, cell.fontColour ) ? NOTE_FONTS[ cell.fontColour ] : CHANGE_CATEGORY.NON_BREAKING;
        current.notes.push( { category: category, text: cell.text, source: source } );
    }
    return { versions: versions, anomalies: anomalies };
};
