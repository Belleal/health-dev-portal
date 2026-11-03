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

const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );
const { expandMessage } = require( "#xsd-reader" );

const ENTITIES_FILE = "NHIS-Entities.xsd";

const localName = ( name ) => ( name || "" ).replace( /^[^:]*:/, "" );
const childNamed = ( node, name ) => node.children.find( ( candidate ) => candidate.name === name ) || null;

// The type a complex type derives from, by extension or restriction, or null.
function baseOf( node ) {
    const content = childNamed( node, "complexContent" );
    const derivation = content ? ( childNamed( content, "extension" ) || childNamed( content, "restriction" ) ) : null;
    return derivation ? localName( derivation.attributes.base ) : null;
}

// The blueprint a type folds into: the last NHIS-Entities type on its derivation chain, or null when the chain never
// reaches one. A chain that loops ends where it does.
function rootOf( name, lookup ) {
    let root = null;
    const seen = new Set();
    for ( let current = name; current && !seen.has( current ); ) {
        seen.add( current );
        const type = lookup( current );
        if ( !type ) {
            break;
        }
        if ( type.file === ENTITIES_FILE && type.node.name === "complexType" ) {
            root = current;
        }
        current = baseOf( type.node );
    }
    return root;
}

const groups = ( node ) => [ ...( node.kind === "group" ? [ node ] : [] ), ...node.children.flatMap( groups ) ];

/**
 * Learns the blueprints from a published XSD set (design record §4.4): every complex type of NHIS-Entities, and every
 * message-local type whose derivation chain reaches one, folds into the type its chain starts from. On the published
 * set, 24 types make 18 blueprints, and `patientP001` and four other local types fold in. Then every group of every
 * published message whose declared type folds into a blueprint is bound to it; an anonymous type binds nothing.
 *
 * @method
 * @param {import( "#xsd-reader" ).XsdSet} set
 * @returns {import( "@health-dev-portal/spec-model/definitions" ).BlueprintCatalogue} Deep-frozen, and plain data: it
 *     survives JSON, so it can be stored.
 * @public
 */
module.exports.learnCatalogue = ( set ) => {
    const sharedLookup = ( name ) => set.shared.get( name ) || null;
    const members = new Map();
    const fold = ( name, lookup ) => {
        const root = rootOf( name, lookup );
        if ( root ) {
            const types = members.get( root ) || [];
            if ( !types.includes( name ) ) {
                types.push( name );
            }
            members.set( root, types );
        }
    };
    // The roots first, in NHIS-Entities' order, so each blueprint lists its key first.
    const entities = [ ...set.shared ].filter( ( [ , type ] ) => type.file === ENTITIES_FILE && type.node.name === "complexType" ).map( ( [ name ] ) => name );
    entities.filter( ( name ) => rootOf( name, sharedLookup ) === name ).forEach( ( name ) => fold( name, sharedLookup ) );
    entities.forEach( ( name ) => fold( name, sharedLookup ) );

    const published = {};
    for ( const code of [ ...set.messages.keys() ].sort() ) {
        const message = set.messages.get( code );
        const lookup = ( name ) => message.types.get( name ) || set.shared.get( name ) || null;
        for ( const name of message.types.keys() ) {
            fold( name, lookup );
        }
        const bound = {};
        for ( const group of groups( expandMessage( set, code ) ) ) {
            const root = group.type ? rootOf( group.type, lookup ) : null;
            if ( root ) {
                bound[ group.path ] = root;
            }
        }
        if ( Object.keys( bound ).length ) {
            published[ code ] = bound;
        }
    }
    return deepFreeze( {
        blueprints: [ ...members ].map( ( [ key, types ] ) => ( { key: key, types: types } ) ),
        published: published
    } );
};
