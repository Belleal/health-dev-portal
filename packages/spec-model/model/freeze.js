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

/**
 * Freezes a value and everything reachable from it.
 *
 * Children are visited even when the object itself is already frozen: an object frozen shallowly elsewhere would
 * otherwise shelter mutable children.
 *
 * @method
 * @param {*} value
 * @param {WeakSet} [seen]
 * @returns {*} The same value.
 * @public
 */
module.exports.deepFreeze = ( value, seen = new WeakSet() ) => {
    if ( value === null || typeof value !== "object" || seen.has( value ) ) {
        return value;
    }
    seen.add( value );
    for ( const key of Object.keys( value ) ) {
        module.exports.deepFreeze( value[ key ], seen );
    }
    return Object.freeze( value );
};
