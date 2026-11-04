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

const pg = require( "pg" );
const { ConstraintError } = require( "#errors" );

const INT8 = 20;
// A schema name that needs no quoting, so it can be spelled into SQL and into the connection's search_path.
const SCHEMA = /^[a-z_][a-z0-9_]*$/;
// SQLSTATE class 23, integrity constraint violation: not null, foreign key, unique, check (PostgreSQL appendix A).
const CHECK_VIOLATION = "23514";
const CONSTRAINT_CLASS = "23";

// COUNT(*) is int8, which pg returns as a string to keep values past 2^53 exact. Counts here never come near that, and
// SQLite returns a number, so int8 is a number — on this driver's own type set, never pg's global one.
const TYPES = {
    getTypeParser: ( oid, format ) => oid === INT8 ? ( value ) => value === null ? null : Number( value ) : pg.types.getTypeParser( oid, format )
};

const translated = ( error ) => {
    if ( error && typeof error.code === "string" && error.code.startsWith( CONSTRAINT_CLASS ) ) {
        return new ConstraintError( error.message, error.code === CHECK_VIOLATION ? error.constraint || null : null, error );
    }
    return error;
};

/**
 * Turns the subset's `?` placeholders into PostgreSQL's `$1`, `$2`, … A `?` inside single-quoted text or a
 * double-quoted identifier is left alone, a doubled quote included: `'it''s ?'` stays as it is.
 *
 * @method
 * @param {string} sql
 * @returns {string}
 * @public
 */
module.exports.rewritePlaceholders = ( sql ) => {
    let out = "";
    let quote = null;
    let number = 0;
    for ( const character of sql ) {
        if ( quote ) {
            // A doubled quote closes and at once reopens the quoted text, so toggling twice keeps it quoted.
            if ( character === quote ) {
                quote = null;
            }
            out += character;
        } else if ( character === "'" || character === "\"" ) {
            quote = character;
            out += character;
        } else if ( character === "?" ) {
            number += 1;
            out += `$${ number }`;
        } else {
            out += character;
        }
    }
    return out;
};

/**
 * The PostgreSQL driver, over a `pg` pool (design record §3.2).
 *
 * @private
 */
class PostgresDatabase {

    #pool;

    /**
     * @param {pg.Pool} pool
     */
    constructor( pool ) {
        this.#pool = pool;
    }

    get dialect() {
        return "postgres";
    }

    async #query( client, sql, params ) {
        try {
            return await client.query( module.exports.rewritePlaceholders( sql ), params );
        } catch ( error ) {
            throw translated( error );
        }
    }

    async all( sql, params = [] ) {
        return ( await this.#query( this.#pool, sql, params ) ).rows;
    }

    async get( sql, params = [] ) {
        const rows = ( await this.#query( this.#pool, sql, params ) ).rows;
        return rows.length ? rows[ 0 ] : null;
    }

    async run( sql, params = [] ) {
        return { changes: ( await this.#query( this.#pool, sql, params ) ).rowCount || 0 };
    }

    async batch( statements ) {
        const client = await this.#pool.connect();
        try {
            await client.query( "BEGIN" );
            const results = [];
            for ( const statement of statements ) {
                results.push( { changes: ( await this.#query( client, statement.sql, statement.params ) ).rowCount || 0 } );
            }
            await client.query( "COMMIT" );
            return results;
        } catch ( error ) {
            await client.query( "ROLLBACK" );
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.#pool.end();
    }
}

/**
 * Opens a PostgreSQL database. With a schema, every connection works in it, and it is created if missing.
 *
 * @method
 * @param {string} url
 * @param {{schema?: string}} options
 * @returns {Promise<import( "#definitions" ).Database>}
 * @throws {TypeError} For a schema name that would need quoting.
 * @public
 */
module.exports.openPostgres = async ( url, options ) => {
    const schema = options.schema;
    if ( schema !== undefined && !SCHEMA.test( schema ) ) {
        throw new TypeError( `A schema name must be lower-case letters, digits and underscores: "${ schema }" is not.` );
    }
    const pool = new pg.Pool( { connectionString: url, types: TYPES, ...( schema ? { options: `-c search_path=${ schema }` } : {} ) } );
    if ( schema ) {
        try {
            await pool.query( `CREATE SCHEMA IF NOT EXISTS ${ schema }` );
        } catch ( error ) {
            await pool.end();
            throw error;
        }
    }
    return new PostgresDatabase( pool );
};
