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
 * The Environment status screen (plan 9a), which replaces `hdp-status` for staff: each environment's state and message,
 * the maintenance windows to come, and the recent updates. It writes through the data layer's status store with the
 * person's key as `by`; the public page never shows it. The fragment's roles gate only the HTML, so the view and every
 * service check the role themselves.
 */

const { ENVIRONMENTS, STATES, addMaintenance, cancelMaintenance, currentStatus, maintenanceWindows, setStatus, statusEvents } = require( "@health-dev-portal/data/status" );
const { refusalOf, refuse } = require( "#studio/refusals" );
const { requireStudioAdmin } = require( "#studio/roles" );
const { formatSofia, sofiaInstant } = require( "#studio/sofia-time" );

// How many updates the screen lists: a glance at what changed lately, as the public feed is the long record.
const EVENTS_SHOWN = 20;

const textOf = ( message, language ) => message ? message[ language === "en" ? "en" : "bg" ] : "";
const by = ( session ) => ( session.studio && session.studio.key ) || "";

// Both languages given, neither, or one: the one is the store's to refuse, and it says why.
const messageOf = ( params ) => {
    const bg = typeof params.messageBg === "string" ? params.messageBg.trim() : "";
    const en = typeof params.messageEn === "string" ? params.messageEn.trim() : "";
    return bg === "" && en === "" ? null : { bg: bg, en: en };
};

/**
 * The Environment status screen's data.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session.
 * @param {Date} [now] The moment windows are measured against; the present without it.
 * @param {string} [language] The screen's language, for the times and the messages; Bulgarian without one.
 * @returns {Promise<{environments: string[], states: string[], current: Array<Object>, windows: Array<Object>, events: Array<Object>}>}
 *     `current` is each environment's last state, `null` for one never set; `windows` are those not ended or cancelled;
 *     `events` are the latest updates and announcements. Each carries its times in Sofia time (`...Text`) and its message in
 *     the screen's language (`messageText`), the message itself too.
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's.
 * @public
 */
module.exports.environmentView = async ( db, session, now = new Date(), language = "bg" ) => {
    requireStudioAdmin( session );
    const [ current, windows, events ] = await Promise.all( [ currentStatus( db ), maintenanceWindows( db, { now: now } ), statusEvents( db, { limit: EVENTS_SHOWN } ) ] );
    return {
        environments: [ ...ENVIRONMENTS ],
        states: [ ...STATES ],
        current: current.map( ( one ) => ( { ...one, messageText: textOf( one.message, language ),
            updatedAtText: one.updatedAt === null ? "" : formatSofia( one.updatedAt, language, { time: true } ) } ) ),
        windows: windows.map( ( one ) => ( { ...one, messageText: textOf( one.message, language ), startsAtText: formatSofia( one.startsAt, language, { time: true } ),
            endsAtText: formatSofia( one.endsAt, language, { time: true } ) } ) ),
        events: events.map( ( one ) => ( { ...one, messageText: textOf( one.message, language ), atText: formatSofia( one.at, language, { time: true } ),
            ...( one.kind === "maintenance" ? { startsAtText: formatSofia( one.startsAt, language, { time: true } ), endsAtText: formatSofia( one.endsAt, language, { time: true } ) } : {} ) } ) )
    };
};

/**
 * Sets what staff now say of an environment, as the acting admin.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session; its `studio.key` is who made the change.
 * @param {{environment: string, state: string, messageBg?: string, messageEn?: string}} params A message is given in both
 *     languages or in neither.
 * @returns {Promise<void>}
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's; `E_WEB_INVALID_REQUEST_BODY`
 *     (422) naming the reason when the store refuses the change.
 * @public
 */
module.exports.changeStatus = async ( db, session, params ) => {
    requireStudioAdmin( session );
    const { environment, state } = params || {};
    try {
        await setStatus( db, { environment: environment, state: state, message: messageOf( params || {} ), by: by( session ) } );
    } catch ( error ) {
        throw refusalOf( error );
    }
};

/**
 * Announces a maintenance window, as the acting admin.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session; its `studio.key` is who announced it.
 * @param {{environment: string, startsAt: string, endsAt: string, messageBg?: string, messageEn?: string}} params The times
 *     are `yyyy-mm-ddThh:mm` in Sofia time, as the form's inputs give them.
 * @returns {Promise<void>}
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's; `E_WEB_INVALID_REQUEST_BODY`
 *     (422) for a time that is none, that the clock skips or repeats, or a window that ends first.
 * @public
 */
module.exports.announceWindow = async ( db, session, params ) => {
    requireStudioAdmin( session );
    const { environment, startsAt, endsAt } = params || {};
    try {
        await addMaintenance( db, { environment: environment, startsAt: sofiaInstant( startsAt ), endsAt: sofiaInstant( endsAt ), message: messageOf( params || {} ), by: by( session ) } );
    } catch ( error ) {
        throw refusalOf( error );
    }
};

/**
 * Cancels an announced window, as the acting admin.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session; its `studio.key` is who cancelled it.
 * @param {{id: string}} params
 * @returns {Promise<void>}
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's; `E_WEB_INVALID_REQUEST_BODY`
 *     (422) for a window that is none or was cancelled already, which would otherwise look like a success.
 * @public
 */
module.exports.withdrawWindow = async ( db, session, params ) => {
    requireStudioAdmin( session );
    const { id } = params || {};
    try {
        if ( typeof id !== "string" || !await cancelMaintenance( db, id, { by: by( session ) } ) ) {
            throw refuse( "studio.refused.window-gone" );
        }
    } catch ( error ) {
        throw refusalOf( error );
    }
};
