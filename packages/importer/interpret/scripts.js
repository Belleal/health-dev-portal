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

// Cyrillic letters with a Latin twin in common fonts. Folding is safe only in code columns, where Latin is the only
// valid script, and only when the result is entirely Latin (design record §5.7).
const LOOK_ALIKES = Object.freeze( {
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s"
} );

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const NOT_ASCII = /[^\x20-\x7E]/;

const describeLetter = ( letter ) => `${ letter } U+${ letter.codePointAt( 0 ).toString( 16 ).toUpperCase().padStart( 4, "0" ) }`;

/**
 * Replaces Cyrillic look-alikes with their Latin twins, if that leaves the text entirely ASCII.
 *
 * @method
 * @param {string} text
 * @returns {{folded: string, letters: string[]}} `letters` names each folded letter; empty when nothing was folded.
 * @public
 */
module.exports.foldLookAlikes = ( text ) => {
    const letters = [];
    const folded = Array.from( text, ( letter ) => {
        if ( Object.hasOwn( LOOK_ALIKES, letter ) ) {
            letters.push( describeLetter( letter ) );
            return LOOK_ALIKES[ letter ];
        }
        return letter;
    } ).join( "" );
    if ( letters.length === 0 || NOT_ASCII.test( folded ) ) {
        return { folded: text, letters: [] };
    }
    return { folded: folded, letters: letters };
};

/**
 * Finds words that mix Latin and Cyrillic letters — a slip that is invisible on screen and breaks search and matching.
 *
 * @method
 * @param {string} text
 * @returns {string[]}
 * @public
 */
module.exports.findMixedScriptWords = ( text ) => ( text.match( /[\p{L}\p{N}_-]+/gu ) || [] )
    .filter( ( word ) => LATIN.test( word ) && CYRILLIC.test( word ) );
