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
 * One test suite, two databases (design record §3.2, §11): every suite written with eachDatabase runs on a fresh
 * SQLite database in memory and, when HDP_TEST_POSTGRES_URL is set, on PostgreSQL in a schema of its own.
 */

const crypto = require( "node:crypto" );
const { after, before, describe } = require( "node:test" );
const { openDatabase } = require( "@health-dev-portal/data/database" );

const POSTGRES = process.env.HDP_TEST_POSTGRES_URL;

// In CI a missing PostgreSQL is a failure, never a skip: a suite that did not run looks exactly like one that passed.
if ( !POSTGRES && process.env.CI ) {
    throw new Error( "HDP_TEST_POSTGRES_URL is not set: CI must run the data layer's tests on PostgreSQL too." );
}

const TARGETS = [
    { name: "sqlite", open: async () => ( { db: await openDatabase( "sqlite::memory:" ), dispose: async () => {} } ) }
];
if ( POSTGRES ) {
    TARGETS.push( { name: "postgres", open: async () => {
        // A schema per suite: test files run in parallel against one server, and each drops what it made.
        const schema = `test_${ crypto.randomBytes( 6 ).toString( "hex" ) }`;
        const db = await openDatabase( POSTGRES, { schema: schema } );
        return { db: db, dispose: async () => db.run( `DROP SCHEMA ${ schema } CASCADE` ) };
    } } );
}

/**
 * The names of the databases eachDatabase runs on, in order.
 *
 * @type {string[]}
 * @public
 */
module.exports.DATABASES = TARGETS.map( ( target ) => target.name );

/**
 * Runs `body` once per database, each in its own `describe`, with a database opened before the suite and closed —
 * for PostgreSQL, its schema dropped — after it.
 *
 * @method
 * @param {string} title
 * @param {function( function(): import( "#definitions" ).Database ): void} body Receives a getter, since the database
 *     opens only when the suite starts.
 * @public
 */
module.exports.eachDatabase = ( title, body ) => {
    for ( const target of TARGETS ) {
        describe( `${ title } (${ target.name })`, () => {
            let opened = null;
            before( async () => {
                opened = await target.open();
            } );
            after( async () => {
                if ( opened ) {
                    await opened.dispose();
                    await opened.db.close();
                }
            } );
            body( () => opened.db );
        } );
    }
};
