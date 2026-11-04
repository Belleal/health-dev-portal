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
const { insertStatements } = require( "#database" );
const { findVersion, storeVersion } = require( "#versions" );
const { CHANGE_ORIGIN, STAGE } = require( "@health-dev-portal/spec-model/kinds" );

const ENTRY_COLUMNS = [ "id", "version_id", "position_no", "category", "origin", "text_bg", "text_en", "source" ];

/**
 * Compares two dotted version numbers part by part as whole numbers, so 1.5.10 comes after 1.5.9 and 1.5 before 1.5.1.
 *
 * @method
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative, zero or positive, as for `Array.prototype.sort`.
 * @public
 */
module.exports.compareNumbers = ( a, b ) => {
    const left = a.split( "." );
    const right = b.split( "." );
    for ( let index = 0; index < Math.max( left.length, right.length ); index += 1 ) {
        if ( left[ index ] === undefined || right[ index ] === undefined ) {
            return left.length - right.length;
        }
        const difference = Number( left[ index ] ) - Number( right[ index ] );
        if ( Number.isNaN( difference ) ) {
            return left[ index ] < right[ index ] ? -1 : left[ index ] > right[ index ] ? 1 : 0;
        }
        if ( difference !== 0 ) {
            return difference;
        }
    }
    return 0;
};

// One block per number, its notes in order. Nomenclatures 1.5.33 heads 1.3.12 twice; storing the blocks one by one
// would keep the first and drop the second as already imported.
const byNumber = ( history ) => {
    const merged = new Map();
    for ( const change of history ) {
        const found = merged.get( change.version );
        merged.set( change.version, found
            ? { ...found, stagingDate: found.stagingDate || change.stagingDate, productionDate: found.productionDate || change.productionDate, notes: [ ...found.notes, ...change.notes ] }
            : change );
    }
    return [ ...merged.values() ];
};

const datesOf = ( change ) => [
    ...( change.stagingDate ? [ { stage: STAGE.TESTING, enteredOn: change.stagingDate } ] : [] ),
    ...( change.productionDate ? [ { stage: STAGE.PRODUCTION, enteredOn: change.productionDate } ] : [] )
];

/**
 * Keeps a workbook's change notes as changelog entries (design record §2, §4.1, §4.7). Each change version's notes go to
 * the spec's version with that number, or, when `attach.number` matches, to `attach.version` — a development version,
 * which has no number yet. A number the spec does not hold becomes a retired version first, with no content and with
 * the dates the notes give. Entries are `imported`, their text Bulgarian as the workbooks write it and their English
 * recorded missing (§4.9). A version that already has imported entries gets none again.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} spec
 * @param {string} kind One of `SPEC_KIND`.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion[]} history
 * @param {{number: string, version: string}} [attach]
 * @returns {Promise<{retired: number, entries: number}>} What was added now.
 * @public
 */
module.exports.storeHistory = async ( db, spec, kind, history, attach ) => {
    let retired = 0;
    let entries = 0;
    for ( const change of byNumber( history ) ) {
        let target;
        if ( attach && attach.number === change.version ) {
            target = attach.version;
        } else {
            const found = await findVersion( db, spec, { number: change.version } );
            if ( found ) {
                target = found.id;
            } else {
                target = await storeVersion( db, { spec: spec, kind: kind, number: change.version, stage: STAGE.RETIRED, stages: datesOf( change ) } );
                retired += 1;
            }
        }
        const kept = await db.get( "SELECT COUNT(*) AS n FROM changelog_entries WHERE version_id = ? AND origin = ?", [ target, CHANGE_ORIGIN.IMPORTED ] );
        if ( kept.n > 0 || change.notes.length === 0 ) {
            continue;
        }
        await db.batch( insertStatements( "changelog_entries", ENTRY_COLUMNS, change.notes.map( ( note, index ) => [ crypto.randomUUID(), target, index, note.category,
            CHANGE_ORIGIN.IMPORTED, note.text, null, JSON.stringify( note.source ) ] ) ) );
        entries += change.notes.length;
    }
    return { retired: retired, entries: entries };
};

/**
 * A spec's changelog, newest first: a development version, then the numbered versions in descending order, each with
 * its entries in order (design record §7.10).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} spec
 * @returns {Promise<Array<{version: string, number: string|null, stage: string, entries: Object[]}>>} An entry has its
 *     stored columns, with `source` parsed and `dropped` a boolean.
 * @public
 */
module.exports.loadChangelog = async ( db, spec ) => {
    const versions = await db.all( "SELECT id, number, stage FROM versions WHERE spec_id = ?", [ spec ] );
    const rows = await db.all( `SELECT e.id, e.version_id, e.position_no, e.category, e.origin, e.target_kind, e.target_identity, e.before_value, e.after_value, e.text_bg,
        e.text_en, e.dropped, e.source FROM changelog_entries e JOIN versions v ON v.id = e.version_id WHERE v.spec_id = ? ORDER BY e.position_no`, [ spec ] );
    const log = new Map( versions.map( ( version ) => [ version.id, { version: version.id, number: version.number, stage: version.stage, entries: [] } ] ) );
    for ( const row of rows ) {
        log.get( row.version_id ).entries.push( { ...row, dropped: row.dropped === 1, source: row.source === null ? null : JSON.parse( row.source ) } );
    }
    return [ ...log.values() ].sort( ( a, b ) => {
        if ( a.number === null || b.number === null ) {
            return ( a.number === null ? 0 : 1 ) - ( b.number === null ? 0 : 1 );
        }
        return module.exports.compareNumbers( b.number, a.number );
    } );
};
