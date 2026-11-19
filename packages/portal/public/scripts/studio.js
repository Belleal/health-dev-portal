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
 * The studio's Alpine components (plan 9a). The shell page loads this script before Alpine's own (see public/index.html),
 * and Alpine's CSP build starts when its script runs, so a component is registered on `alpine:init` and not later. Each
 * screen of the studio adds one `Alpine.data` call here. A browser script: no `require`, and nothing here renders markup
 * from data — a display name from the identity provider may contain some, so every value reaches the page by `x-text`.
 */

/* global Alpine -- the framework's Alpine, which has defined it by the time `alpine:init` fires. */

( () => {
    "use strict";

    // The label of a session role; a role the studio has no label for shows as it is named.
    const ROLE_LABEL = {
        "studio:reader": "studio.home.role.reader",
        "studio:editor": "studio.home.role.editor",
        "studio:approver": "studio.home.role.approver",
        "studio:admin": "studio.home.role.admin",
        "admin": "studio.home.role.admin"
    };

    // Runs a load once the application has its configuration and labels, as the framework's own screens do. The store
    // is the framework's: it fills `isInitialized` after `/app/config` and `/me`.
    const whenInitialized = ( component, load ) => {
        const application = Alpine.store( "tiApplication" );
        if ( application.isInitialized ) {
            load();
        } else {
            component.$watch( () => application.isInitialized, ( isInitialized ) => {
                if ( isInitialized ) {
                    load();
                }
            } );
        }
    };

    /**
     * The landing screen: the person's name and roles from `/app/studio-home`, or the notice that they have no access.
     *
     * @returns {Object}
     */
    const configureStudioHome = () => {
        return {
            loaded: false,
            name: "",
            roles: [],

            init() {
                whenInitialized( this, () => this.load() );
            },

            load() {
                Alpine.store( "tiApplication" ).sendRequest( "/app/studio-home" ).then( ( result ) => {
                    const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                    const application = Alpine.store( "tiApplication" );
                    this.name = String( data.name || "" );
                    this.roles = ( Array.isArray( data.roles ) ? data.roles : [] ).map( ( role ) => ( {
                        key: String( role ),
                        text: ROLE_LABEL[ role ] ? application.getLabel( ROLE_LABEL[ role ], String( role ) ) : String( role )
                    } ) );
                    this.loaded = true;
                } ).catch( ( error ) => {
                    if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                        return;
                    }
                    const application = Alpine.store( "tiApplication" );
                    application.notify( application.formatException( error ) );
                } );
            },

            // Shown only once the answer is in, so a person with access never sees the notice flash.
            hasRoles() {
                return this.loaded && this.roles.length > 0;
            },

            hasNoRoles() {
                return this.loaded && this.roles.length === 0;
            }
        };
    };

    /**
     * The sidebar's navigation slot: whether to show the admin's entries. It sits inside the framework's sidebar
     * component, whose `active`, `home` and `navigate` it reads through Alpine's scope chain.
     *
     * @returns {Object}
     */
    const configureStudioNav = () => {
        return {
            // The server's `studio` block of /app/config; none until the configuration has loaded.
            isAdmin() {
                const configuration = Alpine.store( "tiApplication" ).configuration;
                return Boolean( configuration && configuration.studio && configuration.studio.admin );
            }
        };
    };

    document.addEventListener( "alpine:init", () => {
        Alpine.data( "tiStudioNav", configureStudioNav );
        Alpine.data( "tiStudioHome", configureStudioHome );
    } );
} )();
