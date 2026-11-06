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
 * A module's page, the business rules, a module's conditions and dictionary (plan 8a, Task 5; decisions 3, 4 and 7),
 * against a real server on a copy of the seed: what each lists, where it is anchored, how it is cached, and which
 * addresses answer 404 or 410.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, rowsOf, seedContent, startPortal } = require( "./support/server" );
const { bySegment, endpointSegment, stageBand } = require( "#pages/version" );

const FIXED = "public, max-age=86400";
const BRIEF = "public, max-age=60";

// Each group of a module's page: its heading and the HTML up to the next.
const segmentsOf = ( text ) => new Map( [ ...text.matchAll( /<section class="segment">\s*<h2>([^<]*)<\/h2>([\s\S]*?)<\/section>/g ) ]
    .map( ( match ) => [ match[ 1 ], match[ 2 ] ] ) );

// The codes a group lists, by the link that opens each of its rows: a row's other cells link the paired message too.
const codesOf = ( group ) => [ ...group.matchAll( /<tr><td><a href="[^"]*\/([A-Z]\d{3})">/g ) ].map( ( match ) => match[ 1 ] );

// Where the seed's messages belong, read from its content: under the segment of their own address, else of their
// paired message's (the controller's ruling on decision 7), else under "other".
const expectedSegments = ( messages, other ) => {
    const segment = ( address ) => address ? `/${ address.split( "/" ).filter( Boolean ).at( -2 ) }` : null;
    const groups = new Map();
    for ( const message of messages ) {
        const paired = messages.find( ( one ) => one.code === message.pairedWith );
        const key = segment( message.address ) || ( paired && segment( paired.address ) ) || other;
        groups.set( key, [ ...( groups.get( key ) || [] ), message.code ] );
    }
    return groups;
};

describe( "An endpoint's segment", () => {

    it( "is the second-to-last segment of the address's path, and none for a message without one", () => {
        assert.equal( endpointSegment( "/v4/eprescription/doctor/issue" ), "/doctor" );
        assert.equal( endpointSegment( "/v4/eprescription/pharmacy/fetch-own-list/" ), "/pharmacy" );
        assert.equal( endpointSegment( "/v4/eprescription/doctor/issue?debug=1" ), "/doctor" );
        assert.equal( endpointSegment( "/issue" ), null );
        assert.equal( endpointSegment( null ), null );
        assert.equal( endpointSegment( "" ), null );
    } );

    it( "groups a response under its request's segment, and only what has neither under other", () => {
        const message = ( code, address, pairedWith = null ) => ( { code: code, address: address, pairedWith: pairedWith } );
        const groups = bySegment( [ message( "X001", "/v1/x/doctor/issue", "X002" ), message( "X002", null, "X001" ), message( "X003", "/v1/x/pharmacy/fetch", "X004" ),
            message( "X004", null, "X003" ), message( "X005", null, null ), message( "X006", null, "X999" ), message( "X007", null, "X005" ), message( "X008", "/v1/x/doctor/cancel" ) ] );
        assert.deepEqual( groups.map( ( group ) => [ group.segment, group.messages.map( ( one ) => one.code ) ] ), [
            [ "/doctor", [ "X001", "X002", "X008" ] ],
            [ "/pharmacy", [ "X003", "X004" ] ],
            // No address; paired with no message of the version; paired with a message that has no address either.
            [ null, [ "X005", "X006", "X007" ] ]
        ] );
    } );
} );

// The seed keeps no module in previous production, and its one testing version has a date and a production one, so the
// band's other cases are checked on versions made here.
describe( "The stage switcher", () => {

    const version = ( stage, number, expiresOn = null ) => ( { spec: "e-referral", stage: stage, number: number, expiresOn: expiresOn } );
    const address = ( stage ) => `/bg/specs/e-referral/${ stage }`;

    it( "marks previous production backward compatible until its date, in each language", () => {
        const stages = [ { stage: "production", version: version( "production", "2.0.1" ) }, { stage: "previous-production", version: version( "previous-production", "2.0.0", "2027-04-30" ) } ];
        const bg = String( stageBand( "bg", { stages: stages, version: stages[ 1 ].version, address: address } ) );
        assert.match( bg, /<a href="\/bg\/specs\/e-referral\/previous-production" aria-current="true">Предишна 2\.0\.0 · обратно съвместима до 30\.04\.2027<\/a>/ );
        assert.match( String( stageBand( "en", { stages: stages, version: stages[ 0 ].version, address: address } ) ), />Previous production 2\.0\.0 · backward compatible until 30 Apr 2027</ );
        // Neither stage is testing's: no date due, no comparison.
        assert.doesNotMatch( bg, /предстои|compare/ );
    } );

    it( "says a testing version has no production date yet, and offers no comparison with a production there is not", () => {
        const stages = [ { stage: "testing", version: version( "testing", "1.0.0" ) } ];
        const band = String( stageBand( "bg", { stages: stages, version: stages[ 0 ].version, address: address, planned: null } ) );
        assert.match( band, /датата за продукция още не е определена/ );
        assert.doesNotMatch( band, /compare/ );
    } );
} );

describe( "A module's pages and the business rules", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "groups a module's messages by endpoint segment", async () => {
        const response = await get( `/bg/specs/e-prescription/${ SEED.ePrescription.production }` );
        assert.equal( response.status, 200 );
        assertPublic( response, FIXED );
        const segments = segmentsOf( response.text );
        assert.deepEqual( [ ...segments.keys() ], [ "/doctor", "/pharmacy", "друго" ] );
        const content = await seedContent( SEED.ePrescription.spec, SEED.ePrescription.production );
        const expected = expectedSegments( content.messages, "друго" );
        for ( const [ segment, group ] of segments ) {
            assert.deepEqual( codesOf( group ), expected.get( segment ), segment );
        }
        // A response is listed with its request, under the endpoint it is returned from; only P099, the error message
        // that answers any request and pairs with none, is left under "other".
        assert.deepEqual( codesOf( segments.get( "/doctor" ) ).slice( 0, 2 ), [ "P001", "P002" ] );
        assert.ok( codesOf( segments.get( "/pharmacy" ) ).includes( "P004" ) );
        assert.deepEqual( codesOf( segments.get( "друго" ) ), [ "P099" ] );
        assert.equal( rowsOf( response.text ).length, content.messages.length );
        for ( const link of [ "conditions", "dictionary" ] ) {
            assert.match( response.text, new RegExp( `href="/bg/specs/e-prescription/1\\.5\\.1/${ link }"` ) );
        }
        assert.match( response.text, /href="\/bg\/errors"/ );
        assert.match( response.text, /href="\/bg\/changes\/e-prescription"/ );
        assert.deepEqual( [ ...segmentsOf( ( await get( "/en/specs/e-prescription/production" ) ).text ).keys() ], [ "/doctor", "/pharmacy", "other" ] );
    } );

    it( "gives a stage page its fixed address as canonical, and caches it briefly", async () => {
        for ( const [ stage, number ] of [ [ "production", SEED.ePrescription.production ], [ "testing", SEED.ePrescription.testing ] ] ) {
            for ( const tail of [ "", "/P001", "/P001/conditions", "/P001/elements/contents/prescription/lrn", "/conditions", "/dictionary" ] ) {
                const response = await get( `/bg/specs/e-prescription/${ stage }${ tail }` );
                assert.equal( response.status, 200, `${ stage }${ tail }` );
                assertPublic( response, BRIEF );
                const fixed = `/specs/e-prescription/${ number }${ tail }`;
                assert.match( response.text, new RegExp( `<link rel="canonical" href="https://developers\\.example\\.test/bg${ fixed.replace( /\./g, "\\." ) }">` ), `${ stage }${ tail }` );
                assert.match( response.text, new RegExp( `hreflang="en" href="https://developers\\.example\\.test/en${ fixed.replace( /\./g, "\\." ) }"` ) );
                // The language switch stays on the stage address.
                assert.match( response.text, new RegExp( `<a href="/en/specs/e-prescription/${ stage }${ tail.replace( /\./g, "\\." ) }" hreflang="en"` ) );
                const pinned = await get( `/bg${ fixed }` );
                assert.equal( pinned.status, 200, fixed );
                assertPublic( pinned, FIXED );
            }
        }
    } );

    it( "switches between the kept stages, and says when a testing version is due in production", async () => {
        const testing = await get( "/bg/specs/e-prescription/testing/P001" );
        const band = /<div class="band">([\s\S]*?)<\/div>/.exec( testing.text )[ 1 ];
        assert.match( band, /<a href="\/bg\/specs\/e-prescription\/testing\/P001" aria-current="true">Тестова 1\.5\.2<\/a>/ );
        assert.match( band, /<a href="\/bg\/specs\/e-prescription\/production\/P001">Продукция 1\.5\.1<\/a>/ );
        assert.match( band, /предстои в продукция на 05\.12\.2026/ );
        assert.match( band, /href="\/bg\/changes\/e-prescription\/compare\?from=1\.5\.1&amp;to=1\.5\.2"/ );
        assert.match( ( await get( "/en/specs/e-prescription/1.5.2" ) ).text, /due in production on 5 Dec 2026/ );
        const production = /<div class="band">([\s\S]*?)<\/div>/.exec( ( await get( "/bg/specs/e-prescription/1.5.1/P001/conditions" ) ).text )[ 1 ];
        assert.match( production, /<a href="\/bg\/specs\/e-prescription\/production\/P001\/conditions" aria-current="true">Продукция 1\.5\.1<\/a>/ );
        assert.doesNotMatch( production, /предстои/ );
    } );

    it( "answers a version that was never public, and an unknown message or element, with 404", async () => {
        // Staff-only stages have no public address at all; a development version has no number to be found by.
        for ( const path of [ "/bg/specs/rules/development", "/bg/specs/e-prescription/implementation", "/bg/specs/e-prescription/1.5.1/P999",
            "/bg/specs/e-prescription/1.5.1/P001/elements/none", "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription/lrn~2",
            "/bg/specs/e-prescription/9.9.9", "/bg/specs/e-unknown/production", "/bg/specs/rules/testing", "/bg/specs/rules/production/conditions",
            "/bg/specs/rules/production/dictionary", "/bg/specs/rules/1.1.1/P001", "/en/specs/nomenclatures/production" ] ) {
            const response = await get( path );
            assert.equal( response.status, 404, path );
            assertPublic( response, BRIEF );
        }
    } );

    it( "answers a retired version's fixed address with 410 and a link to its changes", async () => {
        for ( const tail of [ "", "/P001", "/P001/elements/contents/prescription/lrn", "/conditions", "/dictionary" ] ) {
            const response = await get( `/bg/specs/e-prescription/${ SEED.history }${ tail }` );
            assertPublic( response, FIXED );
            assert.equal( response.status, 410, tail );
            assert.match( response.text, /href="\/bg\/changes\/e-prescription"/ );
        }
        assert.match( ( await get( "/en/specs/rules/1.1.0" ) ).text, /href="\/en\/changes\/rules"/ );
    } );

    it( "lists a module's conditions with an anchor each, and the module's rules with their error codes", async () => {
        const content = await seedContent( SEED.ePrescription.spec, SEED.ePrescription.production );
        const conditions = await get( "/bg/specs/e-prescription/1.5.1/conditions" );
        assertPublic( conditions, FIXED );
        assert.equal( rowsOf( conditions.text ).length, content.conditions.length );
        for ( const condition of content.conditions ) {
            assert.match( conditions.text, new RegExp( `<tr id="${ condition.id }">` ) );
        }
        // The canonical form where the condition was read, and every element that names it, at its own address.
        assert.match( conditions.text, /<tr id="CDP01">[\s\S]*?IF &#39;prescription\.category&#39;\.value IN \[&#39;T2&#39;, &#39;T3&#39;\][\s\S]*?href="\/bg\/specs\/e-prescription\/1\.5\.1\/P001\/elements\/contents\/prescription\/isProtocolBased"/ );

        const rules = await get( `/bg/specs/rules/${ SEED.rules.production }` );
        assert.equal( rules.status, 200 );
        assertPublic( rules, FIXED );
        const published = await seedContent( SEED.rules.spec, SEED.rules.production );
        assert.equal( rowsOf( rules.text ).length, published.rules.length );
        for ( const rule of published.rules ) {
            assert.match( rules.text, new RegExp( `<tr id="${ rule.id }">` ) );
        }
        assert.match( rules.text, /<tr id="RL001">[\s\S]*?<a href="\/bg\/errors#E002">E002<\/a>/ );
        // Its lines are kept, and an English page marks the Bulgarian definition untranslated.
        assert.match( ( await get( "/en/specs/rules/production" ) ).text, /<tr id="RL002">[\s\S]*?<span lang="bg">Стойността на полето трябва да бъде число по-голямо от 0<\/span> <span class="untranslated">not yet translated<\/span>/ );
    } );

    it( "lists a module's dictionary, each text in the page's language or marked", async () => {
        const content = await seedContent( SEED.ePrescription.spec, SEED.ePrescription.production );
        const response = await get( "/bg/specs/e-prescription/production/dictionary" );
        assert.equal( rowsOf( response.text ).length, content.dictionary.length );
        assert.match( response.text, /<tr id="PMI">[\s\S]*?<span lang="en">Personal Medical Identifier<\/span> <span class="untranslated">не е преведено<\/span>[\s\S]*?УИН на лекар/ );
        assert.match( ( await get( "/en/specs/e-prescription/production/dictionary" ) ).text, /<tr id="PMI">[\s\S]*?Personal Medical Identifier[\s\S]*?<span lang="bg">УИН на лекар<\/span> <span class="untranslated">not yet translated<\/span>/ );
    } );
} );
