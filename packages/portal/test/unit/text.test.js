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
 * A model's text in the page's language (plan 8a, decision 5; design record §4.9, §8.4), the dates of §7.12, and the
 * names the model does not have.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SafeString } = require( "@ti-engine/web-content/html" );
const { localText, columnText, plainText } = require( "#text" );
const { formatCount, formatDate } = require( "#format" );
const { SPEC_NAMES, specName } = require( "#spec-names" );

describe( "Model texts", () => {

    it( "shows the other language with a marker when a text is missing", () => {
        assert.equal( String( localText( { bg: "Описание", en: null }, "en" ) ),
            "<span lang=\"bg\">Описание</span> <span class=\"untranslated\">not yet translated</span>" );
        assert.equal( String( localText( { bg: "<b>", en: null }, "bg" ) ), "&lt;b&gt;" );
        assert.equal( String( localText( { bg: null, en: null }, "bg" ) ), "—" );
    } );

    it( "marks a missing Bulgarian text in Bulgarian, and never marks a text that is there", () => {
        assert.equal( String( localText( { bg: null, en: "Single use" }, "bg" ) ),
            "<span lang=\"en\">Single use</span> <span class=\"untranslated\">не е преведено</span>" );
        assert.equal( String( localText( { bg: "Описание", en: "Description" }, "en" ) ), "Description" );
        assert.equal( String( localText( { bg: "Описание", en: "" }, "en" ) ), String( localText( { bg: "Описание", en: null }, "en" ) ) );
        assert.equal( String( localText( null, "en" ) ), "—" );
        assert.ok( localText( { bg: "a", en: "b" }, "bg" ) instanceof SafeString );
        assert.throws( () => localText( { bg: "a", en: "b" }, "fr" ), RangeError );
    } );

    it( "gives a bilingual column its own language or a dash, unmarked", () => {
        assert.equal( String( columnText( { bg: "<Описание>", en: null }, "bg" ) ), "&lt;Описание&gt;" );
        assert.equal( String( columnText( { bg: "Описание", en: null }, "en" ) ), "—" );
    } );

    it( "gives a document's title its plain text, where no marker can go: the page's language, else the other, else nothing", () => {
        assert.equal( plainText( { bg: "Тип на рецепта", en: null }, "en" ), "Тип на рецепта" );
        assert.equal( plainText( { bg: "Описание", en: "Description" }, "en" ), "Description" );
        assert.equal( plainText( { bg: "<b>", en: null }, "bg" ), "<b>", "plain, and escaped where it is put" );
        // A blank text is as missing as in localText, so the title names what the heading shows.
        assert.equal( plainText( { bg: "Описание", en: "  " }, "en" ), "Описание" );
        assert.equal( plainText( { bg: null, en: null }, "bg" ), "" );
        assert.equal( plainText( null, "bg" ), "" );
        assert.throws( () => plainText( { bg: "a", en: null }, "fr" ), RangeError );
    } );
} );

describe( "Dates and counts", () => {

    it( "writes a date as dd.mm.yyyy in Bulgarian and as en-GB's day, short month and year in English", () => {
        assert.equal( formatDate( "2026-12-11", "bg" ), "11.12.2026" );
        assert.equal( formatDate( "2026-12-11", "en" ), "11 Dec 2026" );
        assert.equal( formatDate( "2027-04-30", "en" ), "30 Apr 2027" );
        // The day in Sofia: 22:30 UTC on 10 December is already the 11th there (design record §7.12).
        assert.equal( formatDate( new Date( "2026-12-10T22:30:00Z" ), "bg" ), "11.12.2026" );
        assert.throws( () => formatDate( "2026-02-30", "bg" ), RangeError );
        assert.throws( () => formatDate( null, "bg" ), RangeError );
    } );

    it( "writes a cardinality as a count", () => {
        assert.equal( formatCount( { min: 1, max: 1 } ), "1..1" );
        assert.equal( formatCount( { min: 0, max: null } ), "0..*" );
        assert.equal( formatCount( null ), "" );
    } );
} );

describe( "Spec names", () => {

    it( "names the modules and the rules in both languages, and an unnamed spec by its ID", () => {
        assert.equal( specName( "e-prescription", "bg" ), "Е-рецепта" );
        assert.equal( specName( "e-prescription", "en" ), "e-Prescription" );
        assert.equal( specName( "rules", "bg" ), "Бизнес правила" );
        assert.equal( specName( "e-unknown", "en" ), "e-unknown" );
        assert.equal( SPEC_NAMES[ 0 ].spec, "e-prescription" );
        assert.equal( SPEC_NAMES.at( -1 ).spec, "rules" );
        for ( const one of SPEC_NAMES ) {
            assert.ok( one.name.bg && one.name.en, one.spec );
        }
    } );
} );
