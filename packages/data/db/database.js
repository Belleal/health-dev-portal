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

const { ConstraintError } = require( "#errors" );
const { openSqlite } = require( "#sqlite-driver" );

/**
 * The most parameters one statement may bind: D1's limit, the strictest of the three databases (design record §3.2).
 *
 * @type {number}
 * @public
 */
const MAX_PARAMETERS = 100;
module.exports.MAX_PARAMETERS = MAX_PARAMETERS;

module.exports.ConstraintError = ConstraintError;

const SQLITE = "sqlite:";
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Opens a database by its URL: `sqlite::memory:` or `sqlite:<path>`.
 *
 * A URL may carry a password, so an error names only its scheme, never the URL.
 *
 * @method
 * @param {string} url
 * @returns {Promise<import( "#definitions" ).Database>}
 * @throws {TypeError} For a scheme no driver serves.
 * @public
 */
module.exports.openDatabase = async ( url ) => {
    if ( typeof url === "string" && url.startsWith( SQLITE ) ) {
        return openSqlite( url.slice( SQLITE.length ) );
    }
    const scheme = typeof url === "string" ? SCHEME.exec( url ) : null;
    throw new TypeError( `No database driver for ${ scheme ? `the scheme "${ scheme[ 1 ] }"` : "this URL" }: use sqlite:<path> or sqlite::memory:.` );
};

/**
 * Multi-row inserts of the given rows, each statement binding at most `MAX_PARAMETERS` values.
 *
 * @method
 * @param {string} table
 * @param {string[]} columns
 * @param {Array<Array<string|number|null>>} rows Each in the order of `columns`.
 * @returns {import( "#definitions" ).Statement[]} None for no rows.
 * @throws {RangeError} When one row alone has more columns than a statement may bind.
 * @public
 */
module.exports.insertStatements = ( table, columns, rows ) => {
    const perStatement = Math.floor( MAX_PARAMETERS / columns.length );
    if ( perStatement < 1 ) {
        throw new RangeError( `A row of ${ table } binds ${ columns.length } values; a statement may bind ${ MAX_PARAMETERS }.` );
    }
    const tuple = `( ${ columns.map( () => "?" ).join( ", " ) } )`;
    const statements = [];
    for ( let start = 0; start < rows.length; start += perStatement ) {
        const chunk = rows.slice( start, start + perStatement );
        statements.push( {
            sql: `INSERT INTO ${ table } ( ${ columns.join( ", " ) } ) VALUES ${ chunk.map( () => tuple ).join( ", " ) }`,
            params: chunk.flat()
        } );
    }
    return statements;
};
