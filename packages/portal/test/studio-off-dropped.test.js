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
 * The studio with its one listed method dropped (plan 9a, spec §3, "No sign-in method, no staff area"): `openid-azure`
 * listed with no client ID, which the framework removes as it starts, leaves no sign-in method in effect, and so no
 * studio. A file of its own: core allows one service instance per process, and the framework reads the methods as the
 * server is constructed, so studio-off.test.js cannot start a second portal with another list.
 */

const { after, before, describe, it, mock } = require( "node:test" );
const assert = require( "node:assert/strict" );
// First: it sets the environment ti-engine reads as it loads.
const { SEEDED, get, startPortal } = require( "./support/server" );
const logger = require( "@ti-engine/core/logger" );

const NOT_FOUND = /<h1>(Страницата не е намерена|Page not found)<\/h1>/;
const NOTICE = "The studio is off: no sign-in method is in effect (TI_WEB_AUTH_METHODS).";

describe( "The studio with its one listed method dropped", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    let log;
    before( async () => {
        log = mock.method( logger, "log" );
        // Removed, so that a client ID in the shell cannot keep the method in effect.
        portal = await startPortal( { environment: { TI_WEB_AUTH_METHODS: "openid-azure", TI_AZURE_AUTH_CLIENT_ID: undefined } } );
    } );
    after( async () => {
        log.mock.restore();
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "a listed method the framework drops leaves the studio off too", async () => {
        for ( const path of [ "/studio/", "/login/openid-azure", "/me" ] ) {
            const response = await get( path );
            assert.deepEqual( [ response.status, response.headers.get( "location" ), response.headers.get( "set-cookie" ) ], [ 404, null, null ], path );
            assert.match( response.text, NOT_FOUND, path );
        }
        assert.equal( log.mock.calls.filter( ( call ) => call.arguments[ 0 ] === NOTICE ).length, 1 );
    } );
} );
