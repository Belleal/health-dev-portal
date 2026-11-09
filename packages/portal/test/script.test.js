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
 * The portal's one script, in real Chromium (plan 8a, decision 6): the "copy link" button of a selected element. Its
 * two defects were found by CodeRabbit on #20, and neither is reachable without a browser.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
// A missing browser skips locally and fails in CI, as in the accessibility test.
const { IN_CI, SEED, SEEDED, get, startPortal } = require( "./support/server" );
const paths = require( "#paths" );

const COPY = "button.copy[data-copy]";
const UNSEEDED = !SEEDED && "the portal's seed is not built (npm run fixtures:fetch, then npm test)";
const NO_CHROMIUM = "Chromium is not installed: CI runs `npx playwright install --with-deps chromium` first.";

describe( "The copy link button, in Chromium", { skip: UNSEEDED }, () => {
    let portal = null;
    let browser = null;
    let skip = null;
    let element = null;

    before( async () => {
        const { chromium } = require( "playwright" );
        try {
            browser = await chromium.launch();
        } catch ( error ) {
            if ( IN_CI ) {
                throw new Error( NO_CHROMIUM, { cause: error } );
            }
            skip = "Chromium is not installed (npx playwright install chromium)";
            return;
        }
        portal = await startPortal();
        // An element is found on the page rather than named here, so that this test needs no knowledge of the slugs.
        const tree = await get( paths.message( "bg", SEED.ePrescription.spec, SEED.ePrescription.production, "P001" ) );
        const selected = /href="([^"]*\/P001\/elements\/[^"]+)"/.exec( tree.text );
        assert.ok( selected, "P001's tree links to its elements" );
        element = new URL( selected[ 1 ], portal.url ).href;
    } );

    after( async () => {
        if ( browser !== null ) {
            await browser.close();
        }
        if ( portal !== null ) {
            await portal.stop();
        }
    } );

    /**
     * Opens the selected element's page in a fresh context, collecting the errors its script throws.
     *
     * @method
     * @param {function( import( "playwright" ).BrowserContext ): Promise<void>} [prepare] Run on the context first.
     * @returns {Promise<{page: import( "playwright" ).Page, errors: Error[]}>}
     * @private
     */
    const open = async ( prepare = async () => {} ) => {
        const context = await browser.newContext();
        await prepare( context );
        const page = await context.newPage();
        const errors = [];
        page.on( "pageerror", ( error ) => errors.push( error ) );
        await page.goto( element );
        return { page, errors };
    };

    it( "keeps its own label after a second click within the moment it says it copied", async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const origin = new URL( portal.url ).origin;
        const { page, errors } = await open( ( browserContext ) => browserContext.grantPermissions(
            [ "clipboard-read", "clipboard-write" ], { origin: origin } ) );
        const button = page.locator( COPY );
        const label = await button.textContent();
        const copied = await button.getAttribute( "data-copied" );
        assert.notEqual( label, copied );

        await button.click();
        await page.locator( COPY, { hasText: copied } ).waitFor();
        // The second click lands while the button says it copied: read then, that text became the label to go back to.
        await button.click();
        await page.waitForTimeout( 2500 );

        assert.equal( await button.textContent(), label );
        assert.equal( await page.evaluate( () => navigator.clipboard.readText() ), element );
        assert.deepEqual( errors, [] );
    } );

    it( "throws nothing where the browser offers no clipboard, as on a page not served over HTTPS", async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        // Chromium offers no clipboard outside a secure context. Every address a test can reach is one, so it is
        // taken away.
        const { page, errors } = await open( ( browserContext ) => browserContext.addInitScript( () => {
            delete Navigator.prototype.clipboard;
        } ) );
        assert.equal( await page.evaluate( () => navigator.clipboard ), undefined );
        const button = page.locator( COPY );
        const label = await button.textContent();

        await button.click();
        // One round trip after the click: the browser reports an uncaught error before it answers anything later.
        await page.evaluate( () => true );

        assert.deepEqual( errors.map( ( error ) => error.message ), [] );
        assert.equal( await button.textContent(), label );
    } );
} );
