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
 * The fixed files of a published version (design record §7.7, §7.9; plan 8a decision 8, plan 8b decision 2): made once,
 * when the version is frozen and public, and never changed. A frozen version cannot change, nor what it resolved
 * against, so a file made from them is the same whenever it is made, and the first one made is the one kept.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const JSZip = require( "jszip" );
const { changelogJson, codeListCsv, codeListJson, moduleModelJson, sampleMessage } = require( "@health-dev-portal/spec-model/downloads" );
const { LIFECYCLE, SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { compareNumbers } = require( "@health-dev-portal/spec-model/numbers" );
const { messageShape } = require( "@health-dev-portal/spec-model/xsd-shape" );
const { writeMessageXsd } = require( "@health-dev-portal/spec-model/xsd-writer" );
const { storeFile } = require( "#files" );
const { findPublishedById, publishedChangelog } = require( "#published" );
const { resolveVersion } = require( "#resolution" );
const { readContent } = require( "#targets" );

const XML = "application/xml; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const CSV = "text/csv; charset=utf-8";
const ZIP = "application/zip";
const XMLDSIG = "xmldsig-core-schema.xsd";
// W3C's xmldsig schema in the bytes his.bg serves at /api/v1/ (plan 8b, decision 6): without the DOCTYPE of W3C's own
// copy, which points at a DTD on w3.org, so that it compiles offline as the published XSDs import it.
const XMLDSIG_FILE = path.join( __dirname, "..", "assets", XMLDSIG );

// Read when the module loads, where a synchronous read blocks no request and a missing asset stops the start rather than a
// download (CodeRabbit on #4).
const xmldsig = fs.readFileSync( XMLDSIG_FILE );

/**
 * W3C's `xmldsig-core-schema.xsd`, which every generated XSD imports by that name (design record §4.10). Read once,
 * when the module loads.
 *
 * @method
 * @returns {Buffer}
 * @public
 */
module.exports.xmldsigSchema = () => xmldsig;

const text = ( value ) => Buffer.from( value, "utf8" );
const publicMessages = ( content ) => content.messages.filter( ( message ) => message.lifecycle !== LIFECYCLE.WITHDRAWN );

// A file's own failure: what its generator threw, or a sibling the zip needs that could not be made. It is logged and
// answered as no file. Anything else, the database or the store failing while a file is made, is no file's failure and
// propagates: caught as one, a database outage became a 404 cached for a minute (final review of plan 8b).
class NotMadeError extends Error {}
// What a generator itself threw: the same until a deploy changes the generator, so it is remembered (`unmakeable`).
class GeneratorError extends NotMadeError {}
const generated = async ( make ) => {
    try {
        return await make();
    } catch ( error ) {
        throw new GeneratorError( error.message, { cause: error } );
    }
};

// The files whose generator failed in this process, by version and name. Retried, each request for one read every list
// its module reads, CL011's 39,005 entries among them, and logged again, at anyone's asking (CodeRabbit on #4). A
// restart, which every deploy is, forgets them, so a fixed generator still heals them. A zip that missed a sibling is not
// remembered: its sibling may have lost its bytes, which heals without a deploy.
const unmakeable = new Set();

// A module's files (plan 8b, decision 2). Each message's XSD and sample come from that message alone, so one message
// messageShape refuses costs only its own files; generateXsds, which maps them all in one pass, would have stopped every
// one (CodeRabbit on #3). The zip comes last and is made from the stored files, so it holds what is served.
function moduleFiles( published, inputs ) {
    const { content, spec, number } = published;
    const messages = publicMessages( content );
    // The inputs are read outside `generated`, so that a database failing while they are read propagates.
    const xsds = messages.map( ( message ) => ( { name: `NHIS-${ message.code }.xsd`, type: XML, make: async () => {
        const lists = new Map( ( await inputs() ).codeLists.map( ( list ) => [ list.id, list ] ) );
        return generated( () => text( writeMessageXsd( messageShape( message, lists ), { version: content.version } ) ) );
    } } ) );
    const samples = messages.map( ( message ) => ( { name: `${ message.code }.xml`, type: XML, make: async () => {
        const { codeLists, keys } = await inputs();
        return generated( () => text( sampleMessage( message, { spec: spec, number: number }, codeLists, keys ) ) );
    } } ) );
    const model = { name: "model.json", type: JSON_TYPE, make: () => generated( () => text( moduleModelJson( content ) ) ) };
    const changelog = { name: "changelog.json", type: JSON_TYPE, make: async () => {
        const versions = ( await inputs() ).changelog;
        return generated( () => text( changelogJson( spec, number, versions ) ) );
    } };
    const folder = `${ spec }-${ number }`;
    const zip = { name: "all.zip", type: ZIP, make: async ( made ) => {
        const archive = new JSZip();
        for ( const file of xsds ) {
            archive.file( `${ folder }/xsd/${ file.name }`, await made( file.name ) );
        }
        archive.file( `${ folder }/xsd/${ XMLDSIG }`, module.exports.xmldsigSchema() );
        for ( const file of samples ) {
            archive.file( `${ folder }/samples/${ file.name }`, await made( file.name ) );
        }
        archive.file( `${ folder }/model.json`, await made( model.name ) );
        archive.file( `${ folder }/changelog.json`, await made( changelog.name ) );
        return generated( () => archive.generateAsync( { type: "nodebuffer", compression: "DEFLATE" } ) );
    } };
    return [ ...xsds, ...samples, model, changelog, zip ];
}

/**
 * The files a public version has, by its kind (plan 8b, decision 2). A code list has its JSON and its CSV (plan 8a,
 * decision 8). A module has each message's XSD and sample, a message withdrawn excepted, its model, its changelog and the
 * zip of them all, last. The rules have none yet.
 *
 * @method
 * @param {{kind: string, content: Object, spec?: string, number?: string}} published
 * @param {function(): Promise<{codeLists: Array<{id: string, keyType: string}>, keys: Map<string, string>, changelog: Object[]}>|null} inputs
 *     What a module's files are made from besides its content, loaded only when one is made: reading every list a
 *     module reads, CL011's 39,005 entries among them, on each request would cost more than serving the file.
 * @returns {Array<{name: string, type: string, make: function( function( string ): Promise<Buffer> ): Promise<Buffer>}>}
 *     `make` is given `made( name )`, a sibling's stored bytes, which throws when the sibling cannot be made.
 * @public
 */
module.exports.fixedFilesOf = ( published, inputs ) => {
    if ( published.kind === SPEC_KIND.CODE_LIST ) {
        return [
            { name: "list.json", type: JSON_TYPE, make: () => generated( () => text( codeListJson( published.content ) ) ) },
            { name: "list.csv", type: CSV, make: () => generated( () => text( codeListCsv( published.content ) ) ) }
        ];
    }
    return published.kind === SPEC_KIND.MODULE ? moduleFiles( published, inputs ) : [];
};

// The first key of a list version that has not expired there: one whose validUntil is after the version (plan 8a,
// decision 9). A sample's coded value is a real key, so that the message tester will accept it (plan 8b, decision 3).
const firstValidKey = ( list, number ) => {
    const entry = list.entries.find( ( one ) => one.validUntil === null || one.validUntil === undefined || compareNumbers( one.validUntil, number ) > 0 );
    return entry ? entry.key : undefined;
};

// A module's inputs: the lists it recorded reading (§4.8) with their key types and first valid keys, and its spec's
// public changelog. Loaded once per call, and only when a file is made.
const inputsOf = ( db, published ) => {
    let loaded = null;
    return () => {
        loaded = loaded || ( async () => {
            const codeLists = [];
            const keys = new Map();
            for ( const resolution of await resolveVersion( db, published.id ) ) {
                if ( resolution.keyType === null ) {
                    continue;
                }
                codeLists.push( { id: resolution.spec, keyType: resolution.keyType } );
                const list = await readContent( db, resolution.version );
                const key = list && list.list ? firstValidKey( list.list, list.version ) : undefined;
                if ( key !== undefined ) {
                    keys.set( resolution.spec, key );
                }
            }
            return { codeLists: codeLists, keys: keys, changelog: await publishedChangelog( db, published.spec ) };
        } )();
        return loaded;
    };
};

// A version's public content when it is public and frozen: only a frozen version has content that can no longer
// change, so only its files can be made once and kept. The same rule serves the site and the promotion.
const frozenPublic = async ( db, versionId ) => {
    const published = await findPublishedById( db, versionId );
    return published && published.frozen && published.content ? published : null;
};

const rowOf = ( db, versionId, name ) => db.get( "SELECT hash FROM fixed_files WHERE version_id = ? AND name = ?", [ versionId, name ] );

// Makes one file if it has no row, and answers the hash that is there afterwards. Two requests that both found no row
// both make the file and both write; the primary key keeps the first, and each reads back the winner rather than
// trusting its own hash. A file whose generator fails is not stored: its error is logged with the version and the name,
// the answer is null, and the failure is remembered until the process restarts, so a generator fixed by a deploy heals it
// (plan 8b, decision 2). Any other failure, of the database or the store, is not the file's and propagates
// (`NotMadeError`).
const ensured = async ( db, store, published, files, file ) => {
    const existing = await rowOf( db, published.id, file.name );
    if ( existing ) {
        return existing.hash;
    }
    const key = `${ published.id }/${ file.name }`;
    if ( unmakeable.has( key ) ) {
        return null;
    }
    const made = async ( name ) => {
        const sibling = files.find( ( candidate ) => candidate.name === name );
        const hash = sibling ? await ensured( db, store, published, files, sibling ) : null;
        const bytes = hash === null ? null : await store.get( hash );
        if ( !bytes ) {
            throw new NotMadeError( `${ name } could not be made` );
        }
        return bytes;
    };
    let bytes;
    try {
        bytes = await file.make( made );
    } catch ( error ) {
        if ( !( error instanceof NotMadeError ) ) {
            throw error;
        }
        if ( error instanceof GeneratorError ) {
            unmakeable.add( key );
        }
        // The data layer has no logger of its own; console.error is its error level. Nothing of the data goes in the
        // message but the version's ID, the file's name and what the generator said (plan 8a, final review).
        console.error( `The fixed file ${ file.name } of version ${ published.id } could not be made: ${ error.message }` );
        return null;
    }
    const hash = await storeFile( db, store, bytes, file.type );
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
 * @param {string} name e.g. `list.json`, `NHIS-P001.xsd`, `all.zip`.
 * @returns {Promise<{bytes: Buffer, type: string, hash: string}|null>} `null` unless the version is public and frozen
 *     and its kind has a file of that name; `null` too, reported on the console's error stream, when the file cannot be
 *     made or is recorded but the store has lost its bytes.
 * @public
 */
module.exports.fixedFile = async ( db, store, versionId, name ) => {
    const published = await frozenPublic( db, versionId );
    // The name is looked up among the version's own, never used as a path or a key on its own.
    const files = published ? module.exports.fixedFilesOf( published, inputsOf( db, published ) ) : [];
    const file = files.find( ( candidate ) => candidate.name === name );
    if ( !file ) {
        return null;
    }
    const hash = await ensured( db, store, published, files, file );
    if ( hash === null ) {
        return null;
    }
    const bytes = await store.get( hash );
    if ( !bytes ) {
        // The row stays, so the file is never made again and its download answers 404 for good: said at error level,
        // or no one learns why (final review, ledger line 51). Nothing of the data goes in the message but the
        // version's ID and the file's name.
        console.error( `The fixed file ${ name } of version ${ versionId } is recorded, but its bytes are missing from the file store.` );
        return null;
    }
    return { bytes: bytes, type: file.type, hash: hash };
};

/**
 * Makes every fixed file of a version that is not made yet. A version that is not public and frozen, or whose kind has
 * no files, gets none. A file that cannot be made is logged and left out, and the others are still made.
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
    const files = published ? module.exports.fixedFilesOf( published, inputsOf( db, published ) ) : [];
    for ( const file of files ) {
        await ensured( db, store, published, files, file );
    }
};
