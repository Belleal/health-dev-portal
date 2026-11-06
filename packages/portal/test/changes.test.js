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
 * The changes pages and the feeds (plan 8a, Task 8; decision 10), against a real server on a copy of the seed: the index,
 * a spec's changelog with its comparison form, the comparison of two kept versions, and the Atom feeds.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, startPortal } = require( "./support/server" );

const BRIEF = "public, max-age=60";
const ATOM = "application/atom+xml; charset=utf-8";
const PUBLIC_URL = "https://developers.example.test";

describe( "The changes pages and the feeds", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "lists every spec's changelog and the feeds on the index, in both languages", async () => {
        for ( const lang of [ "bg", "en" ] ) {
            const response = await get( `/${ lang }/changes` );
            assert.equal( response.status, 200 );
            assertPublic( response, BRIEF );
            assert.ok( response.text.includes( `href="/${ lang }/changes/e-prescription"` ) );
            assert.ok( response.text.includes( `href="/${ lang }/changes/${ SEED.cl007.spec }"` ) );
            assert.ok( response.text.includes( `href="/${ lang }/changes/feed.atom"` ) );
        }
        assert.match( ( await get( "/bg/changes" ) ).text, /<title>Промени · /u );
        assert.match( ( await get( "/en/changes" ) ).text, /<title>Changes · /u );
    } );

    it( "gives a spec's changelog newest first, grouped by category", async () => {
        const response = await get( "/bg/changes/e-prescription" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        const page = response.text;
        assert.ok( page.indexOf( "1.5.2" ) < page.indexOf( "1.5.1" ) );
        assert.match( page, /Несъвместими[\s\S]*Съвместими/u );
        assert.ok( page.indexOf( "1.5.1" ) < page.indexOf( SEED.history ) );
        // The English page has its own words, not Bulgarian ones.
        const english = ( await get( "/en/changes/e-prescription" ) ).text;
        assert.match( english, /Breaking[\s\S]*Non-breaking/ );
        assert.ok( !/Несъвместими/u.test( english ) );
        assert.match( english, /href="\/en\/changes\/e-prescription\/feed\.atom"/ );
    } );

    it( "shows a detected entry as words and values, never as the item's JSON", async () => {
        const page = ( await get( "/en/changes/e-prescription" ) ).text;
        const start = page.indexOf( 'id="v1.5.2"' );
        const section = page.slice( start, page.indexOf( "</section>", start ) );
        for ( const change of SEED.ePrescriptionChanges ) {
            assert.match( section, change.pattern );
        }
        assert.equal( section.includes( "&quot;identity&quot;" ), false, "no item dumped as JSON" );
        // Each row names the aspect that changed, beside the values.
        assert.match( section, /exampleNote@value<\/code><\/td><td>new<\/td><td>.<\/td><td>.<\/td>/u );
        assert.match( section, /supplements@value<\/code><\/td><td><code>requirement<\/code><\/td><td>O<\/td><td>R<\/td>/ );
        assert.match( section, /supplements@value<\/code><\/td><td><code>cardinality<\/code><\/td><td>0\.\.1<\/td><td>1\.\.1<\/td>/ );
        assert.match( section, /lrn@value<\/code><\/td><td><code>description<\/code><\/td>/ );
        assert.match( page, /<th scope="col">Before<\/th><th scope="col">After<\/th>/ );
    } );

    it( "says when a version's dates were not recorded", async () => {
        const page = ( await get( "/bg/changes/e-prescription" ) ).text;
        const start = page.indexOf( `id="v${ SEED.history }"` );
        assert.ok( start > 0, "the migrated history version is on the page" );
        assert.match( page.slice( start, start + 600 ), /датите не са записани/u );
        assert.match( ( await get( "/en/changes/e-prescription" ) ).text, /dates not recorded/ );
        // A version with a recorded date shows it, in the language's format.
        assert.match( ( await get( "/bg/changes/e-prescription" ) ).text, /тестова от 05\.11\.2026/u );
        assert.match( ( await get( "/en/changes/e-prescription" ) ).text, /testing from 5 Nov 2026/ );
    } );

    it( "leaves out a version abandoned before testing", async () => {
        const abandoned = SEED.cl008Abandoned;
        const page = ( await get( "/bg/changes/CL008" ) ).text;
        assert.equal( page.includes( `id="v${ abandoned }"` ), false );
        assert.equal( page.includes( `value="${ abandoned }"` ), false, "not among the comparison choices" );
        assert.equal( ( await get( `/bg/changes/CL008/compare?from=1.5.33&to=${ abandoned }` ) ).status, 404 );
        for ( const feed of [ "/bg/changes/feed.atom", "/bg/changes/CL008/feed.atom" ] ) {
            const text = ( await get( feed ) ).text;
            assert.equal( text.includes( `CL008#${ abandoned }-` ), false, feed );
        }
    } );

    it( "carries a comparison form that works without JavaScript", async () => {
        const page = ( await get( "/bg/changes/e-prescription" ) ).text;
        const form = page.match( /<form\b[^>]*>[\s\S]*?<\/form>/ )[ 0 ];
        assert.match( form, /method="get"/ );
        assert.match( form, /action="\/bg\/changes\/e-prescription\/compare"/ );
        const selects = [ ...form.matchAll( /<select\b[^>]*name="(from|to)"[^>]*>([\s\S]*?)<\/select>/g ) ];
        assert.deepEqual( selects.map( ( select ) => select[ 1 ] ), [ "from", "to" ] );
        for ( const select of selects ) {
            assert.match( select[ 2 ], /value="1\.5\.1"/ );
            assert.match( select[ 2 ], /value="1\.5\.2"/ );
            // A version with no content, as the migrated history is, cannot be compared.
            assert.equal( select[ 2 ].includes( `value="${ SEED.history }"` ), false );
        }
        assert.match( form, /<button\b/ );
        assert.equal( /\sstyle=|<script\b[^>]*>[^<]/.test( page ), false );
    } );

    it( "compares two kept versions, structure and the entries between them", async () => {
        const response = await get( "/bg/changes/e-prescription/compare?from=1.5.1&to=1.5.2" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        for ( const change of SEED.ePrescriptionChanges ) {
            assert.match( response.text, change.pattern );
        }
        assert.match( response.text, /Несъвместими/u );
        assert.match( response.text, /Съвместими/u );
        // The entries after the first version, up to the second: 1.5.2's, and not 1.5.1's.
        assert.ok( response.text.includes( `id="v1.5.2"` ) || /Версия 1\.5\.2/u.test( response.text ) );
        assert.equal( /Версия 1\.5\.1\b/u.test( response.text ), false );
        assert.ok( response.text.includes( "/bg/changes/e-prescription" ) );
        const english = ( await get( "/en/changes/e-prescription/compare?from=1.5.1&to=1.5.2" ) ).text;
        assert.match( english, /Differences in structure/ );
    } );

    it( "swaps a reversed comparison, and refuses a comparison of unknown versions", async () => {
        const forward = await get( "/bg/changes/e-prescription/compare?from=1.5.1&to=1.5.2" );
        const reversed = await get( "/bg/changes/e-prescription/compare?from=1.5.2&to=1.5.1" );
        assert.equal( reversed.status, 200 );
        assertPublic( reversed, BRIEF );
        assert.match( reversed.text, /1\.5\.1 → 1\.5\.2/u );
        // The canonical address is the ordered one, so the pair has one address.
        assert.match( reversed.text, /rel="canonical" href="[^"]*compare\?from=1\.5\.1&amp;to=1\.5\.2"/ );
        assert.equal( reversed.text.length, forward.text.length );

        for ( const address of [
            "/bg/changes/e-prescription/compare?from=1.5.1&to=1.5.1",
            "/bg/changes/e-prescription/compare?from=1.5.1&to=9.9.9",
            "/bg/changes/e-prescription/compare?from=../1.5.1&to=1.5.2",
            "/bg/changes/e-prescription/compare?from=1.5.1",
            // A version with no content cannot be compared.
            `/bg/changes/e-prescription/compare?from=${ SEED.history }&to=1.5.2`,
            "/bg/changes/no-such-spec/compare?from=1.0.0&to=1.0.1",
            "/bg/changes/no-such-spec",
            "/bg/changes/no-such-spec/feed.atom"
        ] ) {
            const response = await get( address );
            assert.equal( response.status, 404, address );
            assertPublic( response, BRIEF );
        }
    } );

    it( "compares code lists too", async () => {
        const response = await get( `/en/changes/${ SEED.cl007.spec }/compare?from=${ SEED.cl007.previous }&to=${ SEED.cl007.production }` );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        assert.match( response.text, new RegExp( `${ SEED.cl007.added }` ) );
    } );

    it( "publishes Atom feeds for everything and for one spec", async () => {
        const response = await get( "/bg/changes/e-prescription/feed.atom" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF, ATOM );
        assert.match( response.text, /^<\?xml version="1\.0" encoding="utf-8"\?>\s*<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/ );
        const id = `${ PUBLIC_URL }/bg/changes/e-prescription#${ SEED.ePrescription.testing }-testing`;
        assert.ok( response.text.includes( `<id>${ id }</id>` ), "the testing publication's id" );
        assert.match( response.text, /<updated>2026-11-05T00:00:00Z<\/updated>/ );
        assert.ok( response.text.includes( `<link href="${ PUBLIC_URL }/bg/changes/e-prescription"` ) );
        assert.equal( response.text.includes( "CL007" ), false, "the per-spec feed holds that spec only" );

        const everything = await get( "/en/changes/feed.atom" );
        assertPublic( everything, BRIEF, ATOM );
        assert.match( everything.text, /^<\?xml version="1\.0" encoding="utf-8"\?>\s*<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/ );
        assert.ok( everything.text.includes( `<id>${ PUBLIC_URL }/en/changes/e-prescription#${ SEED.ePrescription.testing }-testing</id>` ) );
        assert.ok( everything.text.includes( `<id>${ PUBLIC_URL }/en/changes/CL007#${ SEED.cl007.production }-production</id>` ) );
        // One entry per publication, and every markup character in what the feed says is escaped.
        const entries = [ ...everything.text.matchAll( /<entry>/g ) ].length;
        assert.ok( entries >= 3, `${ entries } entries` );
        assert.equal( /&(?!amp;|lt;|gt;|quot;|#39;|#x27;)/.test( everything.text ), false, "a bare ampersand" );
        assert.equal( everything.text.includes( "<script" ), false );
    } );

    it( "gives a feed with no entry a date of its own, and a feed's entries each a day", async () => {
        const text = ( await get( "/bg/changes/rules/feed.atom" ) ).text;
        assert.match( text, /<updated>\d{4}-\d{2}-\d{2}T00:00:00Z<\/updated>/ );
        for ( const entry of text.matchAll( /<entry>[\s\S]*?<\/entry>/g ) ) {
            assert.match( entry[ 0 ], /<updated>\d{4}-\d{2}-\d{2}T00:00:00Z<\/updated>/ );
            assert.match( entry[ 0 ], /<link href="https:\/\/developers\.example\.test\// );
        }
    } );
} );
