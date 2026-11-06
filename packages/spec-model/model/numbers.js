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

// A version number: whole numbers joined by dots, at least two of them (design record §7.2).
const DOTTED = /^\d+(\.\d+)+$/;

/**
 * Compares two dotted version numbers part by part as whole numbers, so 1.5.10 comes after 1.5.9 and 1.5 before 1.5.1.
 *
 * @method
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative, zero or positive, as for `Array.prototype.sort`.
 * @public
 */
module.exports.compareNumbers = ( a, b ) => {
    const left = a.split( "." );
    const right = b.split( "." );
    for ( let index = 0; index < Math.max( left.length, right.length ); index += 1 ) {
        if ( left[ index ] === undefined || right[ index ] === undefined ) {
            return left.length - right.length;
        }
        const difference = Number( left[ index ] ) - Number( right[ index ] );
        if ( Number.isNaN( difference ) ) {
            return left[ index ] < right[ index ] ? -1 : left[ index ] > right[ index ] ? 1 : 0;
        }
        if ( difference !== 0 ) {
            return difference;
        }
    }
    return 0;
};

/**
 * The number the portal proposes for a spec's next numbered version (design record §7.2): its highest number, a retired
 * version's included, with the last part raised by one.
 *
 * @method
 * @param {string[]} numbers Every number the spec has used.
 * @returns {string} `1.0.0` for a spec with none.
 * @public
 */
module.exports.proposeNumber = ( numbers ) => {
    if ( !numbers.length ) {
        return "1.0.0";
    }
    const parts = [ ...numbers ].sort( module.exports.compareNumbers ).pop().split( "." );
    parts[ parts.length - 1 ] = String( Number( parts[ parts.length - 1 ] ) + 1 );
    return parts.join( "." );
};

/**
 * Whether the approver may give a version this number (design record §7.2): a dotted number above every one the spec
 * has used, so a number is never reused, a retired version's included.
 *
 * @method
 * @param {string} number
 * @param {string[]} numbers Every number the spec has used.
 * @returns {boolean}
 * @public
 */
module.exports.acceptsNumber = ( number, numbers ) => typeof number === "string" && DOTTED.test( number )
    && numbers.every( ( used ) => module.exports.compareNumbers( number, used ) > 0 );
