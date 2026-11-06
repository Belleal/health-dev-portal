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
const { sofiaDate } = require( "@health-dev-portal/spec-model/dates" );
const { loadEntries, refreshChangelog } = require( "#changelog" );
const { ConstraintError } = require( "#database" );
const { authorOf } = require( "#editing" );
const { guardStatements, lockStatement, stageStatement, staleStatement } = require( "#schema" );
const { UnderReviewError, findVersion, loadAnomalies, loadApprovedContent, loadVersion } = require( "#versions" );

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

/**
 * The statement that locks a release's row until the batch ends: every change of a release's status takes it first, then
 * checks the status it read. On PostgreSQL a status checked before any lock let an approval and a return made at once
 * both commit, the return writing over the approval (final review of plan 6b, I1).
 *
 * @method
 * @param {string} releaseId
 * @returns {import( "#definitions" ).Statement}
 * @public
 */
module.exports.lockRelease = ( releaseId ) => ( { sql: "UPDATE releases SET status = status WHERE id = ?", params: [ releaseId ] } );

/**
 * The statement that makes a batch stale when a release's status is no longer the one it was read in. It goes after
 * `lockRelease`, under the lock.
 *
 * @method
 * @param {string} releaseId
 * @param {string} status
 * @returns {import( "#definitions" ).Statement}
 * @public
 */
module.exports.releaseIs = ( releaseId, status ) => ( { sql: "INSERT INTO write_guards ( reason ) SELECT 'stale' FROM releases WHERE id = ? AND status <> ?",
    params: [ releaseId, status ] } );

// Each version of a round locked, then checked unchanged since its changelog was taken (§7.4); a version entering the
// release is checked, under its lock, to be in no release yet.
const lockedRound = ( round, entering ) => round.flatMap( ( row ) => [ ...guardStatements( row.id ), staleStatement( row.id, row.content_hash ),
    ...( entering.includes( row ) ? [ unreleased( row.id ) ] : [] ) ] );

// The round and each version's changelog as submitted (§7.4).
const roundStatements = async ( db, releaseId, roundNo, round, author ) => {
    const roundId = crypto.randomUUID();
    const statements = [ { sql: "INSERT INTO rounds ( id, release_id, round_no, submitted_by, submitted_at ) VALUES ( ?, ?, ?, ?, ? )",
        params: [ roundId, releaseId, roundNo, author.actor, author.now.toISOString() ] } ];
    for ( const row of round ) {
        statements.push( { sql: "INSERT INTO round_versions ( round_id, version_id, content_hash, changelog ) VALUES ( ?, ?, ?, ? )",
            params: [ roundId, row.id, row.content_hash, JSON.stringify( await loadEntries( db, row.id ) ) ] } );
    }
    return statements;
};

// A version not yet in a release, checked under its lock, which comes first in the batch: two submissions at once both pass
// the first look, and on PostgreSQL both committed while the check ran before the lock (final review of plan 6b, I1).
const unreleased = ( versionId ) => ( { sql: "INSERT INTO write_guards ( reason ) SELECT 'stale' FROM versions WHERE id = ? AND release_id IS NOT NULL",
    params: [ versionId ] } );

// Runs a submission's batch, again from the start when a write came in between.
const retrying = async ( db, attempt ) => {
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
    throw new Error( `The release changed while it was written, ${ ATTEMPTS } times over.` );
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
    return retrying( db, async () => {
        const rows = [];
        for ( const versionId of input.versions ) {
            rows.push( await rowOf( db, versionId ) );
        }
        const reasons = await refusalsOf( db, rows, rows, [] );
        if ( reasons.length ) {
            throw new SubmissionRefusedError( reasons );
        }
        const releaseId = crypto.randomUUID();
        // Locks and checks first; then the release row, before the versions' references to it.
        const statements = [
            ...lockedRound( rows, rows ),
            { sql: "INSERT INTO releases ( id, status, summary_bg, summary_en, created_at ) VALUES ( ?, ?, ?, ?, ? )",
                params: [ releaseId, RELEASE_STATUS.REVIEW, summary.bg || null, summary.en || null, author.now.toISOString() ] },
            ...rows.map( ( row ) => ( { sql: "UPDATE versions SET release_id = ? WHERE id = ?", params: [ releaseId, row.id ] } ) ),
            ...await roundStatements( db, releaseId, 1, rows, author ),
            module.exports.eventStatement( { release: releaseId, event: RELEASE_EVENT.SUBMITTED, author: author, details: { round: 1 } } )
        ];
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
    return retrying( db, async () => {
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
        // A version joins a release only while it is in implementation (§7.3): joining one in testing, it went on to
        // production under the release's date, with no notice period of its own (final review of plan 6b, I3).
        const past = members.filter( ( row ) => row.stage !== STAGE.DEVELOPMENT && row.stage !== STAGE.IMPLEMENTATION && row.stage !== STAGE.RETIRED );
        if ( added.length && past.length ) {
            reasons.push( ...added.map( ( row ) => ( { version: row.id, rule: "past",
                message: `The release has gone past implementation (${ past[ 0 ].spec_id } is in ${ past[ 0 ].stage }); a version joins only a release in implementation (§7.3).` } ) ) );
        }
        if ( reasons.length ) {
            throw new SubmissionRefusedError( reasons );
        }
        const last = await db.get( "SELECT MAX( round_no ) AS n FROM rounds WHERE release_id = ?", [ releaseId ] );
        const roundNo = ( last.n || 0 ) + 1;
        const statements = [
            // The release is as it was read: a decision or another round in between makes this one stale.
            module.exports.lockRelease( releaseId ),
            module.exports.releaseIs( releaseId, release.status ),
            ...lockedRound( round, added ),
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

// What a development version starts from once the version it started from is gone: the most advanced left (§7.5).
const SOURCES = Object.freeze( [ STAGE.IMPLEMENTATION, STAGE.TESTING, STAGE.PRODUCTION ] );

/**
 * Abandons a release in implementation or testing (design record §7.1): its versions there retire and freeze, with
 * their changelogs, and their numbers stay taken; a development version it held leaves it, to be submitted again. A
 * development version whose base was one of the retired moves its base to the spec's most advanced version left, or to
 * none, and its changelog is refreshed, so the abandoned changes show in it and its editor decides whether to keep them.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {string} releaseId
 * @param {{actor: string, now: Date}} input
 * @returns {Promise<void>}
 * @throws {TypeError} For a release abandoned already, one with a version in production or previous production, one
 *     with nothing in implementation or testing, or no author.
 * @throws {RangeError} For a release that is none.
 * @public
 */
module.exports.abandonRelease = async ( db, store, releaseId, input ) => {
    const author = authorOf( input );
    const retired = await retrying( db, async () => {
        const release = await db.get( "SELECT id, status FROM releases WHERE id = ?", [ releaseId ] );
        if ( !release ) {
            throw new RangeError( `There is no release ${ releaseId }.` );
        }
        if ( release.status === RELEASE_STATUS.ABANDONED ) {
            throw new TypeError( `Release ${ releaseId } was abandoned already.` );
        }
        const members = await db.all( "SELECT id, spec_id, stage FROM versions WHERE release_id = ?", [ releaseId ] );
        if ( members.some( ( member ) => member.stage === STAGE.PRODUCTION || member.stage === STAGE.PREVIOUS_PRODUCTION ) ) {
            throw new TypeError( `Release ${ releaseId } has reached production, and is not abandoned.` );
        }
        const leaving = members.filter( ( member ) => member.stage === STAGE.IMPLEMENTATION || member.stage === STAGE.TESTING );
        if ( !leaving.length ) {
            throw new TypeError( `Release ${ releaseId } has nothing in implementation or testing to abandon; return it instead.` );
        }
        const statements = [ module.exports.lockRelease( releaseId ), module.exports.releaseIs( releaseId, release.status ) ];
        for ( const member of leaving ) {
            statements.push( lockStatement( member.id ), stageStatement( member.id, member.stage ),
                { sql: "UPDATE versions SET stage = ?, frozen = 1 WHERE id = ?", params: [ STAGE.RETIRED, member.id ] },
                { sql: "DELETE FROM approved_items WHERE version_id = ?", params: [ member.id ] },
                { sql: "INSERT INTO version_stages ( version_id, stage, entered_on ) VALUES ( ?, ?, ? )", params: [ member.id, STAGE.RETIRED, sofiaDate( author.now ) ] } );
        }
        for ( const member of members.filter( ( candidate ) => candidate.stage === STAGE.DEVELOPMENT ) ) {
            statements.push( { sql: "UPDATE versions SET release_id = NULL WHERE id = ?", params: [ member.id ] } );
        }
        statements.push( { sql: "UPDATE releases SET status = ? WHERE id = ?", params: [ RELEASE_STATUS.ABANDONED, releaseId ] },
            module.exports.eventStatement( { release: releaseId, event: RELEASE_EVENT.ABANDONED, author: author, details: { versions: leaving.map( ( member ) => member.id ) } } ) );
        return { statements: statements, result: leaving };
    } );
    for ( const spec of new Set( retired.map( ( member ) => member.spec_id ) ) ) {
        const development = await findVersion( db, spec, { stage: STAGE.DEVELOPMENT } );
        if ( !development || !retired.some( ( member ) => member.id === development.base ) ) {
            continue;
        }
        let base = null;
        for ( const stage of SOURCES ) {
            const found = await findVersion( db, spec, { stage: stage } );
            if ( found ) {
                base = found.id;
                break;
            }
        }
        await db.batch( [ ...guardStatements( development.id ), { sql: "UPDATE versions SET base_id = ? WHERE id = ?", params: [ base, development.id ] } ] );
        await refreshChangelog( db, development.id );
    }
};

/**
 * Takes a development version out of its release (final review of plan 6b, I4): one added by a round the approver
 * returned, or one of a release returned before its first approval. Otherwise nothing took it out, and it held its
 * release short of testing for good. A release left with no version is abandoned. The version is free to be submitted
 * again, alone or in another release.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @param {{actor: string, now: Date}} input
 * @returns {Promise<void>}
 * @throws {import( "#versions" ).UnderReviewError} While its release is under review.
 * @throws {TypeError} For a version not in development or in no release, or no author.
 * @throws {RangeError} For a version that is none.
 * @public
 */
module.exports.withdrawVersion = async ( db, versionId, input ) => {
    const author = authorOf( input );
    await retrying( db, async () => {
        const row = await rowOf( db, versionId );
        if ( row.stage !== STAGE.DEVELOPMENT || row.release_id === null ) {
            throw new TypeError( `Version ${ versionId } is not a development version in a release.` );
        }
        const release = await db.get( "SELECT id, status FROM releases WHERE id = ?", [ row.release_id ] );
        if ( release.status === RELEASE_STATUS.REVIEW ) {
            throw new UnderReviewError( versionId );
        }
        return { statements: [
            module.exports.lockRelease( release.id ),
            module.exports.releaseIs( release.id, release.status ),
            ...guardStatements( versionId ),
            { sql: "INSERT INTO write_guards ( reason ) SELECT 'stale' FROM versions WHERE id = ? AND ( release_id IS NULL OR release_id <> ? )", params: [ versionId, release.id ] },
            { sql: "UPDATE versions SET release_id = NULL WHERE id = ?", params: [ versionId ] },
            // Whether anything is left is decided here, under the release's lock: counted before the batch, two
            // withdrawals at once each saw the other's version, and the empty release was never abandoned (review of PR 18).
            { sql: "UPDATE releases SET status = ? WHERE id = ? AND NOT EXISTS ( SELECT 1 FROM versions WHERE release_id = ? AND stage <> ? )",
                params: [ RELEASE_STATUS.ABANDONED, release.id, release.id, STAGE.RETIRED ] },
            module.exports.eventStatement( { release: release.id, version: versionId, event: RELEASE_EVENT.WITHDRAWN, author: author } )
        ], result: undefined };
    } );
};
