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
 * The studio's session (plan 9a): which person a sign-in is, and the roles the session carries from that person's
 * grants. The framework's session hooks call `augment` at sign-in and `refresh` on later requests.
 */

const authorization = require( "@ti-engine/web-framework/authorization" );
const { loadGrants, recordSignIn } = require( "@health-dev-portal/data/staff" );
const { sessionRolesOf } = require( "#studio/roles" );

// The framework adds and removes its own admin role against the allowlist; leaving it out here would have the two take it
// away and give it back on every request, and a write of the session each time.
const withFramework = ( current, roles ) => current.includes( "admin" ) ? [ ...roles, "admin" ] : roles;

const sameList = ( left, right ) => left === right || ( Array.isArray( left ) && Array.isArray( right )
    && left.length === right.length && left.every( ( one, index ) => one === right[ index ] ) );

/**
 * The key a person's grants are stored under. An Entra person is keyed by the object ID, not by the subject: the
 * subject differs per application registration, so a key built from it would lose a person's grants when the
 * registration changes, while the object ID names the person in the directory.
 *
 * @method
 * @param {Object} user The session's user.
 * @param {string} authMethod The session's sign-in method.
 * @returns {string} `entra:<objectID>` for an Entra sign-in, the framework's user ID for a local one.
 * @throws {Error} For an Entra sign-in without an object ID, and for any other method: an unkeyed person would share
 *     grants with the next one.
 * @public
 */
module.exports.personKeyOf = ( user, authMethod ) => {
    if ( authMethod === "openid-azure" ) {
        if ( typeof user.objectID !== "string" || user.objectID === "" ) {
            throw new Error( "An Entra sign-in carries no object ID, so the studio cannot tell who the person is." );
        }
        return `entra:${ user.objectID }`;
    }
    if ( authMethod === "local" ) {
        return user.userID;
    }
    throw new Error( `The studio does not take a sign-in by ${ JSON.stringify( authMethod ) }.` );
};

/**
 * Records a sign-in and puts the person's roles on the session.
 *
 * @method
 * @param {Object} session The session; its `user` and `authMethod` are read, its `studio` and `user.roles` set.
 * @param {Object} db The portal's database.
 * @param {Object} options
 * @param {string[]} options.admins The configuration's admin allowlist.
 * @param {Date} [options.now] The time of the sign-in.
 * @returns {Promise<void>}
 * @throws {Error} When the sign-in cannot be keyed.
 * @public
 */
module.exports.augment = async ( session, db, { admins, now = new Date() } ) => {
    const user = session.user;
    const key = module.exports.personKeyOf( user, session.authMethod );
    await recordSignIn( db, { key: key, name: user.name || user.username, configuredAdmin: authorization.isAdminIdentity( user, admins ), at: now } );
    const { roles, editorSpecs } = sessionRolesOf( await loadGrants( db, key ) );
    session.studio = { key: key, editorSpecs: editorSpecs };
    user.roles = withFramework( user.roles || [], roles );
};

/**
 * Follows a change of the person's grants since the last request. It assigns only what changed: express-session saves a
 * session whose content changed, so assigning on every request would be a store write on every request.
 *
 * @method
 * @param {Object} session A session `augment` has prepared.
 * @param {Object} db The portal's database.
 * @returns {Promise<void>}
 * @public
 */
module.exports.refresh = async ( session, db ) => {
    const granted = sessionRolesOf( await loadGrants( db, session.studio.key ) );
    const roles = withFramework( session.user.roles, granted.roles );
    const editorSpecs = granted.editorSpecs;
    if ( !sameList( session.user.roles, roles ) ) {
        session.user.roles = roles;
    }
    if ( !sameList( session.studio.editorSpecs, editorSpecs ) ) {
        session.studio.editorSpecs = editorSpecs;
    }
};
