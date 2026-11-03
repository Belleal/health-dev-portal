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

const { KEY_TYPE } = require( "#kinds" );

// A leading zero carries meaning (CL015's `01` is not `1`), so only a canonical whole number is an integer.
const WHOLE_NUMBER = /^(0|[1-9]\d*)$/;

// xs:int's upper bound: a larger key typed xs:int would make the generated XSD refuse a valid code.
const XS_INT_MAX = 2147483647;

/**
 * The type of a code list's keys (design record §4.6): `integer` when there is at least one key and every key is a whole
 * number from 0 to 2,147,483,647 written without a leading zero, `string` otherwise. A list without entries is
 * therefore `string`: nothing shows its codes are numbers.
 *
 * @method
 * @param {string[]} keys
 * @returns {string} One of `KEY_TYPE`.
 * @public
 */
module.exports.keyTypeOf = ( keys ) => keys.length > 0 && keys.every( ( key ) => WHOLE_NUMBER.test( key ) && Number( key ) <= XS_INT_MAX )
    ? KEY_TYPE.INTEGER
    : KEY_TYPE.STRING;
