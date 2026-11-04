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

const { STAGE } = require( "#kinds" );

// The stages a version moves through, in order. Previous production and retired are not on it: a version there is
// frozen and reads what it recorded when it froze (design record §4.8, §7.7).
const LINE = Object.freeze( [ STAGE.DEVELOPMENT, STAGE.IMPLEMENTATION, STAGE.TESTING, STAGE.PRODUCTION ] );

/**
 * The stages in which a version of the given stage looks for the specs it refers to, nearest first (design record
 * §4.8): its own stage, then each stage further on. A module in development therefore sees the entries an editor is
 * adding to a list in development, and otherwise the list as it is in production.
 *
 * @method
 * @param {string} stage One of `STAGE`.
 * @returns {string[]}
 * @throws {RangeError} For previous production, retired or an unknown stage, which are never resolved again.
 * @public
 */
module.exports.resolutionOrder = ( stage ) => {
    const index = LINE.indexOf( stage );
    if ( index < 0 ) {
        throw new RangeError( `A version in stage "${ stage }" is not resolved: only ${ LINE.join( ", " ) } are (design record §4.8).` );
    }
    return LINE.slice( index );
};
