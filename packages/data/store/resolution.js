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

const { ConstraintError, insertStatements } = require( "#database" );
const { guardStatements, staleStatement } = require( "#schema" );
const { FrozenVersionError, findVersion, loadVersion } = require( "#versions" );
const { referencedSpecs } = require( "@health-dev-portal/spec-model/references" );
const { resolutionOrder } = require( "@health-dev-portal/spec-model/stages" );
const { SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );

const RULES = "rules";
const COLUMNS = [ "version_id", "spec_id", "resolved_id", "number", "key_type" ];

// Sorted in JavaScript, never by SQL: PostgreSQL's collation orders text differently from SQLite (design record §3.2).
const bySpec = ( resolutions ) => resolutions.sort( ( a, b ) => a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0 );

// A list in implementation is read as approved: its pending changes are no one's to depend on until approved (plan 6b,
// decision 4).
const keyTypeOf = async ( db, versionId ) => {
    const version = await db.get( "SELECT stage, approved_hash FROM versions WHERE id = ?", [ versionId ] );
    const table = version && version.stage === STAGE.IMPLEMENTATION && version.approved_hash !== null ? "approved_items" : "items";
    const row = await db.get( `SELECT data FROM ${ table } WHERE version_id = ? AND kind = 'list'`, [ versionId ] );
    return row ? JSON.parse( row.data ).keyType : null;
};

/**
 * @typedef {Object} Resolution One spec a version reads, and the version of it read (design record §4.8).
 * @property {string} spec
 * @property {string} version The ID of the version read.
 * @property {string|null} number `null` when the version read is in development.
 * @property {string|null} keyType A code list's key type, which the module's XSDs depend on; `null` for the rules.
 */

/**
 * What a version reads (design record §4.8). A module reads each code list it names and, if it names a rule, the rules:
 * each in the module's own stage, else the nearest stage further on. A spec found in none is left out, and linking
 * reports it. A frozen version reads what it recorded when it froze, whatever has moved since. A code list or the
 * rules read nothing.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<Resolution[]>} Sorted by spec.
 * @throws {RangeError} When there is no such version.
 * @public
 */
module.exports.resolveVersion = async ( db, versionId ) => resolvedOf( db, await loaded( db, versionId ) );

const loaded = async ( db, versionId ) => {
    const version = await loadVersion( db, versionId );
    if ( !version ) {
        throw new RangeError( `There is no version ${ versionId }.` );
    }
    return version;
};

const byId = async ( db, versionId ) => {
    const row = await db.get( "SELECT v.id, v.number, s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?", [ versionId ] );
    return row ? { id: row.id, number: row.number, kind: row.kind } : null;
};

// What a module reads from `stage` on, where `after` says what a spec will hold in a stage once a move is made: a version
// moving there, or `null` for one leaving it (plan 6b, decision 8).
const resolveIn = async ( db, version, stage, after ) => {
    if ( version.kind !== SPEC_KIND.MODULE || !version.content ) {
        return [];
    }
    const references = referencedSpecs( version.content );
    const specs = [ ...references.codeLists, ...( references.rules ? [ RULES ] : [] ) ];
    const resolutions = [];
    for ( const spec of specs ) {
        for ( const where of resolutionOrder( stage ) ) {
            const placed = after.get( spec );
            let found;
            if ( placed && placed.has( where ) ) {
                found = placed.get( where ) === null ? null : await byId( db, placed.get( where ) );
            } else {
                found = await findVersion( db, spec, { stage: where } );
            }
            if ( found ) {
                resolutions.push( { spec: spec, version: found.id, number: found.number, keyType: found.kind === SPEC_KIND.CODE_LIST ? await keyTypeOf( db, found.id ) : null } );
                break;
            }
        }
    }
    return bySpec( resolutions );
};

const resolvedOf = async ( db, version ) => {
    if ( version.frozen ) {
        const rows = await db.all( "SELECT spec_id, resolved_id, number, key_type FROM resolutions WHERE version_id = ?", [ version.id ] );
        return bySpec( rows.map( ( row ) => ( { spec: row.spec_id, version: row.resolved_id, number: row.number, keyType: row.key_type } ) ) );
    }
    return resolveIn( db, version, version.stage, new Map() );
};

/**
 * What a version will read in a stage once a move is made (design record §4.8): as `resolveVersion`, from `stage` on,
 * where `after` overrides what a spec holds in a stage. A move checks a module against what it will read, counting what
 * moves with it (plan 6b, decision 8). It ignores any record, since it asks about a state that is not yet.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @param {string} stage One of the stages a version moves through.
 * @param {Map<string, Map<string, string|null>>} after By spec, then stage: the version it will hold, or `null` for none.
 * @returns {Promise<Resolution[]>} Sorted by spec; each number as stored.
 * @throws {RangeError} When there is no such version.
 * @public
 */
module.exports.resolveAt = async ( db, versionId, stage, after ) => resolveIn( db, await loaded( db, versionId ), stage, after );

/**
 * The statements that record what a version reads, replacing its record: `recordResolution`'s, for an approval or a
 * promotion to write in its own batch, behind its own guards.
 *
 * @method
 * @param {string} versionId
 * @param {Resolution[]} resolutions
 * @returns {import( "#definitions" ).Statement[]}
 * @public
 */
module.exports.resolutionStatements = ( versionId, resolutions ) => [
    { sql: "DELETE FROM resolutions WHERE version_id = ?", params: [ versionId ] },
    ...insertStatements( "resolutions", COLUMNS, resolutions.map( ( r ) => [ versionId, r.spec, r.version, r.number, r.keyType ] ) )
];

// A content that keeps changing while it is resolved is being edited without pause; past this, the caller decides.
const ATTEMPTS = 3;

/**
 * Records what a version reads, replacing what it recorded before, in one batch behind the frozen-version guard: a
 * frozen version's record never changes (design record §7.7). The batch also checks, under the guard's lock, that the
 * content is still the one it was resolved from; if an edit came in between, it resolves again. Without that, a record
 * of what the old content read was written, and a freeze kept it for good (CodeRabbit on #14).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<Resolution[]>} What was recorded.
 * @throws {FrozenVersionError} When the version is frozen; nothing is written.
 * @throws {Error} When the content changed under every one of three attempts.
 * @public
 */
module.exports.recordResolution = async ( db, versionId ) => {
    for ( let attempt = 1; attempt <= ATTEMPTS; attempt += 1 ) {
        const version = await loaded( db, versionId );
        const resolutions = await resolvedOf( db, version );
        try {
            await db.batch( [
                ...guardStatements( versionId ),
                ...( version.contentHash === null ? [] : [ staleStatement( versionId, version.contentHash ) ] ),
                ...module.exports.resolutionStatements( versionId, resolutions )
            ] );
            return resolutions;
        } catch ( error ) {
            if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
                throw new FrozenVersionError( versionId );
            }
            if ( !( error instanceof ConstraintError && error.constraint === "stale_guard" ) ) {
                throw error;
            }
        }
    }
    throw new Error( `Version ${ versionId } changed while it was resolved, ${ ATTEMPTS } times over.` );
};
