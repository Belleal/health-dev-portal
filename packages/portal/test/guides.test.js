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
 * The Guides section (plan 8c, decision 4; design record §8.1), on the repository's own content: the index, a guide with
 * its contents, notice, sources and licence, and the addresses that are no guide.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEEDED, assertPublic, get, rawStatus, startPortal } = require( "./support/server" );

const BRIEF = "public, max-age=60";

describe( "The Guides section", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "lists the guides in the register's order, a draft marked, and the planned ones with their old document", async () => {
        const response = await get( "/bg/guides" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        const page = response.text;
        assert.ok( page.indexOf( "href=\"/bg/guides/getting-started\"" ) > 0 );
        assert.ok( page.indexOf( "href=\"/bg/guides/getting-started\"" ) < page.indexOf( "href=\"/bg/guides/environments\"" ) );
        assert.match( page, /Чернова/ );
        assert.match( page, /Предстои/ );
        assert.match( page, /href="https:\/\/www\.his\.bg\/upload\/32\// );
        // A planned guide has no page yet, so it is not linked.
        assert.doesNotMatch( page, /href="\/bg\/guides\/authentication"/ );
    } );

    it( "serves a guide with its contents, its AI-draft notice, its sources and its licence", async () => {
        const response = await get( "/bg/guides/getting-started" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        const page = response.text;
        assert.match( page, /Чернова, изготвена с помощта на изкуствен интелект/ );
        // The notice comes before the title.
        assert.ok( page.indexOf( "Чернова, изготвена" ) < page.indexOf( "<h1>" ) );
        assert.match( page, /<a href="#token">/ );
        assert.match( page, /<h2 id="token">/ );
        assert.match( page, /href="https:\/\/www\.his\.bg\/upload\/239\// );
        assert.match( page, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/deed\.bg"/ );
        assert.match( page, /17\.11\.2026/ );
        assert.match( page, /<link rel="canonical" href="https:\/\/developers\.example\.test\/bg\/guides\/getting-started">/ );
        const english = await get( "/en/guides/getting-started" );
        assert.match( english.text, /A draft written with the help of artificial intelligence/ );
        assert.match( english.text, /deed\.en/ );
        assert.match( english.text, /17 Nov 2026/ );
    } );

    it( "answers an unknown or malformed guide with 404", async () => {
        for ( const address of [ "/bg/guides/nope", "/bg/guides/authentication", "/bg/guides/Getting-Started", "/bg/guides/getting-started/more",
            "/bg/guides/%2e%2e", "/bg/guides/../faq" ] ) {
            assert.equal( await rawStatus( address ), 404, address );
        }
    } );

    it( "names Guides in the top bar, marked on its own pages", async () => {
        for ( const address of [ "/bg/guides", "/bg/guides/environments" ] ) {
            const nav = /<nav class="sections"[\s\S]*?<\/nav>/.exec( ( await get( address ) ).text )[ 0 ];
            assert.match( nav, /<a href="\/bg\/guides" aria-current="true">Ръководства<\/a>/, address );
        }
        const nav = /<nav class="sections"[\s\S]*?<\/nav>/.exec( ( await get( "/en/specs" ) ).text )[ 0 ];
        // In §8.1's order: after Changes.
        assert.match( nav, /href="\/en\/changes"[\s\S]*href="\/en\/guides">Guides<\/a>[\s\S]*href="\/en\/faq">FAQ<\/a>/ );
    } );
} );
