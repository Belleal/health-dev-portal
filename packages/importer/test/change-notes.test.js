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
 * Change notes: versions in order, each note's category from its font colour (design record §5.1).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readChangeNotes } = require( "#change-notes" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

describe( "readChangeNotes", () => {

    it( "reads versions oldest first, with categorised notes", () => {
        const result = readChangeNotes( moduleSheets().find( ( candidate ) => candidate.name === "Change Notes" ) );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.versions.map( ( version ) => version.version ), [ "1.0.0", "1.1.0" ] );
        assert.deepEqual( result.versions[ 1 ].notes.map( ( note ) => note.category ), [ "breaking", "dropped-plan" ] );
        assert.equal( result.versions[ 0 ].notes[ 0 ].category, "non-breaking" );
        assert.deepEqual( result.versions[ 1 ].notes[ 0 ].source, { sheet: "Change Notes", row: 4 } );
    } );

    it( "treats black and theme-black notes as non-breaking", () => {
        const result = readChangeNotes( sheet( "Change Notes", [ row( 1, [ "Версия 2.0.0" ] ), row( 2, [ "Note" ], { fontColour: "000000" } ) ] ) );
        assert.equal( result.versions[ 0 ].notes[ 0 ].category, "non-breaking" );
    } );

    it( "warns about a note before any version heading", () => {
        const result = readChangeNotes( sheet( "Change Notes", [ row( 1, [ "Stray note" ] ), row( 2, [ "Версия 1.0.0" ] ) ] ) );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "notes-before-version" ] );
        assert.equal( result.versions.length, 1 );
    } );
} );
