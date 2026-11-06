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
 * From an address to the page that answers it (plan 8a, decision 3). `parseAddress` has checked every part's shape;
 * a page checks what only the data can say — whether that version is public, whether that message exists — and
 * answers 404 when it is not. An address with no page, and any page that throws, are answered here.
 */

const { sofiaDate } = require( "@health-dev-portal/spec-model/dates" );
const { home, parseAddress } = require( "#paths" );
const { CACHE, failed, notFound, redirect } = require( "#responses" );
const { errorsPage } = require( "#pages/errors" );
const { homePage } = require( "#pages/home" );
const { messagePage } = require( "#pages/message" );
const { downloadFile, listPage, listsPage } = require( "#pages/nomenclatures" );
const { conditionsPage, dictionaryPage, specPage, specsIndexPage } = require( "#pages/specs" );

// Each kind of page `parseAddress` gives, and the function that answers it,
// `( context: PageContext, parts: Address ) => Promise<void>` (#definitions), which sends its own response through
// responses.js. A kind with no function yet is a 404, so an address the site will have is never answered by anything
// else meanwhile.
const PAGES = Object.freeze( {
    home: homePage,
    specs: specsIndexPage,
    spec: specPage,
    conditions: conditionsPage,
    dictionary: dictionaryPage,
    message: messagePage,
    lists: listsPage,
    list: listPage,
    download: downloadFile,
    errors: errorsPage
} );

/**
 * Answers `/` with a permanent redirect to the Bulgarian home page (design record §8.1).
 *
 * @method
 * @param {Object} request
 * @param {Object} response
 * @returns {void}
 * @public
 */
module.exports.rootRedirect = ( request, response ) => redirect( response, { status: 301, location: home( "bg" ), cache: CACHE.BRIEF } );

/**
 * The handler of every GET the framework does not answer itself: it reads the address, builds the page's context and
 * hands both to the page; an address that is none is the 404 page, and a page that throws is the 500 page.
 *
 * @method
 * @param {function(): {db: import( "@health-dev-portal/data/definitions" ).Database, store: import( "@health-dev-portal/data/definitions" ).FileStore}} resources
 *     Read on each request: the server opens both as it starts, and the framework holds every request until it has.
 * @returns {function( Object, Object ): Promise<void>} An Express handler.
 * @public
 */
module.exports.pageHandler = ( resources ) => async ( request, response ) => {
    try {
        const parts = parseAddress( request.originalUrl );
        if ( parts === null || !Object.hasOwn( PAGES, parts.page ) ) {
            notFound( request, response );
            return;
        }
        const { db, store } = resources();
        await PAGES[ parts.page ]( { db: db, store: store, lang: parts.lang, request: request, response: response, nonce: response.locals.nonce,
            today: sofiaDate( new Date() ) }, parts );
    } catch ( error ) {
        failed( request, response, error );
    }
};
