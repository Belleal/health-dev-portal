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

const { LIFECYCLE } = require( "#kinds" );
const { messageShape } = require( "#xsd-shape" );

const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";

// Text needs &, < and > escaped. An attribute value also needs its quote, and its tab and line ends as references:
// a parser turns literal ones into spaces, so a fixed value would read back different.
const escapeText = ( value ) => value.replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" );
const escapeAttribute = ( value ) => escapeText( value ).replace( /"/g, "&quot;" ).replace( /\t/g, "&#9;" ).replace( /\n/g, "&#10;" ).replace( /\r/g, "&#13;" );
const attributes = ( pairs ) => pairs.filter( ( [ , value ] ) => value !== null && value !== undefined )
    .map( ( [ name, value ] ) => ` ${ name }="${ escapeAttribute( String( value ) ) }"` ).join( "" );

const indent = ( depth ) => "  ".repeat( depth );

function annotation( texts, depth ) {
    if ( texts.length === 0 ) {
        return [];
    }
    return [
        `${ indent( depth ) }<xs:annotation>`,
        ...texts.map( ( [ language, text ] ) => `${ indent( depth + 1 ) }<xs:documentation${ attributes( [ [ "xml:lang", language ] ] ) }>${ escapeText( text ) }</xs:documentation>` ),
        `${ indent( depth ) }</xs:annotation>`
    ];
}

const elementTexts = ( documentation ) => documentation
    ? [ [ "bg", documentation.bg ], [ "en", documentation.en ] ].filter( ( [ , text ] ) => text )
    : [];

const occurs = ( node ) => [ [ "minOccurs", node.min ], [ "maxOccurs", node.max === null ? "unbounded" : node.max ] ];

function particle( node, depth ) {
    if ( node.kind === "signature" ) {
        return [ `${ indent( depth ) }<xs:element${ attributes( [ [ "ref", "ds:Signature" ], ...occurs( node ) ] ) }/>` ];
    }
    const head = `${ indent( depth ) }<xs:element${ attributes( [ [ "name", node.tag ], [ "type", `nhis:${ node.type }` ], ...occurs( node ) ] ) }`;
    const texts = elementTexts( node.documentation );
    return texts.length ? [ `${ head }>`, ...annotation( texts, depth + 1 ), `${ indent( depth ) }</xs:element>` ] : [ `${ head }/>` ];
}

// Facets in one fixed order, so a file changes only where its message did.
function facets( value ) {
    return [
        [ "minInclusive", value.minInclusive ],
        [ "maxInclusive", value.maxInclusive ],
        [ "totalDigits", value.totalDigits ],
        [ "fractionDigits", value.fractionDigits ],
        [ "minLength", value.minLength ],
        [ "maxLength", value.maxLength ],
        ...value.enumeration.map( ( entry ) => [ "enumeration", entry ] ),
        ...value.patterns.map( ( pattern ) => [ "pattern", pattern ] )
    ].filter( ( [ , given ] ) => given !== null && given !== undefined );
}

function attribute( entry, depth ) {
    const restrictions = facets( entry.value );
    const head = [ [ "name", entry.name ], ...( restrictions.length ? [] : [ [ "type", `xs:${ entry.value.base }` ] ] ),
        [ "use", entry.required ? "required" : null ], [ "fixed", entry.fixed ] ];
    const texts = entry.documentation ? [ [ null, entry.documentation ] ] : [];
    const documentation = texts.length ? [
        `${ indent( depth + 1 ) }<xs:annotation>`,
        `${ indent( depth + 2 ) }<xs:documentation>${ escapeText( entry.documentation ) }</xs:documentation>`,
        `${ indent( depth + 1 ) }</xs:annotation>`
    ] : [];
    if ( restrictions.length === 0 && documentation.length === 0 ) {
        return [ `${ indent( depth ) }<xs:attribute${ attributes( head ) }/>` ];
    }
    return [
        `${ indent( depth ) }<xs:attribute${ attributes( head ) }>`,
        ...documentation,
        ...( restrictions.length ? [
            `${ indent( depth + 1 ) }<xs:simpleType>`,
            `${ indent( depth + 2 ) }<xs:restriction${ attributes( [ [ "base", `xs:${ entry.value.base }` ] ] ) }>`,
            ...restrictions.map( ( [ name, given ] ) => `${ indent( depth + 3 ) }<xs:${ name }${ attributes( [ [ "value", given ] ] ) }/>` ),
            `${ indent( depth + 2 ) }</xs:restriction>`,
            `${ indent( depth + 1 ) }</xs:simpleType>`
        ] : [] ),
        `${ indent( depth ) }</xs:attribute>`
    ];
}

function typeDefinition( node ) {
    if ( node.kind === "field" ) {
        return [ `${ indent( 1 ) }<xs:complexType${ attributes( [ [ "name", node.type ] ] ) }>`, ...node.attributes.flatMap( ( entry ) => attribute( entry, 2 ) ),
            `${ indent( 1 ) }</xs:complexType>` ];
    }
    const sequence = node.children.length
        ? [ `${ indent( 2 ) }<xs:sequence>`, ...node.children.flatMap( ( child ) => particle( child, 3 ) ), `${ indent( 2 ) }</xs:sequence>` ]
        : [ `${ indent( 2 ) }<xs:sequence/>` ];
    return [ `${ indent( 1 ) }<xs:complexType${ attributes( [ [ "name", node.type ] ] ) }>`, ...sequence, `${ indent( 1 ) }</xs:complexType>` ];
}

const typed = ( node ) => [ ...( node.type ? [ node ] : [] ), ...node.children.flatMap( typed ) ];

/**
 * Writes a message's schema shape as one self-contained XSD (design record §4.10): no include, no extension, no choice
 * and no shared type. Every group and field has its own named type at the top level, defined once, depth first in row
 * order. The one import is xmldsig's, for `Signature`. Element and attribute names, their order and the namespace are
 * the wire's, unchanged.
 *
 * @method
 * @param {import( "#definitions" ).SchemaNode} shape The root `message`, from `messageShape`.
 * @param {{version: string|null}} options `version` is the module version, written as the schema's `version`.
 * @returns {string}
 * @public
 */
module.exports.writeMessageXsd = ( shape, options ) => [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    `<xs:schema${ attributes( [ [ "xmlns:xs", "http://www.w3.org/2001/XMLSchema" ], [ "xmlns:nhis", "https://www.his.bg" ], [ "xmlns:ds", XMLDSIG ],
        [ "targetNamespace", "https://www.his.bg" ], [ "elementFormDefault", "qualified" ], [ "version", options.version ] ] ) }>`,
    `${ indent( 1 ) }<xs:import${ attributes( [ [ "namespace", XMLDSIG ], [ "schemaLocation", "xmldsig-core-schema.xsd" ] ] ) }/>`,
    `${ indent( 1 ) }<xs:element${ attributes( [ [ "name", "message" ], [ "type", `nhis:${ shape.type }` ] ] ) }/>`,
    ...typed( shape ).flatMap( typeDefinition ),
    "</xs:schema>",
    ""
].join( "\n" );

/**
 * Generates a module version's XSDs (design record §4.10): one per message, a withdrawn one excepted, from the version
 * and the nomenclatures it resolved against. So any kept version's XSDs can be generated again.
 *
 * @method
 * @param {import( "#definitions" ).ModuleVersion} version
 * @param {import( "#definitions" ).NomenclaturesVersion} nomenclatures
 * @returns {Array<{code: string, fileName: string, text: string}>}
 * @throws {TypeError} Without nomenclatures: a coded value's type is its list's key type.
 * @throws {RangeError} For a message that cannot be generated, from `messageShape`.
 * @public
 */
module.exports.generateXsds = ( version, nomenclatures ) => {
    if ( !nomenclatures || !Array.isArray( nomenclatures.codeLists ) ) {
        throw new TypeError( "generateXsds needs the nomenclatures the version resolved against: a coded value is typed by its list's key type." );
    }
    const codeLists = new Map( nomenclatures.codeLists.map( ( list ) => [ list.id, list ] ) );
    return version.messages.filter( ( message ) => message.lifecycle !== LIFECYCLE.WITHDRAWN ).map( ( message ) => ( {
        code: message.code,
        fileName: `NHIS-${ message.code }.xsd`,
        text: module.exports.writeMessageXsd( messageShape( message, codeLists ), { version: version.version } )
    } ) );
};
