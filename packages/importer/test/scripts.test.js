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
 * Look-alike letters. A Cyrillic letter that looks Latin has already broken three things in the published
 * specifications: CDP08's 'Т3' (HEL-3), CL999's 'Е003' (HEL-4) and 30 requirement cells holding 'О' (HEL-12).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { findMixedScriptWords, foldLookAlikes } = require( "#scripts" );

describe( "scripts", () => {

    it( "folds look-alikes in a code and names each folded letter", () => {
        assert.deepEqual( foldLookAlikes( "О" ), { folded: "O", letters: [ "О U+041E" ] } );
        assert.deepEqual( foldLookAlikes( "Т3" ).folded, "T3" );
        assert.deepEqual( foldLookAlikes( "Е003" ).folded, "E003" );
    } );

    it( "leaves a value alone when folding would not make it entirely Latin", () => {
        // A genuine Bulgarian word in a fixed value must never be rewritten.
        assert.deepEqual( foldLookAlikes( "Обща" ), { folded: "Обща", letters: [] } );
        assert.deepEqual( foldLookAlikes( "P001" ), { folded: "P001", letters: [] } );
        assert.deepEqual( foldLookAlikes( "" ), { folded: "", letters: [] } );
    } );

    it( "finds words that mix Latin and Cyrillic letters", () => {
        // HEL-10: a Latin E before Cyrillic letters, invisible on screen.
        assert.deepEqual( findMixedScriptWords( "Потвърждение за успешно създаване на E-рецепта" ), [ "E-рецепта" ] );
        // P001 row 16: a Cyrillic Е before Latin letters.
        assert.deepEqual( findMixedScriptWords( "Е-prescription LRN" ), [ "Е-prescription" ] );
        assert.deepEqual( findMixedScriptWords( "ePrescription Issue Request" ), [] );
        assert.deepEqual( findMixedScriptWords( "Заявка за създаване на Е-рецепта" ), [] );
        assert.deepEqual( findMixedScriptWords( "" ), [] );
    } );
} );
