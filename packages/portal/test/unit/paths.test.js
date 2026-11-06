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
 * Every address the site has (plan 8a, decision 3): each builder, and `parseAddress`, which routes.js dispatches on and
 * which must give back exactly what built an address.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const paths = require( "#paths" );

const { changes, compare, conditions, dictionary, download, element, elementSlugs, errors, feed, home, list, lists, message, other, parseAddress,
    parseAt, spec, specs } = paths;

// A Cyrillic path segment, as an element's path may hold one, encoded the way a browser sends it.
const NOTE = encodeURIComponent( "бележка" );

const ROUND_TRIPS = [
    [ () => home( "bg" ), { lang: "bg", page: "home" } ],
    [ () => home( "en" ), { lang: "en", page: "home" } ],
    [ () => specs( "en" ), { lang: "en", page: "specs" } ],
    [ () => spec( "bg", "e-prescription", "production" ), { lang: "bg", page: "spec", spec: "e-prescription", at: "production" } ],
    [ () => spec( "en", "rules", "1.1.1" ), { lang: "en", page: "spec", spec: "rules", at: "1.1.1" } ],
    [ () => conditions( "bg", "e-prescription", "1.5.1" ), { lang: "bg", page: "conditions", spec: "e-prescription", at: "1.5.1" } ],
    [ () => dictionary( "en", "e-prescription", "testing" ), { lang: "en", page: "dictionary", spec: "e-prescription", at: "testing" } ],
    [ () => message( "bg", "e-prescription", "previous-production", "P001" ),
        { lang: "bg", page: "message", spec: "e-prescription", at: "previous-production", code: "P001", tab: "elements", slug: null } ],
    [ () => message( "en", "e-prescription", "1.5.1", "P001", "conditions" ),
        { lang: "en", page: "message", spec: "e-prescription", at: "1.5.1", code: "P001", tab: "conditions", slug: null } ],
    [ () => message( "bg", "e-prescription", "1.5.1", "P002", "changes" ),
        { lang: "bg", page: "message", spec: "e-prescription", at: "1.5.1", code: "P002", tab: "changes", slug: null } ],
    [ () => element( "bg", "e-prescription", "1.5.1", "P001", "contents/prescription/lrn" ),
        { lang: "bg", page: "message", spec: "e-prescription", at: "1.5.1", code: "P001", tab: "elements", slug: "contents/prescription/lrn" } ],
    [ () => element( "en", "e-prescription", "testing", "P001", `contents/${ NOTE }~2` ),
        { lang: "en", page: "message", spec: "e-prescription", at: "testing", code: "P001", tab: "elements", slug: `contents/${ NOTE }~2` } ],
    [ () => lists( "bg" ), { lang: "bg", page: "lists", query: { q: null } } ],
    [ () => lists( "en", { q: "рецепта" } ), { lang: "en", page: "lists", query: { q: "рецепта" } } ],
    [ () => list( "bg", "CL007", "production" ), { lang: "bg", page: "list", id: "CL007", at: "production", query: { q: null, expired: false, page: 1 } } ],
    [ () => list( "en", "CL011", "1.5.33", { q: "A&B", expired: true, page: 3 } ),
        { lang: "en", page: "list", id: "CL011", at: "1.5.33", query: { q: "A&B", expired: true, page: 3 } } ],
    [ () => download( "CL007", "1.5.34", "json" ), { lang: null, page: "download", id: "CL007", at: "1.5.34", ext: "json" } ],
    [ () => download( "CL011", "production", "csv" ), { lang: null, page: "download", id: "CL011", at: "production", ext: "csv" } ],
    [ () => errors( "bg" ), { lang: "bg", page: "errors", testing: false } ],
    [ () => errors( "en", true ), { lang: "en", page: "errors", testing: true } ],
    [ () => changes( "bg" ), { lang: "bg", page: "changes", spec: null } ],
    [ () => changes( "en", "e-prescription" ), { lang: "en", page: "changes", spec: "e-prescription" } ],
    [ () => changes( "bg", "CL007" ), { lang: "bg", page: "changes", spec: "CL007" } ],
    [ () => compare( "bg", "e-prescription", "1.5.1", "1.5.2" ), { lang: "bg", page: "compare", spec: "e-prescription", from: "1.5.1", to: "1.5.2" } ],
    [ () => feed( "bg" ), { lang: "bg", page: "feed", spec: null } ],
    [ () => feed( "en", "CL007" ), { lang: "en", page: "feed", spec: "CL007" } ]
];

describe( "Addresses", () => {

    it( "turns every address back into what built it", () => {
        for ( const [ build, parts ] of ROUND_TRIPS ) {
            assert.deepEqual( parseAddress( build() ), parts, build() );
        }
    } );

    it( "writes the addresses of decision 3 exactly", () => {
        assert.equal( home( "bg" ), "/bg/" );
        assert.equal( spec( "bg", "e-prescription", "1.5.1" ), "/bg/specs/e-prescription/1.5.1" );
        assert.equal( message( "bg", "e-prescription", "1.5.1", "P001" ), "/bg/specs/e-prescription/1.5.1/P001" );
        assert.equal( element( "bg", "e-prescription", "1.5.1", "P001", "contents/prescription/lrn" ),
            "/bg/specs/e-prescription/1.5.1/P001/elements/contents/prescription/lrn" );
        assert.equal( list( "bg", "CL011", "1.5.33", { q: "a b", expired: true, page: 2 } ), "/bg/nomenclatures/CL011/1.5.33?q=a%20b&expired=1&page=2" );
        // A default is left out, so one page has one address.
        assert.equal( list( "bg", "CL011", "1.5.33", { q: "", expired: false, page: 1 } ), "/bg/nomenclatures/CL011/1.5.33" );
        assert.equal( download( "CL007", "1.5.34", "csv" ), "/downloads/nomenclatures/CL007/1.5.34.csv" );
        assert.equal( errors( "en", true ), "/en/errors/testing" );
        assert.equal( compare( "bg", "e-prescription", "1.5.1", "1.5.2" ), "/bg/changes/e-prescription/compare?from=1.5.1&to=1.5.2" );
        assert.equal( feed( "bg" ), "/bg/changes/feed.atom" );
        assert.equal( feed( "bg", "e-prescription" ), "/bg/changes/e-prescription/feed.atom" );
    } );

    it( "reads a browser's spelling of the same address as that address", () => {
        // Lower-case hex and an unencoded letter both name the element whose slug is upper-case hex.
        assert.equal( parseAddress( `/bg/specs/e-prescription/1.5.1/P001/elements/contents/${ NOTE.toLowerCase() }` ).slug, `contents/${ NOTE }` );
        assert.equal( parseAddress( "/bg/specs/e-prescription/1.5.1/P001/elements/contents/бележка" ).slug, `contents/${ NOTE }` );
        assert.deepEqual( parseAddress( "/bg/?utm=x" ), { lang: "bg", page: "home" } );
        assert.deepEqual( parseAddress( "/en/nomenclatures?q=a&q=b" ).query, { q: "a" } );
    } );

    it( "refuses what is no address: a staff stage, a list under the specs, a module under the lists, and hostile input", () => {
        for ( const path of [
            "/", "/bg", "/fr/", "/bg//", "/BG/", "/bg/nope", "/bg/specs/", "/bg/specs/e-prescription",
            "/bg/specs/e-prescription/development", "/bg/specs/e-prescription/implementation", "/bg/specs/e-prescription/retired",
            "/bg/specs/e-prescription/1.5.", "/bg/specs/e-prescription/v1.5.1", "/bg/specs/CL007/production", "/bg/nomenclatures/e-prescription/production",
            "/bg/specs/e-prescription/1.5.1/p001", "/bg/specs/e-prescription/1.5.1/P001/elements", "/bg/specs/e-prescription/1.5.1/P001/elements/",
            "/bg/specs/e-prescription/1.5.1/P001/elements/a//b", "/bg/specs/e-prescription/1.5.1/P001/xsd", "/bg/specs/%3Cscript%3E/production",
            "/bg/specs/e-prescription/1.5.1/P001/elements/%E0%A4%A", "/bg/changes/e-prescription/compare?from=../1.5.1&to=1.5.2",
            "/bg/changes/e-prescription/compare?from=1.5.1", "/bg/nomenclatures/CL007/production?page=0", "/bg/nomenclatures/CL007/production?page=2x",
            "/downloads/nomenclatures/CL007/1.5.34.xml", "/downloads/nomenclatures/CL007/development.json", "/downloads/nomenclatures/e-prescription/1.5.1.json",
            "/bg/errors/production", "/bg/changes/feed.rss", "/app/x"
        ] ) {
            assert.equal( parseAddress( path ), null, path );
        }
        assert.equal( parseAddress( "/bg/specs/e-prescription/1.5.1/P001/elements/..%2F..%2Fx" ).slug, "..%2F..%2Fx" );
    } );

    it( "reads a stage slug or a number, and nothing a staff member alone may see", () => {
        assert.deepEqual( [ "testing", "production", "previous-production" ].map( parseAt ),
            [ { stage: "testing" }, { stage: "production" }, { stage: "previous-production" } ] );
        assert.deepEqual( parseAt( "1.5.33" ), { number: "1.5.33" } );
        for ( const segment of [ "development", "implementation", "retired", "", "1.5.", ".1", "1..5", "1.5.33a", "Production", null, undefined ] ) {
            assert.equal( parseAt( segment ), null, String( segment ) );
        }
    } );

    it( "gives the same address in the other language, its query kept", () => {
        assert.equal( other( "/bg/specs/e-prescription/production/P001?x=1" ), "/en/specs/e-prescription/production/P001?x=1" );
        assert.equal( other( "/en/" ), "/bg/" );
        assert.equal( other( "/bg/nope" ), "/en/nope" );
        for ( const path of [ "/", "/app/x", "/downloads/nomenclatures/CL007/1.5.34.json", "/bgx/" ] ) {
            assert.equal( other( path ), null, path );
        }
    } );

    it( "gives each element of a message its own slug, a repeated path numbered in document order", () => {
        const node = ( path, children = [] ) => ( { path: path, children: children } );
        const twice = node( "contents/бележка" );
        const thrice = node( "contents/бележка" );
        const message = { code: "P001", elements: [ node( "header", [ node( "header/sender" ) ] ),
            node( "contents", [ node( "contents/бележка", [ twice ] ), thrice, node( null ) ] ) ] };
        const slugs = elementSlugs( message );
        assert.deepEqual( [ ...slugs.values() ], [ "header", "header/sender", "contents", `contents/${ NOTE }`, `contents/${ NOTE }~2`, `contents/${ NOTE }~3` ] );
        assert.equal( slugs.get( twice ), `contents/${ NOTE }~2` );
        assert.equal( slugs.get( thrice ), `contents/${ NOTE }~3` );
        // Every slug is an address of its own.
        for ( const slug of slugs.values() ) {
            assert.equal( parseAddress( element( "bg", "e-prescription", "1.5.1", "P001", slug ) ).slug, slug );
        }
    } );

    it( "refuses to build an address from a part it could not read back", () => {
        assert.throws( () => spec( "fr", "e-prescription", "1.5.1" ), RangeError );
        assert.throws( () => spec( "bg", "CL007", "1.5.1" ), RangeError );
        assert.throws( () => spec( "bg", "e-prescription", "development" ), RangeError );
        assert.throws( () => list( "bg", "e-prescription", "production" ), RangeError );
        assert.throws( () => download( "CL007", "1.5.34", "xml" ), RangeError );
    } );

    it( "writes an absolute address from the public URL", () => {
        paths.setPublicUrl( "https://developers.example.test/" );
        assert.equal( paths.absolute( "/bg/" ), "https://developers.example.test/bg/" );
        assert.throws( () => paths.setPublicUrl( "developers.example.test" ), TypeError );
        assert.throws( () => paths.setPublicUrl( "" ), TypeError );
    } );
} );
