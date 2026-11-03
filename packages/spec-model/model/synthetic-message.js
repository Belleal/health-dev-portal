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

const { fitsValueType } = require( "#xsd-shape" );

const NAMESPACE = "https://www.his.bg";
const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";

// A value of each built-in that is not a string, before any bound.
const SAMPLES = Object.freeze( {
    int: "1",
    positiveInteger: "1",
    unsignedInt: "1",
    decimal: "1.5",
    date: "2026-01-02",
    dateTime: "2026-01-02T03:04:05",
    boolean: "true",
    base64Binary: "QQ=="
} );

// The letters a string is tried with: Latin, digit, lower case, and Cyrillic for the `a` class.
const LETTERS = Object.freeze( [ "A", "1", "a", "а" ] );
const LONGEST = 64;

const escape = ( text ) => text.replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" ).replace( /"/g, "&quot;" );

function sampleOf( attribute ) {
    if ( attribute.fixed !== null && attribute.fixed !== undefined ) {
        return attribute.fixed;
    }
    const type = attribute.value;
    if ( type.enumeration.length ) {
        return type.enumeration[ 0 ];
    }
    if ( Object.hasOwn( SAMPLES, type.base ) ) {
        return type.minInclusive !== null && Number( type.minInclusive ) > Number( SAMPLES[ type.base ] ) ? type.minInclusive : SAMPLES[ type.base ];
    }
    // The shortest string of one repeated letter that the type accepts: `A…` for `an`, `1…` for `n`, `111111` for YYMMDD.
    const shortest = Math.max( type.minLength ?? 0, 1 );
    const longest = Math.max( shortest, type.maxLength ?? LONGEST );
    for ( let length = shortest; length <= longest; length++ ) {
        const found = LETTERS.map( ( letter ) => letter.repeat( length ) ).find( ( candidate ) => fitsValueType( candidate, type ) );
        if ( found ) {
            return found;
        }
    }
    return "A".repeat( shortest );
}

function write( node, omit ) {
    if ( omit.has( node.path ) ) {
        return "";
    }
    const one = () => {
        if ( node.kind === "signature" ) {
            return "<ds:Signature/>";
        }
        if ( node.kind === "field" ) {
            return `<${ node.tag }${ node.attributes.map( ( attribute ) => ` ${ attribute.name }="${ escape( sampleOf( attribute ) ) }"` ).join( "" ) }/>`;
        }
        const children = node.children.map( ( child ) => write( child, omit ) ).join( "" );
        return children ? `<${ node.tag }>${ children }</${ node.tag }>` : `<${ node.tag }/>`;
    };
    return Array.from( { length: Math.max( node.min, 1 ) }, one ).join( "" );
}

/**
 * Writes a synthetic message of a schema shape (design record §5.5, §8.6): every element `max( min, 1 )` times, so an
 * optional one once, and every attribute with a value its type accepts — the fixed value, the first enumerated one, a
 * sample of the built-in, or the shortest string of one repeated letter that fits every length and pattern. The
 * signature is an empty `ds:Signature`, which xmldsig itself refuses; a validator's errors about it are the caller's to
 * set aside.
 *
 * @method
 * @param {import( "#definitions" ).SchemaNode} shape The root `message`.
 * @param {{omit?: Set<string>}} [options] Paths left out with everything under them: the other alternatives of a choice
 *     a published XSD makes.
 * @returns {string} The message, without an XML declaration.
 * @public
 */
module.exports.synthesizeMessage = ( shape, options = {} ) => {
    const omit = options.omit || new Set();
    const body = shape.children.map( ( child ) => write( child, omit ) ).join( "" );
    return `<message xmlns="${ NAMESPACE }" xmlns:ds="${ XMLDSIG }">${ body }</message>`;
};
