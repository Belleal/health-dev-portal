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
 * The studio with no sign-in method (plan 9a, spec §3, "No sign-in method, no staff area"), against a real server on a
 * copy of the seed started with `TI_WEB_AUTH_METHODS` empty, as the public deployment runs until Entra is registered:
 * every staff address is the pages' 404, with no cookie and no redirect, the public pages are as they were, and the
 * start says the studio is off. A listed method the framework drops leaves it off too: studio-off-dropped.test.js,
 * since core allows one service instance per process.
 */

const { after, before, describe, it, mock } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { createHmac, randomUUID } = require( "node:crypto" );
// First: it sets the environment ti-engine reads as it loads.
const { SEED, SEEDED, assertPublic, get, rawStatus, startPortal } = require( "./support/server" );
const { elementOf, pagesToCheck } = require( "./support/pages" );
const cache = require( "@ti-engine/core/cache" );
const logger = require( "@ti-engine/core/logger" );
const paths = require( "#paths" );

const BRIEF = "public, max-age=60";
const GONE = "public, max-age=86400";
const NOT_FOUND = /<h1>(Страницата не е намерена|Page not found)<\/h1>/;
const NOTICE = "The studio is off: no sign-in method is in effect (TI_WEB_AUTH_METHODS).";

// Each first segment of the staff's, some in another case: the studio and its screens, the framework's configuration API,
// the signed-in user, the sign-in and the token its form asks for, and the choice of language.
const STAFF_PAGES = [
    "/studio/", "/studio", "/STUDIO/", "/studio/not-found",
    "/app", "/app/enter", "/app/config", "/app/dashboard", "/APP/profile",
    "/me", "/login/local", "/csrf-token", "/language/bg", "/admin/config/editors"
];
const STAFF_POSTS = [ "/app/feedback", "/login/local", "/logout" ];

// A session left in the store from before the last method was removed, holding its CSRF token: the one way a POST passes
// the framework's CSRF check, which runs before any route, while nobody can sign in. Written where the framework's
// session store keeps it, a field of the hash `ti:web:sessions` (web-framework 1.63.1), and signed as express-session
// signs its cookie, with the test environment's secret. A store that moved it would leave the POSTs refused with 403.
const leftoverSession = async () => {
    const id = randomUUID();
    const token = randomUUID();
    const maxAge = 10 * 60 * 1000;
    await cache.instance.hashSetField( "ti:web:sessions", id, {
        cookie: { originalMaxAge: maxAge, expires: new Date( Date.now() + maxAge ).toISOString(), httpOnly: true, path: "/" },
        csrfToken: token
    } );
    const signature = createHmac( "sha256", process.env.TI_WEB_COOKIE_SECRET ).update( id ).digest( "base64" ).replace( /=+$/, "" );
    return { cookie: `connect.sid=${ encodeURIComponent( `s:${ id }.${ signature }` ) }`, token: token };
};

describe( "The studio with no sign-in method", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    let log;
    before( async () => {
        // From before the start, when the studio says it is off; every entry still reaches the logger.
        log = mock.method( logger, "log" );
        portal = await startPortal( { environment: { TI_WEB_AUTH_METHODS: "" } } );
    } );
    after( async () => {
        log.mock.restore();
        if ( portal ) {
            await portal.stop();
        }
    } );

    const ask = ( path, init = {} ) => fetch( `${ portal.url }${ path }`, { redirect: "manual", ...init } );
    // The status, where it redirects and the cookie it sets: one comparison names all three.
    const shapeOf = ( response ) => [ response.status, response.headers.get( "location" ), response.headers.get( "set-cookie" ) ];

    it( "with no sign-in method, every studio address is the pages' 404, with no cookie and no redirect", async () => {
        for ( const path of STAFF_PAGES ) {
            const page = await get( path );
            assert.deepEqual( shapeOf( page ), [ 404, null, null ], path );
            assert.match( page.text, NOT_FOUND, path );
            assertPublic( page, BRIEF );
            // As a script asks: the framework's protection answered it 401 where it refused a browser 303 to /studio/.
            const data = await ask( path, { headers: { accept: "application/json" } } );
            assert.deepEqual( shapeOf( data ), [ 404, null, null ], path );
        }
        // Sent as written, a fragment reaches the protection with the address (`/me#x`) and the routes without it (`/me`).
        assert.equal( await rawStatus( "/me#x" ), 404 );
        // A HEAD is answered as its GET is.
        assert.deepEqual( shapeOf( await ask( "/studio/", { method: "HEAD", headers: { accept: "text/html" } } ) ), [ 404, null, null ] );
    } );

    it( "with no sign-in method, any other method is a bare 404", async () => {
        const session = await leftoverSession();
        for ( const path of STAFF_POSTS ) {
            const response = await ask( path, { method: "POST", headers: { accept: "text/html", cookie: session.cookie, "x-xsrf-token": session.token } } );
            assert.deepEqual( [ response.status, response.headers.get( "location" ) ], [ 404, null ], path );
            assert.equal( await response.text(), "", path );
            // None of the studio's cookies: the session's own is renewed, as on every response to a session (`rolling`).
            assert.deepEqual( response.headers.getSetCookie().map( ( line ) => line.slice( 0, line.indexOf( "=" ) ) ).filter( ( name ) => name !== "connect.sid" ), [], path );
        }
    } );

    it( "with no sign-in method, a POST with no session is refused as at an address that was never the studio's", async () => {
        // The framework's CSRF check refuses it before any route, wherever it is sent (measured): no route of the
        // portal's can make it a 404, and none is needed for it to say nothing of the studio.
        const never = await ask( "/bg/nope", { method: "POST", headers: { accept: "text/html" } } );
        assert.deepEqual( shapeOf( never ), [ 403, null, null ] );
        for ( const path of STAFF_POSTS ) {
            assert.deepEqual( shapeOf( await ask( path, { method: "POST", headers: { accept: "text/html" } } ) ), shapeOf( never ), path );
        }
    } );

    it( "with no sign-in method, the public pages and /health are unchanged", async () => {
        for ( const lang of [ "bg", "en" ] ) {
            const home = await get( `/${ lang }/` );
            assert.equal( home.status, 200, lang );
            assertPublic( home, BRIEF );
        }
        const element = elementOf( ( await get( paths.message( "bg", SEED.ePrescription.spec, SEED.ePrescription.production, "P001" ) ) ).text );
        assert.ok( element, "P001's tree links to its elements" );
        for ( const [ address, status ] of pagesToCheck( element ) ) {
            const response = await get( address );
            assert.equal( response.status, status, address );
            assertPublic( response, status === 410 ? GONE : BRIEF );
        }
        const health = await ask( "/health" );
        assert.deepEqual( [ health.status, health.headers.get( "set-cookie" ) ], [ 200, null ] );
    } );

    it( "says at start that the studio is off", () => {
        const notices = log.mock.calls.filter( ( call ) => call.arguments[ 0 ] === NOTICE );
        assert.deepEqual( notices.map( ( call ) => call.arguments[ 1 ] ), [ logger.logSeverity.NOTICE ] );
    } );
} );
