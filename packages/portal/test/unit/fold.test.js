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
 * The filter's folding (plan 8a, decision 9; design record §3.4): what makes a reader who types a Latin look-alike, the
 * wrong case or a romanised word find the same entries as one who types the Cyrillic.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { fold, needles } = require( "#fold" );

// Whether a query reaches a text, as the filter decides it: the text folded, the query in either of its forms.
const reaches = ( query, text ) => needles( query ).some( ( form ) => fold( text ).includes( form ) );

describe( "The filter's folding", () => {

    it( "folds case, transliteration and Latin look-alikes the same way on both sides", () => {
        assert.equal( fold( "PeЦeпTA" ), fold( "рецепта" ) );
    } );

    it( "gives a Latin look-alike and the Cyrillic letter it resembles the same fold, in either case", () => {
        // A В С Е Н К М О Р Т Х У, then a с е о р х у: each pair is one Latin and one Cyrillic letter.
        assert.equal( fold( "ABCEHKMOPTXY" ), fold( "АВСЕНКМОРТХУ" ) );
        assert.equal( fold( "acepxoy" ), fold( "асерхоу" ) );
        assert.equal( fold( "Тип на РЕЦЕПТА" ), fold( "tип нa pецептa" ) );
    } );

    it( "romanises what has no look-alike, so a Latin spelling finds the Cyrillic word", () => {
        // ц has no Latin twin, so it is only found by its romanisation: the Streamlined System's. The word is chosen
        // from letters whose look-alike and romanisation agree (a, e, t, n); where they differ (р is r, but looks like
        // p) the look-alike wins, which fold.js says.
        assert.equal( fold( "цeнa" ), fold( "tsena" ) );
        assert.equal( fold( "ЦЕНА" ), fold( "tsena" ) );
    } );

    it( "keeps what differs apart, and folds nothing to nothing", () => {
        assert.notEqual( fold( "рецепта" ), fold( "рецепти" ) );
        assert.equal( fold( "" ), "" );
        assert.equal( fold( null ), "" );
        assert.equal( fold( undefined ), "" );
    } );

    it( "finds a Cyrillic word by its romanisation as well as by look-alikes (ruling 3)", () => {
        // Each is a query a reader types; the two forms disagree on p, c and h, so neither alone reaches all three.
        assert.equal( reaches( "retsepta", "рецепта" ), true );
        assert.equal( reaches( "shapka", "Шапка" ), true );
        assert.equal( reaches( "PeЦeпTA", "рецепта" ), true );
        assert.equal( reaches( "tip na retsepta", "Тип на рецепта" ), true );
        assert.equal( reaches( "retsepti", "рецепта" ), false );
        assert.deepEqual( needles( "" ), [] );
        assert.deepEqual( needles( null ), [] );
        assert.equal( needles( "abc" ).length, 2 );
    } );

    it( "treats a number as its text", () => {
        assert.equal( fold( 42 ), "42" );
    } );
} );
