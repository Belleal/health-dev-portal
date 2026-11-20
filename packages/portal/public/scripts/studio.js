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

    /**
     * The sidebar's own words that the framework's component writes in English: the collapse button's name and the theme
     * button's text. Read from the store rather than the sidebar's scope, so the component works wherever it is put. The
     * framework's file has the same strings (CA-595); this is the studio's copy until that card lands.
     *
     * @returns {Object}
     */
    const configureStudioChrome = () => {
        const application = () => Alpine.store( "tiApplication" );
        return {
            collapseText() {
                return application().collapsed ? application().getLabel( "studio.nav.expand", "Expand sidebar" ) : application().getLabel( "studio.nav.collapse", "Collapse sidebar" );
            },

            // The button offers the other theme, so a daylight page says "Glass".
            themeText() {
                return application().theme === "daylight" ? application().getLabel( "studio.nav.theme-glass", "Glass theme" ) : application().getLabel( "studio.nav.theme-daylight", "Daylight theme" );
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
            // A save is in flight: a second click would send the person's set again, and the server writes a row of history for each.
            saving: false,

            init() {
                whenInitialized( this, () => this.load() );
            },

            load() {
                this.busy = true;
                return Alpine.store( "tiApplication" ).sendRequest( "/app/people" ).then( ( result ) => {
                    const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                    const people = Array.isArray( data.people ) ? data.people : [];
                    const names = new Map( people.map( ( one ) => [ one.key, String( one.name ) ] ) );
                    this.specs = ( Array.isArray( data.specs ) ? data.specs : [] ).map( String );
                    // Each button's name says whose roles it edits: a screen reader lists buttons apart from their rows, and a column of
                    // "Edit roles" tells them apart by nothing. The name starts with the visible text (WCAG 2.5.3).
                    this.people = people.map( ( one, index ) => ( { key: String( one.key ), name: String( one.name ), configuredAdmin: Boolean( one.configuredAdmin ),
                        grants: one.grants || [], holdsText: holdsText( one.grants || [] ), lastSeenText: String( one.lastSeenText || "" ),
                        buttonID: `ti-people-edit-${ index }`, editText: `${ label( "studio.people.edit", "Edit roles" ) }: ${ String( one.name ) }` } ) );
                    // Who it was done to and by, by name where the studio knows them: a key is an identity provider's, not for reading.
                    this.changes = ( Array.isArray( data.changes ) ? data.changes : [] ).map( ( one ) => ( { id: String( one.id ),
                        text: `${ String( one.atText || "" ) } · ${ names.get( one.key ) || one.key } · ${ holdsText( one.grants || [] ) } · ${ names.get( one.by ) || one.by }` } ) );
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

            // Puts the keyboard where the person's eyes are: on the form's heading when it opens, and on the row's button when it
            // closes, as the page would otherwise leave focus on an element that is gone (WCAG 2.4.3).
            focusLater( find ) {
                this.$nextTick( () => {
                    const element = find();
                    if ( element ) {
                        element.focus();
                    }
                } );
            },

            focusRow( key ) {
                const person = this.people.find( ( one ) => one.key === key );
                if ( person ) {
                    this.focusLater( () => document.getElementById( person.buttonID ) );
                }
            },

            // Refused while a save is in flight, as the rows' Edit buttons are disabled: that save's answer closes the form, and
            // a person opened meanwhile lost theirs, with what was typed on it, when it landed (CodeRabbit on #10). The form
            // being saved already keeps its Save and Cancel until then, so a second form would have had neither.
            edit( key ) {
                const person = this.people.find( ( one ) => one.key === key );
                if ( !person || this.saving ) {
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
                this.focusLater( () => document.getElementById( "ti-people-form-title" ) );
            },

            isEditing() {
                return this.form !== null;
            },

            isSaving() {
                return this.saving;
            },

            cancel() {
                if ( this.saving ) {
                    return;
                }
                const key = this.form === null ? "" : this.form.key;
                this.form = null;
                this.focusRow( key );
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
            // Saving or not, the form says why a save is not possible only when it is the specs: see `cannotSave`.
            cannotSubmit() {
                return this.saving || this.cannotSave();
            },

            cannotSave() {
                return this.form === null || ( this.form.editor && this.form.someSpecs && !this.form.specs.some( ( spec ) => spec.checked ) );
            },

            save() {
                if ( this.cannotSubmit() ) {
                    return;
                }
                this.saving = true;
                const form = this.form;
                const grants = [ "reader", "approver", "admin" ].filter( ( role ) => form[ role ] ).map( ( role ) => ( { role: role, spec: EVERY_SPEC } ) );
                if ( form.editor ) {
                    const specs = form.allSpecs ? [ EVERY_SPEC ] : form.specs.filter( ( one ) => one.checked ).map( ( one ) => one.id );
                    grants.push( ...specs.map( ( spec ) => ( { role: "editor", spec: spec } ) ) );
                }
                Alpine.store( "tiApplication" ).sendRequest( "/app/people-grants", "POST", { key: form.key, grants: grants } ).then( () => {
                    this.form = null;
                    return this.load().then( () => this.focusRow( form.key ) );
                } ).catch( ( error ) => this.fail( error ) ).finally( () => {
                    this.saving = false;
                } );
            }
        };
    };

    // What a screen shows when a request fails: the framework's own notification, unless the request was only aborted.
    const reportFailure = ( error ) => {
        if ( error && ( error.name === "AbortError" || error.isAborted ) ) {
            return;
        }
        const application = Alpine.store( "tiApplication" );
        application.notify( application.formatException( error ) );
    };

    /**
     * Settings: whether an approver may approve a round they submitted themselves.
     *
     * @returns {Object}
     */
    const configureSettings = () => {
        return {
            busy: true,
            loaded: false,
            saving: false,
            selfApproval: true,

            init() {
                whenInitialized( this, () => this.load() );
            },

            // Returns the request, settled either way, so a save can hold its guard until the refresh is in.
            load() {
                this.busy = true;
                return Alpine.store( "tiApplication" ).sendRequest( "/app/settings" ).then( ( result ) => {
                    const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                    // Anything but an explicit `false` is read as allowed, as the review code reads a missing setting.
                    this.selfApproval = data.selfApproval !== false;
                    this.loaded = true;
                    this.busy = false;
                } ).catch( ( error ) => {
                    this.busy = false;
                    reportFailure( error );
                } );
            },

            setSelfApproval( checked ) {
                this.selfApproval = Boolean( checked );
            },

            isSaving() {
                return this.saving;
            },

            save() {
                if ( this.saving ) {
                    return;
                }
                this.saving = true;
                // The guard holds until the refresh has landed or failed. Released on the save's answer, it let a second save be
                // sent while the first one's refresh was on its way, and that refresh then put the older value back on the
                // screen while the newer save was in flight (CodeRabbit on #10). `load` settles either way, having reported its
                // own failure, so `finally` always runs.
                Alpine.store( "tiApplication" ).sendRequest( "/app/settings-save", "POST", { selfApproval: this.selfApproval } ).then( () => this.load() )
                    .catch( ( error ) => reportFailure( error ) ).finally( () => {
                        this.saving = false;
                    } );
            }
        };
    };

    /**
     * Environment status: each environment's state, a form to set it, the windows to come with a form to announce one, and
     * the recent updates. The server writes the times in Sofia time and the messages in the screen's language; this lays
     * the lines out with the labels. The window's times go back as the inputs give them, `yyyy-mm-ddThh:mm`, which the
     * server reads as Sofia time.
     *
     * @returns {Object}
     */
    const configureEnvironment = () => {
        const label = ( key, fallback ) => Alpine.store( "tiApplication" ).getLabel( key, fallback );
        const environmentText = ( id ) => label( `studio.environment.env.${ id }`, String( id ) );
        const stateText = ( id ) => id === null || id === undefined ? label( "studio.environment.not-reported", "Not reported" ) : label( `studio.environment.state.${ id }`, String( id ) );
        const joined = ( parts ) => parts.filter( ( part ) => part !== "" ).join( " · " );
        return {
            busy: true,
            loaded: false,
            environments: [],
            states: [],
            current: [],
            windows: [],
            events: [],
            statusEnvironment: "",
            statusState: "",
            windowEnvironment: "",
            statusMessageBg: "",
            statusMessageEn: "",
            windowMessageBg: "",
            windowMessageEn: "",
            startsAt: "",
            endsAt: "",
            // A write is in flight. Each post inserts a row that shows on the public status page and in its Atom feed, where a
            // feed reader keeps both of two entries for good, so a second click must not send a second request.
            saving: false,

            init() {
                whenInitialized( this, () => this.load() );
            },

            // Returns the request, settled either way: `send` holds its guard on it. Without it `send`'s `finally` ran before the
            // refresh, and a slow first refresh put an older "Now" and an older state on the form while a newer status was in
            // flight (CodeRabbit on #10).
            load() {
                this.busy = true;
                return Alpine.store( "tiApplication" ).sendRequest( "/app/environment-status" ).then( ( result ) => {
                    const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                    const list = ( value ) => Array.isArray( value ) ? value : [];
                    this.environments = list( data.environments ).map( ( id ) => ( { id: String( id ), text: environmentText( id ) } ) );
                    this.states = list( data.states ).map( ( id ) => ( { id: String( id ), text: stateText( id ) } ) );
                    // The message in both languages, each named: staff edit both halves of a public text, and the screen's language
                    // is not the public page's reader's.
                    const messageIn = ( one, language ) => one.message && one.message[ language ] ? `${ label( `studio.environment.message-${ language }`, language ) }: ${ String( one.message[ language ] ) }` : "";
                    this.current = list( data.current ).map( ( one ) => ( { environment: String( one.environment ), state: one.state === null || one.state === undefined ? null : String( one.state ),
                        text: joined( [ environmentText( one.environment ), stateText( one.state ), messageIn( one, "bg" ), messageIn( one, "en" ), String( one.updatedAtText || "" ) ] ) } ) );
                    // The cancel button's name says which window it cancels: a screen reader lists buttons apart from their rows.
                    this.windows = list( data.windows ).map( ( one ) => ( { id: String( one.id ),
                        text: joined( [ environmentText( one.environment ), `${ String( one.startsAtText ) } – ${ String( one.endsAtText ) }`, String( one.messageText || "" ) ] ),
                        cancelText: `${ label( "studio.environment.cancel", "Cancel" ) }: ${ environmentText( one.environment ) }, ${ String( one.startsAtText ) } – ${ String( one.endsAtText ) }` } ) );
                    this.events = list( data.events ).map( ( one ) => ( { id: String( one.id ), text: one.kind === "maintenance"
                        ? joined( [ String( one.atText || "" ), environmentText( one.environment ), `${ label( "studio.environment.window-event", "Maintenance" ) } ${ String( one.startsAtText ) } – ${ String( one.endsAtText ) }`
                            + ( one.cancelled ? ` (${ label( "studio.environment.cancelled", "cancelled" ) })` : "" ), String( one.messageText || "" ) ] )
                        : joined( [ String( one.atText || "" ), environmentText( one.environment ), stateText( one.state ), String( one.messageText || "" ) ] ) } ) );
                    // A select needs a value that is one of its options.
                    const first = ( options, current ) => options.some( ( one ) => one.id === current ) || options.length === 0 ? current : options[ 0 ].id;
                    this.statusEnvironment = first( this.environments, this.statusEnvironment );
                    this.statusState = first( this.states, this.statusState );
                    // The form starts on what the chosen environment is now: it would otherwise start on "operational", and a Set
                    // pressed without a choice would overwrite that environment's public state with it.
                    this.followEnvironment( this.statusEnvironment );
                    this.windowEnvironment = first( this.environments, this.windowEnvironment );
                    this.loaded = true;
                    this.busy = false;
                } ).catch( ( error ) => this.fail( error ) );
            },

            fail( error ) {
                this.busy = false;
                reportFailure( error );
            },

            // The state select shows the chosen environment's current state, the first one when it has never been set.
            followEnvironment( environment ) {
                const one = this.current.find( ( entry ) => entry.environment === environment );
                if ( one && one.state !== null && this.states.some( ( state ) => state.id === one.state ) ) {
                    this.statusState = one.state;
                } else if ( this.states.length > 0 ) {
                    this.statusState = this.states[ 0 ].id;
                }
            },

            isSaving() {
                return this.saving;
            },

            hasNoWindows() {
                return this.windows.length === 0;
            },

            hasNoEvents() {
                return this.events.length === 0;
            },

            // Both times are needed; the server judges the rest, and says why when it refuses.
            cannotAnnounce() {
                return this.saving || this.startsAt === "" || this.endsAt === "";
            },

            // After a change the screen is loaded again, so what it shows is what the server holds, and the guard holds until
            // that refresh has landed or failed. The fields are emptied only once the server has accepted the change: a refusal
            // must leave what was typed to be corrected.
            send( service, body, emptied ) {
                if ( this.saving ) {
                    return;
                }
                this.saving = true;
                Alpine.store( "tiApplication" ).sendRequest( `/app/${ service }`, "POST", body ).then( () => {
                    Object.assign( this, emptied || {} );
                    return this.load();
                } ).catch( ( error ) => this.fail( error ) ).finally( () => {
                    this.saving = false;
                } );
            },

            setStatus() {
                this.send( "status-set", { environment: this.statusEnvironment, state: this.statusState, messageBg: this.statusMessageBg, messageEn: this.statusMessageEn },
                    { statusMessageBg: "", statusMessageEn: "" } );
            },

            announce() {
                if ( this.cannotAnnounce() ) {
                    return;
                }
                this.send( "maintenance-add", { environment: this.windowEnvironment, startsAt: this.startsAt, endsAt: this.endsAt, messageBg: this.windowMessageBg,
                    messageEn: this.windowMessageEn }, { windowMessageBg: "", windowMessageEn: "", startsAt: "", endsAt: "" } );
            },

            cancelWindow( id ) {
                this.send( "maintenance-cancel", { id: id } );
            }
        };
    };

    document.addEventListener( "alpine:init", () => {
        Alpine.data( "tiStudioSettings", configureSettings );
        Alpine.data( "tiStudioEnvironment", configureEnvironment );
        Alpine.data( "tiStudioNav", configureStudioNav );
        Alpine.data( "tiStudioChrome", configureStudioChrome );
        Alpine.data( "tiStudioHome", configureStudioHome );
        Alpine.data( "tiStudioPeople", configurePeople );
    } );
} )();
