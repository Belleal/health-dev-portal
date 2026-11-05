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
const { ConstraintError, insertStatements } = require( "#database" );
const { guardStatements, staleStatement } = require( "#schema" );
const { FrozenVersionError, findVersion, loadVersion, storeVersion } = require( "#versions" );
const { compareContents } = require( "@health-dev-portal/spec-model/differences" );
const { CHANGE_CATEGORY, CHANGE_ORIGIN, STAGE } = require( "@health-dev-portal/spec-model/kinds" );

const ENTRY_COLUMNS = [ "id", "version_id", "position_no", "category", "origin", "text_bg", "text_en", "source" ];

// A version edited without pause changes under its refresh; past this, it gives way to the writes that overtook it.
const ATTEMPTS = 3;

const asJson = ( value ) => value === null || value === undefined ? null : JSON.stringify( value );

// An entry goes after the version's last, its place taken in the statement itself, so two writers never share one.
// PostgreSQL types the selected parameters from the columns they go into (measured with pg 8.23.1 on PostgreSQL 18).
// A difference another refresh has just entered is left as that refresh wrote it, under the one-per-difference index.
const insertEntry = ( versionId, entry ) => ( {
    sql: `INSERT INTO changelog_entries ( id, version_id, position_no, category, origin, target_kind, target_identity, before_value, after_value, text_bg, text_en,
        difference_key ) SELECT ?, ?, COALESCE( MAX( position_no ), -1 ) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM changelog_entries WHERE version_id = ?
        ON CONFLICT DO NOTHING`,
    params: [ entry.id, versionId, entry.category, entry.origin, entry.target, entry.identity, entry.before, entry.after, entry.textBg, entry.textEn, entry.key, versionId ]
} );

// An editor's change to a detected entry makes it theirs (plan 6a, decision 9), in the statement itself: read first, a
// refresh in between could delete the detected entry and the change land on nothing.
const DETECTED = `origin = '${ CHANGE_ORIGIN.DETECTED }'`;
const BY_EDITOR = `origin = CASE WHEN ${ DETECTED } THEN '${ CHANGE_ORIGIN.EDITED }' ELSE origin END`;

const categoryOf = ( category ) => {
    if ( !Object.values( CHANGE_CATEGORY ).includes( category ) ) {
        throw new TypeError( `"${ category }" is not a change category: ${ Object.values( CHANGE_CATEGORY ).join( ", " ) } are.` );
    }
    return category;
};

// Runs a changelog write behind the version's lock and frozen guard.
const guarded = async ( db, versionId, statements ) => {
    try {
        return await db.batch( [ ...guardStatements( versionId ), ...statements ] );
    } catch ( error ) {
        if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
            throw new FrozenVersionError( versionId );
        }
        throw error;
    }
};

// One change to one entry, refused when the entry is gone.
const entryWrite = async ( db, entryId, set, params ) => {
    const entry = await db.get( "SELECT version_id FROM changelog_entries WHERE id = ?", [ entryId ] );
    if ( !entry ) {
        throw new RangeError( `There is no changelog entry ${ entryId }.` );
    }
    const results = await guarded( db, entry.version_id, [ { sql: `UPDATE changelog_entries SET ${ set } WHERE id = ?`, params: [ ...params, entryId ] } ] );
    if ( results[ results.length - 1 ].changes === 0 ) {
        throw new RangeError( `There is no changelog entry ${ entryId }.` );
    }
};

// The statements that make a version's difference entries match its differences (plan 6a, decision 9).
const reconcile = ( versionId, differences, entries ) => {
    const byKey = new Map( entries.map( ( entry ) => [ entry.difference_key, entry ] ) );
    const statements = [];
    const counts = { added: 0, updated: 0, removed: 0, flagged: 0 };
    for ( const difference of differences ) {
        const before = asJson( difference.before );
        const after = asJson( difference.after );
        const entry = byKey.get( difference.key );
        if ( !entry ) {
            statements.push( insertEntry( versionId, { id: crypto.randomUUID(), category: difference.category, origin: CHANGE_ORIGIN.DETECTED, target: difference.target,
                identity: difference.identity, before: before, after: after, textBg: null, textEn: null, key: difference.key } ) );
            counts.added += 1;
            continue;
        }
        byKey.delete( difference.key );
        const category = entry.origin === CHANGE_ORIGIN.DETECTED ? difference.category : entry.category;
        if ( entry.before_value !== before || entry.after_value !== after || entry.category !== category || entry.flagged !== 0
            || entry.target_kind !== difference.target || entry.target_identity !== difference.identity ) {
            // A detected entry's category follows the difference; one the editor set stays theirs — decided in the statement,
            // since the editor may take the entry over after it was read.
            statements.push( { sql: `UPDATE changelog_entries SET category = CASE WHEN ${ DETECTED } THEN ? ELSE category END, target_kind = ?, target_identity = ?,
                before_value = ?, after_value = ?, flagged = 0 WHERE id = ?`, params: [ difference.category, difference.target, difference.identity, before, after, entry.id ] } );
            counts.updated += 1;
        }
    }
    // What is left names a difference that is gone: detected, it goes; the editor's, it is flagged for them to judge. Read
    // as detected, an entry the editor explained in the meantime was deleted with its explanation (final review, I1), so
    // each statement holds only for the origin the entry has when it runs.
    for ( const entry of byKey.values() ) {
        if ( entry.origin === CHANGE_ORIGIN.DETECTED ) {
            statements.push( { sql: `DELETE FROM changelog_entries WHERE id = ? AND ${ DETECTED }`, params: [ entry.id ] } );
            counts.removed += 1;
        }
        if ( entry.origin === CHANGE_ORIGIN.DETECTED || entry.flagged === 0 ) {
            statements.push( { sql: `UPDATE changelog_entries SET flagged = 1 WHERE id = ? AND NOT ${ DETECTED } AND flagged = 0`, params: [ entry.id ] } );
            counts.flagged += entry.origin === CHANGE_ORIGIN.DETECTED ? 0 : 1;
        }
    }
    return { statements: statements, counts: counts };
};

/**
 * Brings a version's changelog up to date with its content (design record §7.5, plan 6a decision 9): its differences from
 * its base — from nothing, for a new spec — each have one entry under their key.
 * - A new difference adds a `detected` entry.
 * - A difference that changed updates its entry's values, and keeps the category and text the editor gave it.
 * - A difference that is gone removes a `detected` entry, and flags one the editor edited.
 * Imported and editor's entries name no difference, and are never touched. One batch writes it behind the lock, the
 * frozen guard and the stale check, so it never records the differences of content that has since changed. Overtaken by
 * later writes three times, it gives way: each of those refreshes in its turn.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<{added: number, updated: number, removed: number, flagged: number, superseded?: boolean}>}
 *     `superseded` when it gave way and wrote nothing.
 * @throws {FrozenVersionError} When the version is frozen.
 * @throws {RangeError} When there is no such version.
 * @public
 */
module.exports.refreshChangelog = async ( db, versionId ) => {
    for ( let attempt = 1; attempt <= ATTEMPTS; attempt += 1 ) {
        const version = await loadVersion( db, versionId );
        if ( !version ) {
            throw new RangeError( `There is no version ${ versionId }.` );
        }
        if ( version.content === null ) {
            return { added: 0, updated: 0, removed: 0, flagged: 0 };
        }
        const base = version.base ? await loadVersion( db, version.base ) : null;
        const differences = compareContents( version.kind, base ? base.content : null, version.content );
        const entries = await db.all( `SELECT id, category, origin, target_kind, target_identity, before_value, after_value, flagged, difference_key FROM changelog_entries
            WHERE version_id = ? AND difference_key IS NOT NULL`, [ versionId ] );
        const { statements, counts } = reconcile( versionId, differences, entries );
        try {
            await guarded( db, versionId, [ staleStatement( versionId, version.contentHash ), ...statements ] );
            return counts;
        } catch ( error ) {
            if ( !( error instanceof ConstraintError && error.constraint === "stale_guard" ) ) {
                throw error;
            }
        }
    }
    // Thrown, it told an edit that had been written that it had failed, and a retry inserted twice (final review).
    return { added: 0, updated: 0, removed: 0, flagged: 0, superseded: true };
};

/**
 * Corrects an entry's category or text. A detected entry becomes `edited`, and from then on keeps what the editor gave
 * it however its difference changes (plan 6a, decision 9).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} entryId
 * @param {{category?: string, textBg?: string|null, textEn?: string|null}} changes Only what is given changes.
 * @returns {Promise<void>}
 * @throws {FrozenVersionError} When the entry's version is frozen.
 * @throws {RangeError} When there is no such entry.
 * @throws {TypeError} For a category that is none.
 * @public
 */
module.exports.editChangelogEntry = async ( db, entryId, changes ) => {
    const set = [ BY_EDITOR ];
    const params = [];
    for ( const [ field, column, check ] of [ [ "category", "category", categoryOf ], [ "textBg", "text_bg", ( text ) => text ], [ "textEn", "text_en", ( text ) => text ] ] ) {
        if ( changes[ field ] !== undefined ) {
            set.push( `${ column } = ?` );
            params.push( check( changes[ field ] ) );
        }
    }
    await entryWrite( db, entryId, set.join( ", " ), params );
};

/**
 * Drops an entry: it stays in the changelog, marked dropped, and the editor's decision with it.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} entryId
 * @returns {Promise<void>}
 * @throws {FrozenVersionError} When the entry's version is frozen.
 * @throws {RangeError} When there is no such entry.
 * @public
 */
module.exports.dropChangelogEntry = async ( db, entryId ) => entryWrite( db, entryId, `dropped = 1, ${ BY_EDITOR }`, [] );

/**
 * Takes back a drop.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} entryId
 * @returns {Promise<void>}
 * @throws {FrozenVersionError} When the entry's version is frozen.
 * @throws {RangeError} When there is no such entry.
 * @public
 */
module.exports.restoreChangelogEntry = async ( db, entryId ) => entryWrite( db, entryId, `dropped = 0, ${ BY_EDITOR }`, [] );

/**
 * Adds an entry the editor writes, after the version's others. It names no difference, so no edit takes it away.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @param {{category: string, textBg: string|null, textEn: string|null, target?: string, identity?: string}} entry
 * @returns {Promise<string>} The new entry's ID.
 * @throws {FrozenVersionError} When the version is frozen.
 * @throws {RangeError} When there is no such version.
 * @throws {TypeError} For a category that is none.
 * @public
 */
module.exports.addChangelogEntry = async ( db, versionId, entry ) => {
    const category = categoryOf( entry.category );
    if ( !await db.get( "SELECT id FROM versions WHERE id = ?", [ versionId ] ) ) {
        throw new RangeError( `There is no version ${ versionId }.` );
    }
    const id = crypto.randomUUID();
    await guarded( db, versionId, [ insertEntry( versionId, { id: id, category: category, origin: CHANGE_ORIGIN.EDITOR, target: entry.target || null,
        identity: entry.identity || null, before: null, after: null, textBg: entry.textBg === undefined ? null : entry.textBg,
        textEn: entry.textEn === undefined ? null : entry.textEn, key: null } ) ] );
    return id;
};

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
                // Frozen as it is created: a retired version keeps only its changelog (design record §4.1).
                target = await storeVersion( db, { spec: spec, kind: kind, number: change.version, stage: STAGE.RETIRED, stages: datesOf( change ), frozen: true } );
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
 *     stored columns, with `source` parsed and `dropped` and `flagged` booleans; `before_value` and `after_value` are
 *     JSON.
 * @public
 */
module.exports.loadChangelog = async ( db, spec ) => {
    const versions = await db.all( "SELECT id, number, stage FROM versions WHERE spec_id = ?", [ spec ] );
    const rows = await db.all( `SELECT e.id, e.version_id, e.position_no, e.category, e.origin, e.target_kind, e.target_identity, e.before_value, e.after_value, e.text_bg,
        e.text_en, e.dropped, e.flagged, e.difference_key, e.source FROM changelog_entries e JOIN versions v ON v.id = e.version_id WHERE v.spec_id = ?
        ORDER BY e.position_no`, [ spec ] );
    const log = new Map( versions.map( ( version ) => [ version.id, { version: version.id, number: version.number, stage: version.stage, entries: [] } ] ) );
    for ( const row of rows ) {
        log.get( row.version_id ).entries.push( { ...row, dropped: row.dropped === 1, flagged: row.flagged === 1, source: row.source === null ? null : JSON.parse( row.source ) } );
    }
    return [ ...log.values() ].sort( ( a, b ) => {
        if ( a.number === null || b.number === null ) {
            return ( a.number === null ? 0 : 1 ) - ( b.number === null ? 0 : 1 );
        }
        return module.exports.compareNumbers( b.number, a.number );
    } );
};
