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

const { addDays, sofiaDate } = require( "@health-dev-portal/spec-model/dates" );
const { RELEASE_EVENT, RELEASE_STATUS, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { ConstraintError } = require( "#database" );
const { authorOf } = require( "#editing" );
const { PromotionRefusedError, checkMove } = require( "#moves" );
const { eventStatement } = require( "#releases" );
const { resolutionStatements, resolveAt } = require( "#resolution" );
const { guardStatements, lockStatement, stageStatement, staleStatement } = require( "#schema" );
const { findVersion } = require( "#versions" );

// Where a promotion moves a release's versions from (design record §7.1).
const FROM = Object.freeze( { [ STAGE.TESTING ]: STAGE.IMPLEMENTATION, [ STAGE.PRODUCTION ]: STAGE.TESTING } );

// A promotion computed from what it read is computed again when another write came in between.
const ATTEMPTS = 3;

const entered = ( versionId, stage, author ) => ( { sql: "INSERT INTO version_stages ( version_id, stage, entered_on ) VALUES ( ?, ?, ? )",
    params: [ versionId, stage, sofiaDate( author.now ) ] } );

const runs = async ( db, attempt ) => {
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
    throw new Error( `The releases changed while they were promoted, ${ ATTEMPTS } times over.` );
};

// What each release holds, and what it would move: its versions in the stage it leaves.
const releasesOf = async ( db, releaseIds, to ) => {
    const releases = [];
    for ( const releaseId of releaseIds ) {
        const release = await db.get( "SELECT id, status, notice_days, planned_on FROM releases WHERE id = ?", [ releaseId ] );
        if ( !release ) {
            throw new RangeError( `There is no release ${ releaseId }.` );
        }
        if ( release.status === RELEASE_STATUS.ABANDONED ) {
            throw new TypeError( `Release ${ releaseId } was abandoned.` );
        }
        const members = await db.all( `SELECT id, spec_id, stage, content_hash, approved_hash, replaces_id FROM versions WHERE release_id = ? AND stage <> '${ STAGE.RETIRED }'`,
            [ releaseId ] );
        const moving = members.filter( ( member ) => member.stage === FROM[ to ] );
        if ( !moving.length ) {
            throw new TypeError( `Release ${ releaseId } has no version in ${ FROM[ to ] } to promote to ${ to }.` );
        }
        releases.push( { ...release, members: members, moving: moving } );
    }
    return releases;
};

const toTesting = async ( db, releases, input, author ) => {
    const refusals = [];
    for ( const release of releases ) {
        for ( const member of release.moving ) {
            // Approved content only goes on (§7.4): a round under review, or changes not yet approved, hold it back.
            if ( release.status === RELEASE_STATUS.REVIEW || member.content_hash !== member.approved_hash ) {
                refusals.push( { version: member.id, spec: member.spec_id, rule: "pending", message: `${ member.spec_id } has changes not yet approved.` } );
            }
        }
        if ( release.planned_on === null && !( Number.isInteger( input.noticeDays ) && input.noticeDays >= 0 ) ) {
            throw new TypeError( `Release ${ release.id } goes to testing with a notice period in days (§7.6).` );
        }
    }
    const moves = releases.flatMap( ( release ) => release.moving.map( ( member ) => ( { version: member.id, to: STAGE.TESTING,
        ...( member.replaces_id ? { replaces: member.replaces_id } : {} ) } ) ) );
    const check = await checkMove( db, moves );
    refusals.push( ...check.refusals );
    if ( refusals.length ) {
        throw new PromotionRefusedError( refusals );
    }
    const placed = new Map( releases.flatMap( ( release ) => release.moving ).map( ( member ) => [ member.spec_id,
        new Map( [ [ STAGE.IMPLEMENTATION, null ], [ STAGE.TESTING, member.id ] ] ) ] ) );
    const statements = [];
    for ( const release of releases ) {
        for ( const member of release.moving ) {
            statements.push( ...guardStatements( member.id ), stageStatement( member.id, STAGE.IMPLEMENTATION ), staleStatement( member.id, member.content_hash ) );
            // A fix replaces the testing version it fixes, which retires first, so the stage holds one version (§7.1).
            if ( member.replaces_id ) {
                statements.push( lockStatement( member.replaces_id ), stageStatement( member.replaces_id, STAGE.TESTING ),
                    { sql: "UPDATE versions SET stage = ?, frozen = 1 WHERE id = ?", params: [ STAGE.RETIRED, member.replaces_id ] },
                    entered( member.replaces_id, STAGE.RETIRED, author ) );
            }
            // What it reads is recorded before it freezes, and frozen with it (§7.7); its approved copy is its content now.
            statements.push( ...resolutionStatements( member.id, await resolveAt( db, member.id, STAGE.TESTING, placed ) ),
                { sql: "UPDATE versions SET stage = ?, frozen = 1 WHERE id = ?", params: [ STAGE.TESTING, member.id ] },
                { sql: "DELETE FROM approved_items WHERE version_id = ?", params: [ member.id ] },
                entered( member.id, STAGE.TESTING, author ) );
        }
        // A fix keeps the release's planned date (§7.6.2); a release new to testing gets one from its notice period.
        const plannedOn = release.planned_on === null ? addDays( sofiaDate( author.now ), input.noticeDays ) : release.planned_on;
        if ( release.planned_on === null ) {
            statements.push( { sql: "UPDATE releases SET notice_days = ?, planned_on = ? WHERE id = ?", params: [ input.noticeDays, plannedOn, release.id ] } );
        }
        statements.push( { sql: "UPDATE releases SET status = ? WHERE id = ?", params: [ RELEASE_STATUS.ACCEPTED, release.id ] },
            eventStatement( { release: release.id, event: RELEASE_EVENT.PROMOTED, author: author,
                details: { to: STAGE.TESTING, plannedOn: plannedOn, versions: release.moving.map( ( member ) => member.id ) } } ) );
    }
    return { statements: statements, result: { warnings: check.warnings } };
};

const toProduction = async ( db, releases, input, author ) => {
    const refusals = [];
    const previous = input.previous || {};
    const today = sofiaDate( author.now );
    const replaced = new Map();
    for ( const release of releases ) {
        // A fix in implementation holds its whole release in testing (§7.3).
        for ( const member of release.members.filter( ( candidate ) => candidate.stage !== STAGE.TESTING ) ) {
            refusals.push( { version: member.id, spec: member.spec_id, rule: "waiting", message: `${ member.spec_id } is still in ${ member.stage }; the release waits for it.` } );
        }
        if ( release.planned_on === null || today < release.planned_on ) {
            refusals.push( { version: release.moving[ 0 ].id, spec: release.moving[ 0 ].spec_id, rule: "date",
                message: release.planned_on === null ? "The release has no planned production date yet (§7.6)." : `It is ${ today }; the release is planned for ${ release.planned_on } (§7.6).` } );
        }
        for ( const member of release.moving ) {
            const current = await findVersion( db, member.spec_id, { stage: STAGE.PRODUCTION } );
            if ( current ) {
                replaced.set( member.id, current.id );
                if ( !Object.hasOwn( previous, current.id ) ) {
                    refusals.push( { version: current.id, spec: member.spec_id, rule: "previous",
                        message: `Say whether ${ member.spec_id } ${ current.number } stays as previous production, and until when, or retires (§7.6).` } );
                } else if ( previous[ current.id ] !== null ) {
                    addDays( previous[ current.id ], 0 );
                }
            }
        }
    }
    const check = await checkMove( db, releases.flatMap( ( release ) => release.moving.map( ( member ) => ( { version: member.id, to: STAGE.PRODUCTION } ) ) ) );
    refusals.push( ...check.refusals );
    if ( refusals.length ) {
        throw new PromotionRefusedError( refusals );
    }
    const statements = [];
    for ( const release of releases ) {
        for ( const member of release.moving ) {
            statements.push( lockStatement( member.id ), stageStatement( member.id, STAGE.TESTING ) );
            // Previous production holds one version: the one there retires, then the replaced one takes its place (§7.6.3).
            const earlier = await findVersion( db, member.spec_id, { stage: STAGE.PREVIOUS_PRODUCTION } );
            if ( earlier ) {
                statements.push( lockStatement( earlier.id ), { sql: "UPDATE versions SET stage = ? WHERE id = ?", params: [ STAGE.RETIRED, earlier.id ] },
                    entered( earlier.id, STAGE.RETIRED, author ) );
            }
            const current = replaced.get( member.id );
            if ( current ) {
                const until = previous[ current ];
                statements.push( lockStatement( current ), stageStatement( current, STAGE.PRODUCTION ),
                    until === null
                        ? { sql: "UPDATE versions SET stage = ? WHERE id = ?", params: [ STAGE.RETIRED, current ] }
                        : { sql: "UPDATE versions SET stage = ?, expires_on = ? WHERE id = ?", params: [ STAGE.PREVIOUS_PRODUCTION, until, current ] },
                    entered( current, until === null ? STAGE.RETIRED : STAGE.PREVIOUS_PRODUCTION, author ) );
            }
            statements.push( { sql: "UPDATE versions SET stage = ? WHERE id = ?", params: [ STAGE.PRODUCTION, member.id ] }, entered( member.id, STAGE.PRODUCTION, author ) );
        }
        statements.push( eventStatement( { release: release.id, event: RELEASE_EVENT.PROMOTED, author: author,
            details: { to: STAGE.PRODUCTION, versions: release.moving.map( ( member ) => member.id ), previous: previous } } ) );
    }
    return { statements: statements, result: { warnings: check.warnings } };
};

/**
 * Promotes one or more releases in the same stage, in one batch, the checks seeing them move together (design record
 * §7.3).
 * - **To testing**, from implementation: refused while changes are pending or a round is open (`pending`). Each version
 *   records what it reads in testing and freezes (§7.7); a fix replaces the testing version it fixes, which retires.
 *   The release's planned production date is the Sofia date plus `noticeDays`; a release that has one keeps it.
 * - **To production**, from testing: refused while any version of the release is still in implementation (`waiting`),
 *   and before the planned date in Sofia (`date`). Each replaced production version goes to previous production until
 *   the date `previous` gives for it, or retires on `null`; one with no decision refuses (`previous`). A version already
 *   in previous production retires.
 * `checkMove`'s refusals apply to both.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Where the blueprint catalogue is.
 * @param {string[]} releaseIds
 * @param {{to: string, noticeDays?: number, previous?: Object<string, string|null>, actor: string, now: Date}} input
 * @returns {Promise<{warnings: import( "#definitions" ).Warning[]}>} Readers of a moving list that name something it no
 *     longer has (§4.8).
 * @throws {PromotionRefusedError} Naming every version and rule it breaks; nothing is written.
 * @throws {TypeError} For a stage that is not promoted to, a release with nothing to move, an abandoned release, a
 *     missing notice period, or no author.
 * @throws {RangeError} For a release that is none, or a date that is none.
 * @public
 */
module.exports.promoteReleases = async ( db, store, releaseIds, input ) => {
    const author = authorOf( input );
    if ( !FROM[ input.to ] ) {
        throw new TypeError( `A release is promoted to testing or production, not to ${ input.to }.` );
    }
    if ( !Array.isArray( releaseIds ) || !releaseIds.length ) {
        throw new TypeError( "Promote one release or more." );
    }
    return runs( db, async () => {
        const releases = await releasesOf( db, releaseIds, input.to );
        return input.to === STAGE.TESTING ? toTesting( db, releases, input, author ) : toProduction( db, releases, input, author );
    } );
};

/**
 * Sets or moves a release's planned production date (design record §7.6): an extended integration period, or an earlier
 * date when the code is ready. Either is announced again, from the event it records.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} releaseId
 * @param {{plannedOn: string, actor: string, now: Date}} input `plannedOn` as `yyyy-mm-dd`.
 * @returns {Promise<void>}
 * @throws {TypeError} For a release with no version in testing, or no author.
 * @throws {RangeError} For a release or date that is none.
 * @public
 */
module.exports.setPlannedDate = async ( db, releaseId, input ) => {
    const author = authorOf( input );
    addDays( input.plannedOn, 0 );
    const release = await db.get( "SELECT id, planned_on FROM releases WHERE id = ?", [ releaseId ] );
    if ( !release ) {
        throw new RangeError( `There is no release ${ releaseId }.` );
    }
    if ( !await db.get( "SELECT id FROM versions WHERE release_id = ? AND stage = ?", [ releaseId, STAGE.TESTING ] ) ) {
        throw new TypeError( `Release ${ releaseId } has no version in testing, so no production date to plan.` );
    }
    await db.batch( [
        { sql: "UPDATE releases SET planned_on = ? WHERE id = ?", params: [ input.plannedOn, releaseId ] },
        eventStatement( { release: releaseId, event: RELEASE_EVENT.DATE_SET, author: author, details: { plannedOn: input.plannedOn, was: release.planned_on } } )
    ] );
};

/**
 * Retires a version in previous production, when its backward compatibility has run out (design record §7.6.4): staff
 * do it by hand, and it is recorded.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @param {{actor: string, now: Date}} input
 * @returns {Promise<void>}
 * @throws {TypeError} For a version not in previous production, or no author.
 * @public
 */
module.exports.retirePreviousProduction = async ( db, versionId, input ) => {
    const author = authorOf( input );
    const version = await db.get( "SELECT id, stage, release_id FROM versions WHERE id = ?", [ versionId ] );
    if ( !version || version.stage !== STAGE.PREVIOUS_PRODUCTION ) {
        throw new TypeError( `Version ${ versionId } is not in previous production.` );
    }
    await runs( db, async () => ( { statements: [
        lockStatement( versionId ),
        stageStatement( versionId, STAGE.PREVIOUS_PRODUCTION ),
        { sql: "UPDATE versions SET stage = ? WHERE id = ?", params: [ STAGE.RETIRED, versionId ] },
        entered( versionId, STAGE.RETIRED, author ),
        eventStatement( { release: version.release_id, version: versionId, event: RELEASE_EVENT.PREVIOUS_RETIRED, author: author } )
    ], result: undefined } ) );
};
