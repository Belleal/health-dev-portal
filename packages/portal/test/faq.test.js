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
 * The FAQ (plan 8c, decision 5; design record §8.1): his.bg's eleven questions, unchanged, by category, each at its own
 * anchor, and in Bulgarian on the English page, marked as not yet translated (§8.4).
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEEDED, assertPublic, get, startPortal } = require( "./support/server" );

const BRIEF = "public, max-age=60";

describe( "The FAQ", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "groups the questions by category, each at its own anchor, and says they are unreviewed", async () => {
        const response = await get( "/bg/faq" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        const page = response.text;
        assert.match( page, /Предстои преглед/ );
        assert.match( page, /<h3 id="token-method">При обръщението към https:\/\/auth\.his\.bg кой метод се използва – POST или GET\?<\/h3>/ );
        assert.match( page, /<p>Заявката е GET и се извършва на адрес https:\/\/auth\.his\.bg\/token<\/p>/ );
        assert.equal( [ ...page.matchAll( /<h3 id="/g ) ].length, 11 );
        // The categories in the register's order, each question under its own.
        const order = [ "Автентикация и подпис", "Съобщения", "Е-направление", "Номенклатури" ].map( ( name ) => page.indexOf( `>${ name }</h2>` ) );
        assert.ok( order.every( ( at, index ) => at > 0 && ( index === 0 || at > order[ index - 1 ] ) ), JSON.stringify( order ) );
        assert.ok( page.indexOf( "id=\"qualification-gp\"" ) > order[ 3 ] );
        assert.match( page, /<a href="#e-referral">Е-направление<\/a>/ );
    } );

    it( "shows the FAQ in Bulgarian on the English page, marked", async () => {
        const response = await get( "/en/faq" );
        assert.equal( response.status, 200 );
        const page = response.text;
        assert.match( page, /These questions and answers were moved unchanged from his\.bg/ );
        assert.match( page, />Authentication and signing<\/h2>/ );
        assert.match( page, /<h3 id="token-method"><span lang="bg">При обръщението към https:\/\/auth\.his\.bg/ );
        assert.match( page, /<div class="prose" lang="bg">\s*<p>Заявката е GET/ );
        assert.match( page, /not yet translated/ );
    } );

    it( "names FAQ in the top bar, marked on its page", async () => {
        const nav = /<nav class="sections"[\s\S]*?<\/nav>/.exec( ( await get( "/bg/faq" ) ).text )[ 0 ];
        assert.match( nav, /<a href="\/bg\/faq" aria-current="true">Въпроси и отговори<\/a>/ );
    } );
} );
