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
// A missing browser skips locally and fails in CI, as a missing seed does: a skipped check looks exactly like a passing one.
const { IN_CI, SEED, SEEDED, get, startPortal } = require( "./support/server" );
const { elementOf, pagesToCheck } = require( "./support/pages" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { addMaintenance, setStatus } = require( "@health-dev-portal/data/status" );
const paths = require( "#paths" );

const TAGS = [ "wcag2a", "wcag2aa", "wcag21a", "wcag21aa" ];
const SPEC = SEED.ePrescription.spec;

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
        // Every state, so that axe measures each one's colour: the latest two in the band and the table, all four in the
        // history; and a window to come, in the band and on the status page (plan 8c, decision 6).
        const db = await openDatabase( `sqlite:${ portal.database }` );
        const update = ( environment, state, at ) => setStatus( db, { environment: environment, state: state, message: { bg: "Съобщение", en: "Message" },
            by: "a11y-test", at: new Date( at ) } );
        await update( "production", "maintenance", "2026-11-17T07:00:00Z" );
        await update( "test", "operational", "2026-11-17T07:30:00Z" );
        await update( "production", "degraded", "2026-11-17T08:00:00Z" );
        await update( "test", "outage", "2026-11-17T08:30:00Z" );
        await addMaintenance( db, { environment: "production", startsAt: new Date( "2099-11-20T20:00:00Z" ), endsAt: new Date( "2099-11-20T21:30:00Z" ),
            message: { bg: "Обновяване", en: "Upgrade" }, by: "a11y-test" } );
        await db.close();
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
        const element = elementOf( ( await get( paths.message( "bg", SPEC, SEED.ePrescription.production, "P001" ) ) ).text );
        assert.ok( element, "P001's tree links to its elements" );

        const found = [];
        for ( const [ address, status ] of pagesToCheck( element ) ) {
            const requested = new URL( address, portal.url ).href;
            const response = await page.goto( requested );
            // Without this a mistyped builder, a redirect or a 500 page would be analysed as the page meant, and pass.
            if ( response.status() !== status || response.url() !== requested ) {
                found.push( `${ address } answered ${ response.status() } at ${ response.url() }, expected ${ status } at ${ requested }` );
                continue;
            }
            const result = await new AxeBuilder( { page } ).withTags( TAGS ).analyze();
            for ( const one of result.violations ) {
                found.push( `${ address } ${ one.id }: ${ one.nodes.map( ( node ) => node.target.join( " " ) ).join( " | " ) }` );
            }
        }
        assert.deepEqual( found, [] );
    } );
} );
