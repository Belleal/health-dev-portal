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
 * Who reaches the studio, against a real server on a copy of the seed (plan 9a): its sign-in screen at /studio/, its
 * addresses refused to anyone not signed in in whatever case they are written, every public page as anonymous and as
 * cacheable as it was with sign-in on, a person recorded at first sign-in, and the roles a session carries following the
 * person's grants from one request to the next.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
// First: it sets the environment ti-engine reads as it loads.
const { SEED, SEEDED, assertPublic, get, startPortal } = require( "./support/server" );
const { elementOf, pagesToCheck } = require( "./support/pages" );
const { grant, signIn } = require( "./support/staff" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { EVERY_SPEC, ROLE, listPeople } = require( "@health-dev-portal/data/staff" );
const paths = require( "#paths" );

const BRIEF = "public, max-age=60";
const GONE = "public, max-age=86400";
const FOREVER = "public, max-age=31536000, immutable";
const HTML = "text/html; charset=utf-8";
const ATOM = "application/atom+xml; charset=utf-8";
const SPEC = SEED.ePrescription.spec;

describe( "The studio's access", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    // A request as a browser or a script makes it, with a signed-in session's cookie when one is given.
    const ask = ( path, accept, session = null ) => fetch( `${ portal.url }${ path }`, { redirect: "manual",
        headers: { accept: accept, ...( session === null ? {} : { cookie: session.cookie } ) } } );
    const me = async ( session ) => {
        const response = await ask( "/me", "application/json", session );
        assert.equal( response.status, 200 );
        return ( await response.json() ).data.user;
    };
    const personOf = async ( username ) => {
        const db = await openDatabase( `sqlite:${ portal.database }` );
        try {
            return ( await listPeople( db ) ).find( ( one ) => one.key === `local:${ username }` );
        } finally {
            await db.close();
        }
    };
    // Every kind of page, with the status it answers: the accessibility test's list.
    const listedPages = async () => {
        const element = elementOf( ( await get( paths.message( "bg", SPEC, SEED.ePrescription.production, "P001" ) ) ).text );
        assert.ok( element, "P001's tree links to its elements" );
        return pagesToCheck( element );
    };

    it( "serves the sign-in screen at /studio/ and /studio, to an anonymous visitor", async () => {
        for ( const path of [ "/studio/", "/studio" ] ) {
            const response = await get( path );
            assert.equal( response.status, 200, path );
            assert.equal( response.headers.get( "content-type" ), HTML, path );
            assert.match( response.text, /<meta name="ti-home" content="\/studio\/"\/>/, path );
            // The shell holds no screen of its own: it asks for the first as soon as it loads (measured), and an
            // anonymous visitor's first is the sign-in, with its form.
            assert.match( response.text, /<ti-nested-frame-placeholder hx-get="\/app\/enter" hx-trigger="load"/, path );
        }
        const screen = await fetch( `${ portal.url }/app/enter`, { redirect: "manual", headers: { accept: "text/html", "hx-request": "true" } } );
        assert.equal( screen.status, 200 );
        assert.match( await screen.text(), /<form id="ti-login-form" action="\/login\/local" method="post"/ );
    } );

    it( "refuses a staff address to an anonymous visitor, in any case", async () => {
        for ( const path of [ "/app/profile", "/APP/profile", "/app/about", "/me", "/ME", "/Studio/not-found/x" ] ) {
            const page = await ask( path, "text/html" );
            assert.deepEqual( [ page.status, page.headers.get( "location" ), page.headers.get( "set-cookie" ) ], [ 303, "/studio/", null ], path );
            const data = await ask( path, "application/json" );
            assert.deepEqual( [ data.status, data.headers.get( "set-cookie" ) ], [ 401, null ], path );
        }
    } );

    it( "keeps every public page anonymous and cacheable with sign-in enabled", async () => {
        const pages = [
            ...( await listedPages() ).map( ( [ address, status ] ) => [ address, status, status === 410 ? GONE : BRIEF, HTML ] ),
            [ paths.specDownload( SPEC, SEED.ePrescription.production, "zip" ), 200, FOREVER, "application/zip" ],
            [ paths.feed( "bg", SPEC ), 200, BRIEF, ATOM ]
        ];
        for ( const [ address, status, cache, type ] of pages ) {
            const response = await get( address );
            assert.equal( response.status, status, address );
            assertPublic( response, cache, type );
        }
        // Signed in, the same pages answer as they did, with the session's cookie, and so kept out of shared caches.
        const session = await signIn( portal.url, "editor" );
        for ( const [ address, status ] of pages ) {
            const response = await ask( address, "text/html", session );
            assert.equal( response.status, status, address );
            assert.notEqual( response.headers.get( "set-cookie" ), null, address );
            assert.doesNotMatch( response.headers.get( "cache-control" ), /\bpublic\b/, address );
        }
    } );

    it( "records a person at first sign-in, with no role", async () => {
        const session = await signIn( portal.url, "nobody" );
        const person = await personOf( "nobody" );
        assert.ok( person, "the sign-in recorded them" );
        assert.deepEqual( [ person.name, person.configuredAdmin, person.grants ], [ "Test Nobody", false, [] ] );
        assert.deepEqual( ( await me( session ) ).roles, [] );
    } );

    it( "gives a role on the next request, and takes it away on the next", async () => {
        const session = await signIn( portal.url, "reader" );
        assert.deepEqual( ( await me( session ) ).roles, [] );
        await grant( portal.database, "reader", [ { role: ROLE.READER, spec: EVERY_SPEC } ] );
        assert.deepEqual( ( await me( session ) ).roles, [ "studio:reader" ] );
        await grant( portal.database, "reader", [] );
        assert.deepEqual( ( await me( session ) ).roles, [] );
    } );

    it( "gives the configuration's admin the framework's admin role, and records them as from configuration", async () => {
        const session = await signIn( portal.url, "config-admin" );
        assert.deepEqual( ( await me( session ) ).roles, [ "admin" ] );
        const person = await personOf( "config-admin" );
        assert.deepEqual( [ person.configuredAdmin, person.grants ], [ true, [] ] );
    } );

    it( "no public page names the studio", async () => {
        for ( const [ address ] of await listedPages() ) {
            const { text } = await get( address );
            assert.equal( text.includes( "/studio" ), false, address );
            assert.equal( text.includes( "/app/" ), false, address );
        }
    } );
} );
