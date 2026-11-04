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

const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );
const { SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { ERROR_CODE_LIST } = require( "@health-dev-portal/spec-model/links" );
const { resolutionOrder } = require( "@health-dev-portal/spec-model/stages" );
const { loadCatalogue } = require( "#files" );
const { resolveVersion } = require( "#resolution" );
const { findVersion, loadVersion } = require( "#versions" );

// The rules are one spec, under this ID, as resolution names it.
const RULES = "rules";

// Plan 6a, decision 7: every edit is checked against what its version reads, and a list such as CL011 has 39,005 entries.
const CACHED = 50;
const frozen = new Map();

// A frozen version's content never changes (design record §7.7), so it is read once and kept, least recently used first
// out. `loadVersion` reads the row before the items, so content read under `frozen` is already final. It is frozen in the
// cache too: every caller shares the one object.
const contentOf = async ( db, versionId ) => {
    if ( frozen.has( versionId ) ) {
        const content = frozen.get( versionId );
        frozen.delete( versionId );
        frozen.set( versionId, content );
        return content;
    }
    const version = await loadVersion( db, versionId );
    if ( version && version.frozen && version.content ) {
        frozen.set( versionId, deepFreeze( version.content ) );
        if ( frozen.size > CACHED ) {
            frozen.delete( frozen.keys().next().value );
        }
    }
    return version ? version.content : null;
};

/**
 * What a version's content is checked against on every edit (design record §5.4).
 * - For a module, the lists and the rules it reads (design record §4.8), and the stored blueprint catalogue. A list or
 *   the rules found in no stage is left out, and linking reports it.
 * - For the rules, CL999 as found from the rules' own stage onwards, which their error codes are checked against.
 * - For a code list, nothing: its checks concern only itself.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Where the catalogue is.
 * @param {string} versionId
 * @returns {Promise<import( "@health-dev-portal/importer/check" ).CheckTargets>}
 * @throws {RangeError} When there is no such version.
 * @public
 */
module.exports.loadTargets = async ( db, store, versionId ) => {
    const row = await db.get( "SELECT v.stage, s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?", [ versionId ] );
    if ( !row ) {
        throw new RangeError( `There is no version ${ versionId }.` );
    }
    if ( row.kind === SPEC_KIND.MODULE ) {
        const codeLists = [];
        let rules = null;
        for ( const resolution of await resolveVersion( db, versionId ) ) {
            const content = await contentOf( db, resolution.version );
            if ( !content ) {
                continue;
            }
            if ( resolution.spec === RULES ) {
                rules = content;
            } else {
                codeLists.push( content.list );
            }
        }
        return { codeLists: codeLists, rules: rules, catalogue: await loadCatalogue( db, store ) };
    }
    if ( row.kind === SPEC_KIND.RULES ) {
        for ( const stage of resolutionOrder( row.stage ) ) {
            const found = await findVersion( db, ERROR_CODE_LIST, { stage: stage } );
            const content = found ? await contentOf( db, found.id ) : null;
            if ( content ) {
                return { codeLists: [ content.list ], rules: null, catalogue: null };
            }
        }
        return { codeLists: [], rules: null, catalogue: null };
    }
    return { codeLists: null, rules: null, catalogue: null };
};
