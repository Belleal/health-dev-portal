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

const { EFFECT, PROPERTY } = require( "#conditions" );

/**
 * @typedef {Object} ConditionBinding A condition's paths bound to element identities, for one naming element.
 * @property {string|null} condition The condition's ID; the caller fills it.
 * @property {string} message The message's code.
 * @property {string} element The identity of the element naming the condition.
 * @property {Object<string, string|null>} paths Per operand key, the bound identity, or `null` when the path names no
 *     single element.
 */

/**
 * The key an operand's binding is kept under: `THIS`, or the path as written with `@attribute` when it reads one.
 *
 * @method
 * @param {import( "#definitions" ).Operand} operand
 * @returns {string}
 * @public
 */
module.exports.operandKey = ( operand ) => {
    const path = operand.path.self ? "THIS" : operand.path.text;
    return operand.attribute ? `${ path }@${ operand.attribute }` : path;
};

const flatten = ( elements ) => elements.flatMap( ( element ) => [ element, ...flatten( element.children ) ] );

function operandsOf( condition ) {
    const operands = [];
    if ( condition.scope ) {
        operands.push( { path: condition.scope, attribute: null, property: PROPERTY.ELEMENT, column: null } );
    }
    const visit = ( predicate ) => {
        if ( predicate.kind === "comparison" ) {
            operands.push( predicate.operand );
        } else if ( predicate.kind === "not" ) {
            visit( predicate.term );
        } else {
            predicate.terms.forEach( visit );
        }
    };
    visit( condition.predicate );
    for ( const branch of [ condition.then, condition.otherwise ].filter( Boolean ) ) {
        branch.alternatives.flat().filter( ( effect ) => effect.kind !== EFFECT.NOTE ).forEach( ( effect ) => operands.push( effect.operand ) );
    }
    return operands;
}

// The identity an operand means among the elements on one tag path: the attribute it names, else the group, else the
// field or polymorphic element itself — never one of a polymorphic element's numbered variants.
function identityOn( elements, operand ) {
    if ( !elements ) {
        return null;
    }
    if ( operand.attribute ) {
        const named = elements.find( ( element ) => element.attribute === operand.attribute && !element.identity.includes( "#" ) );
        return named ? named.identity : null;
    }
    const group = elements.find( ( element ) => element.kind === "group" );
    if ( group ) {
        return group.identity;
    }
    const field = elements.find( ( element ) => element.attribute === "value" && !element.identity.includes( "#" ) );
    return field ? field.identity : null;
}

function resolve( operand, byPath, naming ) {
    if ( operand.path.self ) {
        return naming.identity;
    }
    const relative = operand.path.text.startsWith( ".." );
    const tags = operand.path.text.replace( /^\.\./, "" ).split( "." ).filter( Boolean );
    if ( tags.length === 0 ) {
        return null;
    }
    const joined = tags.join( "/" );
    if ( relative ) {
        // An element the tree could not place (an untagged row) has nowhere to walk up from (final review: it threw).
        if ( !naming.path ) {
            return null;
        }
        // Up from the naming element's parent: the first ancestor under which the rest of the path exists wins.
        const own = naming.path.split( "/" );
        for ( let depth = own.length - 1; depth >= 0; depth-- ) {
            const candidate = [ ...own.slice( 0, depth ), ...tags ].join( "/" );
            if ( byPath.has( candidate ) ) {
                return identityOn( byPath.get( candidate ), operand );
            }
        }
        return null;
    }
    const absolute = tags[ 0 ] === "header" || tags[ 0 ] === "contents" ? joined : `contents/${ joined }`;
    if ( byPath.has( absolute ) ) {
        return identityOn( byPath.get( absolute ), operand );
    }
    // Partial: the one tag path ending so. A field and its attribute rows share a path, so they count once.
    const endings = [ ...byPath.keys() ].filter( ( path ) => path.endsWith( `/${ joined }` ) );
    return endings.length === 1 ? identityOn( byPath.get( endings[ 0 ] ), operand ) : null;
}

/**
 * Binds every path of a condition to an element identity, as seen from one element naming it (design record §6.2):
 * `THIS` is that element, a relative path starts from it, and everything resolves within its message. An absolute path
 * is tried first, then a partial one, which must name exactly one element.
 *
 * @method
 * @param {import( "#definitions" ).Condition} condition
 * @param {import( "#definitions" ).Message} message
 * @param {import( "#definitions" ).ElementNode} element The element naming the condition.
 * @returns {ConditionBinding}
 * @public
 */
module.exports.bindCondition = ( condition, message, element ) => {
    const byPath = new Map();
    for ( const candidate of flatten( message.elements ) ) {
        if ( candidate.path ) {
            byPath.set( candidate.path, [ ...( byPath.get( candidate.path ) || [] ), candidate ] );
        }
    }
    const paths = {};
    for ( const operand of operandsOf( condition ) ) {
        const key = module.exports.operandKey( operand );
        if ( !Object.hasOwn( paths, key ) ) {
            paths[ key ] = resolve( operand, byPath, element );
        }
    }
    return { condition: null, message: message.code, element: element.identity, paths: paths };
};
