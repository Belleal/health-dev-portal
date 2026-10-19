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
        assert.match( report[ 1 ], /^\[warning\] P001!B3 look-alike-letter: / );
        assert.match( report[ 2 ], /^\[warning\] P001!A16 mixed-script-word: / );
        assert.equal( report[ 3 ], "Import accepted." );
    } );

    it( "puts blocking anomalies first and says the import was refused", () => {
        const report = formatReport( { version: { ...version, version: null }, anomalies: [
            createAnomaly( "unknown-fill", { sheet: "P001", row: 2 }, { colour: "123456" } ),
            createAnomaly( "missing-version" )
        ] } ).split( "\n" );
        assert.equal( report[ 0 ], "e-prescription (version unknown): 2 messages, 1 blocking, 1 warnings" );
        assert.match( report[ 1 ], /^\[blocking\] \(workbook\) missing-version/ );
        assert.match( report[ report.length - 1 ], /^Import refused/ );
    } );
} );
