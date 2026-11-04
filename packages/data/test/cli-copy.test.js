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
 * hdp-copy, run as a person runs it: the exit code, the printed summary, and never either database URL.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { migrateSchema } = require( "#schema" );
const { directoryStore, storeFile } = require( "#files" );
const { migrateImported } = require( "#migration" );
const { stageImports } = require( "./support/models" );

const CLI = path.resolve( __dirname, "../bin/copy.js" );
const run = ( args ) => spawnSync( process.execPath, [ CLI, ...args ], { encoding: "utf8" } );

describe( "hdp-copy", () => {

    it( "prints the usage and exits 2 without both databases, or with one file store", () => {
        for ( const args of [ [], [ "--from", "sqlite::memory:" ], [ "--from", "sqlite::memory:", "--to", "sqlite::memory:", "--files-from", "a" ] ] ) {
            const result = run( args );
            assert.equal( result.status, 2, args.join( " " ) );
            assert.match( result.stderr, /Usage: hdp-copy/ );
        }
    } );

    it( "copies a SQLite file into another with its files, then refuses to copy into it again, never printing a URL", async () => {
        const directory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-copy-" ) );
        const from = `sqlite:${ path.join( directory, "from.db" ) }`;
        const to = `sqlite:${ path.join( directory, "to.db" ) }`;
        const source = await openDatabase( from );
        await migrateSchema( source );
        await migrateImported( source, directoryStore( path.join( directory, "files-from" ) ), stageImports() );
        await storeFile( source, directoryStore( path.join( directory, "files-from" ) ), Buffer.from( "x" ), "text/plain" );
        await source.close();
        const files = [ "--files-from", path.join( directory, "files-from" ), "--files-to", path.join( directory, "files-to" ) ];
        const first = run( [ "--from", from, "--to", to, ...files ] );
        assert.equal( first.status, 0, first.stdout + first.stderr );
        assert.match( first.stdout, /^Copied \d+ rows in 10 tables; 1 files\.$/m );
        const second = run( [ "--from", from, "--to", to ] );
        assert.equal( second.status, 1 );
        assert.match( second.stderr, /already holds/ );
        for ( const output of [ first.stdout, first.stderr, second.stdout, second.stderr ] ) {
            assert.ok( !output.includes( from ) && !output.includes( to ), "a database URL was printed" );
        }
    } );
} );
