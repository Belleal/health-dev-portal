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
 * Checks every workbook kind makes the same way: sheet names that collide once trimmed, and the workbook's version.
 */

const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );

const FILE_VERSION = /v(\d+\.\d+\.\d+)/i;

/**
 * Reports sheet names that differ only in surrounding spaces. Sheets are matched by trimmed name, so "P002" beside a
 * stale "P002 " is ambiguous: whichever came first would be read, silently (final review of plan 1).
 *
 * @method
 * @param {string[]} names Every sheet name in the workbook, as written.
 * @returns {import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}
 * @public
 */
module.exports.ambiguousSheets = ( names ) => {
    const byName = new Map();
    for ( const name of names ) {
        const trimmed = name.trim();
        byName.set( trimmed, [ ...( byName.get( trimmed ) || [] ), name ] );
    }
    return [ ...byName.values() ].filter( ( group ) => group.length > 1 )
        .map( ( group ) => createAnomaly( "ambiguous-sheet", {}, { sheets: group.map( ( name ) => JSON.stringify( name ) ).join( ", " ) } ) );
};

/**
 * Takes the workbook's version from its change notes — the highest heading — and checks it against the version the
 * file name gives, when it gives one.
 *
 * @method
 * @param {{latest: import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion|null}} notes `readChangeNotes`'s result.
 * @param {string|null} notesSheetName The change-notes sheet's name, or `null` when the workbook has none.
 * @param {string} [fileName]
 * @returns {{version: string|null, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.workbookVersion = ( notes, notesSheetName, fileName ) => {
    const anomalies = [];
    const latest = notes.latest;
    if ( !latest ) {
        anomalies.push( createAnomaly( "missing-version", notesSheetName ? { sheet: notesSheetName } : {} ) );
    }
    const fileVersion = FILE_VERSION.exec( fileName || "" );
    if ( latest && fileVersion && fileVersion[ 1 ] !== latest.version ) {
        anomalies.push( createAnomaly( "version-mismatch", {}, { fileVersion: fileVersion[ 1 ], version: latest.version } ) );
    }
    return { version: latest ? latest.version : null, anomalies: anomalies };
};
