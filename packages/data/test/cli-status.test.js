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
 * hdp-status, run as a person runs it (plan 8c, decision 6): the exit code, what it prints, and what it refuses. It
 * sets the environments' status until the staff area's form (plan 9).
 */

const { after, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );

const CLI = path.resolve( __dirname, "../bin/status.js" );
const directory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-status-" ) );
const DATABASE = `sqlite:${ path.join( directory, "status.db" ) }`;
// The child sees no database URL from this process's environment: each run names its own.
const run = ( ...args ) => spawnSync( process.execPath, [ CLI, "--database", DATABASE, ...args ], { encoding: "utf8",
    env: Object.fromEntries( Object.entries( process.env ).filter( ( [ name ] ) => name !== "HDP_DATABASE_URL" ) ) } );

describe( "hdp-status", () => {

    after( () => {
        fs.rmSync( directory, { recursive: true, force: true } );
    } );

    it( "prints the usage and exits 2 without a command, or with one it does not know", () => {
        for ( const args of [ [], [ "nope" ], [ "window" ], [ "window", "move" ] ] ) {
            const result = run( ...args );
            assert.equal( result.status, 2, args.join( " " ) );
            assert.match( result.stderr, /Usage: hdp-status/ );
        }
    } );

    it( "sets a status and shows it", () => {
        const before = run( "show" );
        assert.equal( before.status, 0, before.stderr );
        assert.match( before.stdout, /production: not reported/ );
        const set = run( "set", "--environment", "test", "--state", "degraded", "--bg", "Бавни отговори", "--en", "Slow answers", "--by", "staff-a" );
        assert.equal( set.status, 0, set.stderr );
        const shown = run( "show" );
        assert.match( shown.stdout, /test: degraded since \d{4}-\d{2}-\d{2}T[\d:.]+Z — Бавни отговори \/ Slow answers/ );
        assert.match( shown.stdout, /production: not reported/ );
        // Who set it is for staff: show does not print it either.
        assert.doesNotMatch( shown.stdout, /staff-a/ );
    } );

    it( "refuses a time without an offset, saying how to write one", () => {
        const result = run( "window", "add", "--environment", "production", "--from", "2026-11-20T22:00", "--to", "2026-11-20T23:30+02:00", "--by", "staff-a" );
        assert.equal( result.status, 2 );
        assert.match( result.stderr, /2026-11-20T22:00\+02:00/ );
    } );

    it( "refuses an unknown state, naming the four, and a message in one language", () => {
        const state = run( "set", "--environment", "production", "--state", "fine", "--by", "staff-a" );
        assert.equal( state.status, 2 );
        assert.match( state.stderr, /operational, degraded, maintenance, outage/ );
        const message = run( "set", "--environment", "production", "--state", "outage", "--bg", "Само български", "--by", "staff-a" );
        assert.equal( message.status, 2 );
        assert.match( message.stderr, /--bg and --en/ );
        const author = run( "set", "--environment", "production", "--state", "outage" );
        assert.equal( author.status, 2 );
        assert.match( author.stderr, /--by/ );
    } );

    it( "adds a window, shows it, and cancels it", () => {
        const added = run( "window", "add", "--environment", "production", "--from", "2099-11-20T22:00+02:00", "--to", "2099-11-20T23:30+02:00",
            "--bg", "Обновяване", "--en", "Upgrade", "--by", "staff-a" );
        assert.equal( added.status, 0, added.stderr );
        const id = /window ([0-9a-f-]{36})/.exec( added.stdout )[ 1 ];
        assert.match( run( "show" ).stdout, new RegExp( `${ id }.*production 2099-11-20T20:00:00\\.000Z → 2099-11-20T21:30:00\\.000Z` ) );
        const cancelled = run( "window", "cancel", "--id", id, "--by", "staff-b" );
        assert.equal( cancelled.status, 0, cancelled.stderr );
        assert.doesNotMatch( run( "show" ).stdout, new RegExp( id ) );
        const again = run( "window", "cancel", "--id", id, "--by", "staff-b" );
        assert.equal( again.status, 1 );
        assert.match( again.stderr, /no window/i );
    } );
} );
