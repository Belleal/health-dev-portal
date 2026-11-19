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
 * The studio's languages, against a real server on a copy of the seed (plan 9a, spec §3): both are offered at sign-in,
 * a visitor starts in Bulgarian, the choice of English holds, and a signed-in screen's labels are Bulgarian by default.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
// First: it sets the environment ti-engine reads as it loads.
const { SEEDED, startPortal } = require( "./support/server" );
const { signIn } = require( "./support/staff" );

describe( "The studio's languages", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    const ask = ( path, headers = {} ) => fetch( `${ portal.url }${ path }`, { redirect: "manual", headers: headers } );

    it( "offers Bulgarian and English on the sign-in screen", async () => {
        const screen = await ask( "/app/enter", { accept: "text/html", "hx-request": "true" } );
        const html = await screen.text();
        assert.match( html, /href="\/language\/bg"/ );
        assert.match( html, /href="\/language\/en"/ );
    } );

    it( "starts a visitor in Bulgarian, and keeps the choice of English", async () => {
        assert.match( await ( await ask( "/studio/" ) ).text(), /<html lang="bg"/ );
        const choice = await ask( "/language/en" );
        const cookie = choice.headers.getSetCookie().map( ( line ) => line.split( ";" )[ 0 ] ).join( "; " );
        assert.notEqual( cookie, "", "the choice is a cookie" );
        assert.match( await ( await ask( "/studio/", { cookie: cookie } ) ).text(), /<html lang="en"/ );
    } );

    it( "serves a signed-in screen's labels from the Bulgarian catalogue by default", async () => {
        const session = await signIn( portal.url, "nobody" );
        const headers = { accept: "application/json", cookie: session.cookie };
        const config = ( await ( await ask( "/app/config", headers ) ).json() ).data;
        const bundle = await ask( config.labelsBundle.url, headers );
        assert.equal( bundle.status, 200 );
        const labels = await bundle.json();
        const text = ( node, key ) => key.split( "." ).reduce( ( one, part ) => ( one ? one[ part ] : undefined ), node );
        assert.equal( text( labels, "studio.nav.people" ), "Хора" );
    } );
} );
