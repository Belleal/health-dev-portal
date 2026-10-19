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
 * Element identities (design record §4.3). The importer, version comparison and changelog generation all key on these
 * strings, so their exact shape is pinned here.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { isValidPart, joinPath, withAttribute, withVariant } = require( "@health-dev-portal/spec-model/identity" );

describe( "identity", () => {

    it( "joins tags into a path", () => {
        assert.equal( joinPath( "", "header" ), "header" );
        assert.equal( joinPath( "contents/prescription", "lrn" ), "contents/prescription/lrn" );
    } );

    it( "adds an attribute to a path", () => {
        assert.equal( withAttribute( "contents/prescription/lrn", "value" ), "contents/prescription/lrn@value" );
        assert.equal( withAttribute( "contents/prescription/group/medication/medicationCode", "name" ),
            "contents/prescription/group/medication/medicationCode@name" );
    } );

    it( "numbers polymorphic variants from 1", () => {
        assert.equal( withVariant( "a/doseQuantityCode@value", 2 ), "a/doseQuantityCode@value#2" );
    } );

    it( "refuses parts that would make two identities print alike", () => {
        for ( const bad of [ "", "a/b", "a@b", "a#b", "a b", null, 7 ] ) {
            assert.equal( isValidPart( bad ), false, JSON.stringify( bad ) );
            assert.throws( () => joinPath( "x", bad ), TypeError );
        }
        assert.throws( () => withAttribute( "", "value" ), TypeError );
        assert.throws( () => withAttribute( "x", "a b" ), TypeError );
        assert.throws( () => withVariant( "x@value", 0 ), TypeError );
        assert.throws( () => withVariant( "x@value", 1.5 ), TypeError );
        assert.equal( isValidPart( "medicationCode" ), true );
    } );
} );
