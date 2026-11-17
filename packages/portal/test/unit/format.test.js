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
 * A moment as a reader expects it (plan 8c, decision 6; design record §7.12): in Sofia time, whatever the server's own
 * zone, on both sides of a clock change.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { formatDateTime } = require( "#format" );

describe( "Moments", () => {

    it( "shows times in Sofia time across the clock change", () => {
        // Summer time, UTC+3, until 04:00 on 25 October 2026; then UTC+2.
        assert.equal( formatDateTime( "2026-10-24T23:30:00Z", "bg" ), "25.10.2026 02:30" );
        assert.equal( formatDateTime( "2026-10-25T01:30:00Z", "bg" ), "25.10.2026 03:30" );
        assert.equal( formatDateTime( new Date( "2026-11-20T20:00:00Z" ), "bg" ), "20.11.2026 22:00" );
    } );

    it( "writes English as en-GB's date and a 24-hour time", () => {
        assert.equal( formatDateTime( "2026-11-20T20:00:00Z", "en" ), "20 Nov 2026, 22:00" );
        assert.equal( formatDateTime( "2026-12-31T22:30:00Z", "en" ), "1 Jan 2027, 00:30" );
    } );

    it( "refuses a moment that is none, and a language the site does not have", () => {
        assert.throws( () => formatDateTime( "yesterday", "bg" ), RangeError );
        assert.throws( () => formatDateTime( "2026-11-20T20:00:00Z", "fr" ), RangeError );
    } );
} );
