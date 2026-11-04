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

const { insertStatements } = require( "#database" );
const { TABLES, migrateSchema } = require( "#schema" );

const PAGE = 1000;
// Each table's primary key, by which the source is read page by page. The order only has to hold within the source.
const KEYS = Object.freeze( {
    specs: "id", releases: "id", versions: "id", version_stages: "version_id, stage", items: "version_id, item_no", anomalies: "version_id, anomaly_no",
    changelog_entries: "id", resolutions: "version_id, spec_id", files: "hash", settings: "key"
} );

/**
 * A copy refused before anything was written: the target holds data already, or its schema is not the source's.
 *
 * @public
 */
class CopyTargetError extends Error {

    /**
     * @param {string} message
     */
    constructor( message ) {
        super( message );
        this.name = "CopyTargetError";
    }
}
module.exports.CopyTargetError = CopyTargetError;

const migrationsOf = async ( db ) => ( await db.all( "SELECT id FROM schema_migrations" ) ).map( ( row ) => row.id ).sort();

/**
 * Copies a whole database from one driver to the other, identities and history intact (design record §7.11), so work
 * done on the development deployment carries over at launch. The target is migrated first, and refused when its schema
 * differs from the source's or any table already holds a row. Tables are copied in an order in which every reference
 * already exists; a version's base is written in a second pass, since a version may come before its base.
 *
 * @method
 * @param {import( "#definitions" ).Database} source
 * @param {import( "#definitions" ).Database} target
 * @returns {Promise<Object<string, number>>} The rows copied, per table.
 * @throws {CopyTargetError}
 * @public
 */
module.exports.copyDatabase = async ( source, target ) => {
    await migrateSchema( target );
    const [ from, to ] = [ await migrationsOf( source ), await migrationsOf( target ) ];
    if ( from.join( "," ) !== to.join( "," ) ) {
        throw new CopyTargetError( `The target's schema (${ to.join( ", " ) }) is not the source's (${ from.join( ", " ) }).` );
    }
    for ( const table of TABLES ) {
        if ( ( await target.get( `SELECT COUNT(*) AS n FROM ${ table }` ) ).n > 0 ) {
            throw new CopyTargetError( `The target already holds ${ table }: a copy goes into an empty database.` );
        }
    }
    const counts = {};
    const bases = [];
    for ( const table of TABLES ) {
        counts[ table ] = 0;
        for ( let offset = 0; ; offset += PAGE ) {
            const rows = await source.all( `SELECT * FROM ${ table } ORDER BY ${ KEYS[ table ] } LIMIT ? OFFSET ?`, [ PAGE, offset ] );
            if ( rows.length === 0 ) {
                break;
            }
            const columns = Object.keys( rows[ 0 ] );
            const values = rows.map( ( row ) => columns.map( ( column ) => {
                if ( table === "versions" && column === "base_id" && row.base_id !== null ) {
                    bases.push( [ row.base_id, row.id ] );
                    return null;
                }
                return row[ column ];
            } ) );
            await target.batch( insertStatements( table, columns, values ) );
            counts[ table ] += rows.length;
        }
    }
    if ( bases.length ) {
        await target.batch( bases.map( ( params ) => ( { sql: "UPDATE versions SET base_id = ? WHERE id = ?", params: params } ) ) );
    }
    return counts;
};

/**
 * Copies the files a database names from one store to another, skipping those the target already has.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} from
 * @param {import( "#definitions" ).FileStore} to
 * @returns {Promise<number>} How many were copied.
 * @throws {Error} When the database names a file the source store does not have.
 * @public
 */
module.exports.copyFiles = async ( db, from, to ) => {
    let copied = 0;
    for ( const { hash } of await db.all( "SELECT hash FROM files" ) ) {
        if ( await to.has( hash ) ) {
            continue;
        }
        const bytes = await from.get( hash );
        if ( bytes === null ) {
            throw new Error( `The file ${ hash } is recorded but missing from the source store.` );
        }
        await to.put( bytes );
        copied += 1;
    }
    return copied;
};
