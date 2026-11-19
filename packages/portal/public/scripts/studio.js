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

    // Reader, approver and admin hold for every spec; only an editor's grant names specs.
    const EVERY_SPEC = "*";
    const ROLE_ORDER = [ "reader", "editor", "approver", "admin" ];

    /**
     * People: the staff with what each holds, a form that gives one of them roles, and the latest changes. Saving sends the
     * person's whole new set, as the server replaces the set and does not merge into it.
     *
     * @returns {Object}
     */
    const configurePeople = () => {
        const label = ( key, fallback ) => Alpine.store( "tiApplication" ).getLabel( key, fallback );
        const roleText = ( role ) => label( `studio.home.role.${ role }`, role );
        const holdsText = ( grants ) => {
            const parts = ROLE_ORDER.filter( ( role ) => grants.some( ( grant ) => grant.role === role ) ).map( ( role ) => {
                if ( role !== "editor" ) {
                    return roleText( role );
                }
                const specs = grants.filter( ( grant ) => grant.role === "editor" ).map( ( grant ) => grant.spec );
                return specs.includes( EVERY_SPEC ) ? `${ roleText( role ) } (${ label( "studio.people.all-specs", "every spec" ) })` : `${ roleText( role ) } (${ specs.join( ", " ) })`;
            } );
            return parts.length > 0 ? parts.join( ", " ) : label( "studio.people.none", "none" );
        };
        return {
            busy: true,
            loaded: false,
            people: [],
            specs: [],
            changes: [],
            form: null,

            init() {
                whenInitialized( this, () => this.load() );
            },

            load() {
                this.busy = true;
                Alpine.store( "tiApplication" ).sendRequest( "/app/people" ).then( ( result ) => {
                    const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                    const people = Array.isArray( data.people ) ? data.people : [];
                    const names = new Map( people.map( ( one ) => [ one.key, String( one.name ) ] ) );
                    this.specs = ( Array.isArray( data.specs ) ? data.specs : [] ).map( String );
                    this.people = people.map( ( one ) => ( { key: String( one.key ), name: String( one.name ), configuredAdmin: Boolean( one.configuredAdmin ),
                        grants: one.grants || [], holdsText: holdsText( one.grants || [] ) } ) );
                    // Who it was done to and by, by name where the studio knows them: a key is an identity provider's, not for reading.
                    this.changes = ( Array.isArray( data.changes ) ? data.changes : [] ).map( ( one ) => ( { id: String( one.id ),
                        text: `${ String( one.at ).slice( 0, 16 ).replace( "T", " " ) } UTC · ${ names.get( one.key ) || one.key } · ${ holdsText( one.grants || [] ) } · ${ names.get( one.by ) || one.by }` } ) );
                    this.loaded = true;
                    this.busy = false;
                } ).catch( ( error ) => this.fail( error ) );
            },

            fail( error ) {
                this.busy = false;
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
                    return;
                }
                const application = Alpine.store( "tiApplication" );
                application.notify( application.formatException( error ) );
            },

            edit( key ) {
                const person = this.people.find( ( one ) => one.key === key );
                if ( !person ) {
                    return;
                }
                const editing = person.grants.filter( ( grant ) => grant.role === "editor" );
                const allSpecs = editing.length === 0 || editing.some( ( grant ) => grant.spec === EVERY_SPEC );
                const named = editing.map( ( grant ) => grant.spec ).filter( ( spec ) => spec !== EVERY_SPEC );
                // A spec the person holds that the database no longer lists stays on the form, or saving would drop it unseen.
                const specs = [ ...new Set( [ ...this.specs, ...named ] ) ].sort();
                this.form = {
                    key: person.key,
                    name: person.name,
                    reader: person.grants.some( ( grant ) => grant.role === "reader" ),
                    editor: editing.length > 0,
                    approver: person.grants.some( ( grant ) => grant.role === "approver" ),
                    admin: person.grants.some( ( grant ) => grant.role === "admin" ),
                    allSpecs: allSpecs,
                    someSpecs: !allSpecs,
                    specs: specs.map( ( id, index ) => ( { id: id, inputID: `ti-people-spec-${ index }`, checked: named.includes( id ) } ) )
                };
            },

            isEditing() {
                return this.form !== null;
            },

            cancel() {
                this.form = null;
            },

            setRole( role, checked ) {
                this.form[ role ] = Boolean( checked );
            },

            setAllSpecs( all ) {
                this.form.allSpecs = Boolean( all );
                this.form.someSpecs = !all;
            },

            setSpec( id, checked ) {
                const spec = this.form.specs.find( ( one ) => one.id === id );
                if ( spec ) {
                    spec.checked = Boolean( checked );
                }
            },

            hasNoChanges() {
                return this.changes.length === 0;
            },

            // An editor limited to named specs needs one: with none the set would silently hold no editor role.
            cannotSave() {
                return this.form === null || ( this.form.editor && this.form.someSpecs && !this.form.specs.some( ( spec ) => spec.checked ) );
            },

            save() {
                if ( this.cannotSave() ) {
                    return;
                }
                const form = this.form;
                const grants = [ "reader", "approver", "admin" ].filter( ( role ) => form[ role ] ).map( ( role ) => ( { role: role, spec: EVERY_SPEC } ) );
                if ( form.editor ) {
                    const specs = form.allSpecs ? [ EVERY_SPEC ] : form.specs.filter( ( one ) => one.checked ).map( ( one ) => one.id );
                    grants.push( ...specs.map( ( spec ) => ( { role: "editor", spec: spec } ) ) );
                }
                Alpine.store( "tiApplication" ).sendRequest( "/app/people-grants", "POST", { key: form.key, grants: grants } ).then( () => {
                    this.form = null;
                    this.load();
                } ).catch( ( error ) => this.fail( error ) );
            }
        };
    };

    document.addEventListener( "alpine:init", () => {
        Alpine.data( "tiStudioNav", configureStudioNav );
        Alpine.data( "tiStudioHome", configureStudioHome );
        Alpine.data( "tiStudioPeople", configurePeople );
    } );
} )();
