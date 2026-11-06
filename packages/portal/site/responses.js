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
 * How the portal answers (plan 8a, decision 4; design record §10.1, §10.3): every response states its caching, none
 * sets a cookie — nothing here touches the session, which the framework then never saves — and the 404, 410 and 500
 * pages are the site's own, in the language of the address asked for.
 */

const { html } = require( "@ti-engine/web-content/html" );
const logger = require( "@ti-engine/core/logger" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const { home } = require( "#paths" );

/**
 * The `Cache-Control` of each kind of response (decision 4).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.CACHE = Object.freeze( {
    // A page at a fixed address, and a retired one's 410: what it shows never changes, but its markup follows the
    // portal's releases, so a day rather than `immutable` (design record §10.3; ti-engine web-framework 1.19.0).
    FIXED: "public, max-age=86400",
    // Home, indexes, stage pages, errors, changes, comparisons, feeds, 404s and redirects: they follow the stages.
    BRIEF: "public, max-age=60",
    // A fixed download: its bytes never change, by content hash.
    FOREVER: "public, max-age=31536000, immutable",
    // A failure: never kept, so that the next request is answered afresh.
    NONE: "no-store"
} );

const HTML = "text/html; charset=utf-8";

// The language a page about this address is in: its own, else Bulgarian, where `/` goes.
const languageOf = ( request ) => /^\/en(?:\/|$)/.test( request.path ) ? "en" : "bg";

/**
 * Sends a response, with its caching stated.
 *
 * @method
 * @param {Object} response Express's.
 * @param {Object} answer
 * @param {number} [answer.status=200]
 * @param {string} answer.cache The `Cache-Control`, one of `CACHE`.
 * @param {string|Buffer} answer.body
 * @param {string} [answer.type="text/html; charset=utf-8"] The `Content-Type`.
 * @returns {void}
 * @throws {TypeError} For no caching: every response the portal makes states it (decision 4).
 * @public
 */
module.exports.send = ( response, { status = 200, cache, body, type = HTML } ) => {
    if ( typeof cache !== "string" || cache === "" ) {
        throw new TypeError( "Every portal response states its Cache-Control (plan 8a, decision 4)." );
    }
    response.status( status ).set( "Cache-Control", cache ).set( "Content-Type", type ).send( body );
};

/**
 * Redirects, with its caching stated: the root to `/bg/`, a stage's download to its fixed one.
 *
 * @method
 * @param {Object} response
 * @param {Object} answer
 * @param {number} answer.status 301 or 302.
 * @param {string} answer.location An address of the site.
 * @param {string} answer.cache One of `CACHE`.
 * @returns {void}
 * @throws {TypeError} For no caching.
 * @public
 */
module.exports.redirect = ( response, { status, location, cache } ) => {
    if ( typeof cache !== "string" || cache === "" ) {
        throw new TypeError( "Every portal response states its Cache-Control (plan 8a, decision 4)." );
    }
    response.set( "Cache-Control", cache ).redirect( status, location );
};

// A short page of the site's own about why there is nothing here, in the address's language.
const notice = ( request, response, { status, cache, title, text, link } ) => {
    const lang = languageOf( request );
    const main = html`<h1>${ title( lang ) }</h1>
<p>${ text( lang ) }</p>
<p><a href="${ link.address( lang ) }">${ link.text( lang ) }</a></p>`;
    module.exports.send( response, { status: status, cache: cache,
        body: page( { lang: lang, title: title( lang ), path: request.path, main: main, nonce: response.locals.nonce } ) } );
};

/**
 * The 404 page: for an address that is none, a version that was never public, an unknown element. Briefly cached, since
 * an address that is none today may be published tomorrow.
 *
 * @method
 * @param {Object} request
 * @param {Object} response
 * @returns {void}
 * @public
 */
module.exports.notFound = ( request, response ) => notice( request, response, { status: 404, cache: module.exports.CACHE.BRIEF,
    title: ( lang ) => label( lang, "notFoundTitle" ), text: ( lang ) => label( lang, "notFoundText" ),
    link: { address: home, text: ( lang ) => label( lang, "goHome" ) } } );

/**
 * The 410 page: a fixed address of a version that was published and has since been retired, with a link to its spec's
 * changes, which say what replaced it. Cached as a fixed address is: retired is for good.
 *
 * @method
 * @param {Object} request
 * @param {Object} response
 * @param {string} changesPath The spec's changelog, `paths.changes( lang, spec )`.
 * @returns {void}
 * @public
 */
module.exports.gone = ( request, response, changesPath ) => notice( request, response, { status: 410, cache: module.exports.CACHE.FIXED,
    title: ( lang ) => label( lang, "goneTitle" ), text: ( lang ) => label( lang, "goneText" ),
    link: { address: () => changesPath, text: ( lang ) => label( lang, "goneChanges" ) } } );

/**
 * The 500 page. The error is logged with the request it failed, and the page shows nothing of it: a stack or a query
 * would tell a stranger how the portal is built.
 *
 * @method
 * @param {Object} request
 * @param {Object} response
 * @param {*} error
 * @returns {void}
 * @public
 */
module.exports.failed = ( request, response, error ) => {
    // The stack alone, as the framework logs a hook's failure: the logger prints an error's own properties, and a
    // driver's error can carry its connection's details there.
    logger.log( `The portal failed to answer ${ request.method } ${ request.path }.`, logger.logSeverity.ERROR,
        { stack: error && error.stack ? error.stack : String( error ) } );
    if ( response.headersSent ) {
        // Part of the page went out already: all that is left is to end it, which the browser shows as cut short.
        response.end();
        return;
    }
    notice( request, response, { status: 500, cache: module.exports.CACHE.NONE,
        title: ( lang ) => label( lang, "failedTitle" ), text: ( lang ) => label( lang, "failedText" ),
        link: { address: home, text: ( lang ) => label( lang, "goHome" ) } } );
};
