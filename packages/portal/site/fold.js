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
 * The folding of the code lists' filter (plan 8a, decision 9; design record §3.4): both the reader's words and the text
 * searched are folded the same way, so that case, the keyboard layout and the alphabet do not decide what is found.
 */

const { transliterate } = require( "@ti-engine/web-content/transliterate" );

// The Latin letters that look like a Cyrillic one, lower case: A B C E H K M O P T X Y and a c e o p x y, which lower
// case makes one set. Lower case comes first in `fold`, so a capital needs no entry of its own.
const LOOK_ALIKES = new Map( [
    [ "a", "а" ], [ "b", "в" ], [ "c", "с" ], [ "e", "е" ], [ "h", "н" ], [ "k", "к" ], [ "m", "м" ],
    [ "o", "о" ], [ "p", "р" ], [ "t", "т" ], [ "x", "х" ], [ "y", "у" ]
] );

// One pass over the text, not one lookup per character: the filter folds every entry of a list of 39,005.
const LOOK_ALIKE = new RegExp( `[${ [ ...LOOK_ALIKES.keys() ].join( "" ) }]`, "g" );

/**
 * Folds a text for comparison: lower case, then a Latin look-alike becomes the Cyrillic letter it resembles, then the
 * Cyrillic is romanised (`transliterate` romanises Cyrillic, it never turns Latin into Cyrillic). The two sides of a
 * comparison are folded the same way and one is searched in the other.
 *
 * The look-alikes come before the romanisation, and that order is the one that works. Romanising first would turn a
 * Cyrillic "р" into "r" while a Latin "p" typed for it stayed "p", so a reader who types "PeЦeпTA" for "рецепта" would
 * find nothing. Mapped first, both are "р" and are romanised together. The price is that a Latin letter is read as its
 * look-alike rather than as a romanisation where the two differ (b, c, h, p, x, y): "p" finds "р", not "п". That is
 * the better guess for a reader of Bulgarian text on a Latin keyboard, and a letter with no look-alike (ц, ш, ж, ч)
 * is still found by its romanisation.
 *
 * @method
 * @param {string|number|null|undefined} text
 * @returns {string} Empty for no text.
 * @public
 */
module.exports.fold = ( text ) => {
    const lower = ( text === null || text === undefined ? "" : String( text ) ).normalize( "NFC" ).toLowerCase();
    return transliterate( lower.replace( LOOK_ALIKE, ( letter ) => LOOK_ALIKES.get( letter ) ) );
};
