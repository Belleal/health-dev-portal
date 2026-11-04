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

const crypto = require( "node:crypto" );
const fs = require( "node:fs/promises" );
const path = require( "node:path" );

const HASH = /^[0-9a-f]{64}$/;
const CATALOGUE = "blueprint-catalogue";

const sha256 = ( bytes ) => crypto.createHash( "sha256" ).update( bytes ).digest( "hex" );

// A hash names a file, and a directory store turns it into a path: anything else is refused before it gets near one.
const checked = ( hash ) => {
    if ( typeof hash !== "string" || !HASH.test( hash ) ) {
        throw new TypeError( "A file is named by the lower-case hex SHA-256 of its bytes." );
    }
    return hash;
};

/**
 * A file store in memory, for tests.
 *
 * @method
 * @returns {import( "#definitions" ).FileStore}
 * @public
 */
module.exports.memoryStore = () => {
    const files = new Map();
    return {
        put: async ( bytes ) => {
            const hash = sha256( bytes );
            if ( !files.has( hash ) ) {
                files.set( hash, Buffer.from( bytes ) );
            }
            return hash;
        },
        get: async ( hash ) => files.has( checked( hash ) ) ? Buffer.from( files.get( hash ) ) : null,
        has: async ( hash ) => files.has( checked( hash ) )
    };
};

/**
 * A file store in a directory: a file lives at `<root>/<first two hex digits>/<hash>`. It is written under a temporary
 * name beside its place and then renamed, so a reader never sees half a file; a hash already there is not written again.
 *
 * @method
 * @param {string} root
 * @returns {import( "#definitions" ).FileStore}
 * @public
 */
module.exports.directoryStore = ( root ) => {
    const place = ( hash ) => path.join( root, hash.slice( 0, 2 ), hash );
    const has = async ( hash ) => {
        try {
            await fs.access( place( checked( hash ) ) );
            return true;
        } catch ( error ) {
            if ( error.code === "ENOENT" ) {
                return false;
            }
            throw error;
        }
    };
    return {
        put: async ( bytes ) => {
            const hash = sha256( bytes );
            if ( await has( hash ) ) {
                return hash;
            }
            await fs.mkdir( path.dirname( place( hash ) ), { recursive: true } );
            const temporary = `${ place( hash ) }.${ crypto.randomBytes( 6 ).toString( "hex" ) }.tmp`;
            await fs.writeFile( temporary, bytes );
            try {
                await fs.rename( temporary, place( hash ) );
            } catch ( error ) {
                // Another writer got there first: on Windows a rename onto an existing file fails. Same hash, same bytes.
                await fs.rm( temporary, { force: true } );
                if ( !( await has( hash ) ) ) {
                    throw error;
                }
            }
            return hash;
        },
        get: async ( hash ) => {
            try {
                return await fs.readFile( place( checked( hash ) ) );
            } catch ( error ) {
                if ( error.code === "ENOENT" ) {
                    return null;
                }
                throw error;
            }
        },
        has: has
    };
};

/**
 * Stores a file and records it, once, with its size and type.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {Uint8Array} bytes
 * @param {string} contentType
 * @returns {Promise<string>} The hash.
 * @public
 */
module.exports.storeFile = async ( db, store, bytes, contentType ) => {
    const hash = await store.put( bytes );
    await db.run( "INSERT INTO files ( hash, size, content_type, created_at ) VALUES ( ?, ?, ?, ? ) ON CONFLICT ( hash ) DO NOTHING",
        [ hash, bytes.length, contentType, new Date().toISOString() ] );
    return hash;
};

/**
 * Reads a setting.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} key
 * @returns {Promise<string|null>}
 * @public
 */
module.exports.readSetting = async ( db, key ) => {
    const row = await db.get( "SELECT value FROM settings WHERE key = ?", [ key ] );
    return row ? row.value : null;
};

/**
 * Writes a setting, replacing its value.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 * @public
 */
module.exports.writeSetting = async ( db, key, value ) => {
    await db.run( "INSERT INTO settings ( key, value ) VALUES ( ?, ? ) ON CONFLICT ( key ) DO UPDATE SET value = excluded.value", [ key, value ] );
};

/**
 * Stores the blueprint catalogue the published XSD set teaches (design record §4.4, §5.2) as a JSON file, and points the
 * setting `blueprint-catalogue` at it.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {import( "@health-dev-portal/spec-model/definitions" ).BlueprintCatalogue} catalogue
 * @returns {Promise<string>} The file's hash.
 * @public
 */
module.exports.storeCatalogue = async ( db, store, catalogue ) => {
    const hash = await module.exports.storeFile( db, store, Buffer.from( JSON.stringify( catalogue ) ), "application/json" );
    await module.exports.writeSetting( db, CATALOGUE, hash );
    return hash;
};

/**
 * Loads the stored blueprint catalogue.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @returns {Promise<import( "@health-dev-portal/spec-model/definitions" ).BlueprintCatalogue|null>} `null` when none is
 *     stored.
 * @throws {Error} When the setting names a file the store does not have.
 * @public
 */
module.exports.loadCatalogue = async ( db, store ) => {
    const hash = await module.exports.readSetting( db, CATALOGUE );
    if ( hash === null ) {
        return null;
    }
    const bytes = await store.get( hash );
    if ( bytes === null ) {
        throw new Error( `The blueprint catalogue ${ hash } is recorded but missing from the file store.` );
    }
    return JSON.parse( bytes.toString( "utf8" ) );
};
