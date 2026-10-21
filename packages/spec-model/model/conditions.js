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
 * The operators of a comparison or a restricting effect (design record §6.3, §6.4).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.OPERATOR = Object.freeze( {
    EQUAL: "=",
    NOT_EQUAL: "!=",
    LESS: "<",
    LESS_OR_EQUAL: "<=",
    GREATER: ">",
    GREATER_OR_EQUAL: ">=",
    IN: "in",
    NOT_IN: "not-in",
    MATCHES: "matches",
    NOT_MATCHES: "not-matches",
    IS_NULL: "is-null",
    IS_NOT_NULL: "is-not-null",
    IS_TRUE: "is-true",
    IS_FALSE: "is-false"
} );

/**
 * What a THEN or ELSE effect does (design record §6.4).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.EFFECT = Object.freeze( {
    REQUIRE: "require",
    ABSENT: "absent",
    RESTRICT: "restrict",
    CARDINALITY: "cardinality",
    ANY: "any",
    NOTE: "note"
} );

/**
 * Which property of an element an operand reads (design record §6.2): its value, its requirement, its cardinality,
 * the element itself (present or absent), or a column of the code-list entry it holds.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.PROPERTY = Object.freeze( {
    VALUE: "value",
    REQUIRED: "required",
    CARDINALITY: "cardinality",
    ELEMENT: "element",
    ENTRY: "entry"
} );
