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
 * The canonical form of a condition (design record §6.7): every condition is printed from its parsed form, so all read
 * alike whatever the workbook wrote. The parser reads this form back to the same condition.
 */

const { EFFECT, OPERATOR, PROPERTY } = require( "#conditions" );

const quote = ( text ) => `'${ text.replace( /'/g, "''" ) }'`;

const printList = ( values ) => `[${ values.map( quote ).join( ", " ) }]`;

const printSet = ( set ) => `${ set.list }[${ quote( set.column ) }]`;

function printOperand( operand ) {
    const path = operand.path.self ? "THIS" : quote( operand.path.text );
    const attribute = operand.attribute ? `.@${ operand.attribute }` : "";
    switch ( operand.property ) {
        case PROPERTY.VALUE:
            // An attribute's value is the attribute itself: `'q'.@nhifCode`, not `'q'.@nhifCode.value`.
            return `${ path }${ attribute || ".value" }`;
        case PROPERTY.ELEMENT:
            return path;
        case PROPERTY.ENTRY:
            return `${ path }${ attribute }.entry[${ quote( operand.column ) }]`;
        default:
            return `${ path }${ attribute }.${ operand.property }`;
    }
}

const UNARY = Object.freeze( {
    [ OPERATOR.IS_NULL ]: "IS null",
    [ OPERATOR.IS_NOT_NULL ]: "IS NOT null",
    [ OPERATOR.IS_TRUE ]: "IS true",
    [ OPERATOR.IS_FALSE ]: "IS false"
} );

const SET_OPERATORS = Object.freeze( { [ OPERATOR.IN ]: "IN", [ OPERATOR.NOT_IN ]: "NOT IN" } );

const GLOB_OPERATORS = Object.freeze( { [ OPERATOR.MATCHES ]: "MATCHES", [ OPERATOR.NOT_MATCHES ]: "NOT MATCHES" } );

function printTest( operand, operator, values, set ) {
    const left = printOperand( operand );
    if ( UNARY[ operator ] ) {
        return `${ left } ${ UNARY[ operator ] }`;
    }
    if ( SET_OPERATORS[ operator ] ) {
        return `${ left } ${ SET_OPERATORS[ operator ] } ${ set ? printSet( set ) : printList( values ) }`;
    }
    if ( GLOB_OPERATORS[ operator ] ) {
        return `${ left } ${ GLOB_OPERATORS[ operator ] } ${ values.length === 1 ? quote( values[ 0 ] ) : printList( values ) }`;
    }
    return `${ left } ${ operator } ${ quote( values[ 0 ] ) }`;
}

function printPredicate( predicate ) {
    if ( predicate.kind === "comparison" ) {
        return printTest( predicate.operand, predicate.operator, predicate.values, predicate.set );
    }
    if ( predicate.kind === "not" ) {
        const inner = printPredicate( predicate.term );
        return predicate.term.kind === "comparison" ? `NOT ${ inner }` : `NOT (${ inner })`;
    }
    // A term of the other kind is wrapped, so `(A OR B) AND C` never reads as `A OR (B AND C)`.
    return predicate.terms.map( ( term ) => ( term.kind === "and" || term.kind === "or" ? `(${ printPredicate( term ) })` : printPredicate( term ) ) )
        .join( predicate.kind === "and" ? " AND " : " OR " );
}

const printCardinality = ( cardinality ) => quote( `${ cardinality.min }..${ cardinality.max === null ? "*" : cardinality.max }` );

/**
 * Prints one effect of a branch in the canonical form.
 *
 * @method
 * @param {import( "#definitions" ).Effect} effect
 * @returns {string}
 * @public
 */
module.exports.printEffect = ( effect ) => {
    switch ( effect.kind ) {
        case EFFECT.REQUIRE:
            return `${ printOperand( effect.operand ) } = ${ quote( effect.requirement ) }`;
        case EFFECT.ABSENT:
            return `${ printOperand( effect.operand ) } IS null`;
        case EFFECT.RESTRICT:
            return printTest( effect.operand, effect.operator, effect.values, effect.set );
        case EFFECT.CARDINALITY:
            return `${ printOperand( effect.operand ) } = ${ printCardinality( effect.cardinality ) }`;
        case EFFECT.ANY:
            return `${ printOperand( effect.operand ) } IS any`;
        default:
            return `NOTE ${ quote( effect.text ) }`;
    }
};

/**
 * Prints a THEN or ELSE branch: its alternatives joined by OR, one of several effects wrapped in parentheses.
 *
 * @method
 * @param {import( "#definitions" ).Branch} branch
 * @returns {string}
 * @public
 */
function printBranch( branch ) {
    const several = branch.alternatives.length > 1;
    return branch.alternatives.map( ( alternative ) => {
        const effects = alternative.map( module.exports.printEffect ).join( " AND " );
        return several && alternative.length > 1 ? `(${ effects })` : effects;
    } ).join( " OR " );
}

module.exports.printBranch = printBranch;

/**
 * Prints a condition in the canonical form of design record §6: `FOR EACH`, `IF`, `THEN` and `ELSE`, each on its
 * own line.
 *
 * @method
 * @param {import( "#definitions" ).Condition} condition
 * @returns {string}
 * @public
 */
module.exports.printCondition = ( condition ) => {
    const lines = [];
    if ( condition.scope ) {
        lines.push( `FOR EACH ${ condition.scope.self ? "THIS" : quote( condition.scope.text ) }` );
    }
    lines.push( `IF ${ printPredicate( condition.predicate ) }` );
    lines.push( `THEN ${ printBranch( condition.then ) }` );
    if ( condition.otherwise ) {
        lines.push( `ELSE ${ printBranch( condition.otherwise ) }` );
    }
    return lines.join( "\n" );
};
