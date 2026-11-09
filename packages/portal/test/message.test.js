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
 * The message page (plan 8a, Task 5; decision 7, mockup M1): the tree table with every element at its own address, the
 * detail panel, the markers of a testing page, the Conditions and Changes tabs, and the constraints as a reader reads
 * them. The markers' placement and the constraints are checked on content made here as well, since the seed removes no
 * element and has no number with more than one digit.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, rowOf, rowsOf, seedContent, startPortal } = require( "./support/server" );
const { escapeHtml } = require( "@ti-engine/web-content/html" );
const { describeConstraint, spellConstraint } = require( "#format" );
const { elementMarkers, treeTable } = require( "#pages/message-tree" );

const BRIEF = "public, max-age=60";

const walk = ( nodes, out = [] ) => {
    for ( const node of nodes ) {
        out.push( node );
        walk( node.children, out );
    }
    return out;
};

// A message's elements, read from the seed: what the page must show, one row each.
const elementsOf = async ( code, number = SEED.ePrescription.production ) => walk( ( await seedContent( SEED.ePrescription.spec, number ) ).messages
    .find( ( one ) => one.code === code ).elements );

// The markers of a row, by class.
const markersOf = ( row ) => [ ...row.matchAll( /<span class="badge (new|changed|removed)">/g ) ].map( ( match ) => match[ 1 ] );

describe( "Constraints as a reader reads them", () => {

    const string = ( constraint ) => ( { kind: "field", dataType: "String", constraint: { raw: "", ...constraint } } );

    it( "states a number's max= as a count of digits", () => {
        // HEL-26 (Boris, 2026-11-06): on a number, the workbooks' max= counts digits, as sick-leave days' max=2 does.
        const days = { kind: "field", dataType: "Unsigned Int", constraint: { raw: "max=2", maxValue: 2 } };
        assert.equal( String( describeConstraint( days, "bg" ) ), "до 2 цифри" );
        assert.equal( String( describeConstraint( days, "en" ) ), "up to 2 digits" );
        const one = { kind: "field", dataType: "Unsigned Int", constraint: { raw: "max=1", maxValue: 1 } };
        assert.equal( String( describeConstraint( one, "bg" ) ), "до 1 цифра" );
        assert.equal( String( describeConstraint( one, "en" ) ), "up to 1 digit" );
        assert.equal( String( describeConstraint( { kind: "field", dataType: "Decimal", constraint: { raw: "min=2, max=5", minValue: 2, maxValue: 5 } }, "en" ) ), "2–5 digits" );
    } );

    it( "states a string's length, its character class with its meaning, and its format", () => {
        assert.equal( String( describeConstraint( string( { maxLength: 36 } ), "bg" ) ), "≤ 36" );
        assert.equal( String( describeConstraint( string( { minLength: 2 } ), "bg" ) ), "≥ 2" );
        assert.equal( String( describeConstraint( string( { minLength: 2, maxLength: 36 } ), "bg" ) ), "2–36" );
        assert.equal( String( describeConstraint( string( { minLength: 36, maxLength: 36 } ), "bg" ) ), "= 36" );
        assert.equal( String( describeConstraint( string( { maxLength: 36, charset: "an" } ), "en" ) ),
            "≤ 36, <abbr title=\"Latin letters, digits, hyphen and space\">an</abbr>" );
        assert.match( String( describeConstraint( string( { charset: "a" } ), "bg" ) ), /<abbr title="букви, включително кирилица, тире и интервал">a<\/abbr>/ );
        assert.match( String( describeConstraint( string( { charset: "n" } ), "bg" ) ), /<abbr title="цифри">n<\/abbr>/ );
        // `ans` has no published definition: it is shown as written, with no meaning made up for it.
        assert.equal( String( describeConstraint( string( { charset: "ans" } ), "en" ) ), "ans" );
        assert.equal( String( describeConstraint( { kind: "field", dataType: "Date", constraint: { raw: "YYMMDD", format: "yymmdd" } }, "bg" ) ), "YYMMDD" );
        assert.equal( String( describeConstraint( string( { format: "base64" } ), "bg" ) ), "base64" );
        assert.equal( String( describeConstraint( string( { charset: "<b>" } ), "bg" ) ), "&lt;b&gt;" );
        assert.equal( String( describeConstraint( { kind: "group", dataType: null, constraint: null }, "bg" ) ), "" );
    } );

    it( "shows a constraint the importer could not split as the workbook writes it, in the tree and in the panel", () => {
        // 203 elements of the published workbooks carry only `raw` (measured, final review I1): a date-time's pattern, a
        // string's `Base64Encoded`, a number's `max-length=2`. They showed as no constraint at all.
        const dateTime = { kind: "field", dataType: "Date and Time", constraint: { raw: "YYYY-MM-DDThh:mm" } };
        const encoded = { kind: "field", dataType: "String", constraint: { raw: "Base64Encoded" } };
        assert.equal( String( describeConstraint( dateTime, "bg" ) ), "<code>YYYY-MM-DDThh:mm</code>" );
        assert.equal( String( describeConstraint( encoded, "en" ) ), "<code>Base64Encoded</code>" );
        assert.equal( String( describeConstraint( { kind: "field", dataType: "String", constraint: { raw: "<b>" } }, "en" ) ), "<code>&lt;b&gt;</code>" );
        assert.deepEqual( spellConstraint( dateTime, "bg" ), [ "както е записано в работната книга: YYYY-MM-DDThh:mm" ] );
        assert.deepEqual( spellConstraint( encoded, "en" ), [ "as the workbook writes it: Base64Encoded" ] );
        // A blank raw is no constraint, as before.
        assert.equal( String( describeConstraint( { kind: "field", dataType: "String", constraint: { raw: " " } }, "bg" ) ), "" );
        assert.deepEqual( spellConstraint( { kind: "field", dataType: "String", constraint: { raw: "" } }, "bg" ), [] );
        // Where a part was split, the raw text is not shown beside it: nothing changes.
        const split = string( { raw: "max=36, an", maxLength: 36, charset: "an" } );
        assert.equal( String( describeConstraint( split, "en" ) ), "≤ 36, <abbr title=\"Latin letters, digits, hyphen and space\">an</abbr>" );
        assert.deepEqual( spellConstraint( split, "en" ), [ "up to 36 characters", "characters an: Latin letters, digits, hyphen and space" ] );
    } );
} );

describe( "The tree's markers", () => {

    const field = ( path, extra = {} ) => ( { identity: `${ path }@value`, path: path, depth: path.split( "/" ).length - 1, kind: "field", name: { bg: null, en: null },
        requirement: "O", cardinality: { min: 0, max: 1 }, dataType: "String", constraint: null, fixedValue: null, defaultValue: null, rules: [], conditions: [],
        codeList: null, tag: path.split( "/" ).at( -1 ), attribute: "value", description: { bg: null, en: null }, children: [], ...extra } );
    const group = ( path, children ) => ( { ...field( path ), identity: path, kind: "group", dataType: null, attribute: null, children: children } );
    const message = ( elements ) => ( { code: "X001", title: { bg: null, en: null }, address: null, elements: elements } );
    // `base` null is a testing version with nothing in production; `undefined`, a page that is not marked at all.
    const render = ( base, current ) => rowsOf( String( treeTable( { lang: "bg", spec: "e-test", at: "testing", message: current,
        markers: base === undefined ? null : elementMarkers( base, current ), selected: null, linked: new Map() } ) ) );
    const pathOf = ( row ) => / data-path="([^"]*)"/.exec( row )[ 1 ];

    it( "puts a removed element under its former parent, after that parent's current children, struck through", () => {
        const base = message( [ group( "a", [ field( "a/x" ), field( "a/gone" ), field( "a/y" ) ] ), field( "b" ), field( "top" ) ] );
        const current = message( [ group( "a", [ field( "a/x" ), field( "a/y", { requirement: "R" } ), field( "a/new" ) ] ), field( "b" ) ] );
        const rows = render( base, current );
        assert.deepEqual( rows.map( pathOf ), [ "a", "a/x", "a/y", "a/new", "a/gone", "b", "top" ] );
        assert.deepEqual( rows.map( markersOf ), [ [], [], [ "changed" ], [ "new" ], [ "removed" ], [], [ "removed" ] ] );
        const gone = rows[ 4 ];
        assert.match( gone, /^<tr class="removed" data-depth="2" data-path="a\/gone">/ );
        // A removed element has no address in this version: nothing to select.
        assert.doesNotMatch( gone, /href=/ );
        assert.match( rows[ 6 ], /^<tr class="removed" data-depth="1" data-path="top">/ );
    } );

    it( "nests what was removed with its removed parent, and marks nothing without a version to compare with", () => {
        const base = message( [ group( "a", [ field( "a/x" ) ] ), group( "g", [ field( "g/one" ), group( "g/inner", [ field( "g/inner/two" ) ] ) ] ) ] );
        const current = message( [ group( "a", [ field( "a/x" ) ] ) ] );
        const rows = render( base, current );
        assert.deepEqual( rows.map( pathOf ), [ "a", "a/x", "g", "g/one", "g/inner", "g/inner/two" ] );
        assert.deepEqual( rows.slice( 2 ).map( ( row ) => / data-depth="(\d+)"/.exec( row )[ 1 ] ), [ "1", "2", "2", "3" ] );
        assert.ok( rows.slice( 2 ).every( ( row ) => row.startsWith( "<tr class=\"removed\"" ) ) );
        assert.deepEqual( render( undefined, current ).flatMap( markersOf ), [] );
        // Against a production that has none of it, everything is new.
        assert.deepEqual( render( null, current ).flatMap( markersOf ), [ "new", "new" ] );
    } );
} );

describe( "The message page", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "renders every element of P001 with its requirement, count, type, constraints and links", async () => {
        const response = await get( "/bg/specs/e-prescription/1.5.1/P001" );
        assertPublic( response, BRIEF );
        assert.equal( rowsOf( response.text ).length, ( await elementsOf( "P001" ) ).length );
        assert.match( rowOf( response.text, "contents/prescription/lrn" ), /R[\s\S]*1\.\.1[\s\S]*≤ 36/ );
        // The list as it is in production today (design record §4.8, ruling F2), not the 1.5.33 that 1.5.1's frozen
        // resolution record names, which is previous production now and is retired with the next update.
        assert.match( rowOf( response.text, "contents/prescription/category" ), /href="\/bg\/nomenclatures\/CL007\/1\.5\.34"/ );
        assert.match( rowOf( ( await get( "/bg/specs/e-prescription/production/P001" ) ).text, "contents/prescription/category" ), /href="\/bg\/nomenclatures\/CL007\/1\.5\.34"/ );
        // A rule at the rules version of the stage shown, a condition at its anchor on the Conditions tab.
        assert.match( rowOf( response.text, "contents/prescription/authoredOn" ), /href="\/bg\/specs\/rules\/1\.1\.1#RL071">RL071</ );
        assert.match( rowOf( response.text, "contents/prescription/isProtocolBased" ), /href="\/bg\/specs\/e-prescription\/1\.5\.1\/P001\/conditions#CDP01">CDP01</ );
        assert.match( rowOf( response.text, "contents/prescription/lrn" ), /<td class="R"><abbr title="задължителен">R<\/abbr><\/td>/ );
        assert.match( rowOf( response.text, "contents/prescription/lrn" ), /<td>String<\/td>/ );
        assert.match( rowOf( response.text, "contents/prescription/lrn" ), /<abbr title="латински букви, цифри, тире и интервал">an<\/abbr>/ );
        assert.match( rowOf( response.text, "contents/prescription" ), /група/ );
        // The version in testing reads the list at the nearest stage from testing on: CL007 has nothing in testing, so
        // production's. So do its rules, which are in production only.
        for ( const at of [ "1.5.2", "testing" ] ) {
            const testing = ( await get( `/bg/specs/e-prescription/${ at }/P001` ) ).text;
            assert.match( rowOf( testing, "contents/prescription/category" ), /href="\/bg\/nomenclatures\/CL007\/1\.5\.34"/, at );
            assert.match( rowOf( testing, "contents/prescription/authoredOn" ), /href="\/bg\/specs\/rules\/1\.1\.1#RL071">RL071</, at );
        }
        // The heading, the address line, and the tabs.
        assert.match( response.text, /<h1>P001 · Заявка за създаване на Е-рецепта<\/h1>/ );
        assert.match( response.text, /<code>\/v4\/eprescription\/doctor\/issue<\/code>/ );
        assert.match( response.text, /<a href="\/bg\/specs\/e-prescription\/1\.5\.1\/P001" aria-current="page">Елементи<\/a>/ );
        // Without the script the tree is whole: every toggle is hidden until the script shows it.
        assert.ok( [ ...response.text.matchAll( /<button class="twisty"[^>]*>/g ) ].every( ( match ) => / hidden(?:[ >])/.test( match[ 0 ] ) ) );
    } );

    it( "gives every element an address of its own, and the sidebar the module's messages by segment", async () => {
        const response = await get( "/bg/specs/e-prescription/1.5.1/P001" );
        const links = [ ...response.text.matchAll( /<tr\b[^>]*>\s*<td>(?:<button[^>]*><\/button>)?<a href="([^"]+)"/g ) ].map( ( match ) => match[ 1 ] );
        assert.equal( links.length, ( await elementsOf( "P001" ) ).length );
        assert.equal( new Set( links ).size, links.length );
        // The attribute shares its field's path, and the choice's two variants share theirs.
        assert.ok( links.includes( "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription/group/medication/medicationCode~2" ) );
        assert.ok( links.includes( "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription/group/medication/dosageInstruction/doseQuantityCode~3" ) );
        const sidebar = /<aside class="sidebar"[^>]*>([\s\S]*?)<\/aside>/.exec( response.text )[ 1 ];
        assert.match( sidebar, /<h2>\/doctor<\/h2>[\s\S]*?<a href="\/bg\/specs\/e-prescription\/1\.5\.1\/P001" aria-current="true">P001/ );
        // A response sits with its request; "other" keeps only what has neither an address nor a paired one with it.
        const groups = new Map( [ ...sidebar.matchAll( /<h2>([^<]*)<\/h2>\s*<ul>([\s\S]*?)<\/ul>/g ) ]
            .map( ( match ) => [ match[ 1 ], [ ...match[ 2 ].matchAll( /<li><a href="[^"]*\/([A-Z]\d{3})"/g ) ].map( ( one ) => one[ 1 ] ) ] ) );
        assert.deepEqual( [ ...groups.keys() ], [ "/doctor", "/pharmacy", "друго" ] );
        assert.deepEqual( groups.get( "/doctor" ), [ "P001", "P002", "P007", "P008", "P017", "P018", "P019", "P020" ] );
        assert.ok( groups.get( "/pharmacy" ).includes( "P004" ) && groups.get( "/pharmacy" ).includes( "P022" ) );
        assert.deepEqual( groups.get( "друго" ), [ "P099" ] );
        assert.match( sidebar, /href="\/bg\/specs\/e-prescription\/1\.5\.1\/conditions"[\s\S]*href="\/bg\/specs\/e-prescription\/1\.5\.1\/dictionary"[\s\S]*href="\/bg\/errors"/ );
    } );

    it( "selects an element at its own address and fills the panel", async () => {
        const lrn = ( await elementsOf( "P001" ) ).find( ( one ) => one.path === "contents/prescription/lrn" );
        const response = await get( "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription/lrn" );
        assertPublic( response, BRIEF );
        assert.match( rowOf( response.text, "contents/prescription/lrn" ), /^<tr aria-current="true"/ );
        assert.equal( rowsOf( response.text ).filter( ( row ) => row.includes( "aria-current" ) ).length, 1 );
        const panel = /<aside class="panel"[^>]*>([\s\S]*?)<\/aside>/.exec( response.text )[ 1 ];
        assert.ok( panel.includes( lrn.description.bg ), "the panel shows the description" );
        assert.match( panel, /<code>contents\/prescription\/lrn@value<\/code>/ );
        assert.match( panel, /R · 1\.\.1/ );
        assert.match( panel, /до 36 знака/ );
        assert.match( panel, /&lt;nhis:lrn value=&quot;…&quot;\/&gt;/ );
        assert.match( panel, /<button class="copy" type="button" data-copy="\/bg\/specs\/e-prescription\/1\.5\.1\/P001\/elements\/contents\/prescription\/lrn" data-copied="Копирано" hidden>Копирай връзка<\/button>/ );
        // "Used also in": the other messages with an element at the same path, each linked to it.
        const sender = ( await get( "/bg/specs/e-prescription/1.5.1/P001/elements/header/sender" ) ).text;
        assert.match( /<aside class="panel"[^>]*>([\s\S]*?)<\/aside>/.exec( sender )[ 1 ], /href="\/bg\/specs\/e-prescription\/1\.5\.1\/P002\/elements\/header\/sender">P002</ );
        // An attribute's own address selects the attribute, not its field.
        const attribute = await get( "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription/group/medication/medicationCode~2" );
        const selected = rowsOf( attribute.text ).filter( ( row ) => row.includes( "aria-current" ) );
        assert.equal( selected.length, 1 );
        assert.match( selected[ 0 ], /@name/ );
        assert.match( attribute.text, /&lt;nhis:medicationCode name=&quot;…&quot;\/&gt;/ );
        // A group's XML is elided.
        assert.match( ( await get( "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription" ) ).text, /&lt;nhis:prescription&gt;…&lt;\/nhis:prescription&gt;/ );
        // With no element selected, the panel describes the message.
        assert.match( /<aside class="panel"[^>]*>([\s\S]*?)<\/aside>/.exec( ( await get( "/bg/specs/e-prescription/1.5.1/P001" ) ).text )[ 1 ], /href="\/bg\/specs\/e-prescription\/1\.5\.1\/P002"/ );
    } );

    it( "shows a Bulgarian description on the English page, marked untranslated", async () => {
        const lrn = ( await elementsOf( "P001" ) ).find( ( one ) => one.path === "contents/prescription/lrn" );
        assert.equal( lrn.description.en, null );
        const response = await get( "/en/specs/e-prescription/1.5.1/P001/elements/contents/prescription/lrn" );
        assert.equal( response.status, 200 );
        const panel = /<aside class="panel"[^>]*>([\s\S]*?)<\/aside>/.exec( response.text )[ 1 ];
        assert.ok( panel.includes( `<p class="description"><span lang="bg">${ escapeHtml( lrn.description.bg ) }</span> <span class="untranslated">not yet translated</span></p>` ) );
        assert.match( panel, /up to 36 characters/ );
        // The Bulgarian page shows the same text as its own, unmarked.
        const bg = /<aside class="panel"[^>]*>([\s\S]*?)<\/aside>/.exec( ( await get( "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription/lrn" ) ).text )[ 1 ];
        assert.ok( bg.includes( `<p class="description">${ escapeHtml( lrn.description.bg ) }</p>` ) );
    } );

    it( "marks a testing page's elements new, changed or removed against production", async () => {
        const response = await get( "/bg/specs/e-prescription/testing/P001" );
        assert.equal( rowsOf( response.text ).length, ( await elementsOf( "P001", SEED.ePrescription.testing ) ).length );
        const marked = rowsOf( response.text ).filter( ( row ) => markersOf( row ).length > 0 );
        assert.equal( marked.length, SEED.ePrescriptionChanges.length );
        for ( const change of SEED.ePrescriptionChanges ) {
            assert.deepEqual( markersOf( rowOf( response.text, change.path ) ), [ change.aspect === "added" ? "new" : "changed" ], change.path );
        }
        assert.match( rowOf( response.text, "contents/prescription/exampleNote" ), /<span class="badge new">ново<\/span>/ );
        // Production and its fixed address are not marked, nor is a page by number of a version that is not in testing.
        for ( const path of [ "/bg/specs/e-prescription/production/P001", "/bg/specs/e-prescription/1.5.1/P001" ] ) {
            assert.deepEqual( rowsOf( ( await get( path ) ).text ).flatMap( markersOf ), [], path );
        }
        // The testing version's fixed address is the same version, marked the same.
        assert.equal( rowsOf( ( await get( "/bg/specs/e-prescription/1.5.2/P001" ) ).text ).flatMap( markersOf ).length, SEED.ePrescriptionChanges.length );
    } );

    it( "lists the message's changes against production on its Changes tab", async () => {
        const response = await get( "/bg/specs/e-prescription/testing/P001/changes" );
        assert.equal( response.status, 200 );
        for ( const change of SEED.ePrescriptionChanges ) {
            assert.match( response.text, change.pattern );
        }
        assert.match( response.text, /<a href="\/bg\/specs\/e-prescription\/testing\/P001\/changes" aria-current="page">Промени<\/a>/ );
        assert.match( response.text, /href="\/bg\/changes\/e-prescription\/compare\?from=1\.5\.1&amp;to=1\.5\.2"/ );
        const production = await get( "/en/specs/e-prescription/production/P001/changes" );
        assert.equal( production.status, 200 );
        assert.match( production.text, /href="\/en\/changes\/e-prescription"/ );
    } );

    it( "lists a message's conditions with an anchor each", async () => {
        const named = [ ...new Set( ( await elementsOf( "P001" ) ).flatMap( ( one ) => one.conditions ) ) ];
        assert.ok( named.length > 20 );
        const response = await get( "/bg/specs/e-prescription/1.5.1/P001/conditions" );
        assertPublic( response, BRIEF );
        assert.equal( rowsOf( response.text ).length, named.length );
        for ( const id of named ) {
            assert.match( response.text, new RegExp( `<tr id="${ id }">` ) );
        }
        assert.match( response.text, /<tr id="CDP01">[\s\S]*?href="\/bg\/specs\/e-prescription\/1\.5\.1\/P001\/elements\/contents\/prescription\/isProtocolBased">isProtocolBased</ );
        // A condition of another message is not this message's.
        const p003 = [ ...new Set( ( await elementsOf( "P003" ) ).flatMap( ( one ) => one.conditions ) ) ].filter( ( id ) => !named.includes( id ) );
        for ( const id of p003 ) {
            assert.doesNotMatch( response.text, new RegExp( `<tr id="${ id }">` ) );
        }
    } );

    it( "states a number's max= as a count of digits on the page", async () => {
        const response = await get( "/bg/specs/e-prescription/1.5.1/P001" );
        assert.match( rowOf( response.text, "contents/prescription/allowedRepeatsNumber" ), /<td>до 1 цифра<\/td>/ );
        assert.match( rowOf( ( await get( "/en/specs/e-prescription/1.5.1/P001" ) ).text, "contents/prescription/allowedRepeatsNumber" ), /<td>up to 1 digit<\/td>/ );
    } );
} );
