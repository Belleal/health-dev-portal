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
 * The business-rules sheet (design record §4.6.1): each rule's status is its ID cell's fill.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readRulesSheet } = require( "#rules-sheet" );
const { row, sheet } = require( "./support/raw-builders" );

describe( "readRulesSheet", () => {

    const rules = ( ...rows ) => sheet( "Rules", [ row( 1, [ "ЗАБЕЛЕЖКА: Ако валидацията на което и да е правило е неуспешна…" ] ),
        row( 3, [ "Rule ID", "Definition", "Source", "Error Code", "Since" ] ), ...rows ] );
    const green = { fill: "70AD47" };

    it( "reads rules below a header that is not on row 1, lines and all", () => {
        const { rules: read, anomalies } = readRulesSheet( rules( row( 4, [ "RL001", "Идентификаторът ще бъде проверен:\n1. за тип 1 (ЕГН)", "---", "E002", "v1.0.0" ], green ) ) );
        assert.deepEqual( anomalies, [] );
        assert.deepEqual( read, [ { id: "RL001", definition: { bg: "Идентификаторът ще бъде проверен:\n1. за тип 1 (ЕГН)", en: null }, sourceText: null,
            errorCode: "E002", since: "1.0.0", lifecycle: "active", changedInVersion: false, source: { sheet: "Rules", row: 4 } } ] );
    } );

    it( "reads each rule's status from its ID cell's fill", () => {
        const { rules: read, anomalies } = readRulesSheet( rules(
            row( 4, [ "RL092", "В случай, че прегледа…", "---", "E002", "v1.1.0" ], { fill: "FFC000" } ),
            row( 5, [ "RL019", "", "---", "E002", "v1.0.1" ], { fill: "C00000" } ),
            row( 6, [ "RL098", "Ново правило", "---", "E002", "v1.1.1" ] ) ) );
        assert.deepEqual( read.map( ( rule ) => [ rule.id, rule.lifecycle, rule.changedInVersion ] ),
            [ [ "RL092", "active", true ], [ "RL019", "withdrawn", true ], [ "RL098", null, null ] ] );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.id, anomaly.details.colour ] ), [ [ "unknown-rule-colour", "RL098", "none" ] ] );
    } );

    it( "warns about an active rule without a definition, and folds a Cyrillic Е in an error code", () => {
        const { rules: read, anomalies } = readRulesSheet( rules( row( 4, [ "RL096", "", "", "", "" ], green ), row( 5, [ "RL033", "Текст", "---", "Е002", "v1.0.2" ], green ) ) );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.row, anomaly.column ] ), [ [ "rule-without-definition", 4, null ], [ "look-alike-letter", 5, 4 ] ] );
        assert.deepEqual( [ read[ 0 ].since, read[ 0 ].errorCode, read[ 1 ].errorCode ], [ null, null, "E002" ] );
    } );

    it( "blocks a malformed and a repeated rule ID, and a sheet without its required columns", () => {
        const { rules: read, anomalies } = readRulesSheet( rules( row( 4, [ "R001", "x" ], green ), row( 5, [ "RL001", "x" ], green ), row( 6, [ "RL001", "y" ], green ) ) );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level ] ), [ [ "malformed-rule-id", "blocking" ], [ "duplicate-rule", "blocking" ] ] );
        assert.deepEqual( read.map( ( rule ) => rule.definition.bg ), [ "x" ] );
        assert.deepEqual( readRulesSheet( sheet( "Rules", [ row( 1, [ "Rule ID", "Text" ] ) ] ) ).anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.column ] ),
            [ [ "missing-column", "Definition" ] ] );
    } );
} );
