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
 * The database interface every driver offers (design record §3.2): single statements, and batches that are all or
 * nothing, since D1 over HTTP has no transaction a caller could hold open.
 */

const { before, beforeEach, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { insertStatements, openDatabase } = require( "@health-dev-portal/data/database" );
const { eachDatabase } = require( "./support/databases" );

eachDatabase( "Database", ( db ) => {

    before( async () => db().run( "CREATE TABLE t ( a INTEGER PRIMARY KEY, b TEXT, CONSTRAINT positive CHECK ( a > 0 ) )" ) );
    beforeEach( async () => db().run( "DELETE FROM t" ) );

    it( "runs a statement and reads rows back", async () => {
        assert.deepEqual( await db().run( "INSERT INTO t ( a, b ) VALUES ( ?, ? )", [ 1, "x" ] ), { changes: 1 } );
        assert.deepEqual( await db().all( "SELECT a, b FROM t" ), [ { a: 1, b: "x" } ] );
        assert.deepEqual( await db().get( "SELECT b FROM t WHERE a = ?", [ 1 ] ), { b: "x" } );
        assert.equal( await db().get( "SELECT b FROM t WHERE a = ?", [ 2 ] ), null );
    } );

    it( "binds a value holding ? and $1 without reading it as a placeholder", async () => {
        await db().run( "INSERT INTO t ( a, b ) VALUES ( ?, ? )", [ 1, "a?b $1 'c' \"d\"" ] );
        assert.deepEqual( await db().get( "SELECT a, '?' AS q FROM t WHERE b = ?", [ "a?b $1 'c' \"d\"" ] ), { a: 1, q: "?" } );
    } );

    it( "counts as a number, and keeps null as null", async () => {
        await db().batch( [
            { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 1, null ] },
            { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 2, "y" ] }
        ] );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM t" ), { n: 2 } );
        assert.deepEqual( await db().get( "SELECT b FROM t WHERE a = 1" ), { b: null } );
    } );

    it( "runs a batch all or nothing", async () => {
        await assert.rejects( db().batch( [
            { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 1, "x" ] },
            { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 1, "again" ] }
        ] ), { name: "ConstraintError" } );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM t" ), { n: 0 } );
    } );

    it( "names the CHECK constraint a statement broke", async () => {
        await assert.rejects( db().run( "INSERT INTO t ( a, b ) VALUES ( ?, ? )", [ -1, "x" ] ), { name: "ConstraintError", constraint: "positive" } );
    } );

    it( "reports each statement's changes in a batch", async () => {
        await db().run( "INSERT INTO t ( a, b ) VALUES ( ?, ? )", [ 1, "x" ] );
        assert.deepEqual( await db().batch( [
            { sql: "UPDATE t SET b = ? WHERE a = ?", params: [ "y", 1 ] },
            { sql: "UPDATE t SET b = ? WHERE a = ?", params: [ "z", 2 ] }
        ] ), [ { changes: 1 }, { changes: 0 } ] );
    } );

    // When a transaction has already ended — SQLite rolls back by itself after SQLITE_FULL or SQLITE_IOERR — the
    // driver's own ROLLBACK failed, and its "no transaction is active" replaced the error a caller needs (CodeRabbit on
    // #14). A ROLLBACK inside the batch ends it the same way.
    it( "keeps a batch's own error when its transaction has already ended", async () => {
        await assert.rejects( db().batch( [
            { sql: "ROLLBACK", params: [] },
            { sql: "NOT VALID SQL", params: [] }
        ] ), ( error ) => /syntax error/.test( error.message ) && !/no transaction/.test( error.message ) );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM t" ), { n: 0 } );
    } );
} );

describe( "insertStatements", () => {

    it( "keeps every statement within 100 parameters", () => {
        const rows = Array.from( { length: 40 }, ( _, i ) => [ i, `k${ i }`, null ] );
        assert.deepEqual( insertStatements( "t", [ "a", "b", "c" ], rows ).map( ( statement ) => statement.params.length ), [ 99, 21 ] );
        assert.match( insertStatements( "t", [ "a" ], [ [ 1 ], [ 2 ] ] )[ 0 ].sql, /^INSERT INTO t \( a \) VALUES \( \? \), \( \? \)$/ );
    } );

    it( "writes nothing for no rows", () => {
        assert.deepEqual( insertStatements( "t", [ "a" ], [] ), [] );
    } );
} );

describe( "openDatabase", () => {

    it( "refuses a scheme it does not know, without repeating the URL", async () => {
        await assert.rejects( openDatabase( "mysql://user:secret@host/db" ),
            ( error ) => error instanceof TypeError && /mysql/.test( error.message ) && !/secret/.test( error.message ) );
    } );
} );
