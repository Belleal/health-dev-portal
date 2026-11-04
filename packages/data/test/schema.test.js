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
 * The schema (design record §4.1, §7.1, §7.7): what the database itself holds to, on both databases.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { GUARD_SQL, TABLES, migrateSchema } = require( "#schema" );
const { eachDatabase } = require( "./support/databases" );

eachDatabase( "Schema", ( db ) => {

    before( async () => migrateSchema( db() ) );

    const version = ( id, stage, number ) => db().run( "INSERT INTO versions ( id, spec_id, number, stage, created_at ) VALUES ( ?, 'e-prescription', ?, ?, '2026-11-04' )",
        [ id, number, stage ] );

    it( "applies each migration once", async () => {
        assert.deepEqual( await migrateSchema( db() ), [] );
        assert.deepEqual( ( await db().all( "SELECT id FROM schema_migrations" ) ).map( ( row ) => row.id ).sort(), [ "0001-initial", "0002-editing" ] );
    } );

    it( "names the tables a copy carries, each of them empty", async () => {
        assert.deepEqual( TABLES, [ "specs", "releases", "versions", "version_stages", "items", "anomalies", "changelog_entries", "resolutions", "conflicts", "files",
            "settings" ] );
        for ( const table of TABLES ) {
            assert.deepEqual( await db().get( `SELECT COUNT(*) AS n FROM ${ table }` ), { n: 0 }, table );
        }
    } );

    it( "keeps one version of a spec in each stage, and any number retired", async () => {
        await db().run( "INSERT INTO specs ( id, kind ) VALUES ( 'e-prescription', 'module' )" );
        await version( "a", "production", "1.5.1" );
        await assert.rejects( version( "b", "production", "1.5.2" ), { name: "ConstraintError" } );
        await version( "c", "retired", "1.5.0" );
        await version( "d", "retired", "1.4.9" );
        await assert.rejects( version( "e", "retired", "1.5.0" ), { name: "ConstraintError" } );
    } );

    it( "numbers every version but a development one", async () => {
        await assert.rejects( version( "f", "development", "1.6.0" ), { name: "ConstraintError", constraint: "numbered" } );
        await assert.rejects( version( "g", "testing", null ), { name: "ConstraintError", constraint: "numbered" } );
        await version( "h", "development", null );
    } );

    it( "knows only the model's spec kinds and stages", async () => {
        await assert.rejects( db().run( "INSERT INTO specs ( id, kind ) VALUES ( 'x', 'common-schema' )" ), { name: "ConstraintError" } );
        await assert.rejects( version( "i", "staging", "9.9.9" ), { name: "ConstraintError" } );
    } );

    it( "refuses a guarded batch on a frozen version, and writes none of it", async () => {
        await db().run( "UPDATE versions SET frozen = 1 WHERE id = 'a'" );
        await assert.rejects( db().batch( [
            { sql: GUARD_SQL, params: [ "a" ] },
            { sql: "UPDATE versions SET content_hash = 'x' WHERE id = 'a'", params: [] }
        ] ), { name: "ConstraintError", constraint: "write_guard" } );
        assert.deepEqual( await db().get( "SELECT content_hash FROM versions WHERE id = 'a'" ), { content_hash: null } );
        await db().batch( [
            { sql: GUARD_SQL, params: [ "h" ] },
            { sql: "UPDATE versions SET content_hash = 'y' WHERE id = 'h'", params: [] }
        ] );
        assert.deepEqual( await db().get( "SELECT content_hash FROM versions WHERE id = 'h'" ), { content_hash: "y" } );
    } );
} );
