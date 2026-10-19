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
 * The anomaly catalogue (design record §5.3). Every anomaly the importer can raise is declared once, with its level,
 * so no code path can invent a level or forget one.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { ANOMALY_TYPES, createAnomaly, hasBlocking } = require( "@health-dev-portal/spec-model/anomalies" );

describe( "anomalies", () => {

    it( "creates an anomaly with its catalogue level and a rendered message", () => {
        const anomaly = createAnomaly( "duplicate-identity", { sheet: "P001", row: 40 }, { identity: "a@value", firstRow: 12, row: 40 } );
        assert.equal( anomaly.level, "blocking" );
        assert.equal( anomaly.type, "duplicate-identity" );
        assert.equal( anomaly.sheet, "P001" );
        assert.equal( anomaly.row, 40 );
        assert.equal( anomaly.column, null );
        assert.match( anomaly.message, /a@value/ );
        assert.match( anomaly.message, /12/ );
        assert.ok( Object.isFrozen( anomaly ) && Object.isFrozen( anomaly.details ) );
    } );

    it( "leaves an unfilled placeholder visible rather than printing undefined", () => {
        assert.match( createAnomaly( "invalid-requirement" ).message, /\{value\}/ );
    } );

    it( "refuses an unknown type", () => {
        assert.throws( () => createAnomaly( "no-such-thing" ), TypeError );
    } );

    it( "declares a valid level for every type", () => {
        for ( const [ type, definition ] of Object.entries( ANOMALY_TYPES ) ) {
            assert.ok( [ "blocking", "warning" ].includes( definition.level ), type );
            assert.equal( typeof definition.text, "string", type );
        }
    } );

    it( "tells whether any anomaly blocks", () => {
        assert.equal( hasBlocking( [] ), false );
        assert.equal( hasBlocking( [ createAnomaly( "unknown-fill", {}, { colour: "ABCDEF" } ) ] ), false );
        assert.equal( hasBlocking( [ createAnomaly( "missing-tag" ) ] ), true );
    } );
} );
