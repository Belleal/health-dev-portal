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
 * The studio's roles (plan 9a): the names a session carries, and how a person's grants become them.
 *
 * The session names carry a `studio:` prefix because the framework reconciles its own `admin` role against the
 * configured allowlist on every request, in both directions: a role named `admin` granted from the database would be
 * stripped on the next request. The configuration's admin keeps the framework's `admin`, which counts here as well.
 */

const exceptions = require( "@ti-engine/core/exceptions" );
const { EVERY_SPEC, ROLE } = require( "@health-dev-portal/data/staff" );

/**
 * The session role of each stored role.
 *
 * @type {Readonly<{reader: string, editor: string, approver: string, admin: string}>}
 * @public
 */
module.exports.SESSION_ROLE = Object.freeze( {
    [ ROLE.READER ]: "studio:reader",
    [ ROLE.EDITOR ]: "studio:editor",
    [ ROLE.APPROVER ]: "studio:approver",
    [ ROLE.ADMIN ]: "studio:admin"
} );

const SESSION_ROLE = module.exports.SESSION_ROLE;

/**
 * The roles that mark a session as staff: the four studio roles and the framework's `admin`.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
module.exports.STAFF_ROLES = Object.freeze( [ ...Object.values( SESSION_ROLE ), "admin" ] );

/**
 * The roles that make a session an admin of the studio.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
module.exports.ADMIN_ROLES = Object.freeze( [ SESSION_ROLE.admin, "admin" ] );

/**
 * Turns a person's grants into the roles of their session and the specs they may edit.
 *
 * @method
 * @param {Array<{role: string, spec: string}>} grants As `loadGrants` returns them.
 * @returns {{roles: string[], editorSpecs: string[]|null}} The roles in a fixed order, so two reads of the same grants
 *     compare equal. `editorSpecs` is `null` for an editor of every spec, the named specs for a limited one, and `[]`
 *     for someone who is not an editor.
 * @public
 */
module.exports.sessionRolesOf = ( grants ) => {
    const roles = Object.keys( SESSION_ROLE ).filter( ( role ) => grants.some( ( grant ) => grant.role === role ) ).map( ( role ) => SESSION_ROLE[ role ] );
    const editing = grants.filter( ( grant ) => grant.role === ROLE.EDITOR );
    const everySpec = editing.some( ( grant ) => grant.spec === EVERY_SPEC );
    const editorSpecs = everySpec ? null : editing.map( ( grant ) => grant.spec ).sort();
    return { roles: roles, editorSpecs: editorSpecs };
};

/**
 * Whether a session's roles make it an admin of the studio.
 *
 * @method
 * @param {string[]} roles The session user's roles.
 * @returns {boolean}
 * @public
 */
module.exports.isStudioAdmin = ( roles ) => module.exports.ADMIN_ROLES.some( ( role ) => roles.includes( role ) );

/**
 * Refuses anyone who is not an admin. It reads the roles, never `session.studio.editorSpecs`, which a failed refresh
 * leaves at its last value. A fragment's `roles` gate only the HTML, so every JSON view and service of an admin screen
 * calls this itself.
 *
 * @method
 * @param {Object} session
 * @returns {void}
 * @throws {TiException} `E_SEC_UNAUTHORIZED_ACCESS` (403) unless the session is an admin's.
 * @public
 */
module.exports.requireStudioAdmin = ( session ) => {
    const roles = ( session && session.user && session.user.roles ) || [];
    if ( !module.exports.isStudioAdmin( roles ) ) {
        throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_403 );
    }
};
