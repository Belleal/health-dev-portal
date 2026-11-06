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
     * The framework's unprotected routes, and the portal's: `/` (the framework's already), each language's pages, the
     * downloads, and `/app/…`, which the portal answers with its own 404 until plan 9. Measured: without that last one an
     * anonymous `GET /app/x` is answered 303 to `/` by the framework's protection before any route is reached.
     *
     * @method
     * @override
     * @public
     */
    defineUnprotectedRoutes() {
        super.defineUnprotectedRoutes();
        this.addUnprotectedRoute( /^\/(bg|en)(\/.*)?$/ );
        this.addUnprotectedRoute( /^\/downloads\// );
        this.addUnprotectedRoute( /^\/app\// );
    }

    /**
     * The portal's routes around the framework's. Before them, `/` and the framework's application routes: its handlers
     * for `/`, `/not-found`, `/app` and `/app/:view` read the web application manager the portal does not have, and
     * throw. After them, every other GET goes to the pages, whose own 404 answers what is none: the framework's would
     * redirect an HTML GET to `/`.
     *
     * @method
     * @override
     * @public
     */
    defineWebApplicationRoutes() {
        this.registerRoute( "get", "/", rootRedirect );
        for ( const route of [ "/not-found", "/app", "/app/*splat" ] ) {
            this.registerRoute( "get", route, notFound );
        }
        // The framework's `POST /app/:service` reads the manager too: now that /app/… is unprotected, a request holding a
        // CSRF token reaches it. Measured with a session in Redis: 500, logged as an error, for /app/x and
        // /app/send-feedback alike; with this handler, 404.
        this.registerRoute( "post", "/app/*splat", notFound );
        super.defineWebApplicationRoutes();
        this.registerRoute( "get", "*splat", pageHandler( () => ( { db: this.#db, store: this.#store } ) ) );
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
