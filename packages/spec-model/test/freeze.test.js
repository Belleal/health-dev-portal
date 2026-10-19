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
 * deepFreeze: an imported model is handed to several consumers and must not change under any of them.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );

describe( "deepFreeze", () => {

    it( "freezes nested objects and arrays", () => {
        const value = deepFreeze( { a: { b: [ { c: 1 } ] } } );
        assert.ok( Object.isFrozen( value.a.b[ 0 ] ) );
        assert.throws( () => {
            "use strict";
            value.a.b.push( 2 );
        }, TypeError );
    } );

    it( "freezes children of an object that was already frozen shallowly", () => {
        const inner = { x: 1 };
        const outer = Object.freeze( { inner: inner } );
        deepFreeze( outer );
        assert.ok( Object.isFrozen( inner ) );
    } );

    it( "survives a cycle and passes primitives through", () => {
        const a = { };
        a.self = a;
        assert.equal( deepFreeze( a ), a );
        assert.equal( deepFreeze( 3 ), 3 );
        assert.equal( deepFreeze( null ), null );
    } );
} );
