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
 * A hand-built message of e-Prescription P001's shape, for the binder, the checks and the evaluator. spec-model depends
 * on nothing, not even in its tests, so the importer cannot build it.
 */

// Identity, kind, cardinality, data type, code list.
const ROWS = Object.freeze( [
    [ "header", "group", "1..1" ],
    [ "header/sender@value", "field", "1..1", "Codeable Concept", "CL018" ],
    [ "contents", "group", "1..1" ],
    [ "contents/prescription", "group", "1..1" ],
    [ "contents/prescription/lrn@value", "field", "1..1", "String" ],
    [ "contents/prescription/category@value", "field", "1..1", "Codeable Concept", "CL007" ],
    [ "contents/prescription/isProtocolBased@value", "field", "0..1", "Boolean" ],
    [ "contents/prescription/protocolNumber@value", "field", "0..1", "String" ],
    [ "contents/prescription/group", "group", "1..*" ],
    [ "contents/prescription/group/medication", "group", "1..*" ],
    [ "contents/prescription/group/medication/medicationCode@value", "field", "1..1", "Codeable Concept", "CL009" ],
    [ "contents/prescription/group/medication/medicationCode@name", "attribute", "0..1", "Codeable Concept", "CL009" ],
    [ "contents/prescription/group/medication/mkb@value", "field", "0..1", "Codeable Concept", "CL011" ],
    [ "contents/prescription/group/medication/doseQuantityCode@value", "polymorphic", "1..1" ],
    [ "contents/prescription/group/medication/doseQuantityCode@value#1", "field", "1..1", "String" ],
    [ "contents/prescription/group/medication/doseQuantityCode@value#2", "field", "1..1", "Codeable Concept", "CL035" ],
    [ "contents/prescription/allowedRepeatsNumber@value", "field", "0..1", "Unsigned Int" ]
] );

const cardinalityOf = ( text ) => {
    const [ min, max ] = text.split( ".." );
    return { min: Number( min ), max: max === "*" ? null : Number( max ) };
};

function nodeOf( [ identity, kind, cardinality, dataType = null, codeList = null ], row ) {
    const path = identity.replace( /[@#].*$/, "" );
    const tag = path.split( "/" ).pop();
    const attribute = identity.includes( "@" ) ? identity.split( "@" )[ 1 ].replace( /#.*$/, "" ) : null;
    return {
        identity: identity, path: path, depth: path.split( "/" ).length - 1, kind: kind, name: { bg: null, en: tag }, requirement: "R",
        cardinality: cardinalityOf( cardinality ), dataType: dataType, constraint: null, fixedValue: null, defaultValue: null, rules: [],
        conditions: [], codeList: codeList, tag: tag, attribute: attribute, description: { bg: null, en: null },
        source: { sheet: "P001", row: row + 3 }, children: []
    };
}

// An attribute row hangs under its field, a variant under its polymorphic element, anything else under the group of
// its parent path — as plan 1's message tree nests them.
function parentOf( node, byIdentity ) {
    if ( node.kind === "attribute" ) {
        return byIdentity.get( `${ node.path }@value` );
    }
    if ( node.identity.includes( "#" ) ) {
        return byIdentity.get( node.identity.replace( /#.*$/, "" ) );
    }
    return byIdentity.get( node.path.split( "/" ).slice( 0, -1 ).join( "/" ) );
}

/**
 * Builds the test message: e-Prescription P001's shape, small enough to reason about.
 *
 * @returns {{code: string, elements: Object[]}}
 */
function prescriptionMessage() {
    const nodes = ROWS.map( nodeOf );
    const byIdentity = new Map( nodes.map( ( node ) => [ node.identity, node ] ) );
    const roots = [];
    for ( const node of nodes ) {
        const parent = parentOf( node, byIdentity );
        ( parent ? parent.children : roots ).push( node );
    }
    return { code: "P001", elements: roots };
}

/**
 * Finds an element of a message by its identity.
 *
 * @param {{elements: Object[]}} message
 * @param {string} identity
 * @returns {Object}
 */
function elementAt( message, identity ) {
    const visit = ( elements ) => {
        for ( const element of elements ) {
            const found = element.identity === identity ? element : visit( element.children );
            if ( found ) {
                return found;
            }
        }
        return null;
    };
    const found = visit( message.elements );
    if ( !found ) {
        throw new Error( `The test message has no ${ identity }.` );
    }
    return found;
}

module.exports = { prescriptionMessage, elementAt };
