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
 * Structural validation of a message tree (design record §5.3): the checks that need the whole tree rather than one
 * row.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { validateMessageTree } = require( "@health-dev-portal/spec-model/validation" );

const node = ( overrides = {} ) => ( {
    identity: "contents/x@value",
    kind: "field",
    name: { bg: null, en: "X" },
    requirement: "R",
    cardinality: { min: 1, max: 1 },
    conditions: [],
    children: [],
    source: { sheet: "P001", row: 5 },
    ...overrides
} );

const types = ( anomalies ) => anomalies.map( ( anomaly ) => anomaly.type );

describe( "validateMessageTree", () => {

    it( "accepts a sound tree", () => {
        const tree = [ node( { identity: "contents", kind: "group", children: [ node() ] } ) ];
        assert.deepEqual( validateMessageTree( tree ), [] );
    } );

    it( "blocks two elements with one identity, naming both rows", () => {
        const tree = [ node( { identity: "contents", kind: "group", children: [
            node( { source: { sheet: "P001", row: 5 } } ),
            node( { source: { sheet: "P001", row: 9 } } )
        ] } ) ];
        const [ anomaly ] = validateMessageTree( tree );
        assert.equal( anomaly.type, "duplicate-identity" );
        assert.equal( anomaly.level, "blocking" );
        assert.equal( anomaly.details.firstRow, 5 );
        assert.equal( anomaly.row, 9 );
    } );

    it( "blocks a cardinality whose minimum exceeds its maximum", () => {
        assert.deepEqual( types( validateMessageTree( [ node( { cardinality: { min: 2, max: 1 } } ) ] ) ), [ "invalid-cardinality-range" ] );
    } );

    it( "warns about a conditional element that names no condition", () => {
        assert.deepEqual( types( validateMessageTree( [ node( { requirement: "C", cardinality: { min: 0, max: 1 } } ) ] ) ),
            [ "conditional-without-condition" ] );
        assert.deepEqual( validateMessageTree( [ node( { requirement: "C", cardinality: { min: 0, max: 1 }, conditions: [ "CDP01" ] } ) ] ), [] );
    } );

    it( "warns about a required element whose cardinality allows none", () => {
        assert.deepEqual( types( validateMessageTree( [ node( { cardinality: { min: 0, max: 1 } } ) ] ) ), [ "required-with-zero-minimum" ] );
    } );

    it( "warns about an empty group and a polymorphic element with fewer than two variants", () => {
        const tree = [
            node( { identity: "g", kind: "group" } ),
            node( { identity: "p@value", kind: "polymorphic", children: [ node( { identity: "p@value#1" } ) ] } )
        ];
        assert.deepEqual( types( validateMessageTree( tree ) ), [ "empty-group", "single-variant" ] );
    } );

    it( "skips checks that need a value the row did not have", () => {
        assert.deepEqual( validateMessageTree( [ node( { identity: null, cardinality: null } ) ] ), [] );
    } );
} );
