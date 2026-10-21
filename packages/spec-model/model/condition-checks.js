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

const { EFFECT, OPERATOR } = require( "#conditions" );
const { operandKey } = require( "#condition-binding" );

const ORDERINGS = new Set( [ OPERATOR.LESS, OPERATOR.LESS_OR_EQUAL, OPERATOR.GREATER, OPERATOR.GREATER_OR_EQUAL ] );
const NUMERIC_TYPES = new Set( [ "Unsigned Int", "Positive Int", "Decimal", "Integer" ] );
const NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * Every test a condition makes of a value: its predicate's comparisons and its branches' restricting effects.
 *
 * @method
 * @param {import( "#definitions" ).Condition} condition
 * @returns {Array<{operand: import( "#definitions" ).Operand, operator: string, values: string[], set: import( "#definitions" ).ListColumn|null}>}
 * @public
 */
module.exports.testsOf = ( condition ) => {
    const tests = [];
    const visit = ( predicate ) => {
        if ( predicate.kind === "comparison" ) {
            tests.push( predicate );
        } else if ( predicate.kind === "not" ) {
            visit( predicate.term );
        } else {
            predicate.terms.forEach( visit );
        }
    };
    visit( condition.predicate );
    for ( const branch of [ condition.then, condition.otherwise ].filter( Boolean ) ) {
        tests.push( ...branch.alternatives.flat().filter( ( effect ) => effect.kind === EFFECT.RESTRICT ) );
    }
    return tests;
};

/**
 * Checks that a condition's tests suit the data types of the elements it is bound to (design record §6.5): `IS true` /
 * `IS false` only on a boolean, and an ordering never on a boolean, nor on any other type that is not numeric unless
 * every value compared is a number — `'practitioner.role'.value > '1'` on a code list of numeric keys reads, `> 'x'`
 * on a string does not.
 *
 * @method
 * @param {import( "#definitions" ).Condition} condition
 * @param {import( "#condition-binding" ).ConditionBinding} binding
 * @param {Map<string, import( "#definitions" ).ElementNode>} elements The model's elements by identity.
 * @returns {Array<{operator: string, identity: string, dataType: string|null}>}
 * @public
 */
module.exports.checkConditionTypes = ( condition, binding, elements ) => {
    const problems = [];
    for ( const test of module.exports.testsOf( condition ) ) {
        const identity = binding.paths[ operandKey( test.operand ) ];
        const element = identity ? elements.get( identity ) : null;
        if ( !element ) {
            continue;
        }
        const dataType = element.dataType || null;
        const boolean = dataType === "Boolean";
        let mismatch = false;
        if ( test.operator === OPERATOR.IS_TRUE || test.operator === OPERATOR.IS_FALSE ) {
            mismatch = !boolean;
        } else if ( ORDERINGS.has( test.operator ) ) {
            mismatch = boolean || ( !NUMERIC_TYPES.has( dataType ) && !test.values.every( ( value ) => NUMBER.test( value ) ) );
        }
        if ( mismatch ) {
            problems.push( { operator: test.operator, identity: identity, dataType: dataType } );
        }
    }
    return problems;
};
