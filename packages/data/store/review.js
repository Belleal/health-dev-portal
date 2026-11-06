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
const { sofiaDate } = require( "@health-dev-portal/spec-model/dates" );
const { RELEASE_EVENT, RELEASE_STATUS, ROUND_DECISION, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { acceptsNumber, proposeNumber } = require( "@health-dev-portal/spec-model/numbers" );
const { carryChange } = require( "#carry" );
const { ConstraintError } = require( "#database" );
const { authorOf } = require( "#editing" );
const { readSetting } = require( "#files" );
const { keyRows } = require( "#item-diff" );
const { PromotionRefusedError, checkMove } = require( "#moves" );
const { eventStatement } = require( "#releases" );
const { resolutionStatements, resolveAt } = require( "#resolution" );
const { guardStatements, staleStatement } = require( "#schema" );
const { approvedStatements, findVersion, loadApprovedContent, loadItems, loadVersion } = require( "#versions" );

// The setting that makes change control need two people (design record §7.4): off by default, while the team is small.
const TWO_PEOPLE = "review.two-people";

// A decision computed from versions read before its batch is taken again when one changed in between.
const ATTEMPTS = 3;

/**
 * An approver approving a round they submitted, while `review.two-people` is on (design record §7.4).
 *
 * @public
 */
class SelfApprovalError extends Error {

    /**
     * @param {string} release The release's ID.
     * @param {string} actor
     */
    constructor( release, actor ) {
        super( `${ actor } submitted this round of release ${ release }: with two people required, someone else approves it (design record §7.4).` );
        this.name = "SelfApprovalError";
        this.release = release;
        this.actor = actor;
    }
}
module.exports.SelfApprovalError = SelfApprovalError;

const openRound = async ( db, releaseId ) => {
    const release = await db.get( "SELECT id, status FROM releases WHERE id = ?", [ releaseId ] );
    if ( !release ) {
        throw new RangeError( `There is no release ${ releaseId }.` );
    }
    if ( release.status !== RELEASE_STATUS.REVIEW ) {
        throw new TypeError( `Release ${ releaseId } is ${ release.status }, not under review.` );
    }
    return db.get( "SELECT id, round_no, submitted_by FROM rounds WHERE release_id = ? AND decision IS NULL ORDER BY round_no DESC LIMIT 1", [ releaseId ] );
};

// Under review still, as it was read: a decision in between makes this one stale.
const stillUnderReview = ( releaseId ) => ( { sql: "INSERT INTO write_guards ( reason ) SELECT 'stale' FROM releases WHERE id = ? AND status <> ?",
    params: [ releaseId, RELEASE_STATUS.REVIEW ] } );

const decided = ( round, decision, author ) => ( { sql: "UPDATE rounds SET decision = ?, decided_by = ?, decided_at = ? WHERE id = ?",
    params: [ decision, author.actor, author.now.toISOString(), round.id ] } );

// Runs a decision's batch, computed again from the start when a write came in between.
const deciding = async ( db, attempt ) => {
    for ( let tries = 1; tries <= ATTEMPTS; tries += 1 ) {
        const { statements, result } = await attempt();
        try {
            await db.batch( statements );
            return result;
        } catch ( error ) {
            if ( !( error instanceof ConstraintError && error.constraint === "stale_guard" ) ) {
                throw error;
            }
        }
    }
    throw new Error( `The release changed while it was decided on, ${ ATTEMPTS } times over.` );
};

/**
 * Approves a release's open round (design record §7.2, §7.4). A first round moves the release's development versions into
 * implementation, each with the number the approver gave or the one proposed, its approved content copied and what it
 * reads recorded. A later round approves the pending changes of its implementation versions, and moves in any
 * development version added. The release is then accepted. Each version whose approved content changed is carried to
 * its spec's development version (§7.8); a conflict that causes in a version under review returns that version's release
 * to its editor (§7.4).
 *
 * Approval waits until the line is clear (§7.1): `checkMove` refuses it otherwise, and the release stays under review.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Where the blueprint catalogue is.
 * @param {string} releaseId
 * @param {{numbers?: Object<string, string>, actor: string, now: Date}} input `numbers` by version ID, for the versions
 *     entering implementation.
 * @returns {Promise<{carried: Array<{version: string, applied: number, conflicts: number}>, warnings: import( "#definitions" ).Warning[]}>}
 * @throws {PromotionRefusedError} With `checkMove`'s refusals, and `number` for a number the spec cannot take.
 * @throws {SelfApprovalError} Under `review.two-people`, for the round's own submitter.
 * @throws {TypeError} For a release not under review, or no author.
 * @throws {RangeError} For a release that is none.
 * @public
 */
module.exports.approveRelease = async ( db, store, releaseId, input ) => {
    const author = authorOf( input );
    const before = new Map();
    const { pending, warnings } = await deciding( db, async () => {
        const round = await openRound( db, releaseId );
        if ( await readSetting( db, TWO_PEOPLE ) === "on" && round.submitted_by === author.actor ) {
            throw new SelfApprovalError( releaseId, author.actor );
        }
        const versions = [];
        for ( const { version_id: id } of await db.all( "SELECT version_id FROM round_versions WHERE round_id = ?", [ round.id ] ) ) {
            versions.push( await loadVersion( db, id ) );
        }
        const entering = versions.filter( ( version ) => version.stage === STAGE.DEVELOPMENT );
        const changed = versions.filter( ( version ) => version.stage === STAGE.IMPLEMENTATION );
        const refusals = [];
        const numbers = new Map();
        for ( const version of entering ) {
            const used = ( await db.all( "SELECT number FROM versions WHERE spec_id = ? AND number IS NOT NULL", [ version.spec ] ) ).map( ( row ) => row.number );
            const number = input.numbers && input.numbers[ version.id ] !== undefined ? input.numbers[ version.id ] : proposeNumber( used );
            if ( !acceptsNumber( number, used ) ) {
                refusals.push( { version: version.id, spec: version.spec, rule: "number", message: `${ number } is not a number above every one ${ version.spec } has used (§7.2).` } );
            }
            numbers.set( version.id, number );
        }
        const check = entering.length ? await checkMove( db, entering.map( ( version ) => ( { version: version.id, to: STAGE.IMPLEMENTATION } ) ) ) : { refusals: [], warnings: [] };
        refusals.push( ...check.refusals );
        if ( refusals.length ) {
            throw new PromotionRefusedError( refusals );
        }
        // What each entering module reads in implementation, counting the others entering with it, under their new numbers.
        const placed = new Map( entering.map( ( version ) => [ version.spec, new Map( [ [ STAGE.DEVELOPMENT, null ], [ STAGE.IMPLEMENTATION, version.id ] ] ) ] ) );
        const statements = [ stillUnderReview( releaseId ) ];
        for ( const version of versions ) {
            statements.push( ...guardStatements( version.id ), staleStatement( version.id, version.contentHash ) );
        }
        for ( const version of entering ) {
            const resolutions = ( await resolveAt( db, version.id, STAGE.IMPLEMENTATION, placed ) )
                .map( ( resolution ) => numbers.has( resolution.version ) ? { ...resolution, number: numbers.get( resolution.version ) } : resolution );
            statements.push(
                { sql: "UPDATE versions SET stage = ?, number = ? WHERE id = ?", params: [ STAGE.IMPLEMENTATION, numbers.get( version.id ), version.id ] },
                { sql: "INSERT INTO version_stages ( version_id, stage, entered_on ) VALUES ( ?, ?, ? )", params: [ version.id, STAGE.IMPLEMENTATION, sofiaDate( author.now ) ] },
                ...approvedStatements( version.id ),
                ...resolutionStatements( version.id, resolutions )
            );
        }
        for ( const version of changed ) {
            before.set( version.id, await loadApprovedContent( db, version.id ) );
            statements.push( ...approvedStatements( version.id ) );
        }
        statements.push(
            decided( round, ROUND_DECISION.APPROVED, author ),
            { sql: "UPDATE releases SET status = ? WHERE id = ?", params: [ RELEASE_STATUS.ACCEPTED, releaseId ] },
            eventStatement( { release: releaseId, event: RELEASE_EVENT.APPROVED, author: author, details: { round: round.round_no, numbers: Object.fromEntries( numbers ) } } )
        );
        return { statements: statements, result: { pending: changed, warnings: check.warnings } };
    } );

    // Approved changes reach development (§7.8), after the approval is written: the carry has its own batch and guards.
    const carried = [];
    for ( const version of pending ) {
        const result = await carryChange( db, store, version.spec, before.get( version.id ), ( await loadVersion( db, version.id ) ).content, version.id );
        carried.push( { version: version.id, applied: result.applied, conflicts: result.conflicts } );
        if ( result.conflicts > 0 ) {
            await returnConflicted( db, version, author );
        }
    }
    return { carried: carried, warnings: warnings };
};

// §7.4: a conflict an approved change causes in a version under review returns its release to its editor.
const returnConflicted = async ( db, upstream, author ) => {
    const development = await findVersion( db, upstream.spec, { stage: STAGE.DEVELOPMENT } );
    const held = development ? await db.get( "SELECT r.id, r.status FROM versions v JOIN releases r ON r.id = v.release_id WHERE v.id = ?", [ development.id ] ) : null;
    if ( held && held.status === RELEASE_STATUS.REVIEW ) {
        await module.exports.returnRelease( db, held.id, { actor: author.actor, now: author.now, comments: [ { version: development.id,
            text: `An approved change to ${ upstream.spec } ${ upstream.number } conflicts with this version: settle the conflict and submit it again (§7.4, §7.8).` } ] } );
    }
};

// A comment's target must name something of its version: an item, by its key, or a changelog entry.
const checkTarget = async ( db, comment ) => {
    if ( comment.target.startsWith( "changelog:" ) ) {
        const entry = await db.get( "SELECT id FROM changelog_entries WHERE id = ? AND version_id = ?", [ comment.target.slice( "changelog:".length ), comment.version ] );
        if ( !entry ) {
            throw new TypeError( `${ comment.target } is no changelog entry of version ${ comment.version }.` );
        }
        return;
    }
    const kind = ( await db.get( "SELECT s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?", [ comment.version ] ) ).kind;
    if ( !keyRows( kind, await loadItems( db, comment.version ) ).has( comment.target ) ) {
        throw new TypeError( `${ comment.target } names no element, condition, entry or rule of version ${ comment.version }.` );
    }
};

/**
 * Returns a release's open round to its editors, with comments (design record §7.4): each on the release as a whole, on
 * a version, or on one element, condition, code-list entry, rule — by its item key — or changelog entry
 * (`changelog:<entry id>`). The versions are editable again.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} releaseId
 * @param {{comments?: Array<{version?: string, target?: string, text: string}>, actor: string, now: Date}} input
 * @returns {Promise<void>}
 * @throws {TypeError} For a release not under review, a comment without text, a version not in the release, a target
 *     that names nothing of its version, or no author.
 * @throws {RangeError} For a release that is none.
 * @public
 */
module.exports.returnRelease = async ( db, releaseId, input ) => {
    const author = authorOf( input );
    const comments = input.comments || [];
    await deciding( db, async () => {
        const round = await openRound( db, releaseId );
        const members = new Set( ( await db.all( "SELECT id FROM versions WHERE release_id = ?", [ releaseId ] ) ).map( ( row ) => row.id ) );
        for ( const comment of comments ) {
            if ( typeof comment.text !== "string" || !comment.text.trim() ) {
                throw new TypeError( "A comment has text." );
            }
            if ( comment.target && !comment.version ) {
                throw new TypeError( "A comment on one item names its version too." );
            }
            if ( comment.version && !members.has( comment.version ) ) {
                throw new TypeError( `Version ${ comment.version } is not in release ${ releaseId }.` );
            }
            if ( comment.target ) {
                await checkTarget( db, comment );
            }
        }
        const statements = [
            stillUnderReview( releaseId ),
            decided( round, ROUND_DECISION.RETURNED, author ),
            { sql: "UPDATE releases SET status = ? WHERE id = ?", params: [ RELEASE_STATUS.RETURNED, releaseId ] },
            ...comments.map( ( comment, index ) => ( {
                sql: "INSERT INTO comments ( id, round_id, comment_no, version_id, target, text, author, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )",
                params: [ crypto.randomUUID(), round.id, index + 1, comment.version || null, comment.target || null, comment.text, author.actor, author.now.toISOString() ]
            } ) ),
            eventStatement( { release: releaseId, event: RELEASE_EVENT.RETURNED, author: author, details: { round: round.round_no, comments: comments.length } } )
        ];
        return { statements: statements, result: undefined };
    } );
};
