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
 * A real portal server for a test file (plan 8a, decision 12): in this process, on a copy of the seed, with core's cache
 * replaced by the portal's stand-in, and no TLS, sign-in, message exchange, health check or jobs timer. Core allows one
 * service instance per process, so a test file starts one; `node --test` runs each file in a process of its own.
 */

// Before anything of ti-engine is loaded: core reads its settings from the environment once, as its config loads.
Object.assign( process.env, {
    TI_MESSAGE_EXCHANGE_ENABLED: "false",
    TI_SERVICE_HEALTH_CHECK_ENABLED: "false",
    TI_WEB_USE_TLS: "false",
    TI_WEB_HOST: "127.0.0.1",
    TI_WEB_PORT: "0",
    // Empty: no sign-in method at all, as the public site has none until plan 9.
    TI_WEB_AUTH_METHODS: "",
    // Off: the 15-minute jobs timer would otherwise touch the cache.
    TI_WEB_JOBS_TRIGGER: "off",
    TI_WEB_PUBLIC_URL: "https://developers.example.test",
    // Warnings and errors only: a test's output is its own, not each request's notice.
    TI_AUDITING_LOG_MIN_LEVEL: "400"
} );

const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { escapeHtml } = require( "@ti-engine/web-content/html" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { readContent } = require( "@health-dev-portal/data/targets" );
const { findVersion } = require( "@health-dev-portal/data/versions" );
const { installMemoryCache } = require( "./memory-cache" );
const { SEED, SEED_DATABASE, SEED_FILES, inCi } = require( "./seed" );

/**
 * Whether the seed has been built: the HTTP tests skip without it, locally.
 *
 * @type {boolean}
 * @public
 */
module.exports.SEEDED = fs.existsSync( SEED_DATABASE ) && fs.existsSync( SEED_FILES );

// In CI a missing seed is a failure, never a skip: a skipped test looks exactly like a passing one (the rule the data
// layer's HDP_TEST_POSTGRES_URL follows).
if ( !module.exports.SEEDED && inCi() ) {
    throw new Error( "The portal's seed is missing: CI must run `npm run fixtures:fetch` before `npm test`, whose pretest builds it." );
}

/**
 * What decision 13 put in the seed, re-exported for the page tests.
 *
 * @type {Object}
 * @public
 */
module.exports.SEED = SEED;

/**
 * Whether the tests run in CI (`CI` set and not `false`), where a missing seed or browser fails rather than skips.
 *
 * @type {boolean}
 * @public
 */
module.exports.IN_CI = inCi();

let cache = null;
let address = null;

/**
 * Constructs the portal's server, not started, under the given environment: each name set, or removed for `undefined`.
 * The stand-in cache is installed first, once.
 *
 * @method
 * @param {Object<string, string|undefined>} [environment]
 * @returns {import( "#portal-server" )}
 * @public
 */
module.exports.createPortal = ( environment = {} ) => {
    for ( const [ name, value ] of Object.entries( environment ) ) {
        if ( value === undefined ) {
            delete process.env[ name ];
        } else {
            process.env[ name ] = value;
        }
    }
    if ( cache === null ) {
        cache = installMemoryCache();
    }
    const PortalServer = require( "#portal-server" );
    return new PortalServer( "portal-test", {} );
};

/**
 * Starts the portal on a copy of the seed, its database and its files, so a test may change both.
 *
 * @method
 * @returns {Promise<{url: string, database: string, files: string, stop: function(): Promise<void>}>} `database` is the
 *     copy's SQLite file and `files` its file store, for a test that moves a spec on through the data layer, as staff
 *     would; `stop` stops the server and removes the copy.
 * @public
 */
module.exports.startPortal = async () => {
    const directory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-portal-" ) );
    const database = path.join( directory, "seed.sqlite" );
    const files = path.join( directory, "files" );
    fs.copyFileSync( SEED_DATABASE, database );
    fs.cpSync( SEED_FILES, files, { recursive: true } );
    const server = module.exports.createPortal( { HDP_DATABASE_URL: `sqlite:${ database }`, HDP_FILES_DIR: files } );
    await server.start();
    address = server.serverUrl;
    return {
        url: server.serverUrl,
        database: database,
        files: files,
        stop: async () => {
            await server.stop();
            address = null;
            fs.rmSync( directory, { recursive: true, force: true } );
        }
    };
};

/**
 * A GET of an address on the started portal, as a browser navigates: asking for HTML, following no redirect.
 *
 * @method
 * @param {string} path
 * @returns {Promise<{status: number, headers: Headers, text: string}>}
 * @public
 */
module.exports.get = async ( path ) => {
    if ( address === null ) {
        throw new Error( "No portal is started: call startPortal() in before()." );
    }
    const response = await fetch( `${ address }${ path }`, { redirect: "manual", headers: { accept: "text/html" } } );
    return { status: response.status, headers: response.headers, text: await response.text() };
};

/**
 * Asserts what every public response is (decision 4; design record §10.1): no cookie, the cache it should carry, and its
 * content type.
 *
 * @method
 * @param {{headers: Headers}} response
 * @param {string} cache The `Cache-Control` expected.
 * @param {string|null} [type] The `Content-Type` expected; `null` skips it, for a redirect.
 * @returns {void}
 * @public
 */
module.exports.assertPublic = ( response, cache, type = "text/html; charset=utf-8" ) => {
    assert.equal( response.headers.get( "set-cookie" ), null, "a public response sets no cookie" );
    assert.equal( response.headers.get( "cache-control" ), cache );
    if ( type !== null ) {
        assert.equal( response.headers.get( "content-type" ), type );
    }
};

/**
 * The rows of a page's data tables: each `<tr>` in the `<tbody>` of a `<table class="rows …">`, as HTML.
 *
 * @method
 * @param {string} html
 * @returns {string[]}
 * @public
 */
module.exports.rowsOf = ( html ) => [ ...html.matchAll( /<table\b[^>]*\bclass="(?:[^"]*\s)?rows(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/table>/g ) ]
    .flatMap( ( table ) => [ ...table[ 1 ].matchAll( /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g ) ] )
    .flatMap( ( body ) => [ ...body[ 1 ].matchAll( /<tr\b[^>]*>[\s\S]*?<\/tr>/g ) ].map( ( row ) => row[ 0 ] ) );

/**
 * The tree's row of one element, by its path: the row whose `data-path` is it. The first, for a path met again.
 *
 * @method
 * @param {string} html
 * @param {string} path e.g. `contents/prescription/lrn`.
 * @returns {string}
 * @public
 */
module.exports.rowOf = ( html, path ) => {
    // Matched in the row's opening tag only, so a link inside another row cannot stand in for it.
    const row = module.exports.rowsOf( html ).find( ( one ) => one.slice( 0, one.indexOf( ">" ) + 1 ).includes( ` data-path="${ escapeHtml( path ) }"` ) );
    assert.ok( row, `no row for the element ${ path }` );
    return row;
};

let seedDatabase = null;

/**
 * A version's content, read from the seed, so a test's expectation comes from the data rather than from a typed copy.
 * Shared and frozen: clone it before changing it.
 *
 * @method
 * @param {string} spec
 * @param {string} number
 * @returns {Promise<import( "@health-dev-portal/data/definitions" ).VersionContent>}
 * @public
 */
module.exports.seedContent = async ( spec, number ) => {
    if ( seedDatabase === null ) {
        seedDatabase = await openDatabase( `sqlite:${ SEED_DATABASE }` );
    }
    const found = await findVersion( seedDatabase, spec, { number: number } );
    assert.ok( found, `the seed has no ${ spec } ${ number }` );
    return readContent( seedDatabase, found.id );
};
