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
const { guardStatements, reviewStatement, staleStatement } = require( "#schema" );
const { decodeContent, encodeContent } = require( "#items" );
const { diffRows, nextAfter } = require( "#item-diff" );
const { RELEASE_STATUS, STAGE } = require( "@health-dev-portal/spec-model/kinds" );

// Another write in between makes a replacement stale; it is computed again, this many times at most.
const ATTEMPTS = 3;

/**
 * A write to a frozen version (design record §7.7): its content and what it resolved against never change again.
 *
 * @public
 */
class FrozenVersionError extends Error {

    /**
     * @param {string} version The version's ID.
     */
    constructor( version ) {
        super( `Version ${ version } is frozen: its content never changes again (design record §7.7).` );
        this.name = "FrozenVersionError";
        this.version = version;
    }
}
module.exports.FrozenVersionError = FrozenVersionError;

/**
 * A change to a version under review (design record §7.4): the approver reviews what was submitted, so it is read-only
 * until it is returned. It lives here, beside `FrozenVersionError`, since the changelog and editing both raise it.
 *
 * @public
 */
class UnderReviewError extends Error {

    /**
     * @param {string} version The version's ID.
     */
    constructor( version ) {
        super( `Version ${ version } is under review: it is read-only until the approver returns it (design record §7.4).` );
        this.name = "UnderReviewError";
        this.version = version;
    }
}
module.exports.UnderReviewError = UnderReviewError;

const ITEM_COLUMNS = [ "version_id", "item_no", "kind", "identity", "parent_no", "position_no", "data", "hash" ];
const ANOMALY_COLUMNS = [ "version_id", "anomaly_no", "item_no", "type", "level", "message", "sheet", "row_number", "column_number", "details" ];
const STAGE_COLUMNS = [ "version_id", "stage", "entered_on" ];
const SELECT = "SELECT v.id, v.spec_id, s.kind, v.number, v.stage, v.frozen, v.release_id, v.base_id, v.content_hash FROM versions v JOIN specs s ON s.id = v.spec_id";

const orNull = ( value ) => value === undefined ? null : value;
const at = ( sheet, row ) => `${ sheet }\u0000${ row }`;
const MAX_IN = 99;

// The items an anomaly can name in its details, by the detail that names them (plan 6a, decision 6).
const NAMED_BY = Object.freeze( { identity: [ "element", "message" ], key: [ "entry" ], id: [ "condition", "rule" ], code: [ "message" ] } );

// The statements that write a version's anomalies, each mapped to an item so the staff side can show it where it is
// (design record §7.11): first the item read from the same sheet and row, else — for an item an editor made, which has
// no source — the item its details name.
const anomalyStatements = ( versionId, rows, anomalies ) => {
    const bySource = new Map();
    const named = new Map();
    for ( const row of rows ) {
        const source = JSON.parse( row.data ).source;
        if ( source && !bySource.has( at( source.sheet, source.row ) ) ) {
            bySource.set( at( source.sheet, source.row ), row.item_no );
        }
        if ( row.identity !== null && !named.has( `${ row.kind }\u0000${ row.identity }` ) ) {
            named.set( `${ row.kind }\u0000${ row.identity }`, row.item_no );
        }
    }
    const itemOf = ( anomaly ) => {
        if ( anomaly.sheet !== null && anomaly.sheet !== undefined && bySource.has( at( anomaly.sheet, anomaly.row ) ) ) {
            return bySource.get( at( anomaly.sheet, anomaly.row ) );
        }
        for ( const [ detail, kinds ] of Object.entries( NAMED_BY ) ) {
            const value = anomaly.details && anomaly.details[ detail ];
            const kind = value === undefined ? null : kinds.find( ( candidate ) => named.has( `${ candidate }\u0000${ value }` ) );
            if ( kind ) {
                return named.get( `${ kind }\u0000${ value }` );
            }
        }
        return null;
    };
    return insertStatements( "anomalies", ANOMALY_COLUMNS, anomalies.map( ( anomaly, index ) => [ versionId, index + 1, itemOf( anomaly ), anomaly.type, anomaly.level,
        anomaly.message, orNull( anomaly.sheet ), orNull( anomaly.row ), orNull( anomaly.column ), JSON.stringify( anomaly.details || {} ) ] ) );
};

// The statements that write a new version's items and anomalies, and its content hash.
const contentStatements = ( versionId, kind, content, anomalies ) => {
    const encoded = content ? encodeContent( kind, content ) : { items: [], hash: null };
    return {
        hash: encoded.hash,
        next: encoded.items.length + 1,
        statements: [
            ...insertStatements( "items", ITEM_COLUMNS, encoded.items.map( ( item ) => [ versionId, item.item_no, item.kind, item.identity, item.parent_no, item.position_no,
                item.data, item.hash ] ) ),
            ...anomalyStatements( versionId, encoded.items, anomalies )
        ]
    };
};

/**
 * The statements that make a version's stored rows hold the result of `diffRows`: deletes, updates and moves, inserts.
 *
 * @method
 * @param {string} versionId
 * @param {{updates: Array, inserts: Array, deletes: Array, moves: Array}} diff
 * @returns {import( "#definitions" ).Statement[]}
 * @public
 */
module.exports.rowStatements = ( versionId, diff ) => {
    const statements = [];
    for ( let start = 0; start < diff.deletes.length; start += MAX_IN ) {
        const chunk = diff.deletes.slice( start, start + MAX_IN );
        statements.push( { sql: `DELETE FROM items WHERE version_id = ? AND item_no IN ( ${ chunk.map( () => "?" ).join( ", " ) } )`,
            params: [ versionId, ...chunk.map( ( row ) => row.item_no ) ] } );
    }
    for ( const row of [ ...diff.updates, ...diff.moves ] ) {
        statements.push( { sql: "UPDATE items SET identity = ?, parent_no = ?, position_no = ?, data = ?, hash = ?, revision = ? WHERE version_id = ? AND item_no = ?",
            params: [ row.identity, row.parent_no, row.position_no, row.data, row.hash, row.revision, versionId, row.item_no ] } );
    }
    statements.push( ...insertStatements( "items", [ ...ITEM_COLUMNS, "revision" ], diff.inserts.map( ( row ) => [ versionId, row.item_no, row.kind, row.identity,
        row.parent_no, row.position_no, row.data, row.hash, row.revision ] ) ) );
    return statements;
};

/**
 * The statements that replace a version's anomalies, mapped to the given rows.
 *
 * @method
 * @param {string} versionId
 * @param {import( "#definitions" ).ItemRow[]} rows The version's rows as they will be.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]} anomalies
 * @returns {import( "#definitions" ).Statement[]}
 * @public
 */
module.exports.anomalyReplacement = ( versionId, rows, anomalies ) => [
    { sql: "DELETE FROM anomalies WHERE version_id = ?", params: [ versionId ] },
    ...anomalyStatements( versionId, rows, anomalies )
];

/**
 * The rows a version will have once a diff is written: the kept ones as changed, and the inserted.
 *
 * @method
 * @param {import( "#definitions" ).ItemRow[]} stored
 * @param {{updates: Array, inserts: Array, deletes: Array, moves: Array}} diff
 * @returns {import( "#definitions" ).ItemRow[]} In item number order.
 * @public
 */
module.exports.rowsAfter = ( stored, diff ) => {
    const gone = new Set( diff.deletes.map( ( row ) => row.item_no ) );
    const changed = new Map( [ ...diff.updates, ...diff.moves ].map( ( row ) => [ row.item_no, row ] ) );
    return [ ...stored.filter( ( row ) => !gone.has( row.item_no ) ).map( ( row ) => changed.get( row.item_no ) || row ), ...diff.inserts ]
        .sort( ( a, b ) => a.item_no - b.item_no );
};

const stored = ( row ) => ( { id: row.id, spec: row.spec_id, kind: row.kind, number: row.number, stage: row.stage, frozen: row.frozen === 1, release: row.release_id,
    base: row.base_id, contentHash: row.content_hash } );

/**
 * Makes sure a spec exists with the given kind.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} id The spec's key: `e-prescription`, `rules`, `CL009`, `nomenclatures`.
 * @param {string} kind One of `SPEC_KIND`.
 * @returns {Promise<void>}
 * @throws {TypeError} When the spec exists with another kind.
 * @public
 */
module.exports.ensureSpec = async ( db, id, kind ) => {
    await db.run( "INSERT INTO specs ( id, kind ) VALUES ( ?, ? ) ON CONFLICT ( id ) DO NOTHING", [ id, kind ] );
    const row = await db.get( "SELECT kind FROM specs WHERE id = ?", [ id ] );
    if ( row.kind !== kind ) {
        throw new TypeError( `The spec ${ id } is a ${ row.kind }, not a ${ kind }.` );
    }
};

/**
 * Stores a new version in one batch: its row, the stages it has been through, its items and its anomalies. A version
 * stored without content — a retired one kept for its changelog — has neither items nor hash. One stored frozen is
 * frozen in that same batch, so there is no moment at which it could be written.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{spec: string, kind: string, number: string|null, stage: string, content?: import( "#definitions" ).VersionContent,
 *     anomalies?: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[], release?: string, base?: string,
 *     stages?: Array<{stage: string, enteredOn: string|null}>, frozen?: boolean, replaces?: string, approved?: boolean,
 *     also?: function( string ): import( "#definitions" ).Statement[]}} input The current stage is recorded even when
 *     `stages` leaves it out. A fix names the testing version it `replaces` and is stored `approved`, its content its
 *     approved copy (plan 6b); `also` adds statements that name the new version to the same batch.
 * @returns {Promise<string>} The new version's ID.
 * @public
 */
module.exports.storeVersion = async ( db, input ) => {
    const id = crypto.randomUUID();
    const stages = [ ...( input.stages || [] ) ];
    if ( !stages.some( ( entry ) => entry.stage === input.stage ) ) {
        stages.push( { stage: input.stage, enteredOn: null } );
    }
    const { hash, next, statements } = contentStatements( id, input.kind, input.content || null, input.anomalies || [] );
    await db.batch( [
        { sql: `INSERT INTO versions ( id, spec_id, number, stage, frozen, base_id, release_id, replaces_id, content_hash, next_item_no, created_at )
            VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )`,
        params: [ id, input.spec, orNull( input.number ), input.stage, input.frozen ? 1 : 0, orNull( input.base ), orNull( input.release ), orNull( input.replaces ),
            hash, next, new Date().toISOString() ] },
        ...insertStatements( "version_stages", STAGE_COLUMNS, stages.map( ( entry ) => [ id, entry.stage, orNull( entry.enteredOn ) ] ) ),
        ...statements,
        ...( input.approved ? module.exports.approvedStatements( id ) : [] ),
        ...( input.also ? input.also( id ) : [] )
    ] );
    return id;
};

/**
 * A version's stored rows, with their revisions, in item number order.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<import( "#definitions" ).ItemRow[]>}
 * @public
 */
module.exports.loadItems = async ( db, versionId ) => db.all(
    "SELECT item_no, kind, identity, parent_no, position_no, data, hash, revision FROM items WHERE version_id = ? ORDER BY item_no", [ versionId ] );

/**
 * The statement that records who changed a version's content and when (design record §10.1), in the change's own
 * batch, numbered after the version's last.
 *
 * @method
 * @param {string} versionId
 * @param {{actor: string, now: Date}} author
 * @param {Array|string} edits The edits as sent, or `"workbook"` for the workbook route.
 * @returns {import( "#definitions" ).Statement}
 * @public
 */
module.exports.editLogStatement = ( versionId, author, edits ) => ( {
    sql: "INSERT INTO edit_log ( id, version_id, edit_no, actor, at, edits ) SELECT ?, ?, COALESCE( MAX( edit_no ), 0 ) + 1, ?, ?, ? FROM edit_log WHERE version_id = ?",
    params: [ crypto.randomUUID(), versionId, author.actor, author.now.toISOString(), JSON.stringify( edits ), versionId ]
} );

const APPROVED_COLUMNS = "version_id, item_no, kind, identity, parent_no, position_no, data, hash";

/**
 * The statements that make a version's current content its approved content (plan 6b, decision 4): its items copied,
 * in the statement itself, and its hash recorded. An approval writes them in its own batch, so what is approved is what
 * the batch's guards checked.
 *
 * @method
 * @param {string} versionId
 * @returns {import( "#definitions" ).Statement[]}
 * @public
 */
module.exports.approvedStatements = ( versionId ) => [
    { sql: "DELETE FROM approved_items WHERE version_id = ?", params: [ versionId ] },
    { sql: `INSERT INTO approved_items ( ${ APPROVED_COLUMNS } ) SELECT ${ APPROVED_COLUMNS } FROM items WHERE version_id = ?`, params: [ versionId ] },
    { sql: "UPDATE versions SET approved_hash = content_hash WHERE id = ?", params: [ versionId ] }
];

/**
 * The approved content of a version in implementation: what the backend team builds and other specs read, while its
 * items carry the changes still pending (design record §7.4).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<import( "#definitions" ).VersionContent|null>} `null` for a version with no approved copy.
 * @public
 */
module.exports.loadApprovedContent = async ( db, versionId ) => {
    const row = await db.get( "SELECT v.spec_id, v.number, v.approved_hash, s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?", [ versionId ] );
    if ( !row || row.approved_hash === null ) {
        return null;
    }
    const items = await db.all( `SELECT item_no, kind, identity, parent_no, position_no, data, hash FROM approved_items WHERE version_id = ? ORDER BY item_no`,
        [ versionId ] );
    return decodeContent( row.kind, row.spec_id, row.number, items );
};

/**
 * Replaces an unfrozen version's content, anomalies and hash, in one batch behind the lock, the frozen-version guard and
 * the stale check. The content is matched to the stored rows by identity (`diffRows`): only what differs changes, every
 * other item keeps its number and revision, and a new item takes a number never used in the version. Wholesale, every
 * item was renumbered and its revision reset, and §7.4's revision check could not survive the workbook route (plan 5,
 * Minor 16).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @param {import( "#definitions" ).VersionContent|null} content `null` keeps no content at all.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]} anomalies
 * @param {{actor: string, now: Date}} [author] The person replacing it — the workbook route — whose write, like an edit,
 *     is refused under review and recorded (design record §7.4, §10.1); none for the portal's own writes.
 * @returns {Promise<void>}
 * @throws {FrozenVersionError} When the version is frozen; nothing is written.
 * @throws {UnderReviewError} With an author, when the version is under review; nothing is written.
 * @throws {RangeError} When there is no such version.
 * @throws {Error} When other writes changed the version under every one of three attempts.
 * @public
 */
module.exports.storeContent = async ( db, versionId, content, anomalies, author ) => {
    for ( let attempt = 1; attempt <= ATTEMPTS; attempt += 1 ) {
        // Read before the rows, and checked again in the batch: a difference computed from rows read before another write
        // undid that write, or left an item under a parent it removed, and the version no longer loaded (final review, C2).
        const row = await db.get( `SELECT s.kind, v.content_hash, v.next_item_no, r.status AS release_status FROM versions v JOIN specs s ON s.id = v.spec_id
            LEFT JOIN releases r ON r.id = v.release_id WHERE v.id = ?`, [ versionId ] );
        if ( !row ) {
            throw new RangeError( `There is no version ${ versionId }.` );
        }
        if ( author && row.release_status === RELEASE_STATUS.REVIEW ) {
            throw new UnderReviewError( versionId );
        }
        const stored = await module.exports.loadItems( db, versionId );
        const diff = content ? diffRows( row.kind, stored, content, row.next_item_no ) : { updates: [], inserts: [], deletes: stored, moves: [] };
        try {
            await db.batch( [
                ...guardStatements( versionId ),
                ...( author ? [ reviewStatement( versionId ) ] : [] ),
                staleStatement( versionId, row.content_hash, row.next_item_no ),
                ...module.exports.rowStatements( versionId, diff ),
                ...module.exports.anomalyReplacement( versionId, module.exports.rowsAfter( stored, diff ), anomalies ),
                { sql: "UPDATE versions SET content_hash = ?, next_item_no = ? WHERE id = ?",
                    params: [ content ? encodeContent( row.kind, content ).hash : null, nextAfter( row.next_item_no, diff ), versionId ] },
                ...( author ? [ module.exports.editLogStatement( versionId, author, "workbook" ) ] : [] )
            ] );
            return;
        } catch ( error ) {
            if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
                throw new FrozenVersionError( versionId );
            }
            if ( error instanceof ConstraintError && error.constraint === "review_guard" ) {
                throw new UnderReviewError( versionId );
            }
            if ( !( error instanceof ConstraintError && error.constraint === "stale_guard" ) ) {
                throw error;
            }
        }
    }
    throw new Error( `Version ${ versionId } changed while its content was replaced, ${ ATTEMPTS } times over.` );
};

/**
 * Freezes a version: from now on its content and what it resolved against never change (design record §7.7).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<void>}
 * @public
 */
module.exports.freezeVersion = async ( db, versionId ) => {
    await db.run( "UPDATE versions SET frozen = 1 WHERE id = ?", [ versionId ] );
};

/**
 * Finds a spec's version by stage or by number, without its content.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} spec
 * @param {{stage?: string, number?: string}} by A stage other than retired, which may hold many, or a number.
 * @returns {Promise<import( "#definitions" ).StoredVersion|null>}
 * @throws {TypeError} For neither, or for the retired stage.
 * @public
 */
module.exports.findVersion = async ( db, spec, by ) => {
    let row;
    if ( by.stage !== undefined ) {
        if ( by.stage === STAGE.RETIRED ) {
            throw new TypeError( "A spec may have many retired versions: find one by its number." );
        }
        row = await db.get( `${ SELECT } WHERE v.spec_id = ? AND v.stage = ?`, [ spec, by.stage ] );
    } else if ( by.number !== undefined ) {
        row = await db.get( `${ SELECT } WHERE v.spec_id = ? AND v.number = ?`, [ spec, by.number ] );
    } else {
        throw new TypeError( "Find a version by its stage or by its number." );
    }
    return row ? stored( row ) : null;
};

/**
 * Loads a version with its content, exactly as stored; `content` is `null` for a version kept only for its changelog.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<import( "#definitions" ).StoredVersion|null>}
 * @public
 */
module.exports.loadVersion = async ( db, versionId ) => {
    const row = await db.get( `${ SELECT } WHERE v.id = ?`, [ versionId ] );
    if ( !row ) {
        return null;
    }
    const version = stored( row );
    if ( row.content_hash === null ) {
        return { ...version, content: null };
    }
    const items = await db.all( "SELECT item_no, kind, identity, parent_no, position_no, data, hash FROM items WHERE version_id = ? ORDER BY item_no", [ versionId ] );
    return { ...version, content: decodeContent( row.kind, row.spec_id, row.number, items ) };
};

/**
 * A version's anomalies in stored order, each with the item it was found on, or `null`.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<Array<import( "@health-dev-portal/spec-model/definitions" ).Anomaly & {item: number|null}>>}
 * @public
 */
module.exports.loadAnomalies = async ( db, versionId ) => {
    const rows = await db.all( "SELECT item_no, type, level, message, sheet, row_number, column_number, details FROM anomalies WHERE version_id = ? ORDER BY anomaly_no",
        [ versionId ] );
    return rows.map( ( row ) => ( { type: row.type, level: row.level, message: row.message, sheet: row.sheet, row: row.row_number, column: row.column_number,
        details: JSON.parse( row.details ), item: row.item_no } ) );
};
