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
 * What only two connections to PostgreSQL can show (final review of plan 5). SQLite and D1 serialise writers, so there
 * these cannot happen; PostgreSQL is the launch database.
 */

const crypto = require( "node:crypto" );
const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const pg = require( "pg" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { guardStatements, migrateSchema } = require( "#schema" );
const { ensureSpec, storeVersion } = require( "#versions" );
const { moduleVersion } = require( "./support/models" );

const POSTGRES = process.env.HDP_TEST_POSTGRES_URL;
// In CI a missing PostgreSQL is a failure, never a skip, as everywhere in this suite.
if ( !POSTGRES && process.env.CI ) {
    throw new Error( "HDP_TEST_POSTGRES_URL is not set: CI must run the data layer's tests on PostgreSQL too." );
}
const settled = ( promise, ms ) => Promise.race( [ promise.then( () => "done" ), new Promise( ( resolve ) => setTimeout( () => resolve( "waiting" ), ms ) ) ] );

describe( "PostgreSQL with two connections", { skip: POSTGRES ? false : "HDP_TEST_POSTGRES_URL is not set" }, () => {

    const schema = `test_${ crypto.randomBytes( 6 ).toString( "hex" ) }`;
    let db;
    before( async () => {
        db = await openDatabase( POSTGRES, { schema: schema } );
        await migrateSchema( db );
        await ensureSpec( db, "e-prescription", "module" );
    } );
    after( async () => {
        await db.run( `DROP SCHEMA ${ schema } CASCADE` );
        await db.close();
    } );

    // Under READ COMMITTED the guard reads `frozen` without a lock: a freeze committed between the guard and the batch's
    // COMMIT let a write land on a frozen version.
    it( "makes a freeze wait for a guarded batch that has passed its guard", async () => {
        const id = await storeVersion( db, { spec: "e-prescription", kind: "module", number: null, stage: "development", content: moduleVersion( null ) } );
        const writer = new pg.Client( { connectionString: POSTGRES, options: `-c search_path=${ schema }` } );
        const freezer = new pg.Client( { connectionString: POSTGRES, options: `-c search_path=${ schema }` } );
        await writer.connect();
        await freezer.connect();
        try {
            await writer.query( "BEGIN" );
            for ( const statement of guardStatements( id ) ) {
                await writer.query( statement.sql.replace( "?", "$1" ), statement.params );
            }
            const freeze = freezer.query( "UPDATE versions SET frozen = 1 WHERE id = $1", [ id ] );
            assert.equal( await settled( freeze, 500 ), "waiting" );
            await writer.query( "UPDATE versions SET content_hash = 'written-before-the-freeze' WHERE id = $1", [ id ] );
            await writer.query( "COMMIT" );
            await freeze;
        } finally {
            await writer.end();
            await freezer.end();
        }
    } );

    // The connection dies inside the batch: the driver's ROLLBACK then failed too, and its "Client was closed" replaced
    // the batch's own error, and the dead client went back to the pool (CodeRabbit on #14).
    it( "keeps a batch's own error when its connection dies in it, and discards the connection", async () => {
        await assert.rejects( db.batch( [ { sql: "SELECT pg_terminate_backend( pg_backend_pid() )", params: [] } ] ), /terminating connection/ );
        assert.deepEqual( await db.get( "SELECT 1 AS n" ), { n: 1 } );
    } );

    // A connection the server drops while it sits idle in the pool emits "error" on the pool; unheard, it killed the
    // process (final review of plan 5).
    it( "survives an idle connection the server drops", async () => {
        const victim = await openDatabase( POSTGRES, { schema: schema } );
        try {
            const { pid } = await victim.get( "SELECT pg_backend_pid() AS pid" );
            await db.get( "SELECT pg_terminate_backend( ? ) AS ended", [ pid ] );
            await new Promise( ( resolve ) => setTimeout( resolve, 300 ) );
            assert.deepEqual( await victim.get( "SELECT 1 AS n" ), { n: 1 } );
        } finally {
            await victim.close();
        }
    } );
} );
