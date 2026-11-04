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
 * SQLite database in memory, and again on PostgreSQL once that driver exists.
 */

const { after, before, describe } = require( "node:test" );
const { openDatabase } = require( "@health-dev-portal/data/database" );

const TARGETS = [
    { name: "sqlite", open: () => openDatabase( "sqlite::memory:" ) }
];

/**
 * Runs `body` once per database, each in its own `describe`, with a database opened before the suite and closed
 * after it.
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
            let db = null;
            before( async () => {
                db = await target.open();
            } );
            after( async () => {
                if ( db ) {
                    await db.close();
                }
            } );
            body( () => db );
        } );
    }
};
