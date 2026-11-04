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

const { DatabaseSync } = require( "node:sqlite" );
const { ConstraintError } = require( "#errors" );

// SQLITE_CONSTRAINT, the primary result code under every extended one: CHECK is 275, PRIMARYKEY 1555, UNIQUE 2067,
// FOREIGNKEY 787 (measured with node:sqlite on SQLite 3.53.1).
const SQLITE_CONSTRAINT = 19;
const CHECK = /^CHECK constraint failed: (\S+)$/;

// Prepared statements are cached per SQL text: a version of CL011 is thousands of the same multi-row insert. The cap
// keeps ad-hoc SQL from growing the cache without bound.
const CACHE_LIMIT = 200;

const translated = ( error ) => {
    if ( error && typeof error.errcode === "number" && ( error.errcode & 0xff ) === SQLITE_CONSTRAINT ) {
        const named = CHECK.exec( error.message );
        return new ConstraintError( error.message, named ? named[ 1 ] : null, error );
    }
    return error;
};

// node:sqlite returns null-prototype rows; callers compare them with deepEqual and spread them.
const plain = ( row ) => ( { ...row } );

/**
 * The SQLite driver, over `node:sqlite` (design record §3.2). It is synchronous underneath; the interface is
 * asynchronous so a caller cannot tell it from the PostgreSQL or D1 driver.
 *
 * @private
 */
class SqliteDatabase {

    #db;
    #statements = new Map();

    /**
     * @param {string} location A file path, or `:memory:`.
     */
    constructor( location ) {
        this.#db = new DatabaseSync( location );
        // SQLite enforces foreign keys only when asked, per connection; D1 and PostgreSQL always do.
        this.#db.exec( "PRAGMA foreign_keys = ON" );
    }

    get dialect() {
        return "sqlite";
    }

    #prepared( sql ) {
        let statement = this.#statements.get( sql );
        if ( !statement ) {
            if ( this.#statements.size >= CACHE_LIMIT ) {
                this.#statements.clear();
            }
            statement = this.#db.prepare( sql );
            this.#statements.set( sql, statement );
        }
        return statement;
    }

    #running( operation ) {
        try {
            return operation();
        } catch ( error ) {
            throw translated( error );
        }
    }

    async all( sql, params = [] ) {
        return this.#running( () => this.#prepared( sql ).all( ...params ).map( plain ) );
    }

    async get( sql, params = [] ) {
        const row = this.#running( () => this.#prepared( sql ).get( ...params ) );
        return row ? plain( row ) : null;
    }

    async run( sql, params = [] ) {
        return { changes: Number( this.#running( () => this.#prepared( sql ).run( ...params ) ).changes ) };
    }

    async batch( statements ) {
        this.#db.exec( "BEGIN" );
        try {
            const results = statements.map( ( statement ) => ( { changes: Number( this.#prepared( statement.sql ).run( ...statement.params ).changes ) } ) );
            this.#db.exec( "COMMIT" );
            return results;
        } catch ( error ) {
            this.#db.exec( "ROLLBACK" );
            throw translated( error );
        }
    }

    async close() {
        this.#statements.clear();
        this.#db.close();
    }
}

/**
 * Opens a SQLite database.
 *
 * @method
 * @param {string} location A file path, or `:memory:`.
 * @returns {import( "#definitions" ).Database}
 * @public
 */
module.exports.openSqlite = ( location ) => new SqliteDatabase( location );
