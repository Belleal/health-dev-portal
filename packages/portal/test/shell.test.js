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
 * The portal's shell, against a real server on a copy of the seed (plan 8a, decisions 1, 4 and 6): the root, the 404
 * for every address that is none, the one script with the response's nonce, and the assets by their hash.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const crypto = require( "node:crypto" );
const { SEEDED, assertPublic, get, startPortal } = require( "./support/server" );

const IMMUTABLE = "public, max-age=31536000, immutable";
const sha = ( bytes ) => crypto.createHash( "sha256" ).update( bytes ).digest( "hex" );

describe( "The shell", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    const bytes = async ( path ) => {
        const response = await fetch( `${ portal.url }${ path }` );
        return { status: response.status, headers: response.headers, body: Buffer.from( await response.arrayBuffer() ) };
    };

    it( "sends / to /bg/, and answers unknown and hostile addresses with the 404 page", async () => {
        const root = await get( "/" );
        assertPublic( root, "public, max-age=60", null );
        assert.deepEqual( [ root.status, root.headers.get( "location" ) ], [ 301, "/bg/" ] );
        for ( const path of [ "/bg/nope", "/en/specs/%3Cscript%3E/production", "/app", "/app/x", "/not-found",
            "/bg/specs/e-prescription/1.5.1/P001/elements/..%2F..%2Fx", "/en/specs/e-prescription/development", "/bg/specs/CL007/production",
            "/downloads/nomenclatures/CL007/development.json" ] ) {
            const response = await get( path );
            assertPublic( response, "public, max-age=60" );
            assert.equal( response.status, 404, path );
            assert.equal( response.text.includes( "<script>" ), false, path );
            assert.match( response.text, /<h1>(Страницата не е намерена|Page not found)<\/h1>/, path );
        }
        assert.match( ( await get( "/en/nope" ) ).text, /<html lang="en">[\s\S]*<h1>Page not found<\/h1>/ );
        assert.match( ( await get( "/app/x" ) ).text, /<html lang="bg">/ );
    } );

    it( "answers every unknown address with its own 404, outside the languages too, never a redirect to /", async () => {
        for ( const path of [ "/nope", "/robots.txt", "/favicon.ico", "/sitemap.xml", "/x/y/z" ] ) {
            const response = await get( path );
            assertPublic( response, "public, max-age=60" );
            assert.equal( response.status, 404, path );
        }
    } );

    it( "mints no session: the framework's sign-in and session routes are the portal's 404 until plan 9", async () => {
        // GET /csrf-token minted a token into a new session, saved and cookied, which every later page then re-sent.
        for ( const path of [ "/csrf-token", "/me", "/login/local", "/login/openid-google", "/login/google-callback" ] ) {
            const response = await get( path );
            assertPublic( response, "public, max-age=60" );
            assert.equal( response.status, 404, path );
        }
        // A form post without a token is refused by the framework's CSRF check before any route, and sets nothing either.
        for ( const path of [ "/logout", "/login/local" ] ) {
            const response = await fetch( `${ portal.url }${ path }`, { method: "POST", redirect: "manual", headers: { accept: "text/html" } } );
            assert.equal( response.headers.get( "set-cookie" ), null, path );
            assert.equal( response.status, 403, path );
        }
    } );

    it( "keeps the framework's /admin protected, and sets no cookie there either", async () => {
        const response = await get( "/admin/config/editors" );
        assert.deepEqual( [ response.status, response.headers.get( "location" ), response.headers.get( "set-cookie" ) ], [ 303, "/", null ] );
    } );

    it( "puts the response's nonce on its one script, and serves both assets as immutable at their hashed address", async () => {
        const response = await get( "/bg/nope" );
        const nonce = /script-src [^;]*'nonce-([^']+)'/.exec( response.headers.get( "content-security-policy" ) )[ 1 ];
        const scripts = [ ...response.text.matchAll( /<script\b([^>]*)>([\s\S]*?)<\/script>/g ) ];
        assert.equal( scripts.length, 1 );
        assert.match( scripts[ 0 ][ 1 ], new RegExp( `^ src="/static/portal/portal\\.js\\?v=[0-9a-f]{12}" defer nonce="${ nonce.replace( /[+/=]/g, "\\$&" ) }"$` ) );
        assert.equal( scripts[ 0 ][ 2 ], "" );
        // A fresh nonce on every response: one reused would let an injected script carry it.
        assert.notEqual( /'nonce-([^']+)'/.exec( ( await get( "/bg/nope" ) ).headers.get( "content-security-policy" ) )[ 1 ], nonce );

        const assets = [ /href="(\/static\/portal\/portal\.css)\?v=([0-9a-f]{12})"/, /src="(\/static\/portal\/portal\.js)\?v=([0-9a-f]{12})"/ ]
            .map( ( pattern ) => pattern.exec( response.text ) );
        for ( const [ , address, hash ] of assets ) {
            const fixed = await bytes( `${ address }?v=${ hash }` );
            assert.equal( fixed.status, 200, address );
            assert.equal( fixed.headers.get( "cache-control" ), IMMUTABLE, address );
            assert.equal( fixed.headers.get( "set-cookie" ), null, address );
            assert.equal( sha( fixed.body ).slice( 0, 12 ), hash, address );
            // Without its hash the same file is revalidated, as the framework serves any stable name.
            assert.equal( ( await bytes( address ) ).headers.get( "cache-control" ), "public, max-age=0, must-revalidate", address );
        }
    } );

    it( "serves the fonts as immutable, under the framework's default /fonts/ prefix", async () => {
        const css = ( await bytes( "/static/portal/portal.css" ) ).body.toString( "utf8" );
        const fonts = [ ...new Set( [ ...css.matchAll( /url\(\s*"?(\/static\/fonts\/[^")\s]+)"?\s*\)/g ) ].map( ( match ) => match[ 1 ] ) ) ];
        assert.equal( fonts.length, 8 );
        for ( const font of fonts ) {
            const response = await bytes( font );
            assert.equal( response.status, 200, font );
            assert.equal( response.headers.get( "cache-control" ), IMMUTABLE, font );
            assert.equal( response.headers.get( "set-cookie" ), null, font );
        }
    } );
} );
