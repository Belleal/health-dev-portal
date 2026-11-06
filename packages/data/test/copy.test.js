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
 * A whole database copied from one driver to the other (design record §7.11), so work done on the development
 * deployment carries over to the data centre at launch.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { TABLES, migrateSchema } = require( "#schema" );
const { memoryStore, storeFile } = require( "#files" );
const { migrateImported } = require( "#migration" );
const { CopyTargetError, copyDatabase, copyFiles } = require( "#copy" );
const { eachDatabase } = require( "./support/databases" );
const { stageImports } = require( "./support/models" );

const KEYS = { specs: [ "id" ], releases: [ "id" ], versions: [ "id" ], version_stages: [ "version_id", "stage" ], items: [ "version_id", "item_no" ],
    anomalies: [ "version_id", "anomaly_no" ], changelog_entries: [ "id" ], resolutions: [ "version_id", "spec_id" ], conflicts: [ "id" ], files: [ "hash" ], settings: [ "key" ],
    approved_items: [ "version_id", "item_no" ], rounds: [ "id" ], round_versions: [ "round_id", "version_id" ], comments: [ "id" ], release_events: [ "id" ],
    edit_log: [ "id" ] };

// Every row of a table, sorted in JavaScript by its primary key: a copy is equal when its rows are, whatever order a
// database returns them in.
const rows = async ( db, table ) => ( await db.all( `SELECT * FROM ${ table }` ) )
    .map( ( row ) => [ JSON.stringify( KEYS[ table ].map( ( column ) => row[ column ] ) ), row ] )
    .sort( ( a, b ) => a[ 0 ] < b[ 0 ] ? -1 : a[ 0 ] > b[ 0 ] ? 1 : 0 )
    .map( ( pair ) => pair[ 1 ] );

const seeded = async () => {
    const source = await openDatabase( "sqlite::memory:" );
    await migrateSchema( source );
    await migrateImported( source, memoryStore(), stageImports() );
    await storeFile( source, memoryStore(), Buffer.from( "x" ), "text/plain" );
    // A fix whose ID sorts before the version it replaces, with more versions between than one insert holds: copied in ID
    // order, it reached the target before what it names, and the copy failed on the foreign key (final review of plan 6b).
    const version = ( id, number, replaces ) => source.run( `INSERT INTO versions ( id, spec_id, number, stage, frozen, replaces_id, created_at )
        VALUES ( ?, 'e-prescription', ?, 'retired', 1, ?, '2026-11-06' )`, [ id, number, replaces ] );
    await version( "z-fixed", "9.9.0", null );
    await version( "0-fix", "9.9.1", "z-fixed" );
    for ( let index = 0; index < 8; index++ ) {
        await version( `f${ index }`, `9.8.${ index }`, null );
    }
    return source;
};

eachDatabase( "Copy", ( target ) => {

    it( "copies every table from SQLite, identities and bases included", async () => {
        const source = await seeded();
        const counts = await copyDatabase( source, target() );
        for ( const table of TABLES ) {
            assert.deepEqual( await rows( target(), table ), await rows( source, table ), table );
            assert.equal( counts[ table ], ( await rows( source, table ) ).length, table );
        }
        assert.ok( counts.items > 0 );
        assert.equal( ( await target().get( "SELECT COUNT(*) AS n FROM versions WHERE base_id IS NOT NULL" ) ).n, 1 );
        assert.deepEqual( await target().get( "SELECT replaces_id FROM versions WHERE id = '0-fix'" ), { replaces_id: "z-fixed" } );
        await source.close();
    } );

    it( "refuses a target that already holds data", async () => {
        // The test before filled the target.
        const source = await openDatabase( "sqlite::memory:" );
        await migrateSchema( source );
        await assert.rejects( copyDatabase( source, target() ), { name: "CopyTargetError", message: /specs/ } );
        await source.close();
    } );
} );

describe( "copyDatabase", () => {

    it( "refuses a target whose schema differs from the source's", async () => {
        const source = await openDatabase( "sqlite::memory:" );
        const target = await openDatabase( "sqlite::memory:" );
        await migrateSchema( source );
        await migrateSchema( target );
        await target.run( "INSERT INTO schema_migrations ( id, applied_at ) VALUES ( '9999-later', '2026-11-04' )" );
        await assert.rejects( copyDatabase( source, target ), ( error ) => error instanceof CopyTargetError && /9999-later/.test( error.message ) );
    } );

    // OFFSET paging has no snapshot: a row the source deleted or added while it was copied shifted the pages, and the copy
    // finished without it, saying nothing (CodeRabbit on #14).
    it( "refuses a source that changed while it was copied", async () => {
        const source = await seeded();
        let changed = false;
        // The source as the copy sees it, which deletes an item it has already read.
        const changing = {
            dialect: source.dialect,
            get: ( sql, params ) => source.get( sql, params ),
            run: ( sql, params ) => source.run( sql, params ),
            batch: ( statements ) => source.batch( statements ),
            close: () => source.close(),
            all: async ( sql, params ) => {
                const rows = await source.all( sql, params );
                if ( !changed && /FROM items /.test( sql ) ) {
                    changed = true;
                    await source.run( "DELETE FROM items WHERE item_no = 1" );
                }
                return rows;
            }
        };
        const target = await openDatabase( "sqlite::memory:" );
        await assert.rejects( copyDatabase( changing, target ), { name: "CopyTargetError", message: /changed while it was copied/ } );
        await source.close();
    } );
} );

describe( "copyFiles", () => {

    it( "copies the files a database names, and only the missing ones", async () => {
        const db = await openDatabase( "sqlite::memory:" );
        await migrateSchema( db );
        const from = memoryStore();
        const to = memoryStore();
        const only = await storeFile( db, from, Buffer.from( "a" ), "text/plain" );
        const shared = await storeFile( db, from, Buffer.from( "b" ), "text/plain" );
        await to.put( Buffer.from( "b" ) );
        assert.equal( await copyFiles( db, from, to ), 1 );
        assert.deepEqual( [ await to.has( only ), await to.has( shared ) ], [ true, true ] );
        assert.equal( await copyFiles( db, from, to ), 0 );
    } );

    it( "refuses to copy a file the source store does not have", async () => {
        const db = await openDatabase( "sqlite::memory:" );
        await migrateSchema( db );
        await storeFile( db, memoryStore(), Buffer.from( "lost" ), "text/plain" );
        await assert.rejects( copyFiles( db, memoryStore(), memoryStore() ), /missing from the source/ );
    } );

    // A file whose bytes are not its name's: from the source it would have been stored under another hash, and in the
    // target it was taken as copied (CodeRabbit on #14).
    it( "refuses a file whose bytes do not match its hash, in either store", async () => {
        const db = await openDatabase( "sqlite::memory:" );
        await migrateSchema( db );
        const hash = await storeFile( db, memoryStore(), Buffer.from( "a" ), "text/plain" );
        const corrupt = { has: async () => true, get: async () => Buffer.from( "tampered" ), put: async () => hash };
        await assert.rejects( copyFiles( db, corrupt, memoryStore() ), new RegExp( `${ hash } .*does not match` ) );
        const healthy = memoryStore();
        await healthy.put( Buffer.from( "a" ) );
        await assert.rejects( copyFiles( db, healthy, corrupt ), new RegExp( `${ hash } .*does not match` ) );
    } );
} );
