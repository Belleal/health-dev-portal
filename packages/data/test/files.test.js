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
 * Files by content hash (design record §3.3), and the blueprint catalogue stored as one.
 */

const { before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { directoryStore, loadCatalogue, memoryStore, readSetting, storeCatalogue, storeFile, writeSetting } = require( "#files" );
const { migrateSchema } = require( "#schema" );
const { eachDatabase } = require( "./support/databases" );

const temporary = () => fs.mkdtempSync( path.join( os.tmpdir(), "hdp-files-" ) );

for ( const [ name, open ] of [ [ "memory", () => memoryStore() ], [ "directory", () => directoryStore( temporary() ) ] ] ) {
    describe( `FileStore (${ name })`, () => {

        it( "names a file by the SHA-256 of its bytes, and stores it once", async () => {
            const store = open();
            const hash = await store.put( Buffer.from( "hello" ) );
            assert.equal( hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" );
            assert.equal( await store.put( Buffer.from( "hello" ) ), hash );
            assert.equal( ( await store.get( hash ) ).toString(), "hello" );
            assert.equal( await store.has( hash ), true );
            assert.equal( await store.get( "0".repeat( 64 ) ), null );
            assert.equal( await store.has( "0".repeat( 64 ) ), false );
        } );

        it( "refuses anything but a hash as a name", async () => {
            for ( const name of [ "../etc/passwd", "AB".repeat( 32 ), "a".repeat( 63 ), `${ "a".repeat( 64 ) }/x` ] ) {
                await assert.rejects( open().get( name ), { name: "TypeError" }, name );
                await assert.rejects( open().has( name ), { name: "TypeError" }, name );
            }
        } );
    } );
}

describe( "directoryStore", () => {

    it( "keeps its files across a reopening, two hex digits deep", async () => {
        const root = temporary();
        const hash = await directoryStore( root ).put( Buffer.from( "x" ) );
        assert.equal( ( await directoryStore( root ).get( hash ) ).toString(), "x" );
        assert.deepEqual( fs.readdirSync( path.join( root, hash.slice( 0, 2 ) ) ), [ hash ] );
    } );
} );

eachDatabase( "Files and settings", ( db ) => {

    before( async () => migrateSchema( db() ) );

    it( "records a file once, with its size and type", async () => {
        const store = memoryStore();
        const hash = await storeFile( db(), store, Buffer.from( "ab" ), "text/plain" );
        assert.equal( await storeFile( db(), store, Buffer.from( "ab" ), "text/plain" ), hash );
        assert.deepEqual( await db().all( "SELECT size, content_type FROM files WHERE hash = ?", [ hash ] ), [ { size: 2, content_type: "text/plain" } ] );
    } );

    it( "writes a setting, then overwrites it", async () => {
        assert.equal( await readSetting( db(), "x" ), null );
        await writeSetting( db(), "x", "1" );
        await writeSetting( db(), "x", "2" );
        assert.equal( await readSetting( db(), "x" ), "2" );
    } );

    it( "stores the blueprint catalogue as a file and finds it again", async () => {
        const store = memoryStore();
        assert.equal( await loadCatalogue( db(), store ), null );
        const catalogue = { blueprints: [ { key: "patient", name: "Patient", types: [ "patient" ] } ], published: { patient: "patient" } };
        const hash = await storeCatalogue( db(), store, catalogue );
        assert.equal( await readSetting( db(), "blueprint-catalogue" ), hash );
        assert.deepEqual( await loadCatalogue( db(), store ), catalogue );
        assert.deepEqual( await db().get( "SELECT content_type FROM files WHERE hash = ?", [ hash ] ), { content_type: "application/json" } );
    } );
} );
