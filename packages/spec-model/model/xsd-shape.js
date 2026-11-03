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

const { KEY_TYPE, REQUIREMENT } = require( "#kinds" );

/**
 * The workbook's character classes, as NHIS-Commons 1.13.1 defines them, verbatim (design record §4.10): `n` is
 * `numericString`, `an` `alphanumericString`, `a` `alphaString`. `ans` has no definition there and adds no pattern.
 *
 * @readonly
 * @type {Readonly<{n: string, an: string, a: string}>}
 * @public
 */
module.exports.CHARSET_PATTERNS = Object.freeze( {
    n: "[0-9]+",
    an: "[a-zA-Z0-9\\- ]+",
    a: "[a-zа-яA-ZА-Я\\- ]+"
} );

// The workbook's "Data types" names, and the XSD built-in each becomes (§4.10). Anything else is a string.
const BASES = Object.freeze( {
    "String": "string",
    "Codeable Concept": "string",
    "Date and Time": "dateTime",
    "Date": "date",
    "Boolean": "boolean",
    "Decimal": "decimal",
    "Positive Int": "positiveInteger",
    "Unsigned Int": "unsignedInt"
} );

const YYMMDD = "[0-9]{6}";

const plain = ( base ) => ( { base: base, minLength: null, maxLength: null, patterns: [], minInclusive: null, maxInclusive: null, enumeration: [],
    totalDigits: null, fractionDigits: null } );

/**
 * A type's name in a generated XSD (design record §4.10): each tag of the path below `message`, capitalised, then
 * joined. It is derived from the path, never from a counter, so adding an element never renames another's type, and a
 * vendor's generated classes change only where the message did.
 *
 * @method
 * @param {string} path e.g. `contents/prescription/lrn`.
 * @returns {string} e.g. `ContentsPrescriptionLrn`; `Message` for the root's `""`.
 * @public
 */
module.exports.typeNameOf = ( path ) => path === ""
    ? "Message"
    : path.split( "/" ).map( ( tag ) => tag.charAt( 0 ).toUpperCase() + tag.slice( 1 ) ).join( "" );

/**
 * The value type of an element's value (design record §4.10). A coded value is typed by its list's key type, `xs:int`
 * or `xs:string`, and never enumerated: an enumeration would tie a message to one nomenclatures version, and a vendor's
 * generated `enum` would break on the next code. Otherwise the "Data types" name gives the built-in — a `base64` string
 * is `xs:base64Binary` — and the structured constraint a string's facets: lengths, the character class, and `[0-9]{6}`
 * for `YYMMDD`. A number gets none (design record §4.10).
 *
 * @method
 * @param {import( "#definitions" ).ElementNode} element
 * @param {Map<string, import( "#definitions" ).CodeList>} codeLists By ID.
 * @returns {import( "#definitions" ).ValueType}
 * @public
 */
module.exports.valueTypeOf = ( element, codeLists ) => {
    const list = element.codeList ? codeLists.get( element.codeList ) : null;
    if ( list ) {
        return plain( list.keyType === KEY_TYPE.INTEGER ? "int" : "string" );
    }
    const constraint = element.constraint;
    // A string the workbook marks base64 (e-Hospitalization's epicrisis fileData) is xs:base64Binary, as today.
    const value = plain( constraint && constraint.format === "base64" ? "base64Binary" : BASES[ element.dataType ] || "string" );
    if ( !constraint || value.base !== "string" ) {
        // A number gets no bounds: the workbooks' max= on one is evidently a digit count (sick-leave days max=2,
        // daysAfter max=3), not a value, and as maxInclusive it refused a 14-day sick leave. Today's XSDs bound none.
        return value;
    }
    value.minLength = constraint.minLength ?? null;
    value.maxLength = constraint.maxLength ?? null;
    if ( Object.hasOwn( module.exports.CHARSET_PATTERNS, constraint.charset || "" ) ) {
        value.patterns.push( module.exports.CHARSET_PATTERNS[ constraint.charset ] );
    }
    if ( constraint.format === "yymmdd" ) {
        value.patterns.push( YYMMDD );
    }
    return value;
};

// The lexical forms of the built-ins a generated XSD uses, and the integer ranges xmllint holds them to.
const LEXICAL = Object.freeze( {
    int: /^[+-]?\d+$/,
    positiveInteger: /^\+?\d+$/,
    unsignedInt: /^\+?\d+$/,
    decimal: /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
    boolean: /^(true|false|1|0)$/,
    date: /^-?\d{4,}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/,
    dateTime: /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/
} );
const RANGES = Object.freeze( { int: [ -2147483648, 2147483647 ], positiveInteger: [ 1, Infinity ], unsignedInt: [ 0, 4294967295 ] } );

/**
 * Whether a value is valid for a value type: its base's lexical form and range, its lengths, every pattern, its bounds
 * and its enumeration. The generator writes no fixed value its own type would refuse — an XSD with one does not
 * compile — and the synthetic messages pick their values by it. Patterns are read as JavaScript regular expressions over
 * the whole value, which the NHIS patterns are written as.
 *
 * @method
 * @param {string} value
 * @param {import( "#definitions" ).ValueType} valueType
 * @returns {boolean}
 * @public
 */
module.exports.fitsValueType = ( value, valueType ) => {
    const lexical = LEXICAL[ valueType.base ];
    if ( lexical && !lexical.test( value ) ) {
        return false;
    }
    const range = RANGES[ valueType.base ];
    if ( range && ( Number( value ) < range[ 0 ] || Number( value ) > range[ 1 ] ) ) {
        return false;
    }
    const length = Array.from( value ).length;
    if ( ( valueType.minLength !== null && length < valueType.minLength ) || ( valueType.maxLength !== null && length > valueType.maxLength ) ) {
        return false;
    }
    if ( !valueType.patterns.every( ( pattern ) => new RegExp( `^(?:${ pattern })$`, "u" ).test( value ) ) ) {
        return false;
    }
    if ( ( valueType.minInclusive !== null && Number( value ) < Number( valueType.minInclusive ) )
        || ( valueType.maxInclusive !== null && Number( value ) > Number( valueType.maxInclusive ) ) ) {
        return false;
    }
    return valueType.enumeration.length === 0 || valueType.enumeration.includes( value );
};

// What the writer can write and the reader reads back: no surrounding space, and line ends as XML normalises them.
const text = ( value ) => {
    const normalised = ( value || "" ).replace( /\r\n?/g, "\n" ).trim();
    return normalised || null;
};

const documentationOf = ( element ) => {
    const description = element.description || {};
    const bg = text( description.bg );
    const en = text( description.en );
    return bg || en ? { bg: bg, en: en } : null;
};

const occurrences = ( element ) => element.cardinality
    ? { min: element.cardinality.min, max: element.cardinality.max }
    : { min: element.requirement === REQUIREMENT.REQUIRED ? 1 : 0, max: 1 };

const codedNote = ( element ) => ( element.codeList ? `Code list ${ element.codeList }.` : null );

function attributeOf( element, codeLists, name, required ) {
    const value = module.exports.valueTypeOf( element, codeLists );
    // A fixed value the type refuses would make the XSD fail to compile (I006's senderId, fixed to "NHIS" on the integer
    // list CL018). The type wins; linking reports the value as fixed-value-not-a-key.
    const fixed = element.fixedValue !== null && element.fixedValue !== undefined && module.exports.fitsValueType( element.fixedValue, value )
        ? element.fixedValue
        : null;
    return { name: name, required: required, value: value, fixed: fixed, documentation: codedNote( element ) };
}

// A field's attributes: its value, always required as in every published field type, then each attribute row under it,
// required when its row is R (§4.10).
const fieldAttributes = ( element, codeLists ) => [
    attributeOf( element, codeLists, "value", true ),
    ...element.children.filter( ( child ) => child.kind === "attribute" && child.attribute )
        .map( ( child ) => attributeOf( child, codeLists, child.attribute, child.requirement === REQUIREMENT.REQUIRED ) )
];

const sameAll = ( values ) => values.every( ( value ) => JSON.stringify( value ) === JSON.stringify( values[ 0 ] ) );

// Variants that share a tag are one element whose value takes the loosest of their types: their common one, or an
// unrestricted string (§4.10). An attribute every variant has stays as it is; one some lack becomes optional.
function mergedAttributes( variants, codeLists ) {
    const lists = variants.map( ( variant ) => fieldAttributes( variant, codeLists ) );
    const names = [ ...new Set( lists.flat().map( ( attribute ) => attribute.name ) ) ];
    return names.map( ( name ) => {
        const found = lists.map( ( attributes ) => attributes.find( ( attribute ) => attribute.name === name ) || null );
        const present = found.filter( Boolean );
        return {
            name: name,
            required: found.every( ( attribute ) => attribute && attribute.required ),
            value: sameAll( present.map( ( attribute ) => attribute.value ) ) ? present[ 0 ].value : plain( "string" ),
            fixed: sameAll( found.map( ( attribute ) => attribute && attribute.fixed ) ) ? present[ 0 ].fixed : null,
            documentation: sameAll( found.map( ( attribute ) => attribute && attribute.documentation ) ) ? present[ 0 ].documentation : null
        };
    } );
}

const field = ( path, tag, bounds, attributes, documentation ) => ( { tag: tag, path: path, kind: "field", min: bounds.min, max: bounds.max,
    type: module.exports.typeNameOf( path ), attributes: attributes, children: [], documentation: documentation, origin: null } );

function polymorphicNodes( element, codeLists ) {
    const byTag = new Map();
    for ( const variant of element.children.filter( ( child ) => child.tag && child.path ) ) {
        byTag.set( variant.tag, [ ...( byTag.get( variant.tag ) || [] ), variant ] );
    }
    const own = occurrences( element );
    // One tag: the variants are alternatives for one element. Several: each is an optional element of its own, like the
    // members of a choice, and the conditions say which applies (§4.10).
    return [ ...byTag ].map( ( [ tag, variants ] ) => field( variants[ 0 ].path, tag,
        byTag.size === 1 ? own : { min: 0, max: occurrences( variants[ 0 ] ).max },
        mergedAttributes( variants, codeLists ), byTag.size === 1 ? documentationOf( element ) : documentationOf( variants[ 0 ] ) ) );
}

function nodesOf( element, codeLists, root ) {
    if ( !element.path ) {
        return [];
    }
    if ( element.kind === "polymorphic" ) {
        return polymorphicNodes( element, codeLists );
    }
    if ( element.kind === "field" ) {
        return [ field( element.path, element.tag, occurrences( element ), fieldAttributes( element, codeLists ), documentationOf( element ) ) ];
    }
    if ( element.kind !== "group" ) {
        return [];
    }
    const bounds = occurrences( element );
    if ( root && element.tag === "Signature" ) {
        // xmldsig's, by reference: the one import a generated XSD has (§4.10).
        return [ { tag: "Signature", path: element.path, kind: "signature", min: bounds.min, max: bounds.max, type: null, attributes: [], children: [],
            documentation: null, origin: null } ];
    }
    return [ { tag: element.tag, path: element.path, kind: "group", min: bounds.min, max: bounds.max, type: module.exports.typeNameOf( element.path ),
        attributes: [], children: element.children.flatMap( ( child ) => nodesOf( child, codeLists, false ) ), documentation: documentationOf( element ),
        origin: null } ];
}

// Every type name must name one path, and no two siblings may share one: either would make a file with two
// definitions of one type, which no XSD processor compiles. A blocked import (H001's repeated identifier) is the
// usual cause; two paths spelling one name (a/bC and aB/c) the rare one.
function checkNames( root ) {
    const paths = new Map();
    const visit = ( node ) => {
        const siblings = new Set();
        for ( const child of node.children ) {
            if ( siblings.has( child.path ) ) {
                throw new RangeError( `Two elements at ${ child.path }: a message with a repeated element cannot be generated.` );
            }
            siblings.add( child.path );
        }
        if ( node.type ) {
            const other = paths.get( node.type );
            if ( other !== undefined && other !== node.path ) {
                throw new RangeError( `The type name ${ node.type } would name both ${ other } and ${ node.path }.` );
            }
            paths.set( node.type, node.path );
        }
        node.children.forEach( visit );
    };
    visit( root );
}

/**
 * A message's schema shape (design record §4.10): what its generated XSD says, as the same tree a published XSD reduces
 * to (§5.5). Exactly what the workbook specifies, and nothing else: a group's children in row order, a field's
 * attributes, occurrences from the cardinality, value types by `valueTypeOf`, fixed values fixed, documentation from the
 * descriptions. The `Signature` row is a reference to xmldsig's.
 *
 * @method
 * @param {import( "#definitions" ).Message} message
 * @param {Map<string, import( "#definitions" ).CodeList>} codeLists By ID, from the nomenclatures the version resolved
 *     against.
 * @returns {import( "#definitions" ).SchemaNode}
 * @throws {RangeError} When one type name would name two paths, or two siblings share one, naming them.
 * @public
 */
module.exports.messageShape = ( message, codeLists ) => {
    const root = { tag: "message", path: "", kind: "group", min: 1, max: 1, type: "Message", attributes: [],
        children: message.elements.flatMap( ( element ) => nodesOf( element, codeLists, true ) ), documentation: null, origin: null };
    checkNames( root );
    return root;
};
