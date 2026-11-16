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

// An attribute value's tab and line ends go as references: a parser turns literal ones into spaces, and the message then
// disagreed with the fixed value its own XSD writes as &#9; (CodeRabbit on #12).
const escape = ( text ) => text.replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" ).replace( /"/g, "&quot;" )
    .replace( /\t/g, "&#9;" ).replace( /\n/g, "&#10;" ).replace( /\r/g, "&#13;" );

function sampleOf( attribute, keys ) {
    // A fixed value first, as the XSD requires it: 242 of the 1,500 coded elements of the eight production modules have
    // one, every header's sender and recipient among them (CodeRabbit on #3).
    if ( attribute.fixed !== null && attribute.fixed !== undefined ) {
        return attribute.fixed;
    }
    const type = attribute.value;
    // Then a real key of the list, so that a sample passes the code-list check too (plan 8b, decision 3), but only one
    // the type accepts: a key that did not fit would make the sample fail its own XSD.
    const key = attribute.codeList ? keys.get( attribute.codeList ) : undefined;
    if ( key !== undefined && fitsValueType( key, type ) ) {
        return key;
    }
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

// A node as lines, each `[ depth, text ]`: a field, the signature or an empty group is one line, and a group is its open
// tag, its children's lines and its close tag. Joined without breaks, they are the one-line message plan 4 writes.
function lines( node, context, depth ) {
    if ( context.omit.has( node.path ) ) {
        return [];
    }
    const one = () => {
        if ( node.kind === "signature" ) {
            return [ [ depth, "<ds:Signature/>" ] ];
        }
        if ( node.kind === "field" ) {
            return [ [ depth, `<${ node.tag }${ node.attributes.map( ( attribute ) => ` ${ attribute.name }="${ escape( sampleOf( attribute, context.keys ) ) }"` ).join( "" ) }/>` ] ];
        }
        const children = node.children.flatMap( ( child ) => lines( child, context, depth + 1 ) );
        return children.length ? [ [ depth, `<${ node.tag }>` ], ...children, [ depth, `</${ node.tag }>` ] ] : [ [ depth, `<${ node.tag }/>` ] ];
    };
    return Array.from( { length: Math.max( node.min, 1 ) }, one ).flat();
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
 * @param {{omit?: Set<string>, keys?: Map<string, string>, indent?: string}} [options]
 *     - `omit`: paths left out with everything under them, the other alternatives of a choice a published XSD makes;
 *     - `keys`: a key of each code list by its ID, written for a coded value with no fixed value (plan 8b);
 *     - `indent`: each element on its own line, indented this much per level. Without it the message is one line.
 * @returns {string} The message, without an XML declaration.
 * @public
 */
module.exports.synthesizeMessage = ( shape, options = {} ) => {
    const context = { omit: options.omit || new Set(), keys: options.keys || new Map() };
    const body = shape.children.flatMap( ( child ) => lines( child, context, 1 ) );
    const open = `<message xmlns="${ NAMESPACE }" xmlns:ds="${ XMLDSIG }">`;
    if ( typeof options.indent === "string" && options.indent !== "" ) {
        return [ open, ...body.map( ( [ depth, text ] ) => `${ options.indent.repeat( depth ) }${ text }` ), "</message>" ].join( "\n" );
    }
    return `${ open }${ body.map( ( [ , text ] ) => text ).join( "" ) }</message>`;
};
