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
 * The site's search (plan 8c, decision 7; design record §3.4), against a real server on a copy of the seed: what it
 * finds and where it links, the queries it answers without searching, and an index that follows the published set while
 * the portal runs.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { directoryStore } = require( "@health-dev-portal/data/files" );
const { promoteReleases } = require( "@health-dev-portal/data/promotion" );
const { findVersion } = require( "@health-dev-portal/data/versions" );
const { SEED, SEEDED, assertPublic, get, startPortal } = require( "./support/server" );

const BRIEF = "public, max-age=60";
const search = ( lang, query ) => get( `/${ lang }/search?q=${ encodeURIComponent( query ) }` );
// Every result's link, in the page's order.
const linksOf = ( page ) => [ ...( /<div class="results">([\s\S]*)<\/div>/.exec( page ) || [ "", "" ] )[ 1 ].matchAll( /<a href="([^"]+)"/g ) ].map( ( found ) => found[ 1 ] );

describe( "The site's search", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    let db;
    before( async () => {
        portal = await startPortal();
        db = await openDatabase( `sqlite:${ portal.database }` );
    } );
    after( async () => {
        if ( db ) {
            await db.close();
        }
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "finds a message by its code, at production", async () => {
        const response = await search( "bg", "p001" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        assert.match( response.text, /<link rel="canonical" href="https:\/\/developers\.example\.test\/bg\/search\?q=p001">/ );
        assert.equal( linksOf( response.text )[ 0 ], "/bg/specs/e-prescription/production/P001" );
    } );

    it( "links every result to a page that exists, at an anchor it has", async () => {
        const errors = ( await get( "/bg/errors" ) ).text;
        const code = /<section id="([A-Z]\d+)">/.exec( errors )[ 1 ];
        for ( const query of [ "P001", "CL009", "lrn", code ] ) {
            const links = linksOf( ( await search( "bg", query ) ).text );
            assert.ok( links.length > 0, query );
            for ( const link of links.slice( 0, 30 ) ) {
                const [ address, fragment ] = link.split( "#" );
                const target = await get( address );
                assert.equal( target.status, 200, link );
                if ( fragment !== undefined ) {
                    assert.ok( target.text.includes( `id="${ fragment }"` ), link );
                }
            }
        }
    } );

    it( "names a result's spec only where its group does not already say it", async () => {
        const page = ( await search( "bg", "CL009" ) ).text;
        // A list's own ID is its title: repeated after it, it said nothing ("CL009 · … CL009").
        const list = /<li><a href="\/bg\/nomenclatures\/CL009\/production">[\s\S]*?<\/li>/.exec( page )[ 0 ];
        assert.doesNotMatch( list, /<span class="muted">/ );
        // A message's module is named, since the group holds every module's.
        assert.match( ( await search( "bg", "p001" ) ).text, /P001<\/code> · [^<]*<\/a> <span class="muted">Е-рецепта<\/span>/ );
    } );

    it( "finds the FAQ and the guides", async () => {
        const links = linksOf( ( await search( "bg", "токен" ) ).text );
        assert.ok( links.includes( "/bg/faq#token-method" ), links.join( " " ) );
        assert.ok( links.includes( "/bg/guides/getting-started" ), links.join( " " ) );
        // In English too, the Bulgarian-only question is found and marked.
        const english = ( await search( "en", "auth.his.bg" ) ).text;
        assert.match( english, /href="\/en\/faq#token-method"><span lang="bg">/ );
        // Its excerpt is Bulgarian as well, and says so, as the title does (WCAG 2.1 3.1.2; final review).
        assert.match( english, /href="\/en\/faq#token-method">[\s\S]*?<span class="excerpt" lang="bg">Заявката е GET/ );
    } );

    it( "answers short, long and hostile queries", async () => {
        for ( const query of [ "", "a", "x".repeat( 201 ), "<script>", ".*(", "%" ] ) {
            const response = await search( "bg", query );
            assert.equal( response.status, 200, query );
            assertPublic( response, BRIEF );
            assert.doesNotMatch( response.text, /<script>/, query );
        }
        assert.match( ( await search( "bg", "a" ) ).text, /Въведете поне два знака/ );
        assert.match( ( await search( "en", "x".repeat( 201 ) ) ).text, /too long/ );
        assert.match( ( await search( "bg", "<script>" ) ).text, /&lt;script&gt;/ );
        assert.equal( ( await get( "/bg/search" ) ).status, 200 );
    } );

    it( "has a search box in the top bar that works without JavaScript", async () => {
        const page = ( await get( "/en/specs" ) ).text;
        const form = /<form class="search"[\s\S]*?<\/form>/.exec( page )[ 0 ];
        assert.match( form, /role="search"/ );
        assert.match( form, /action="\/en\/search"/ );
        assert.match( form, /method="get"/ );
        assert.match( form, /<label for="site-search"[^>]*>Search the portal<\/label>/ );
        assert.match( form, /<input id="site-search" type="search" name="q"/ );
    } );

    it( "finds what a promotion made public on the next search", async () => {
        // exampleNote is added in e-Prescription's testing version (SEED.ePrescriptionChanges): found there, before.
        const before = linksOf( ( await search( "bg", "exampleNote" ) ).text );
        assert.ok( before.some( ( link ) => link.startsWith( "/bg/specs/e-prescription/testing/P001/elements/" ) ), before.join( " " ) );
        // The release is promoted to production, as staff would, once its planned date has come, and production's version
        // moves to previous production. The next search finds the element at production, with no restart. A spec's first
        // promotion, with no production to move, is the fingerprint's unit test: the seed has no such spec.
        const { release_id: release } = await db.get( "SELECT release_id FROM versions WHERE spec_id = ? AND number = ?", [ SEED.ePrescription.spec, SEED.ePrescription.testing ] );
        const previous = await findVersion( db, SEED.ePrescription.spec, { number: SEED.ePrescription.production } );
        await promoteReleases( db, directoryStore( portal.files ), [ release ], { to: "production", previous: { [ previous.id ]: "2027-06-30" },
            actor: "approver@example.test", now: new Date( `${ SEED.ePrescription.plannedOn }T12:00:00Z` ) } );
        const after = linksOf( ( await search( "bg", "exampleNote" ) ).text );
        assert.ok( after.length > 0 );
        assert.ok( after.every( ( link ) => link.startsWith( "/bg/specs/e-prescription/production/" ) ), after.join( " " ) );
        assert.equal( ( await get( after[ 0 ] ) ).status, 200 );
    } );
} );
