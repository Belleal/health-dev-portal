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
 * The home page and the specifications index (plan 8a, Task 4; design record §8.2), against a real server on a copy of
 * the seed: the versions by stage, what is upcoming in production, the latest publications, and what never shows.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, rowsOf, startPortal } = require( "./support/server" );
const { nomenclaturesRow } = require( "#pages/home" );
const { stageTable } = require( "#pages/stages" );

// The seed has no module with a previous production version (only CL007 does, and a code list is not a table row), so
// the table that shows one is checked on a published spec made here.
describe( "The table of versions by stage", () => {
    const published = { spec: "e-referral", kind: "module", testing: null, production: { number: "2.0.1", expiresOn: null },
        previousProduction: { number: "2.0.0", expiresOn: "2027-04-30" } };

    it( "shows previous production with the date it stays backward compatible until, in each language", () => {
        assert.match( String( stageTable( { lang: "bg", specs: [ published ], link: false } ) ), />2\.0\.0<br><span class="muted">обратно съвместима до 30\.04\.2027</ );
        assert.match( String( stageTable( { lang: "en", specs: [ published ], link: false } ) ), />2\.0\.0<br><span class="muted">backward compatible until 30 Apr 2027</ );
    } );

    it( "marks a testing version red when nothing is in production, and counts such a code list as ahead", () => {
        const fresh = { spec: "e-new", kind: "module", testing: { number: "1.0.0", expiresOn: null }, production: null, previousProduction: null };
        assert.match( String( stageTable( { lang: "en", specs: [ fresh ], link: false } ) ), /<span class="ahead">1\.0\.0<\/span>/ );
        const list = ( spec, testing, production ) => ( { spec: spec, kind: "code-list", testing: testing && { number: testing }, production: production && { number: production }, previousProduction: null } );
        const row = String( nomenclaturesRow( "en", [ list( "CL900", "1.0.0", null ), list( "CL901", "1.5.2", "1.5.1" ), list( "CL902", "1.5.1", "1.5.1" ), list( "CL903", null, "1.5.1" ) ] ) );
        assert.match( row, />4 lists, 2 with a newer testing version</ );
    } );

    it( "links each version to its spec page at that stage when asked, and marks no version ahead without a testing one", () => {
        const table = String( stageTable( { lang: "en", specs: [ published ], link: true } ) );
        assert.match( table, /href="\/en\/specs\/e-referral\/previous-production"/ );
        assert.match( table, /href="\/en\/specs\/e-referral\/production">2\.0\.1</ );
        assert.equal( table.includes( "ahead" ), false );
    } );
} );

describe( "The home page and the specifications index", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "lists the versions by stage, marking a testing version ahead of production", async () => {
        const response = await get( "/bg/" );
        assert.equal( response.status, 200 );
        assertPublic( response, "public, max-age=60" );
        assert.match( response.text, /Е-рецепта[\s\S]*class="ahead"[^>]*>1\.5\.2<[\s\S]*>1\.5\.1</ );
        const row = rowsOf( response.text ).find( ( one ) => one.includes( "Е-рецепта" ) );
        assert.ok( row, "a row for e-Prescription" );
        assert.equal( ( row.match( /class="ahead"/g ) || [] ).length, 1 );
        assert.match( response.text, /Версии по среди/ );
        assert.match( response.text, /Номенклатури[\s\S]*href="\/bg\/nomenclatures"/ );
    } );

    it( "gives the red mark a legend, and the table a row for the code lists with their count", async () => {
        const home = await get( "/bg/" );
        assert.match( home.text, /class="legend"[\s\S]*Червено/ );
        assert.match( home.text, /Номенклатури<\/a><\/td><td colspan="3">\d+ списъка, \d+ с по-нова тестова версия/ );
        assert.match( ( await get( "/en/" ) ).text, /Nomenclatures<\/a><\/td><td colspan="3">\d+ lists, \d+ with a newer testing version/ );
    } );

    it( "shows the next production go-live with its breaking changes and a link to the comparison", async () => {
        const response = await get( "/bg/" );
        assert.match( response.text, /Предстоящо в продукция/ );
        assert.match( response.text, /05\.12\.2026[\s\S]*\/bg\/changes\/e-prescription\/compare\?from=1\.5\.1&amp;to=1\.5\.2/ );
        assert.match( response.text, /Несъвместими промени: [1-9]/ );
        assert.match( ( await get( "/en/" ) ).text, /5 Dec 2026[\s\S]*\/en\/changes\/e-prescription\/compare\?from=1\.5\.1&amp;to=1\.5\.2/ );
    } );

    it( "lists the latest publications, CL007 1.5.34 in production among them", async () => {
        const response = await get( "/bg/" );
        const after = response.text.slice( response.text.indexOf( "Последни издания" ) );
        assert.match( after, /CL007[\s\S]{0,200}1\.5\.34[\s\S]{0,200}продукция/ );
        assert.match( ( await get( "/en/" ) ).text, /Latest publications[\s\S]*CL007[\s\S]{0,200}1\.5\.34[\s\S]{0,200}production/ );
    } );

    it( "never shows a version abandoned before testing, nor one still in development", async () => {
        for ( const path of [ "/bg/", "/en/", "/bg/specs", "/en/specs" ] ) {
            const text = ( await get( path ) ).text;
            assert.equal( text.includes( "CL008" ), false, `${ path } names CL008, whose version was abandoned` );
            assert.equal( /specs\/rules\/(testing|development|implementation)/.test( text ), false, path );
        }
    } );

    it( "is the same page in English, linked both ways with hreflang", async () => {
        const response = await get( "/en/" );
        assertPublic( response, "public, max-age=60" );
        assert.match( response.text, /<html lang="en">/ );
        assert.match( response.text, /Versions by stage/ );
        assert.match( response.text, /hreflang="bg" href="https:\/\/developers\.example\.test\/bg\/"/ );
        assert.match( response.text, /hreflang="en" href="https:\/\/developers\.example\.test\/en\/"/ );
        assert.match( response.text, /hreflang="x-default" href="https:\/\/developers\.example\.test\/bg\/"/ );
        assert.match( response.text, /<a href="\/bg\/" hreflang="bg"/ );
    } );

    it( "lists every module and the rules by stage on the specifications index, each version a link to its page", async () => {
        const response = await get( "/bg/specs" );
        assert.equal( response.status, 200 );
        assertPublic( response, "public, max-age=60" );
        const prescription = rowsOf( response.text ).find( ( one ) => one.includes( "Е-рецепта" ) );
        assert.ok( prescription, "a row for e-Prescription" );
        assert.match( prescription, /href="\/bg\/specs\/e-prescription\/testing"[^>]*>[\s\S]*1\.5\.2/ );
        assert.match( prescription, new RegExp( `href="/bg/specs/e-prescription/production"[^>]*>${ SEED.ePrescription.production.replace( /\./g, "\\." ) }<` ) );
        const rules = rowsOf( response.text ).find( ( one ) => one.includes( "Бизнес правила" ) );
        assert.ok( rules, "a row for the rules" );
        assert.match( rules, /href="\/bg\/specs\/rules\/production"[^>]*>1\.1\.1</ );
        assert.equal( rowsOf( response.text ).some( ( one ) => one.includes( "CL007" ) ), false, "a code list is not a module" );
        assert.match( ( await get( "/en/specs" ) ).text, /<html lang="en">[\s\S]*e-Prescription/ );
    } );
} );
