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
 * Accessibility in real Chromium (plan 8a, Task 9; design record §8.5, EN 301 549): every kind of page, in both languages
 * where it has two, is opened in a browser and checked by axe against WCAG 2.1 A and AA. A rule is never switched off and
 * no element is excluded: a violation is fixed in the page or the stylesheet that has it.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, get, startPortal } = require( "./support/server" );
const paths = require( "#paths" );

const TAGS = [ "wcag2a", "wcag2aa", "wcag21a", "wcag21aa" ];
const SPEC = SEED.ePrescription.spec;

// A missing browser skips locally and fails in CI, as a missing seed does: a skipped check looks exactly like a passing one.
const IN_CI = Boolean( process.env.CI ) && process.env.CI !== "false";

/**
 * Every address to check: each kind of page, and both languages where a page has two.
 *
 * @method
 * @param {string} element The address of one element of P001, selected.
 * @returns {string[]}
 * @private
 */
function pagesToCheck( element ) {
    const addresses = [];
    for ( const lang of [ "bg", "en" ] ) {
        addresses.push(
            paths.home( lang ),
            paths.specs( lang ),
            paths.spec( lang, SPEC, "production" ),
            paths.message( lang, SPEC, SEED.ePrescription.production, "P001" ),
            paths.message( lang, SPEC, "testing", "P001" ),
            paths.message( lang, SPEC, "testing", "P001", "conditions" ),
            paths.message( lang, SPEC, "testing", "P001", "changes" ),
            paths.spec( lang, SEED.rules.spec, "production" ),
            paths.conditions( lang, SPEC, "testing" ),
            paths.dictionary( lang, SPEC, "testing" ),
            paths.lists( lang ),
            paths.list( lang, SEED.cl007.spec, "production" ),
            paths.errors( lang ),
            paths.errors( lang, true ),
            paths.changes( lang ),
            paths.changes( lang, SPEC ),
            paths.compare( lang, SPEC, SEED.ePrescription.production, SEED.ePrescription.testing ),
            `/${ lang }/no-such-page`,
            paths.spec( lang, SPEC, SEED.history )
        );
    }
    addresses.push( element, element.replace( "/bg/", "/en/" ) );
    return addresses;
}

describe( "Accessibility, in Chromium", { skip: !SEEDED && "the portal's seed is not built (npm run fixtures:fetch, then npm test)" }, () => {
    let portal = null;
    let browser = null;
    let page = null;
    let skip = null;
    let AxeBuilder = null;

    before( async () => {
        const { chromium } = require( "playwright" );
        AxeBuilder = require( "@axe-core/playwright" ).AxeBuilder;
        try {
            browser = await chromium.launch();
        } catch ( error ) {
            if ( IN_CI ) {
                throw new Error( "Chromium is not installed: CI runs `npx playwright install --with-deps chromium` first.", { cause: error } );
            }
            skip = "Chromium is not installed (npx playwright install chromium)";
            return;
        }
        portal = await startPortal();
        page = await ( await browser.newContext() ).newPage(); // axe opens a page of its own from the page's context
    } );

    after( async () => {
        if ( browser !== null ) {
            await browser.close();
        }
        if ( portal !== null ) {
            await portal.stop();
        }
    } );

    it( "finds no WCAG 2.1 AA violation on any kind of page", { timeout: 300000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        // An element is found on the page rather than named here, so that this test needs no knowledge of the slugs.
        const tree = await get( paths.message( "bg", SPEC, SEED.ePrescription.production, "P001" ) );
        const selected = /href="([^"]*\/P001\/elements\/[^"]+)"/.exec( tree.text );
        assert.ok( selected, "P001's tree links to its elements" );

        const found = [];
        for ( const address of pagesToCheck( selected[ 1 ] ) ) {
            await page.goto( `${ portal.url }${ address }` );
            const result = await new AxeBuilder( { page } ).withTags( TAGS ).analyze();
            for ( const one of result.violations ) {
                found.push( `${ address } ${ one.id }: ${ one.nodes.map( ( node ) => node.target.join( " " ) ).join( " | " ) }` );
            }
        }
        assert.deepEqual( found, [] );
    } );
} );
