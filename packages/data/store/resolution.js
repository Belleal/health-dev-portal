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
const { GUARD_SQL } = require( "#schema" );
const { FrozenVersionError, findVersion, loadVersion } = require( "#versions" );
const { referencedSpecs } = require( "@health-dev-portal/spec-model/references" );
const { resolutionOrder } = require( "@health-dev-portal/spec-model/stages" );
const { SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );

const RULES = "rules";
const COLUMNS = [ "version_id", "spec_id", "resolved_id", "number", "key_type" ];

// Sorted in JavaScript, never by SQL: PostgreSQL's collation orders text differently from SQLite (design record §3.2).
const bySpec = ( resolutions ) => resolutions.sort( ( a, b ) => a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0 );

const keyTypeOf = async ( db, versionId ) => {
    const row = await db.get( "SELECT data FROM items WHERE version_id = ? AND kind = 'list'", [ versionId ] );
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
module.exports.resolveVersion = async ( db, versionId ) => {
    const version = await loadVersion( db, versionId );
    if ( !version ) {
        throw new RangeError( `There is no version ${ versionId }.` );
    }
    if ( version.frozen ) {
        const rows = await db.all( "SELECT spec_id, resolved_id, number, key_type FROM resolutions WHERE version_id = ?", [ versionId ] );
        return bySpec( rows.map( ( row ) => ( { spec: row.spec_id, version: row.resolved_id, number: row.number, keyType: row.key_type } ) ) );
    }
    if ( version.kind !== SPEC_KIND.MODULE || !version.content ) {
        return [];
    }
    const references = referencedSpecs( version.content );
    const specs = [ ...references.codeLists, ...( references.rules ? [ RULES ] : [] ) ];
    const resolutions = [];
    for ( const spec of specs ) {
        for ( const stage of resolutionOrder( version.stage ) ) {
            const found = await findVersion( db, spec, { stage: stage } );
            if ( found ) {
                resolutions.push( { spec: spec, version: found.id, number: found.number, keyType: found.kind === SPEC_KIND.CODE_LIST ? await keyTypeOf( db, found.id ) : null } );
                break;
            }
        }
    }
    return bySpec( resolutions );
};

/**
 * Records what a version reads, replacing what it recorded before, in one batch that starts with the frozen-version
 * guard: a frozen version's record never changes (design record §7.7).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<Resolution[]>} What was recorded.
 * @throws {FrozenVersionError} When the version is frozen; nothing is written.
 * @public
 */
module.exports.recordResolution = async ( db, versionId ) => {
    const resolutions = await module.exports.resolveVersion( db, versionId );
    try {
        await db.batch( [
            { sql: GUARD_SQL, params: [ versionId ] },
            { sql: "DELETE FROM resolutions WHERE version_id = ?", params: [ versionId ] },
            ...insertStatements( "resolutions", COLUMNS, resolutions.map( ( r ) => [ versionId, r.spec, r.version, r.number, r.keyType ] ) )
        ] );
    } catch ( error ) {
        if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
            throw new FrozenVersionError( versionId );
        }
        throw error;
    }
    return resolutions;
};
