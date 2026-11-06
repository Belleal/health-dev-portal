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
 * The code lists (plan 8a, Task 6; decisions 3, 4, 8 and 9), against a real server on a copy of the seed: the index and
 * its filter, one list with its columns, expired entries, paging and the messages that use it, and the fixed downloads.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, rowsOf, seedContent, startPortal } = require( "./support/server" );
const paths = require( "#paths" );

const FIXED = "public, max-age=86400";
const BRIEF = "public, max-age=60";
const FOREVER = "public, max-age=31536000, immutable";

// The IDs a page's rows are for: each row's first cell is its list's ID or entry's key, in a <code>.
const keysOf = ( text ) => rowsOf( text ).map( ( row ) => /<code>([^<]*)<\/code>/.exec( row )[ 1 ] );

describe( "The code lists", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "lists every published code list, and filters them by ID or name", async () => {
        const index = await get( "/bg/nomenclatures" );
        assert.equal( index.status, 200 );
        assertPublic( index, BRIEF );
        const all = keysOf( index.text );
        assert.ok( all.length > 100, `${ all.length } lists` );
        assert.ok( all.includes( "CL007" ) && all.includes( "CL011" ) );
        assert.match( index.text, new RegExp( `href="/bg/nomenclatures/CL007/production"` ) );
        // A list's page is reached from the index at each stage that holds one, never by an abandoned version's number.
        assert.match( index.text, /href="\/bg\/nomenclatures\/CL007\/previous-production"/ );
        assert.equal( index.text.includes( `/CL008/${ SEED.cl008Abandoned }` ), false );
        assert.match( index.text, /href="\/en\/nomenclatures"/ );

        const byId = await get( "/bg/nomenclatures?q=CL00" );
        assertPublic( byId, BRIEF );
        const found = keysOf( byId.text );
        assert.ok( found.length >= 9 && found.length < all.length );
        assert.ok( found.every( ( id ) => id.startsWith( "CL00" ) ) );
        assert.ok( found.includes( "CL007" ) && !found.includes( "CL011" ) );

        // The name with its Cyrillic letters swapped for Latin ones that look the same, and in the wrong case.
        const name = ( await seedContent( SEED.cl007.spec, SEED.cl007.production ) ).list.name.bg;
        const typed = name.replace( /а/g, "a" ).replace( /е/g, "e" ).replace( /о/g, "o" ).replace( /р/g, "p" ).replace( /Т/g, "T" ).toUpperCase();
        assert.notEqual( typed, name );
        assert.ok( keysOf( ( await get( `/bg/nomenclatures?q=${ encodeURIComponent( typed ) }` ) ).text ).includes( "CL007" ) );
        // Nothing matches: the page says so, rather than showing an empty table.
        const none = await get( "/bg/nomenclatures?q=zzzzzzzz" );
        assert.equal( none.status, 200 );
        assert.equal( rowsOf( none.text ).length, 0 );
        // The filter is a GET form, which works without a script, and keeps the reader's words.
        assert.match( none.text, /<form class="filter" method="get" action="\/bg\/nomenclatures">/ );
        assert.match( none.text, /value="zzzzzzzz"/ );
    } );

    it( "shows a list's columns, hides expired entries unless asked, and names the messages that use it", async () => {
        const response = await get( "/bg/nomenclatures/CL007/production" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        const page = response.text;
        const content = await seedContent( SEED.cl007.spec, SEED.cl007.production );
        for ( const column of content.list.columns ) {
            assert.match( page, new RegExp( `<th scope="col">${ column.title }</th>` ) );
        }
        // The version's own entries: the one it added is there, the one it expired is not.
        assert.match( page, new RegExp( `>${ SEED.cl007.added }<` ) );
        assert.doesNotMatch( page, new RegExp( `>${ SEED.cl007.expired }<` ) );
        const expired = await get( "/bg/nomenclatures/CL007/production?expired=1" );
        assert.match( expired.text, new RegExp( `>${ SEED.cl007.expired }<` ) );
        assert.equal( rowsOf( expired.text ).length, rowsOf( page ).length + 1 );
        // The toggle is a link either way.
        assert.match( page, /href="\/bg\/nomenclatures\/CL007\/production\?expired=1"/ );
        assert.match( expired.text, /href="\/bg\/nomenclatures\/CL007\/production"/ );
        // The version's own page keeps the same T4 as expired in a version that does not yet expire it.
        assert.match( ( await get( `/bg/nomenclatures/CL007/${ SEED.cl007.previous }` ) ).text, new RegExp( `>${ SEED.cl007.expired }<` ) );

        // Ruling P2: CL007 1.5.34 is read by e-Prescription 1.5.2, at each element that names it, at its own address.
        const message = ( await seedContent( "e-prescription", SEED.ePrescription.testing ) ).messages.find( ( one ) => one.code === "P001" );
        const slugs = paths.elementSlugs( message );
        const category = [ ...slugs ].find( ( [ node ] ) => node.path === "contents/prescription/category" && node.codeList === "CL007" );
        assert.ok( category );
        const link = paths.element( "bg", "e-prescription", SEED.ePrescription.testing, "P001", category[ 1 ] );
        assert.match( link, /\/bg\/specs\/e-prescription\/1\.5\.2\/P001\/elements\/.*category$/ );
        assert.ok( page.includes( `href="${ link }"` ), "links the element that reads the list" );
        // The list's own changelog, and its two downloads.
        assert.match( page, /href="\/bg\/changes\/CL007"/ );
        assert.match( page, /href="\/downloads\/nomenclatures\/CL007\/1\.5\.34\.json"/ );
        assert.match( page, /href="\/downloads\/nomenclatures\/CL007\/1\.5\.34\.csv"/ );
        // The CSV is for spreadsheets and says it is changed there; the JSON is the exact file.
        assert.match( page, /CSV[^<]*&#39;/ );
        assert.match( page, /canonical" href="https:\/\/developers\.example\.test\/bg\/nomenclatures\/CL007\/1\.5\.34"/ );
        // A display column comes only with a display to show, and a column with no text in a language is "—".
        assert.match( page, /<th scope="col">Изписване \(български\)<\/th>/ );
    } );

    it( "names the same list's readers in English, with the list's untranslated name marked", async () => {
        const page = ( await get( "/en/nomenclatures/CL007/production" ) ).text;
        assert.match( page, /<h1>CL007 · <span lang="bg">Тип на рецепта<\/span> <span class="untranslated">not yet translated<\/span><\/h1>/ );
        assert.match( page, /Used in/ );
        const bg = ( await get( "/bg/nomenclatures/CL007/production" ) ).text;
        assert.match( bg, /<h1>CL007 · Тип на рецепта<\/h1>/ );
        assert.doesNotMatch( bg, /не е преведено/ );
    } );

    it( "pages CL011 by 500, and its downloads hold every entry", async () => {
        const first = await get( "/bg/nomenclatures/CL011/production" );
        assert.equal( first.status, 200 );
        assert.equal( rowsOf( first.text ).length, 500 );
        assert.match( first.text, /href="\/bg\/nomenclatures\/CL011\/production\?page=2"/ );
        assert.doesNotMatch( first.text, /\?page=1"/ );
        const last = await get( "/bg/nomenclatures/CL011/production?page=79" );
        assert.equal( last.status, 200 );
        // 39,005 entries: 78 full pages and 5.
        assert.equal( rowsOf( last.text ).length, 5 );
        assert.equal( ( await get( "/bg/nomenclatures/CL011/production?page=80" ) ).status, 404 );
        const json = await get( "/downloads/nomenclatures/CL011/1.5.33.json" );
        assert.equal( json.status, 200 );
        assertPublic( json, FOREVER, "application/json; charset=utf-8" );
        const list = JSON.parse( json.text );
        assert.equal( list.entries.length, 39005 );
        assert.equal( list.format, "nhis-code-list/1" );
        const csv = await get( "/downloads/nomenclatures/CL011/1.5.33.csv" );
        assertPublic( csv, FOREVER, "text/csv; charset=utf-8" );
        assert.match( csv.text, /^"key","description_bg","description_en"/ );
        assert.equal( csv.text.split( "\r\n" ).filter( Boolean ).length, 39005 + 1 );
    } );

    it( "finds a key that lies on a later page, by the filter", async () => {
        const entries = ( await seedContent( "CL011", SEED.nomenclatures ) ).list.entries;
        const key = entries[ 30000 ].key;
        const page = await get( `/bg/nomenclatures/CL011/production?q=${ encodeURIComponent( key ) }` );
        assert.equal( page.status, 200 );
        assert.ok( keysOf( page.text ).includes( key ), `${ key } is found` );
        assert.ok( rowsOf( page.text ).length < 500 );
    } );

    it( "redirects a stage download to its fixed address", async () => {
        for ( const [ stage, number, ext ] of [ [ "production", SEED.cl007.production, "json" ], [ "previous-production", SEED.cl007.previous, "csv" ] ] ) {
            const response = await get( `/downloads/nomenclatures/CL007/${ stage }.${ ext }` );
            assert.equal( response.status, 302, stage );
            assertPublic( response, BRIEF, null );
            assert.equal( response.headers.get( "location" ), `/downloads/nomenclatures/CL007/${ number }.${ ext }` );
        }
        // No version in testing, no download of it.
        assert.equal( ( await get( "/downloads/nomenclatures/CL007/testing.json" ) ).status, 404 );
        assert.equal( ( await get( "/downloads/nomenclatures/CL007/9.9.9.json" ) ).status, 404 );
        assert.equal( ( await get( "/downloads/nomenclatures/CL000/production.json" ) ).status, 404 );
    } );

    it( "answers the number of CL008's abandoned version with 404, page and downloads alike", async () => {
        for ( const path of [ `/bg/nomenclatures/CL008/${ SEED.cl008Abandoned }`, `/downloads/nomenclatures/CL008/${ SEED.cl008Abandoned }.json`,
            `/downloads/nomenclatures/CL008/${ SEED.cl008Abandoned }.csv`, `/en/nomenclatures/CL008/${ SEED.cl008Abandoned }` ] ) {
            const response = await get( path );
            assert.equal( response.status, 404, path );
            assertPublic( response, BRIEF );
        }
        // Its published version is there, at its own number.
        assert.equal( ( await get( "/bg/nomenclatures/CL008/production" ) ).status, 200 );
    } );

    it( "escapes the filter, and answers a page past the end with 404", async () => {
        const page = ( await get( "/bg/nomenclatures/CL007/production?q=%3Cscript%3E" ) ).text;
        assert.equal( page.includes( "<script>" ), false );
        assert.match( page, /value="&lt;script&gt;"/ );
        const index = ( await get( "/bg/nomenclatures?q=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E" ) ).text;
        assert.equal( index.includes( "<script>" ), false );
        assert.equal( ( await get( "/bg/nomenclatures/CL007/production?page=999" ) ).status, 404 );
        assertPublic( await get( "/bg/nomenclatures/CL007/production?page=999" ), BRIEF );
        // A filter that leaves nothing has one page, an empty one; page 0 and a page that is no number are no address.
        assert.equal( ( await get( "/bg/nomenclatures/CL007/production?q=zzzzzzzz" ) ).status, 200 );
        assert.equal( ( await get( "/bg/nomenclatures/CL007/production?q=zzzzzzzz&page=2" ) ).status, 404 );
        assert.equal( ( await get( "/bg/nomenclatures/CL007/production?page=0" ) ).status, 404 );
        assert.equal( ( await get( "/bg/nomenclatures/CL007/production?page=x" ) ).status, 404 );
    } );

    it( "answers a module under the lists, and an unknown list, with 404, and a fixed address with a day's caching", async () => {
        for ( const path of [ "/bg/nomenclatures/e-prescription/production", "/bg/nomenclatures/CL000/production", "/bg/nomenclatures/CL007/9.9.9",
            "/bg/nomenclatures/CL007/development" ] ) {
            const response = await get( path );
            assert.equal( response.status, 404, path );
            assertPublic( response, BRIEF );
        }
        const fixed = await get( "/bg/nomenclatures/CL007/1.5.34" );
        assert.equal( fixed.status, 200 );
        assertPublic( fixed, FIXED );
    } );
} );
