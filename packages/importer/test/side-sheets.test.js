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
 * Side sheets: conditions are kept as written (plan 3 parses them); the dictionary is read as is.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readConditions, readDictionary } = require( "#side-sheets" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

const named = ( name ) => moduleSheets().find( ( candidate ) => candidate.name === name );

describe( "side sheets", () => {

    it( "joins each condition's lines and keeps where it starts", () => {
        const result = readConditions( named( "Conditions" ) );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.conditions.map( ( condition ) => condition.id ), [ "CDP01", "CDP19", "CDP21", "CDP29" ] );
        assert.equal( result.conditions[ 0 ].text, [
            "IF 'prescription.category'.value = 'T2' OR 'T3'",
            "THEN 'prescription.isProtocolBased'.required = 'R'",
            "ELSE 'prescription.isProtocolBased'.required = 'O'"
        ].join( "\n" ) );
        assert.deepEqual( result.conditions[ 0 ].source, { sheet: "Conditions", row: 3 } );
    } );

    it( "warns about an empty condition", () => {
        // CDP09 and CDP36 of e-Prescription 1.5.1 are empty (HEL-5).
        const result = readConditions( sheet( "Conditions", [ row( 1, [ "Condition ID", "Condition Logic" ] ), row( 3, [ "CDP09" ] ) ] ) );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "empty-condition" ] );
        assert.equal( result.conditions[ 0 ].text, "" );
    } );

    it( "blocks a condition ID used twice, keeping the first", () => {
        // CodeRabbit on #4: a copied block left one ID pointing at two texts, and nothing said which one applies.
        const result = readConditions( sheet( "Conditions", [
            row( 1, [ "Condition ID", "Condition Logic" ] ),
            row( 3, [ "CDP01", "IF 'a'.value = '1'" ] ),
            row( 5, [ "CDP01", "IF 'b'.value = '2'" ] ),
            row( 6, [ null, "THEN 'b'.required = 'R'" ] )
        ] ) );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "duplicate-condition" ] );
        assert.equal( result.anomalies[ 0 ].level, "blocking" );
        assert.deepEqual( result.anomalies[ 0 ].details, { id: "CDP01", firstRow: 3, row: 5 } );
        assert.deepEqual( result.conditions.map( ( condition ) => condition.text ), [ "IF 'a'.value = '1'" ] );
    } );

    it( "reads the dictionary", () => {
        const result = readDictionary( named( "Dictionary" ) );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.entries[ 0 ], {
            abbreviation: "PMI",
            name: { bg: null, en: "Personal Medical Identifier" },
            description: { bg: "УИН на лекар", en: null },
            source: { sheet: "Dictionary", row: 2 }
        } );
    } );

    it( "blocks a side sheet without its header", () => {
        assert.deepEqual( readConditions( sheet( "Conditions", [ row( 1, [ "x" ] ) ] ) ).anomalies.map( ( anomaly ) => anomaly.type ), [ "missing-header-row" ] );
        assert.deepEqual( readDictionary( sheet( "Dictionary", [ row( 1, [ "x" ] ) ] ) ).anomalies.map( ( anomaly ) => anomaly.type ), [ "missing-header-row" ] );
    } );
} );
