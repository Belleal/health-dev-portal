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
 * The portal's server (plan 8a, decision 1; design record §3.1): a ti-engine web server with no web application
 * manager until plan 9 brings the staff area. It is started by core's start-instance (`TI_INSTANCE_CLASS`, see the
 * README), which constructs it with the instance's name and the configuration file, if any.
 */

const path = require( "node:path" );
const TiWebServer = require( "@ti-engine/web-framework/web-server" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { directoryStore } = require( "@health-dev-portal/data/files" );
const { PUBLIC_DIRECTORY } = require( "#assets" );
const { setPublicUrl } = require( "#paths" );
const { notFound } = require( "#responses" );
const { pageHandler, rootRedirect } = require( "#routes" );

/**
 * The public website: every published specification version by stage, its messages, the code lists, the errors and the
 * changes, in Bulgarian and English. No response sets a cookie (design record §10.1).
 *
 * @class PortalServer
 * @extends TiWebServer
 * @public
 */
class PortalServer extends TiWebServer {

    #db = null;
    #store = null;

    /**
     * @constructor
     * @param {string} serviceDomainName The instance's name; start-instance gives the class file's, `portal-server`.
     * @param {Object} [serviceConfig] Merged over the portal's own, and then over the framework's defaults.
     */
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, {
            // The stylesheet, the script and the fonts, served under /static: absolute, so the working directory does
            // not decide it. No `staticCache` entry is needed for the fonts: the framework's default immutable prefix,
            // `/fonts/`, is matched against the path under this folder, so /static/fonts/… is answered `public,
            // max-age=31536000, immutable` as it is (measured, plan 8a task 3).
            publicPath: PUBLIC_DIRECTORY,
            // The framework's service proxy, /service/:version/:name, has nothing behind it here.
            api: { endpointEnabled: false },
            ...( serviceConfig || {} )
        } );
    }

    /**
     * Opens the database and the file store, then starts the web server. Both are open before the framework's start
     * resolves, so its start-up gate holds every request until they are. Nothing listens when either is missing, nor
     * without the public URL every absolute link is written from.
     *
     * @method
     * @returns {Promise<void>}
     * @override
     * @public
     */
    onStart() {
        return this.#open().then( () => super.onStart() );
    }

    /**
     * Stops the web server, then closes the database.
     *
     * @method
     * @returns {Promise<void>}
     * @override
     * @public
     */
    onStop() {
        return super.onStop().then( async () => {
            if ( this.#db ) {
                await this.#db.close();
                this.#db = null;
            }
        } );
    }

    /**
     * Everything is public but the framework's `/admin`: web-content's own pattern for a public site, written out here
     * since the portal takes only `/html` and `/transliterate` from web-content. Any narrower list left the rest to the
     * framework's protection, which answers an anonymous `/nope`, `/robots.txt` or `/favicon.ico` 303 to `/` (401 for
     * anything but HTML) before the portal's 404 is reached (review of task 3, I2). The framework's routes that are not
     * public pages are taken by the portal's own 404 instead (`defineWebApplicationRoutes`).
     *
     * The exception ignores case, as Express's routing does: without `i`, `/ADMIN/config/editors` counted as public and
     * reached the admin routes past the protection, which answered a browser 401 rather than its 303 (final review M8).
     *
     * @method
     * @override
     * @public
     */
    defineUnprotectedRoutes() {
        super.defineUnprotectedRoutes();
        this.addUnprotectedRoute( /^\/(?!admin(?:\/|$)).*$/i );
    }

    /**
     * The portal's routes around the framework's.
     * - **Before them**, `/`, and the portal's 404 for the framework's application and session routes:
     *   - its handlers for `/`, `/not-found`, `/app`, `/app/:view` and `POST /app/:service` read the web application
     *     manager the portal does not have, and throw (measured: 500, logged as an error, for a POST holding a CSRF
     *     token);
     *   - `GET /csrf-token` minted a token into a new session for anyone, saved and cookied (`ti-xsrf-token` and
     *     `connect.sid`), after which every page re-sent both cookies beside its public caching (review of task 3, I1);
     *     `/me`, `/login/:method` and `/logout` serve a sign-in the portal does not have until plan 9.
     * - **After them**, every other GET goes to the pages, whose own 404 answers what is none: the framework's would
     *   redirect an HTML GET to `/`. It is a pattern with no named or captured part, so Express decodes nothing of the
     *   address before the portal reads it: as `*splat`, a malformed escape such as `/bg/%E0%A4%A` failed Express's
     *   decoding, which the framework answered 303 to `/?error=4002` for a browser and 400 otherwise, with no caching
     *   stated (final review M2, measured), where the address parser answers it with the 404 page.
     *
     * A generic gap, for a CA card in ti-engine: a `TiWebServer` with no sign-in method enabled still mounts the routes
     * that mint and serve sessions, and an application can only shadow them, one by one, as this does.
     *
     * @method
     * @override
     * @public
     */
    defineWebApplicationRoutes() {
        this.registerRoute( "get", "/", rootRedirect );
        for ( const route of [ "/not-found", "/app", "/app/*splat", "/csrf-token", "/me", "/login/:method" ] ) {
            this.registerRoute( "get", route, notFound );
        }
        for ( const route of [ "/app/*splat", "/login/:method", "/logout" ] ) {
            this.registerRoute( "post", route, notFound );
        }
        super.defineWebApplicationRoutes();
        this.registerRoute( "get", /^\/.*$/, pageHandler( () => ( { db: this.#db, store: this.#store } ) ) );
    }

    // HDP_DATABASE_URL is required; HDP_FILES_DIR defaults to `.files` under the working directory.
    async #open() {
        try {
            setPublicUrl( this.serviceConfig.publicUrl );
        } catch ( error ) {
            throw new Error( "TI_WEB_PUBLIC_URL must be the portal's public origin, such as https://developers.his.bg: canonical addresses, "
                + `hreflang and feeds are written from it. ${ error.message }`, { cause: error } );
        }
        const url = process.env.HDP_DATABASE_URL;
        if ( !url ) {
            throw new Error( "HDP_DATABASE_URL is not set: every page is read from the portal's database (sqlite:<path> or postgres://…)." );
        }
        this.#store = directoryStore( path.resolve( process.env.HDP_FILES_DIR || ".files" ) );
        this.#db = await openDatabase( url );
    }
}

module.exports = PortalServer;
