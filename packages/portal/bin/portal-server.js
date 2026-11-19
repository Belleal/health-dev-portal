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
 * The portal's server (plan 8a, decision 1; design record §3.1): a ti-engine web server for the public site, with the
 * staff area, the studio (plan 9a), as its web application at `/studio/`. It is started by core's start-instance
 * (`TI_INSTANCE_CLASS`, see the README), which constructs it with the instance's name and the configuration file, if any.
 */

const path = require( "node:path" );
const TiWebServer = require( "@ti-engine/web-framework/web-server" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { directoryStore } = require( "@health-dev-portal/data/files" );
const { PUBLIC_DIRECTORY } = require( "#assets" );
const { CONTENT_DIRECTORY, loadContent } = require( "#content" );
const { nameOf } = require( "#pages/nomenclatures" );
const { setPublicUrl } = require( "#paths" );
const { pageHandler, rootRedirect } = require( "#routes" );
const { createSearch } = require( "#search" );
const context = require( "#studio/context" );
const studioSession = require( "#studio/session" );

// The studio's web application manager, which the framework loads by its path.
const STUDIO_MANAGER = path.join( __dirname, "..", "studio", "manager.js" );

/**
 * The public website: every published specification version by stage, its messages, the code lists, the errors and the
 * changes, in Bulgarian and English. No public page sets a cookie for a visitor who is not signed in (design record
 * §10.1). Beside it, the studio: the staff area, signed in to, at `/studio/`.
 *
 * @class PortalServer
 * @extends TiWebServer
 * @public
 */
class PortalServer extends TiWebServer {

    #db = null;
    #store = null;
    #content = null;
    #search = null;

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
            // The studio (plan 9a), at /studio/ so that / stays the public site's. The framework requires the manager at
            // `path.join( process.cwd(), classPath )`, so the path is relative to the working directory: an absolute one
            // is joined into a path that is none (`/app/app/packages/portal/studio/manager.js`, measured), and the start
            // fails.
            application: { classPath: path.relative( process.cwd(), STUDIO_MANAGER ), home: "/studio/" },
            // Bulgarian and English, and a session starts in Bulgarian: the public site's `/` goes to `/bg/` and the team is
            // Bulgarian. The framework offers only the deployment's own language, and so draws no switch at sign-in and
            // ignores `/language/en`, unless `languages` is set (measured at 31dc138: the studio could not be shown in
            // Bulgarian). Set here and not through `TI_WEB_LANGUAGES`, so the portal's behaviour does not depend on a
            // variable that may be unset.
            language: "bg",
            languages: [ "bg", "en" ],
            ...( serviceConfig || {} )
        } );
    }

    /**
     * Reads the guides and the questions, opens the database and the file store, then starts the web server. All are
     * ready before the framework's start resolves, so its start-up gate holds every request until they are. Nothing
     * listens when any is missing, when the content cannot be read, or without the public URL every absolute link is
     * written from. The studio's handlers and session hooks reach the database and the store through its context,
     * attached here: the framework constructs the studio's manager with nothing of the server's.
     *
     * @method
     * @returns {Promise<void>}
     * @override
     * @public
     */
    onStart() {
        return this.#open().then( () => {
            context.instance.attach( { db: this.#db, store: this.#store } );
            return super.onStart();
        } );
    }

    /**
     * Stops the web server, lets the studio's context go, then closes the database.
     *
     * @method
     * @returns {Promise<void>}
     * @override
     * @public
     */
    onStop() {
        return super.onStop().then( async () => {
            context.instance.detach();
            if ( this.#db ) {
                await this.#db.close();
                this.#db = null;
            }
        } );
    }

    /**
     * Everything is public but what is the staff's: web-content's own pattern for a public site, written out here since
     * the portal takes only `/html` and `/transliterate` from web-content. Any narrower list left the rest to the
     * framework's protection, which answers an anonymous `/nope`, `/robots.txt` or `/favicon.ico` 303 to the home (401
     * for anything but HTML) before the portal's 404 is reached (review of task 3, I2). Four first segments are left to
     * the protection, each because what is under it is no public page:
     * - `admin`, the framework's configuration API, which its own admin role guards behind the sign-in;
     * - `app`, the studio's screens, their data and its services (`/app/:view`, `POST /app/:service`, plan 9a). The
     *   framework opens what its sign-in screen needs there itself (`/app`, `/app/enter`, `/app/config` and the labels),
     *   so the rest is refused, a screen added later included, rather than public until someone remembers to close it;
     * - `studio`, the studio's home, for the same reason: the framework opens the home and its not-found page, and
     *   nothing else under it is the public site's;
     * - `me`, the signed-in user, which the framework's own list does not open either. Exempted, an anonymous `/me`
     *   reached its handler past the protection, whose refusal sent the browser to the sign-in screen with an error,
     *   `/studio/?error=2002` (measured), where every other staff address sends it there plainly.
     *
     * The exception ignores case, as Express's routing does: without `i`, `/ADMIN/config/editors` counted as public and
     * reached the admin routes past the protection, which answered a browser 401 rather than its 303 (final review M8).
     * `/APP/profile` and `/ME` reach the studio's handlers in the same way. An address that only resembles one of the
     * four, such as `/%61pp/profile`, `//app/profile` or `/./app/profile`, reaches no studio route either: Express
     * routes the address as it is written, and each is the pages' 404 (measured).
     *
     * @method
     * @override
     * @public
     */
    defineUnprotectedRoutes() {
        super.defineUnprotectedRoutes();
        this.addUnprotectedRoute( /^\/(?!(?:admin|app|studio|me)(?:\/|$)).*$/i );
    }

    /**
     * The portal's routes around the framework's.
     * - **Before them**, `/`, the public site's: the framework's home is `/studio/` (plan 9a), so it serves nothing at
     *   the root. The portal no longer shadows any of the framework's routes with its 404, as it did while it had no
     *   web application: the studio is the manager the handlers of `/app`, `/app/:view` and `POST /app/:service` read,
     *   the framework's not-found page is `/studio/not-found`, which leaves `/not-found` to the pages, and `/csrf-token`,
     *   `/login/:method`, `/me` and `/logout` are the studio's sign-in. A session, and its cookie, is started only by the
     *   sign-in screen and the routes it asks (`/app`, `/app/enter` and `/csrf-token`, measured), each `no-store`, and
     *   never by a public page: the framework mints a token only where a form or a script asks for one.
     * - **After them**, every other GET goes to the pages, whose own 404 answers what is none: the framework's would
     *   redirect an HTML GET to the home. It is a pattern with no named or captured part, so Express decodes nothing of
     *   the address before the portal reads it: as `*splat`, a malformed escape such as `/bg/%E0%A4%A` failed Express's
     *   decoding, which the framework answered 303 to `/?error=4002` for a browser and 400 otherwise, with no caching
     *   stated (final review M2, measured), where the address parser answers it with the 404 page. The framework
     *   answers such an escape with its own 404 since 1.62.0 (CA-573), but the portal's page is still the one shown.
     *
     * @method
     * @override
     * @public
     */
    defineWebApplicationRoutes() {
        this.registerRoute( "get", "/", rootRedirect );
        super.defineWebApplicationRoutes();
        this.registerRoute( "get", /^\/.*$/, pageHandler( () => ( { db: this.#db, store: this.#store, content: this.#content, search: this.#search } ) ) );
    }

    /**
     * At sign-in: records the person, the configuration's admin marked as such, and puts their roles on the session
     * (`#studio/session`). A sign-in it cannot key is refused: the framework answers its throw with the sign-in screen
     * and an error.
     *
     * @method
     * @param {Object} session The new session, with the signed-in user.
     * @returns {Promise<void>} Nothing: the session is changed in place, which the framework accepts.
     * @override
     * @public
     */
    augmentSession( session ) {
        return studioSession.augment( session, context.instance.db, { admins: this.serviceConfig.auth.admins } );
    }

    /**
     * On every request of a signed-in session: reads the person's grants again, so a role given or taken away holds from
     * the next request, with no new sign-in.
     *
     * @method
     * @param {Object} session The request's session.
     * @returns {Promise<void>} The session is changed in place.
     * @override
     * @public
     */
    refreshSession( session ) {
        return studioSession.refresh( session, context.instance.db );
    }

    // HDP_DATABASE_URL is required; HDP_FILES_DIR defaults to `.files` under the working directory, and HDP_CONTENT_DIR
    // to the repository's content/. The content is read first: a file it cannot read is a broken build, refused before
    // anything else is opened (plan 8c), and its error names every file to fix.
    async #open() {
        try {
            setPublicUrl( this.serviceConfig.publicUrl );
        } catch ( error ) {
            throw new Error( "TI_WEB_PUBLIC_URL must be the portal's public origin, such as https://developers.his.bg: canonical addresses, "
                + `hreflang and feeds are written from it. ${ error.message }`, { cause: error } );
        }
        this.#content = loadContent( process.env.HDP_CONTENT_DIR ? path.resolve( process.env.HDP_CONTENT_DIR ) : CONTENT_DIRECTORY );
        // The instance's own search: its index is built on the first search, not here, so a start never waits on it.
        this.#search = createSearch( this.#content, nameOf );
        const url = process.env.HDP_DATABASE_URL;
        if ( !url ) {
            throw new Error( "HDP_DATABASE_URL is not set: every page is read from the portal's database (sqlite:<path> or postgres://…)." );
        }
        this.#store = directoryStore( path.resolve( process.env.HDP_FILES_DIR || ".files" ) );
        this.#db = await openDatabase( url );
    }
}

module.exports = PortalServer;
