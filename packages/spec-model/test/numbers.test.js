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
 * A version's number (design record §7.2): proposed as the spec's highest raised by one, and accepted only above every
 * number the spec has used, a retired one's included.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { acceptsNumber, compareNumbers, proposeNumber } = require( "@health-dev-portal/spec-model/numbers" );

describe( "numbers", () => {

    it( "compares dotted numbers part by part as whole numbers", () => {
        assert.ok( compareNumbers( "1.5.10", "1.5.9" ) > 0 );
        assert.ok( compareNumbers( "1.5", "1.5.1" ) < 0 );
        assert.equal( compareNumbers( "1.5.1", "1.5.1" ), 0 );
    } );

    it( "proposes the highest number with its last part raised, and accepts only a higher one", () => {
        assert.equal( proposeNumber( [ "1.5.1", "1.6.0", "1.5.10" ] ), "1.6.1" );
        assert.equal( proposeNumber( [] ), "1.0.0" );
        assert.deepEqual( [ "1.7.0", "1.6.1", "1.6.0", "1.5.11", "1.7", "v1.7.0" ].map( ( number ) => acceptsNumber( number, [ "1.5.1", "1.6.0" ] ) ),
            [ true, true, false, false, true, false ] );
    } );
} );
