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
 * The text report a person reads after an import: blocking first, then by sheet, row and column, with Excel cell
 * references.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { cellReference, formatReport } = require( "#report" );

const version = { spec: "e-prescription", version: "1.5.1", messages: [ {}, {} ] };

describe( "report", () => {

    it( "writes Excel cell references", () => {
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001", row: 16, column: 1 } ) ), "P001!A16" );
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001", row: 16, column: 27 } ) ), "P001!AA16" );
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001", row: 16 } ) ), "P001 row 16" );
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001" } ) ), "P001" );
        assert.equal( cellReference( createAnomaly( "missing-version" ) ), "(workbook)" );
    } );

    it( "summarises, lists anomalies by position, and says the import was accepted", () => {
        const report = formatReport( { version: version, anomalies: [
            createAnomaly( "mixed-script-word", { sheet: "P001", row: 16, column: 1 }, { word: "Е-prescription" } ),
            createAnomaly( "look-alike-letter", { sheet: "P001", row: 3, column: 2 }, { value: "О", letters: "О U+041E", folded: "O" } )
        ] } ).split( "\n" );
        assert.equal( report[ 0 ], "e-prescription 1.5.1: 2 messages, 0 blocking, 2 warnings" );
        assert.equal( report[ 1 ], "By type: look-alike-letter 1, mixed-script-word 1" );
        assert.match( report[ 2 ], /^\[warning\] P001!B3 look-alike-letter: / );
        assert.match( report[ 3 ], /^\[warning\] P001!A16 mixed-script-word: / );
        assert.equal( report[ 4 ], "Import accepted." );
    } );

    it( "puts blocking anomalies first and says the import was refused", () => {
        const report = formatReport( { version: { ...version, version: null }, anomalies: [
            createAnomaly( "unknown-fill", { sheet: "P001", row: 2 }, { colour: "123456" } ),
            createAnomaly( "missing-version" )
        ] } ).split( "\n" );
        assert.equal( report[ 0 ], "e-prescription (version unknown): 2 messages, 1 blocking, 1 warnings" );
        assert.equal( report[ 1 ], "By type: missing-version 1, unknown-fill 1" );
        assert.match( report[ 2 ], /^\[blocking\] \(workbook\) missing-version/ );
        assert.match( report[ report.length - 1 ], /^Import refused/ );
    } );

    it( "summarises a nomenclatures and a rules import by what they hold", () => {
        const lists = { kind: "nomenclatures", spec: "nomenclatures", version: "1.5.33", codeLists: [ { entries: [ {}, {} ] }, { entries: [] } ] };
        assert.equal( formatReport( { version: lists, anomalies: [] } ).split( "\n" )[ 0 ], "nomenclatures 1.5.33: 2 code lists, 2 entries, 0 blocking, 0 warnings" );
        const rules = { kind: "rules", spec: "rules", version: "1.1.1", rules: [ {} ] };
        assert.equal( formatReport( { version: rules, anomalies: [] } ).split( "\n" )[ 0 ], "rules 1.1.1: 1 rules, 0 blocking, 0 warnings" );
    } );

    it( "tallies anomalies by type, blocking types first", () => {
        const anomalies = [ createAnomaly( "mixed-script-word", {}, { word: "x" } ), createAnomaly( "look-alike-letter", {}, {} ),
            createAnomaly( "look-alike-letter", {}, {} ), createAnomaly( "duplicate-key", {}, {} ) ];
        const lines = formatReport( { version: { kind: "rules", spec: "rules", version: "1.1.1", rules: [] }, anomalies } ).split( "\n" );
        assert.equal( lines[ 1 ], "By type: duplicate-key 1, look-alike-letter 2, mixed-script-word 1" );
    } );
} );
