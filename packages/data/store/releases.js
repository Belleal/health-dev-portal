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
const { compareContents } = require( "@health-dev-portal/spec-model/differences" );
const { ANOMALY_LEVEL, RELEASE_EVENT, RELEASE_STATUS, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { loadEntries } = require( "#changelog" );
const { ConstraintError } = require( "#database" );
const { authorOf } = require( "#editing" );
const { guardStatements, staleStatement } = require( "#schema" );
const { loadAnomalies, loadApprovedContent, loadVersion } = require( "#versions" );

// Another write in between makes a submission stale; it is checked again, this many times at most.
const ATTEMPTS = 3;

/**
 * A submission refused (design record §7.4): each version kept out, and why.
 *
 * @public
 */
class SubmissionRefusedError extends Error {

    /**
     * @param {Array<{version: string|null, rule: string, message: string}>} reasons `rule` is `stage`, `released`,
     *     `spec`, `blocking`, `conflict`, `open` or `nothing`.
     */
    constructor( reasons ) {
        super( `The submission is refused: ${ reasons.map( ( reason ) => reason.message ).join( " " ) }` );
        this.name = "SubmissionRefusedError";
        this.reasons = reasons;
    }
}
module.exports.SubmissionRefusedError = SubmissionRefusedError;

/**
 * The statement that records what happened to a release, or to a version outside one, with who and when (design record
 * §7.3, §10.1), numbered after every event before it.
 *
 * @method
 * @param {{release?: string|null, version?: string|null, event: string, author: {actor: string, now: Date}, details?: Object}} event
 * @returns {import( "#definitions" ).Statement}
 * @public
 */
module.exports.eventStatement = ( event ) => ( {
    sql: `INSERT INTO release_events ( id, event_no, release_id, version_id, event, actor, at, details ) SELECT ?, COALESCE( MAX( event_no ), 0 ) + 1, ?, ?, ?, ?, ?, ?
        FROM release_events`,
    params: [ crypto.randomUUID(), event.release || null, event.version || null, event.event, event.author.actor, event.author.now.toISOString(),
        JSON.stringify( event.details || {} ) ]
} );

const rowOf = async ( db, versionId ) => {
    const row = await db.get( `SELECT v.id, v.spec_id, v.stage, v.release_id, v.content_hash, v.approved_hash, s.kind FROM versions v JOIN specs s ON s.id = v.spec_id
        WHERE v.id = ?`, [ versionId ] );
    if ( !row ) {
        throw new RangeError( `There is no version ${ versionId }.` );
    }
    return row;
};

const pending = ( row ) => row.stage === STAGE.IMPLEMENTATION && row.content_hash !== row.approved_hash;

// Why each version may not go into a round. A version entering the release must be in development and in no release,
// and the only one of its spec; every version in the round must have no blocking anomaly (§7.4) and no open conflict
// (§7.8). Reasons come per version, in the order given.
const refusalsOf = async ( db, entering, round, held ) => {
    const reasons = [];
    const specs = new Set( held.map( ( row ) => row.spec_id ) );
    const refuse = ( version, rule, message ) => reasons.push( { version: version, rule: rule, message: message } );
    for ( const row of round ) {
        if ( entering.includes( row ) ) {
            if ( row.stage !== STAGE.DEVELOPMENT ) {
                refuse( row.id, "stage", `${ row.spec_id } ${ row.stage } is not a development version.` );
            }
            if ( row.release_id !== null ) {
                refuse( row.id, "released", `${ row.spec_id }'s version is already in a release.` );
            }
            if ( specs.has( row.spec_id ) ) {
                refuse( row.id, "spec", `The release already holds a version of ${ row.spec_id }.` );
            }
            specs.add( row.spec_id );
        }
        if ( ( await loadAnomalies( db, row.id ) ).some( ( anomaly ) => anomaly.level === ANOMALY_LEVEL.BLOCKING ) ) {
            refuse( row.id, "blocking", `${ row.spec_id } has a blocking anomaly; fix it before submitting (§7.4).` );
        }
        if ( ( await db.get( "SELECT COUNT(*) AS n FROM conflicts WHERE version_id = ?", [ row.id ] ) ).n > 0 ) {
            refuse( row.id, "conflict", `${ row.spec_id } has an open conflict with an approved change; settle it first (§7.8).` );
        }
    }
    return reasons;
};

// The round's statements: each version locked and checked unchanged since its changelog was taken, the round, and each
// version's changelog as submitted (§7.4).
const roundStatements = async ( db, releaseId, roundNo, round, author ) => {
    const roundId = crypto.randomUUID();
    const statements = [];
    for ( const row of round ) {
        statements.push( ...guardStatements( row.id ), staleStatement( row.id, row.content_hash ) );
    }
    statements.push( { sql: "INSERT INTO rounds ( id, release_id, round_no, submitted_by, submitted_at ) VALUES ( ?, ?, ?, ?, ? )",
        params: [ roundId, releaseId, roundNo, author.actor, author.now.toISOString() ] } );
    for ( const row of round ) {
        statements.push( { sql: "INSERT INTO round_versions ( round_id, version_id, content_hash, changelog ) VALUES ( ?, ?, ?, ? )",
            params: [ roundId, row.id, row.content_hash, JSON.stringify( await loadEntries( db, row.id ) ) ] } );
    }
    return statements;
};

// A version not yet in a release, checked under its lock: two submissions at once both pass the first look.
const unreleased = ( versionId ) => ( { sql: "INSERT INTO write_guards ( reason ) SELECT 'stale' FROM versions WHERE id = ? AND release_id IS NOT NULL",
    params: [ versionId ] } );

// Runs a submission's batch, again from the start when a write came in between.
const submitting = async ( db, attempt ) => {
    for ( let tries = 1; tries <= ATTEMPTS; tries += 1 ) {
        const { statements, result } = await attempt();
        try {
            await db.batch( statements );
            return result;
        } catch ( error ) {
            // A frozen version never gets this far: it is not in development, and is refused as `stage`.
            if ( !( error instanceof ConstraintError && error.constraint === "stale_guard" ) ) {
                throw error;
            }
        }
    }
    throw new Error( `The versions changed while they were submitted, ${ ATTEMPTS } times over.` );
};

/**
 * Submits development versions for review as one release (design record §7.3–§7.4): a new release under review, its
 * first round, and each version's changelog as submitted. From now on the versions are read-only until the approver
 * returns them. A version with a blocking anomaly or an open conflict is kept out, as is one already in a release, one
 * not in development, and a second of one spec.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{versions: string[], summary: {bg: string|null, en: string|null}, actor: string, now: Date}} input
 * @returns {Promise<string>} The release's ID.
 * @throws {SubmissionRefusedError} Naming each version kept out, and why; nothing is written.
 * @throws {TypeError} For no versions, or no author.
 * @throws {RangeError} For a version that is none.
 * @public
 */
module.exports.submitRelease = async ( db, input ) => {
    const author = authorOf( input );
    if ( !Array.isArray( input.versions ) || !input.versions.length ) {
        throw new TypeError( "A release holds one version or more." );
    }
    const summary = input.summary || {};
    return submitting( db, async () => {
        const rows = [];
        for ( const versionId of input.versions ) {
            rows.push( await rowOf( db, versionId ) );
        }
        const reasons = await refusalsOf( db, rows, rows, [] );
        if ( reasons.length ) {
            throw new SubmissionRefusedError( reasons );
        }
        const releaseId = crypto.randomUUID();
        const statements = [
            { sql: "INSERT INTO releases ( id, status, summary_bg, summary_en, created_at ) VALUES ( ?, ?, ?, ?, ? )",
                params: [ releaseId, RELEASE_STATUS.REVIEW, summary.bg || null, summary.en || null, author.now.toISOString() ] },
            ...rows.map( ( row ) => unreleased( row.id ) ),
            ...rows.map( ( row ) => ( { sql: "UPDATE versions SET release_id = ? WHERE id = ?", params: [ releaseId, row.id ] } ) ),
            ...await roundStatements( db, releaseId, 1, rows, author ),
            module.exports.eventStatement( { release: releaseId, event: RELEASE_EVENT.SUBMITTED, author: author, details: { round: 1 } } )
        ];
        // The release row comes first, so the versions' references to it hold in the batch.
        return { statements: statements, result: releaseId };
    } );
};

/**
 * Submits the next round of a release (design record §7.4): a returned release again, with its editors' changes; or an
 * accepted one, with the changes pending in implementation and any development version joining it there (§7.3). The
 * round holds every development version of the release, every implementation version with pending changes, and those
 * added.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} releaseId
 * @param {{add?: string[], actor: string, now: Date}} input
 * @returns {Promise<number>} The round's number.
 * @throws {SubmissionRefusedError} With `open` while a round is under review, `nothing` when there is nothing to
 *     review, or the reasons `submitRelease` gives.
 * @throws {TypeError} For an abandoned release, or no author.
 * @throws {RangeError} For a release or version that is none.
 * @public
 */
module.exports.submitRound = async ( db, releaseId, input ) => {
    const author = authorOf( input );
    return submitting( db, async () => {
        const release = await db.get( "SELECT id, status FROM releases WHERE id = ?", [ releaseId ] );
        if ( !release ) {
            throw new RangeError( `There is no release ${ releaseId }.` );
        }
        if ( release.status === RELEASE_STATUS.ABANDONED ) {
            throw new TypeError( `Release ${ releaseId } was abandoned.` );
        }
        if ( release.status === RELEASE_STATUS.REVIEW ) {
            throw new SubmissionRefusedError( [ { version: null, rule: "open", message: "The release is under review already." } ] );
        }
        const members = [];
        for ( const { id } of await db.all( "SELECT id FROM versions WHERE release_id = ?", [ releaseId ] ) ) {
            members.push( await rowOf( db, id ) );
        }
        const added = [];
        for ( const versionId of input.add || [] ) {
            added.push( await rowOf( db, versionId ) );
        }
        const round = [ ...members.filter( ( row ) => row.stage === STAGE.DEVELOPMENT || pending( row ) ), ...added ];
        if ( !round.length ) {
            throw new SubmissionRefusedError( [ { version: null, rule: "nothing", message: "Nothing in the release is new: no pending change, no version added." } ] );
        }
        const reasons = await refusalsOf( db, added, round, members );
        if ( reasons.length ) {
            throw new SubmissionRefusedError( reasons );
        }
        const last = await db.get( "SELECT MAX( round_no ) AS n FROM rounds WHERE release_id = ?", [ releaseId ] );
        const roundNo = ( last.n || 0 ) + 1;
        const statements = [
            // The release is as it was read: a decision or another round in between makes this one stale.
            { sql: "INSERT INTO write_guards ( reason ) SELECT 'stale' FROM releases WHERE id = ? AND status <> ?", params: [ releaseId, release.status ] },
            ...added.map( ( row ) => unreleased( row.id ) ),
            { sql: "UPDATE releases SET status = ? WHERE id = ?", params: [ RELEASE_STATUS.REVIEW, releaseId ] },
            ...added.map( ( row ) => ( { sql: "UPDATE versions SET release_id = ? WHERE id = ?", params: [ releaseId, row.id ] } ) ),
            ...await roundStatements( db, releaseId, roundNo, round, author ),
            module.exports.eventStatement( { release: releaseId, event: RELEASE_EVENT.SUBMITTED, author: author, details: { round: roundNo } } )
        ];
        return { statements: statements, result: roundNo };
    } );
};

const lastRound = async ( db, releaseId ) => db.get( "SELECT round_no, submitted_by, submitted_at, decision, decided_by, decided_at FROM rounds WHERE release_id = ? ORDER BY round_no DESC LIMIT 1",
    [ releaseId ] );

/**
 * Releases for a queue (design record §7.4): the approver's — every release under review — and an editor's — every
 * release returned to them, by who submitted its last round. Oldest submission first.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{status?: string, submittedBy?: string}} [filter]
 * @returns {Promise<import( "#definitions" ).ReleaseSummary[]>}
 * @public
 */
module.exports.listReleases = async ( db, filter = {} ) => {
    const rows = filter.status
        ? await db.all( "SELECT id, status, summary_bg, summary_en, planned_on FROM releases WHERE status = ?", [ filter.status ] )
        : await db.all( "SELECT id, status, summary_bg, summary_en, planned_on FROM releases" );
    const releases = [];
    for ( const row of rows ) {
        const round = await lastRound( db, row.id );
        if ( filter.submittedBy && ( !round || round.submitted_by !== filter.submittedBy ) ) {
            continue;
        }
        const versions = await db.all( "SELECT id, spec_id, number, stage FROM versions WHERE release_id = ?", [ row.id ] );
        releases.push( { id: row.id, status: row.status, summary: { bg: row.summary_bg, en: row.summary_en }, plannedOn: row.planned_on,
            round: round ? { number: round.round_no, submittedBy: round.submitted_by, submittedAt: round.submitted_at, decision: round.decision } : null,
            versions: versions.map( ( version ) => ( { id: version.id, spec: version.spec_id, number: version.number, stage: version.stage } ) ) } );
    }
    // Sorted here, never by SQL: the two databases order text differently (design record §3.2).
    const at = ( release ) => release.round ? release.round.submittedAt : "";
    return releases.sort( ( a, b ) => at( a ) < at( b ) ? -1 : at( a ) > at( b ) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0 );
};

/**
 * A release as staff see it (design record §7.3–§7.4): its versions, each with its anomalies so the warnings reach the
 * approver, and — in implementation — its pending differences, which a round there is reviewed by (§7.5); its rounds,
 * with each version's changelog as submitted and the comments; and its events.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} releaseId
 * @returns {Promise<import( "#definitions" ).Release|null>}
 * @public
 */
module.exports.loadRelease = async ( db, releaseId ) => {
    const row = await db.get( "SELECT id, status, summary_bg, summary_en, notice_days, planned_on, created_at FROM releases WHERE id = ?", [ releaseId ] );
    if ( !row ) {
        return null;
    }
    const versions = [];
    for ( const { id } of await db.all( "SELECT id FROM versions WHERE release_id = ?", [ releaseId ] ) ) {
        const version = await loadVersion( db, id );
        const approved = await loadApprovedContent( db, id );
        versions.push( { id: version.id, spec: version.spec, kind: version.kind, number: version.number, stage: version.stage, frozen: version.frozen, base: version.base,
            anomalies: await loadAnomalies( db, id ),
            pending: version.stage === STAGE.IMPLEMENTATION && approved && version.content ? compareContents( version.kind, approved, version.content ) : null } );
    }
    const rounds = [];
    for ( const round of await db.all( "SELECT id, round_no, submitted_by, submitted_at, decision, decided_by, decided_at FROM rounds WHERE release_id = ? ORDER BY round_no",
        [ releaseId ] ) ) {
        const snapshots = await db.all( "SELECT version_id, content_hash, changelog FROM round_versions WHERE round_id = ?", [ round.id ] );
        const comments = await db.all( "SELECT id, comment_no, version_id, target, text, author, created_at FROM comments WHERE round_id = ? ORDER BY comment_no", [ round.id ] );
        rounds.push( { id: round.id, number: round.round_no, submittedBy: round.submitted_by, submittedAt: round.submitted_at, decision: round.decision,
            decidedBy: round.decided_by, decidedAt: round.decided_at,
            versions: snapshots.map( ( snapshot ) => ( { version: snapshot.version_id, contentHash: snapshot.content_hash, changelog: JSON.parse( snapshot.changelog ) } ) ),
            comments: comments.map( ( comment ) => ( { id: comment.id, number: comment.comment_no, version: comment.version_id, target: comment.target, text: comment.text,
                author: comment.author, at: comment.created_at } ) ) } );
    }
    const events = await db.all( "SELECT event_no, event, actor, at, version_id, details FROM release_events WHERE release_id = ? ORDER BY event_no", [ releaseId ] );
    return { id: row.id, status: row.status, summary: { bg: row.summary_bg, en: row.summary_en }, noticeDays: row.notice_days, plannedOn: row.planned_on,
        createdAt: row.created_at, versions: versions, rounds: rounds,
        events: events.map( ( event ) => ( { number: event.event_no, event: event.event, actor: event.actor, at: event.at, version: event.version_id,
            details: JSON.parse( event.details ) } ) ) };
};
