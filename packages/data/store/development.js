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

const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { ConstraintError } = require( "#database" );
const { authorOf, recheckVersion } = require( "#editing" );
const { ensureSpec, findVersion, loadAnomalies, loadVersion, storeContent, storeVersion } = require( "#versions" );

// What a development version starts from, the most advanced first (design record §7.1).
const SOURCES = Object.freeze( [ STAGE.IMPLEMENTATION, STAGE.TESTING, STAGE.PRODUCTION ] );

const developing = ( db, spec ) => findVersion( db, spec, { stage: STAGE.DEVELOPMENT } );

const sourceOf = async ( db, spec ) => {
    for ( const stage of SOURCES ) {
        const found = await findVersion( db, spec, { stage: stage } );
        if ( found ) {
            return found;
        }
    }
    return null;
};

// A spec has one development version at most. Two starts at once both pass the first look; the one-per-stage index
// lets one through, and the other is told so as plainly as if it had come second.
const storeDevelopment = async ( db, input ) => {
    try {
        return await storeVersion( db, { ...input, number: null, stage: STAGE.DEVELOPMENT } );
    } catch ( error ) {
        if ( error instanceof ConstraintError && await developing( db, input.spec ) ) {
            throw new TypeError( `The spec ${ input.spec } already has a development version.`, { cause: error } );
        }
        throw error;
    }
};

/**
 * Starts a spec's next development version from its most advanced one — in implementation, else testing, else
 * production — with no number, that version as its base, and its content and anomalies copied, defects included
 * (design record §7.11). The copy is then checked as an edit is, which also writes its changelog.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Where the blueprint catalogue is.
 * @param {string} spec
 * @returns {Promise<string>} The new version's ID.
 * @throws {TypeError} When the spec already has a development version.
 * @throws {RangeError} When it has no version with content to start from.
 * @public
 */
module.exports.startDevelopment = async ( db, store, spec ) => {
    if ( await developing( db, spec ) ) {
        throw new TypeError( `The spec ${ spec } already has a development version.` );
    }
    const source = await sourceOf( db, spec );
    const loaded = source ? await loadVersion( db, source.id ) : null;
    if ( !loaded || !loaded.content ) {
        throw new RangeError( `The spec ${ spec } has no version with content to start from.` );
    }
    const id = await storeDevelopment( db, { spec: spec, kind: loaded.kind, content: { ...loaded.content, version: null }, anomalies: await loadAnomalies( db, source.id ),
        base: source.id } );
    await recheckVersion( db, store, id );
    return id;
};

/**
 * The workbook route into development (design record §7.11), until the editing screens exist: a version read by the
 * importer replaces the development version's content by identity, so every item it leaves as it was keeps its number
 * and revision, and is then checked and its changelog written. A spec without a development version gets one first —
 * started from its most advanced version, or, for a spec that has none, from nothing.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {string} spec
 * @param {Object} version A module, code-list or rules version as the importer gives it; its change notes are not kept.
 * @param {{actor: string, now: Date}} options Who loads it, and when: an upload is recorded like an edit (§10.1).
 * @returns {Promise<{anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}>} The development
 *     version's anomalies now.
 * @throws {TypeError} For no author, or a spec of another kind.
 * @throws {import( "#versions" ).UnderReviewError} When the development version is under review; nothing is written.
 * @public
 */
module.exports.loadIntoDevelopment = async ( db, store, spec, version, options ) => {
    const author = authorOf( options );
    const content = Object.fromEntries( Object.entries( version ).filter( ( [ field ] ) => field !== "changeNotes" ) );
    await ensureSpec( db, spec, content.kind );
    const found = await developing( db, spec );
    let id;
    if ( found ) {
        id = found.id;
    } else if ( await sourceOf( db, spec ) ) {
        id = await module.exports.startDevelopment( db, store, spec );
    } else {
        id = await storeDevelopment( db, { spec: spec, kind: content.kind, content: { ...content, version: null }, base: null } );
    }
    await storeContent( db, id, { ...content, version: null }, [], author );
    return { anomalies: await recheckVersion( db, store, id ) };
};
