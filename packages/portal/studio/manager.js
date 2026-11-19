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
 * The studio's web application manager (plan 9a): the staff area the framework serves at `/studio/`, its screens at
 * `/app/:view` and its services at `POST /app/:service`. The portal server names this module in `application.classPath`,
 * and the framework constructs it with no arguments, so it reaches the database through `#studio/context`, never
 * through the server.
 */

// First: it lays the studio's texts under the application's before anything asks for one.
require( "#studio/labels" );
const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );
const context = require( "#studio/context" );
const { changeGrants, peopleView } = require( "#studio/people" );
const { ADMIN_ROLES, STAFF_ROLES, isStudioAdmin } = require( "#studio/roles" );

// The sidebar entry each screen lights.
const SIDEBAR_ENTRY = Object.freeze( { dashboard: "home", people: "people", settings: "settings", "environment-status": "environment-status" } );

/**
 * The studio. Its screens come with the tasks that build them; until then it is the framework's shell, its sign-in and
 * a landing screen.
 *
 * @class StudioManager
 * @extends TiWebAppManager
 * @public
 */
class StudioManager extends TiWebAppManager {

    /**
     * @constructor
     */
    constructor() {
        super( "studio" );
        // Gates the HTML only: `people` as data and `people-grants` as a service check the role themselves (#studio/people).
        this.addFragment( "people", { title: "People", path: "fragments/frame-people.html", roles: ADMIN_ROLES } );
    }

    /**
     * Answers the studio's own views and the framework's: `studio-home` is the landing screen's data, and `config` is
     * the framework's answer with a `studio` block that says whether the person is an admin, which the sidebar reads to
     * show People, Settings and Environment status. Every other view is the framework's.
     *
     * @method
     * @param {Object} session
     * @param {string} view
     * @param {Object} [options]
     * @returns {Promise<Object>}
     * @override
     * @public
     */
    async processDataRequest( session, view, options = {} ) {
        // The roles the session carries, never a role the framework adds for itself: an application's own would not be
        // the studio's to name on the landing screen.
        const roles = ( ( session && session.user && session.user.roles ) || [] ).filter( ( role ) => STAFF_ROLES.includes( role ) );
        if ( view === "studio-home" ) {
            return {
                name: ( session && session.user && session.user.name ) || "",
                roles: roles,
                // `null` is an editor of every spec, which is not the same as none.
                editorSpecs: ( session && session.studio ) ? session.studio.editorSpecs : [],
                admin: isStudioAdmin( roles )
            };
        }
        if ( view === "people" ) {
            return peopleView( context.instance.db, session );
        }
        const answer = await super.processDataRequest( session, view, options );
        // `/app/config` is unprotected, so `session.user` may be absent: nobody is then an admin.
        // `sidebarNavMapping` is the sidebar's screen-to-entry table, which keeps the entry lit after a reload.
        return view === "config" ? { ...answer, studio: { admin: isStudioAdmin( roles ) }, sidebarNavMapping: SIDEBAR_ENTRY } : answer;
    }

    /**
     * Answers the studio's own services: `people-grants` replaces what one person holds. Every other service is the
     * framework's.
     *
     * @method
     * @param {Object} session
     * @param {string} service
     * @param {Object} params
     * @returns {Promise<Object>}
     * @override
     * @public
     */
    async processServiceRequest( session, service, params ) {
        if ( service === "people-grants" ) {
            await changeGrants( context.instance.db, session, params );
            return {};
        }
        return super.processServiceRequest( session, service, params );
    }
}

module.exports = StudioManager;
