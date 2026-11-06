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
 * The errors page (plan 8a, Task 7; decision 11), against a real server on a copy of the seed: every CL999 error with
 * the rules that raise it, every CL998 warning with its source, and the testing page that exists only while one of the
 * three specs has a testing version.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, seedContent, startPortal } = require( "./support/server" );
const { escapeHtml } = require( "@ti-engine/web-content/html" );

const BRIEF = "public, max-age=60";

const entriesOf = async ( id ) => ( await seedContent( id, SEED.nomenclatures ) ).list.entries;

describe( "The errors page", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "explains every CL999 error with the rules that raise it", async () => {
        const response = await get( "/bg/errors" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        const page = response.text;
        const entries = await entriesOf( "CL999" );
        assert.ok( entries.length > 0 );
        for ( const entry of entries ) {
            assert.match( page, new RegExp( `id="${ entry.key }"` ) );
        }
        assert.match( page, /href="\/bg\/specs\/rules\/1\.1\.1#RL\d{3}"/ );

        // The rules of an entry are those whose code is its key exactly as stored, from the production rules only.
        const rules = ( await seedContent( SEED.rules.spec, SEED.rules.production ) ).rules;
        for ( const entry of entries ) {
            const start = page.indexOf( `id="${ entry.key }"` );
            const section = page.slice( start, page.indexOf( "</section>", start ) );
            const raising = rules.filter( ( rule ) => rule.errorCode === entry.key ).map( ( rule ) => rule.id );
            for ( const id of raising ) {
                assert.ok( section.includes( `href="/bg/specs/rules/${ SEED.rules.production }#${ id }"` ), `${ entry.key } lacks ${ id }` );
            }
            assert.equal( [ ...section.matchAll( /\/specs\/rules\/[^"#]*#/g ) ].length, raising.length, `${ entry.key } links ${ raising.length } rules` );
        }
        // A rule version that was never public is never linked.
        assert.ok( [ ...page.matchAll( /\/specs\/rules\/([^"#]*)#/g ) ].every( ( match ) => match[ 1 ] === SEED.rules.production ) );
    } );

    it( "lists the CL998 warnings with their source", async () => {
        const page = ( await get( "/bg/errors" ) ).text;
        const list = ( await seedContent( "CL998", SEED.nomenclatures ) ).list;
        assert.equal( list.columns[ 0 ].title, "Source" );
        assert.equal( list.entries.length, 13 );
        assert.match( page, /<th scope="col">Source<\/th>/ );
        for ( const entry of list.entries ) {
            assert.ok( page.includes( `<code>${ escapeHtml( entry.key ) }</code>` ), `warning ${ entry.key }` );
            assert.ok( page.includes( escapeHtml( entry.description.bg ) ), `description of ${ entry.key }` );
            if ( entry.values[ 0 ] ) {
                assert.ok( page.includes( escapeHtml( entry.values[ 0 ] ) ), `source of ${ entry.key }` );
            }
        }
    } );

    it( "shows the Bulgarian text with a marker where English is missing", async () => {
        const english = await get( "/en/errors" );
        assert.equal( english.status, 200 );
        assertPublic( english, BRIEF );
        assert.match( english.text, /<span lang="bg">[^<]+<\/span> <span class="untranslated">not yet translated<\/span>/ );
        assert.match( english.text, /href="\/en\/specs\/rules\/1\.1\.1#RL\d{3}"/ );
        const bulgarian = ( await get( "/bg/errors" ) ).text;
        assert.equal( bulgarian.includes( "не е преведено" ), false );
    } );

    it( "answers the testing page with 404 while nothing of the three is in testing", async () => {
        for ( const address of [ "/bg/errors/testing", "/en/errors/testing" ] ) {
            const response = await get( address );
            assert.equal( response.status, 404 );
            assertPublic( response, BRIEF );
        }
    } );
} );
