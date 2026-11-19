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
 * The Settings screen (plan 9a): the one setting the studio owns, whether an approver may approve a round they submitted
 * themselves. The fragment's roles gate only the HTML, so the view and the service each check the role themselves.
 */

const { readSetting, writeSetting } = require( "@health-dev-portal/data/files" );
const { TWO_PEOPLE } = require( "@health-dev-portal/data/review" );
const { refuse } = require( "#studio/refusals" );
const { requireStudioAdmin } = require( "#studio/roles" );

/**
 * The Settings screen's data.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session.
 * @returns {Promise<{selfApproval: boolean}>} Whether an approver may approve their own round. Only `"on"` forbids it, as
 *     the review code reads the setting: a missing value, or `"off"`, allows it.
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's.
 * @public
 */
module.exports.settingsView = async ( db, session ) => {
    requireStudioAdmin( session );
    return { selfApproval: await readSetting( db, TWO_PEOPLE ) !== "on" };
};

/**
 * Saves the Settings screen's form.
 *
 * @method
 * @param {Object} db The portal's database.
 * @param {Object} session The requesting session.
 * @param {{selfApproval: boolean}} params Whether an approver may approve their own round.
 * @returns {Promise<void>} Writes `"off"` when self-approval is allowed and `"on"` when it is not.
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's; `E_WEB_INVALID_REQUEST_BODY`
 *     (422) for anything but a true or false, so a stray `"false"` cannot be read as a yes.
 * @public
 */
module.exports.saveSettings = async ( db, session, params ) => {
    requireStudioAdmin( session );
    const { selfApproval } = params || {};
    if ( typeof selfApproval !== "boolean" ) {
        throw refuse( "studio.refused.not-boolean" );
    }
    await writeSetting( db, TWO_PEOPLE, selfApproval ? "off" : "on" );
};
