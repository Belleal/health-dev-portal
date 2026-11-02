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
 * A code list's key type (design record §4.6): the XSDs type a coded value by it, so a wrong `integer` would make a
 * generated XSD refuse a valid code.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { keyTypeOf } = require( "@health-dev-portal/spec-model/key-type" );
const { KEY_TYPE } = require( "@health-dev-portal/spec-model/kinds" );

describe( "keyTypeOf", () => {

    it( "types whole numbers without a leading zero as integer", () => {
        assert.equal( keyTypeOf( [ "1", "2", "10", "0" ] ), KEY_TYPE.INTEGER );
        assert.equal( keyTypeOf( [ "11210200" ] ), KEY_TYPE.INTEGER );
        assert.equal( keyTypeOf( [ "2147483647" ] ), KEY_TYPE.INTEGER );
    } );

    it( "types anything else as string, an empty list included", () => {
        for ( const keys of [ [ "01" ], [ "1", "T1" ], [ "01.01" ], [ "1.5" ], [ "2147483648" ], [ "-1" ], [ " 1" ], [] ] ) {
            assert.equal( keyTypeOf( keys ), KEY_TYPE.STRING, JSON.stringify( keys ) );
        }
    } );
} );
