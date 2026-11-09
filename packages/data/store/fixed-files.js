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
 * The fixed files of a published version (design record §7.7, §7.9; plan 8a, decision 8): made once, when the version
 * is frozen and public, and never changed. A frozen version cannot change, so a file made from it is the same whenever
 * it is made, and the first one made is the one kept.
 */

const { codeListCsv, codeListJson } = require( "@health-dev-portal/spec-model/downloads" );
const { storeFile } = require( "#files" );
const { findPublishedById } = require( "#published" );

/**
 * The files each kind of spec has, by kind. `make` turns the version's content into the file's text. A kind that is
 * not here has none yet.
 *
 * @type {Object<string, Array<{name: string, type: string, make: function( Object ): string}>>}
 * @public
 */
module.exports.FIXED_FILES = Object.freeze( {
    "code-list": Object.freeze( [
        Object.freeze( { name: "list.json", type: "application/json; charset=utf-8", make: codeListJson } ),
        Object.freeze( { name: "list.csv", type: "text/csv; charset=utf-8", make: codeListCsv } )
    ] )
} );

// A version's public content when it is public and frozen: only a frozen version has content that can no longer
// change, so only its files can be made once and kept. The same rule serves the site and the promotion.
const frozenPublic = async ( db, versionId ) => {
    const published = await findPublishedById( db, versionId );
    return published && published.frozen && published.content ? published : null;
};

const rowOf = ( db, versionId, name ) => db.get( "SELECT hash FROM fixed_files WHERE version_id = ? AND name = ?", [ versionId, name ] );

// Makes one file if it has no row, and answers the hash that is there afterwards. Two requests that both found no row
// both make the file and both write; the primary key keeps the first, and each reads back the winner rather than
// trusting its own hash.
const ensured = async ( db, store, published, file ) => {
    const existing = await rowOf( db, published.id, file.name );
    if ( existing ) {
        return existing.hash;
    }
    const hash = await storeFile( db, store, Buffer.from( file.make( published.content ), "utf8" ), file.type );
    await db.batch( [ { sql: "INSERT INTO fixed_files ( version_id, name, hash, created_at ) VALUES ( ?, ?, ?, ? ) ON CONFLICT ( version_id, name ) DO NOTHING",
        params: [ published.id, file.name, hash, new Date().toISOString() ] } ] );
    return ( await rowOf( db, published.id, file.name ) ).hash;
};

/**
 * A fixed file of a version, made first if it is not there yet.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {string} versionId
 * @param {string} name e.g. `list.json`.
 * @returns {Promise<{bytes: Buffer, type: string, hash: string}|null>} `null` unless the version is public and frozen
 *     and its kind has a file of that name; `null` too, reported on the console's error stream, when the file is recorded
 *     but the store has lost its bytes.
 * @public
 */
module.exports.fixedFile = async ( db, store, versionId, name ) => {
    const published = await frozenPublic( db, versionId );
    // The name is looked up among the kind's own, never used as a path or a key on its own.
    const file = published && ( module.exports.FIXED_FILES[ published.kind ] || [] ).find( ( candidate ) => candidate.name === name );
    if ( !file ) {
        return null;
    }
    const hash = await ensured( db, store, published, file );
    const bytes = await store.get( hash );
    if ( !bytes ) {
        // The row stays, so the file is never made again and its download answers 404 for good: said at error level,
        // or no one learns why (final review, ledger line 51). Nothing of the data goes in the message but the
        // version's ID and the file's name. The data layer has no logger of its own; console.error is its error level.
        console.error( `The fixed file ${ name } of version ${ versionId } is recorded, but its bytes are missing from the file store.` );
        return null;
    }
    return { bytes: bytes, type: file.type, hash: hash };
};

/**
 * Makes every fixed file of a version that is not made yet. A version that is not public and frozen, or whose kind has
 * no files, gets none.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {string} versionId
 * @returns {Promise<void>}
 * @public
 */
module.exports.makeFixedFiles = async ( db, store, versionId ) => {
    const published = await frozenPublic( db, versionId );
    for ( const file of published ? module.exports.FIXED_FILES[ published.kind ] || [] : [] ) {
        await ensured( db, store, published, file );
    }
};
