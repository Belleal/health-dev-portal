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

/*
 * The environments' status (plan 8c, decision 6; design record §8.7): what staff last said of each environment, the
 * maintenance windows they announced, and the events a feed lists. Staff set it — through `hdp-status` until the staff
 * area's form (plan 9) — and nothing measures it yet.
 *
 * Every change records who made it and when (§10.1). Who is for staff: no function here that a public page reads returns
 * it (§10.2). Times are UTC ISO strings, which sort as the moments they name, and are sorted in JavaScript, never by the
 * database's text order (§3.2). The tables stay small — an update or a window now and then — so each read takes them
 * whole.
 */

const crypto = require( "node:crypto" );

/**
 * The environments, in the order a page shows them.
 *
 * @type {{PRODUCTION: string, TEST: string}}
 * @public
 */
module.exports.ENVIRONMENT = Object.freeze( { PRODUCTION: "production", TEST: "test" } );

/**
 * @type {string[]}
 * @public
 */
module.exports.ENVIRONMENTS = Object.freeze( [ module.exports.ENVIRONMENT.PRODUCTION, module.exports.ENVIRONMENT.TEST ] );

/**
 * What staff may say of an environment.
 *
 * @type {{OPERATIONAL: string, DEGRADED: string, MAINTENANCE: string, OUTAGE: string}}
 * @public
 */
module.exports.STATE = Object.freeze( { OPERATIONAL: "operational", DEGRADED: "degraded", MAINTENANCE: "maintenance", OUTAGE: "outage" } );

/**
 * @type {string[]}
 * @public
 */
module.exports.STATES = Object.freeze( Object.values( module.exports.STATE ) );

const isText = ( value ) => typeof value === "string" && value.trim() !== "";

const oneOf = ( value, allowed, what ) => {
    if ( !allowed.includes( value ) ) {
        throw new RangeError( `${ JSON.stringify( value ) } is not ${ what }: ${ allowed.join( ", " ) }.` );
    }
    return value;
};

// A message is given in both languages or not at all (§8.7): a page in either language must have one to show.
const messageOf = ( message ) => {
    if ( message === null || message === undefined ) {
        return null;
    }
    if ( !isText( message.bg ) || !isText( message.en ) ) {
        throw new RangeError( "A status message is given in both languages, bg and en, or not at all." );
    }
    return { bg: message.bg.trim(), en: message.en.trim() };
};

const author = ( by ) => {
    if ( !isText( by ) ) {
        throw new RangeError( "Every status change records who made it." );
    }
    return by.trim();
};

const moment = ( value, what ) => {
    const date = value instanceof Date ? value : new Date( value );
    if ( Number.isNaN( date.getTime() ) ) {
        throw new RangeError( `${ what } is not a time.` );
    }
    return date.toISOString();
};

const rowMessage = ( row ) => row.message_bg === null ? null : { bg: row.message_bg, en: row.message_en };
const newestFirst = ( a, b ) => a < b ? 1 : a > b ? -1 : 0;

const updatesOf = async ( db ) => ( await db.all( "SELECT id, environment, state, message_bg, message_en, updated_at FROM status_updates" ) )
    .map( ( row ) => ( { id: row.id, environment: row.environment, state: row.state, message: rowMessage( row ), updatedAt: row.updated_at } ) )
    // The ID breaks a tie of two updates at one moment, so the latest is the same on every read and both databases.
    .sort( ( a, b ) => newestFirst( a.updatedAt, b.updatedAt ) || newestFirst( a.id, b.id ) );

/**
 * Records what staff now say of an environment.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {Object} change
 * @param {string} change.environment One of `ENVIRONMENTS`.
 * @param {string} change.state One of `STATES`.
 * @param {{bg: string, en: string}|null} [change.message]
 * @param {string} change.by Who made the change, kept for staff.
 * @param {Date} [change.at] When; now without it.
 * @returns {Promise<string>} The update's ID.
 * @throws {RangeError} For an unknown environment or state, a message in one language, or no author.
 * @public
 */
module.exports.setStatus = async ( db, { environment, state, message = null, by, at = new Date() } ) => {
    const id = crypto.randomUUID();
    const text = messageOf( message );
    await db.run( "INSERT INTO status_updates ( id, environment, state, message_bg, message_en, updated_by, updated_at ) VALUES ( ?, ?, ?, ?, ?, ?, ? )",
        [ id, oneOf( environment, module.exports.ENVIRONMENTS, "an environment" ), oneOf( state, module.exports.STATES, "a state" ), text && text.bg,
            text && text.en, author( by ), moment( at, "The change's time" ) ] );
    return id;
};

/**
 * Each environment's state as staff last set it, in `ENVIRONMENTS` order: a `null` state for one never set, which a page
 * must not show as working.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @returns {Promise<Array<{environment: string, state: string|null, message: {bg: string, en: string}|null, updatedAt: string|null}>>}
 * @public
 */
module.exports.currentStatus = async ( db ) => {
    const updates = await updatesOf( db );
    return module.exports.ENVIRONMENTS.map( ( environment ) => {
        const latest = updates.find( ( one ) => one.environment === environment );
        return latest ? { environment: environment, state: latest.state, message: latest.message, updatedAt: latest.updatedAt }
            : { environment: environment, state: null, message: null, updatedAt: null };
    } );
};

/**
 * The updates of every environment, newest first.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{limit?: number}} [options] 20 without it.
 * @returns {Promise<Array<{id: string, environment: string, state: string, message: {bg: string, en: string}|null, updatedAt: string}>>}
 * @public
 */
module.exports.statusHistory = async ( db, { limit = 20 } = {} ) => ( await updatesOf( db ) ).slice( 0, limit );

/**
 * Announces a maintenance window.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {Object} window
 * @param {string} window.environment One of `ENVIRONMENTS`.
 * @param {Date|string} window.startsAt
 * @param {Date|string} window.endsAt After the start.
 * @param {{bg: string, en: string}|null} [window.message]
 * @param {string} window.by Who announced it, kept for staff.
 * @param {Date} [window.at] When; now without it.
 * @returns {Promise<string>} The window's ID.
 * @throws {RangeError} For an unknown environment, a time that is none, an end not after the start, a message in one
 *     language, or no author.
 * @public
 */
module.exports.addMaintenance = async ( db, { environment, startsAt, endsAt, message = null, by, at = new Date() } ) => {
    const start = moment( startsAt, "The window's start" );
    const end = moment( endsAt, "The window's end" );
    if ( end <= start ) {
        throw new RangeError( "A maintenance window ends after it starts." );
    }
    const id = crypto.randomUUID();
    const text = messageOf( message );
    await db.run( `INSERT INTO maintenance_windows ( id, environment, starts_at, ends_at, message_bg, message_en, created_by, created_at )
        VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )`, [ id, oneOf( environment, module.exports.ENVIRONMENTS, "an environment" ), start, end, text && text.bg,
        text && text.en, author( by ), moment( at, "The announcement's time" ) ] );
    return id;
};

/**
 * Cancels an announced window.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} id
 * @param {{by: string, at?: Date}} change Who cancelled it, kept for staff, and when.
 * @returns {Promise<boolean>} `false` for no such window, or one already cancelled.
 * @throws {RangeError} For no author.
 * @public
 */
module.exports.cancelMaintenance = async ( db, id, { by, at = new Date() } ) => {
    const result = await db.run( "UPDATE maintenance_windows SET cancelled_by = ?, cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL",
        [ author( by ), moment( at, "The cancellation's time" ), id ] );
    return result.changes > 0;
};

const windowsOf = async ( db ) => ( await db.all( "SELECT id, environment, starts_at, ends_at, message_bg, message_en, created_at, cancelled_at FROM maintenance_windows" ) )
    .map( ( row ) => ( { id: row.id, environment: row.environment, startsAt: row.starts_at, endsAt: row.ends_at, message: rowMessage( row ), createdAt: row.created_at,
        cancelledAt: row.cancelled_at } ) );

/**
 * The windows that have not ended and were not cancelled, by their start: one in progress, then those to come.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{now: Date}} options
 * @returns {Promise<Array<{id: string, environment: string, startsAt: string, endsAt: string, message: {bg: string, en: string}|null}>>}
 * @public
 */
module.exports.maintenanceWindows = async ( db, { now } ) => {
    const instant = moment( now, "Now" );
    return ( await windowsOf( db ) ).filter( ( one ) => one.cancelledAt === null && one.endsAt > instant )
        .sort( ( a, b ) => -newestFirst( a.startsAt, b.startsAt ) || -newestFirst( a.id, b.id ) )
        .map( ( one ) => ( { id: one.id, environment: one.environment, startsAt: one.startsAt, endsAt: one.endsAt, message: one.message } ) );
};

/**
 * What a feed lists, newest first: each status update at its time, and each window at its announcement, or at its
 * cancellation once cancelled, so a reader's feed shows that it was.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{limit?: number}} [options] 50 without it.
 * @returns {Promise<import( "#definitions" ).StatusEvent[]>}
 * @public
 */
module.exports.statusEvents = async ( db, { limit = 50 } = {} ) => {
    const updates = ( await updatesOf( db ) ).map( ( one ) => ( { kind: "status", id: one.id, environment: one.environment, at: one.updatedAt, state: one.state,
        message: one.message } ) );
    const windows = ( await windowsOf( db ) ).map( ( one ) => ( { kind: "maintenance", id: one.id, environment: one.environment, at: one.cancelledAt || one.createdAt,
        startsAt: one.startsAt, endsAt: one.endsAt, cancelled: one.cancelledAt !== null, message: one.message } ) );
    return [ ...updates, ...windows ].sort( ( a, b ) => newestFirst( a.at, b.at ) || newestFirst( a.id, b.id ) ).slice( 0, limit );
};
