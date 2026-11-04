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
 * What only the PostgreSQL driver does: `?` read as `$n`, and each suite working in a schema of its own.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { rewritePlaceholders } = require( "#postgres-driver" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { eachDatabase } = require( "./support/databases" );

describe( "rewritePlaceholders", () => {

    it( "numbers placeholders, and leaves quoted text alone", () => {
        assert.equal( rewritePlaceholders( "SELECT ?, '?', 'it''s ?', \"a?\" FROM t WHERE a = ?" ), "SELECT $1, '?', 'it''s ?', \"a?\" FROM t WHERE a = $2" );
    } );

    it( "leaves SQL without placeholders as it is", () => {
        assert.equal( rewritePlaceholders( "SELECT 1" ), "SELECT 1" );
    } );
} );

describe( "openDatabase for PostgreSQL", () => {

    it( "refuses a schema name it would have to quote", async () => {
        await assert.rejects( openDatabase( "postgres://postgres@localhost:1/postgres", { schema: "x; DROP TABLE y" } ), { name: "TypeError" } );
    } );
} );

eachDatabase( "Schema isolation", ( db ) => {

    it( "sees only its own tables", async () => {
        await db().run( "CREATE TABLE only_here ( a INTEGER )" );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM only_here" ), { n: 0 } );
    } );
} );
