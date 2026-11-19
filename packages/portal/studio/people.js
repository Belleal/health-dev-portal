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
 * The People screen's data and its one write (plan 9a): who the studio knows, what each holds, and an admin's change of
 * what a person holds. The fragment's roles gate only the HTML, so the framework answers the JSON view and the service
 * to anyone signed in; each checks the role itself, from the session's roles, which are re-read on every request.
 */

const exceptions = require( "@ti-engine/core/exceptions" );
const { grantChanges, listPeople, setGrants } = require( "@health-dev-portal/data/staff" );
const { listSpecs } = require( "@health-dev-portal/data/versions" );
const { isStudioAdmin } = require( "#studio/roles" );
const { formatSofia } = require( "#studio/sofia-time" );

// How many changes the screen lists: the log is long-lived and the screen is a glance, not the audit.
const CHANGES_SHOWN = 30;

/**
 * Refuses anyone who is not an admin. It reads the roles, never `session.studio.editorSpecs`, which a failed refresh
 * leaves at its last value.
 *
 * @method
 * @param {Object} session
 * @returns {void}
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's.
 * @private
 */
const requireAdmin = ( session ) => {
    const roles = ( session && session.user && session.user.roles ) || [];
    if ( !isStudioAdmin( roles ) ) {
        throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
    }
};

/**
 * The People screen's data: everyone with what they hold, the specs a grant may name, and the latest changes.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session.
 * @param {string} [language] The screen's language, for the times; Bulgarian without one.
 * @returns {Promise<{people: Array<Object>, specs: string[], changes: Array<Object>}>} Names are the identity
 *     provider's text, returned as it is: the screen shows them by `x-text` and never as markup. Each person carries
 *     `lastSeenText` and each change `atText`, written in Sofia time.
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's.
 * @public
 */
module.exports.peopleView = async ( db, session, language = "bg" ) => {
    requireAdmin( session );
    const [ people, specs, changes ] = await Promise.all( [ listPeople( db ), listSpecs( db ), grantChanges( db, { limit: CHANGES_SHOWN } ) ] );
    return {
        people: people.map( ( one ) => ( { ...one, lastSeenText: formatSofia( one.lastSeenAt, language ) } ) ),
        specs: specs,
        changes: changes.map( ( one ) => ( { ...one, atText: formatSofia( one.at, language, { time: true } ) } ) )
    };
};

/**
 * Replaces what one person holds, as the acting admin.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session; its `studio.key` is who made the change.
 * @param {{key: string, grants: Array<{role: string, spec: string}>}} params The person and their whole new set.
 * @returns {Promise<void>}
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's; `E_WEB_INVALID_REQUEST_BODY`
 *     (422) naming the reason when the store refuses the set.
 * @public
 */
module.exports.changeGrants = async ( db, session, params ) => {
    requireAdmin( session );
    const { key, grants } = params || {};
    try {
        await setGrants( db, key, grants, { by: ( session.studio && session.studio.key ) || "" } );
    } catch ( error ) {
        if ( error instanceof RangeError ) {
            // The reason is the store's own sentence, written for a person; a client error keeps its data, and the framework's notification shows `details` as the second line.
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_BODY, { details: error.message }, exceptions.httpCode.C_422 );
        }
        throw error;
    }
};
