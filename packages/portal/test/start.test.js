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
 * A start the portal refuses (plan 8a, decision 1): without its database, or without the public URL every absolute
 * link is written from, it never listens. A start the framework refuses once the database is open, and a stop the
 * framework fails, let the database and the studio's context go all the same (plan 9a, task 6a). Its own process,
 * since core allows one service instance per process: every test here starts and stops the same one.
 */

const { before, describe, it, mock } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const net = require( "node:net" );
const path = require( "node:path" );
// First: it sets the environment ti-engine reads as it loads.
const support = require( "./support/server" );
const database = require( "@health-dev-portal/data/database" );

// Every database the portal opens, so a test can see whether it was closed: the portal keeps its own to itself. Wrapped
// before the portal's module is first required, which takes `openDatabase` as it is then. `onOpen`, when a test sets
// it, sees each one first.
const opened = [];
let onOpen = null;
const realOpenDatabase = database.openDatabase;
mock.method( database, "openDatabase", async ( ...args ) => {
    const db = await realOpenDatabase( ...args );
    opened.push( db );
    if ( onOpen !== null ) {
        onOpen( db );
    }
    return db;
} );

const logger = require( "@ti-engine/core/logger" );
const TiWebServer = require( "@ti-engine/web-framework/web-server" );
const context = require( "#studio/context" );

const { createPortal } = support;

// Core raises what a start rejects with as its own exception, which keeps the original message in its data.
const naming = ( setting ) => ( error ) => new RegExp( setting ).test( error.data.message );

// A server holding a port on the portal's address, so that the portal's own listen fails with EADDRINUSE. Never a
// fixed port: a preview portal may hold one.
const holdPort = () => new Promise( ( resolve, reject ) => {
    const holder = net.createServer();
    holder.once( "error", reject );
    holder.listen( 0, "127.0.0.1", () => resolve( holder ) );
} );
const letGo = ( holder ) => new Promise( ( resolve ) => holder.close( () => resolve() ) );

// The studio's context holds nothing once detached: its getters throw.
const detached = () => assert.throws( () => context.instance.db, /not attached/ );
// node:sqlite answers a query on a closed database with ERR_INVALID_STATE, "database is not open" (measured). Observed
// here because Windows' file lock shows an open database only on Windows, and this must fail on Linux too.
const closed = ( db ) => assert.rejects( db.get( "SELECT 1" ), { code: "ERR_INVALID_STATE" } );

describe( "A refused start", () => {

    // With no sign-in method: the local one reads the seed's users file, and nothing here needs the seed.
    let server;
    before( () => {
        server = createPortal( { HDP_DATABASE_URL: undefined, TI_WEB_PUBLIC_URL: "https://developers.example.test", TI_WEB_AUTH_METHODS: "" } );
    } );

    it( "stops the start without HDP_DATABASE_URL, or without TI_WEB_PUBLIC_URL, before it listens", async () => {
        await assert.rejects( server.start(), naming( "HDP_DATABASE_URL" ) );
        assert.equal( server.serverUrl, "" );
        process.env.HDP_DATABASE_URL = "sqlite::memory:";
        server.serviceConfig.publicUrl = "";
        await assert.rejects( server.start(), naming( "TI_WEB_PUBLIC_URL" ) );
        server.serviceConfig.publicUrl = "developers.example.test/";
        await assert.rejects( server.start(), naming( "TI_WEB_PUBLIC_URL" ) );
        assert.equal( server.serverUrl, "" );
        assert.equal( server.startup.state, "failed" );
    } );

    // Before task 6a both stayed: on Windows the database's lock then failed the test helper's removal of its copy with
    // EPERM, and that error replaced the start's own (review of task 3).
    it( "a start refused after the database opened lets the database and the studio's context go, and rejects with its own error", async () => {
        process.env.HDP_DATABASE_URL = "sqlite::memory:";
        server.serviceConfig.publicUrl = "https://developers.example.test";
        const holder = await holdPort();
        server.serviceConfig.port = holder.address().port;
        opened.length = 0;
        try {
            await assert.rejects( server.start(), ( error ) => error.data.code === "EADDRINUSE" );
        } finally {
            await letGo( holder );
        }
        detached();
        assert.equal( opened.length, 1, "the start opened its database before it was refused" );
        await closed( opened[ 0 ] );
    } );

    it( "a close that fails as a refused start lets go is logged, and the start still rejects with its own error", async ( t ) => {
        const holder = await holdPort();
        server.serviceConfig.port = holder.address().port;
        opened.length = 0;
        // Closed, then failed: nothing of the database outlives the test.
        onOpen = ( db ) => {
            const close = db.close.bind( db );
            db.close = async () => {
                await close();
                throw new Error( "the close failed" );
            };
        };
        const log = t.mock.method( logger, "log", () => {} );
        try {
            await assert.rejects( server.start(), ( error ) => error.data.code === "EADDRINUSE" );
        } finally {
            onOpen = null;
            await letGo( holder );
        }
        detached();
        // At ERROR, which the test environment's minimum, 400, shows.
        const failures = log.mock.calls.filter( ( call ) => String( call.arguments[ 2 ]?.stack ).includes( "the close failed" ) );
        assert.deepEqual( failures.map( ( call ) => call.arguments[ 1 ] ), [ logger.logSeverity.ERROR ] );
    } );

    it( "a stop whose framework stop fails still lets the database and the context go, and rejects with that failure", async ( t ) => {
        server.serviceConfig.port = 0;
        opened.length = 0;
        await server.start();
        try {
            assert.equal( context.instance.db, opened[ 0 ] );
            const failure = new Error( "the framework's stop failed" );
            t.mock.method( TiWebServer.prototype, "onStop", async () => {
                throw failure;
            }, { times: 1 } );
            await assert.rejects( server.stop(), ( error ) => error.data.message === failure.message );
            detached();
            await closed( opened[ 0 ] );
        } finally {
            // The framework's own stop has not run, so its server still listens: this one is for real, or the file never
            // ends.
            await server.stop();
        }
    } );
} );

const UNSEEDED = !support.SEEDED && "the portal's seed is not built (npm run fixtures:fetch, then npm test)";

describe( "A test portal whose start is refused", { skip: UNSEEDED }, () => {

    // Without this a refused start left its copy of the seed in the temporary directory on every run, and the server
    // unstopped, since the caller never received `stop` (CodeRabbit on #20).
    it( "stops the server and removes its copy of the seed, and rejects with the start's own error", async () => {
        const refusal = new Error( "refused" );
        const seen = { files: null, stopped: false };
        const real = support.createPortal;
        support.createPortal = ( environment ) => {
            seen.files = environment.HDP_FILES_DIR;
            return {
                start: async () => {
                    throw refusal;
                },
                stop: async () => {
                    seen.stopped = true;
                    throw new Error( "a stop after a refused start may fail too" );
                }
            };
        };
        try {
            await assert.rejects( support.startPortal(), ( error ) => error === refusal );
        } finally {
            support.createPortal = real;
        }
        assert.ok( seen.files, "the copy was made before the start" );
        assert.equal( fs.existsSync( path.dirname( seen.files ) ), false );
        assert.equal( seen.stopped, true );
    } );
} );
