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
const { fold } = require( "#fold" );

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

    it( "treats a number as its text", () => {
        assert.equal( fold( 42 ), "42" );
    } );
} );
