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
 * The XSD reader (design record §5.2, §5.5): small schemas written here, in the published files' own style — a shared
 * file and a message file that includes it.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { expandMessage, parseXsd, readXsdSet } = require( "#xsd-reader" );

const schema = ( body, version = "1.0.0" ) => `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.w3.org/2000/09/xmldsig#" xmlns:nhis="https://www.his.bg"
  targetNamespace="https://www.his.bg" elementFormDefault="qualified" version="${ version }">${ body }</xs:schema>`;

// A shared file in the shape of NHIS-Commons: a message base with a header, and two field types.
const COMMONS = schema( `
  <xs:simpleType name="alphanumericString"><xs:restriction base="xs:string"><xs:pattern value="[a-zA-Z0-9\\- ]+"/></xs:restriction></xs:simpleType>
  <xs:complexType name="lrnBase"><xs:attribute name="value" use="required">
    <xs:simpleType><xs:restriction base="nhis:alphanumericString"><xs:maxLength value="36"/></xs:restriction></xs:simpleType>
  </xs:attribute><xs:attribute name="dataType" type="xs:string"/></xs:complexType>
  <xs:complexType name="codeBase"><xs:attribute name="value" use="required"><xs:simpleType>
    <xs:restriction base="xs:string"><xs:length value="4"/></xs:restriction></xs:simpleType></xs:attribute>
    <xs:attribute name="name" type="xs:string"/></xs:complexType>
  <xs:complexType name="header"><xs:sequence><xs:element name="messageType" type="nhis:codeBase"/></xs:sequence></xs:complexType>
  <xs:complexType name="messageBase"><xs:sequence><xs:element name="header" type="nhis:header"/></xs:sequence></xs:complexType>
  <xs:complexType name="contentsBase"><xs:sequence/></xs:complexType>`, "1.13.1" );

const message = ( code, contents ) => schema( `
  <xs:include schemaLocation="https://www.his.bg/api/v1/NHIS-Commons.xsd"/>
  <xs:element name="message" type="nhis:message${ code }"/>
  <xs:complexType name="message${ code }"><xs:complexContent><xs:extension base="nhis:messageBase"><xs:sequence>
    <xs:element name="contents" type="nhis:contents${ code }"/>
    <xs:element ref="Signature"/>
  </xs:sequence></xs:extension></xs:complexContent></xs:complexType>${ contents }` );

const setOf = ( messages ) => readXsdSet( [ { name: "NHIS-Commons.xsd", text: COMMONS },
    ...Object.entries( messages ).map( ( [ code, text ] ) => ( { name: `NHIS-${ code }.xsd`, text: text } ) ) ] );

const find = ( node, path ) => {
    if ( node.path === path ) {
        return node;
    }
    for ( const child of node.children ) {
        const found = find( child, path );
        if ( found ) {
            return found;
        }
    }
    return null;
};

describe( "The XSD reader", () => {

    it( "appends an extension's particles to its base's", () => {
        const root = expandMessage( setOf( { P001: message( "P001", `
          <xs:complexType name="contentsP001"><xs:sequence><xs:element name="lrn" type="nhis:lrnBase"/></xs:sequence></xs:complexType>` ) } ), "P001" );
        assert.deepEqual( [ root.path, root.tag, root.kind ], [ "", "message", "group" ] );
        assert.deepEqual( root.children.map( ( child ) => child.tag ), [ "header", "contents", "Signature" ] );
        assert.deepEqual( root.children.map( ( child ) => child.origin.file ), [ "NHIS-Commons.xsd", "NHIS-P001.xsd", "NHIS-P001.xsd" ] );
        assert.deepEqual( find( root, "contents/lrn" ).type, "lrnBase" );
    } );

    it( "reads an element's inline type where it stands", () => {
        const root = expandMessage( setOf( { P001: message( "P001", `
          <xs:complexType name="contentsP001"><xs:sequence><xs:element name="status" minOccurs="0" maxOccurs="unbounded"><xs:complexType><xs:sequence>
            <xs:element name="lrn" type="nhis:lrnBase"/></xs:sequence></xs:complexType></xs:element></xs:sequence></xs:complexType>` ) } ), "P001" );
        const status = find( root, "contents/status" );
        assert.deepEqual( [ status.type, status.kind, status.min, status.max ], [ null, "group", 0, null ] );
        assert.deepEqual( status.children.map( ( child ) => child.path ), [ "contents/status/lrn" ] );
    } );

    it( "marks the members of a choice with the choice's id", () => {
        const root = expandMessage( setOf( { R001: message( "R001", `
          <xs:complexType name="contentsR001"><xs:sequence><xs:element name="referral" type="nhis:referral"/></xs:sequence></xs:complexType>
          <xs:complexType name="referral"><xs:sequence><xs:element name="x" type="nhis:lrnBase"/>
            <xs:choice><xs:element name="y" type="nhis:lrnBase"/><xs:element name="z" type="nhis:lrnBase"/></xs:choice>
          </xs:sequence></xs:complexType>` ) } ), "R001" );
        assert.deepEqual( find( root, "contents/referral" ).children.map( ( child ) => [ child.tag, child.origin.choice ] ),
            [ [ "x", null ], [ "y", "contents/referral#1" ], [ "z", "contents/referral#1" ] ] );
    } );

    it( "reads ref=Signature as the signature, and skips dataType", () => {
        const root = expandMessage( setOf( { P001: message( "P001", `
          <xs:complexType name="contentsP001"><xs:sequence><xs:element name="lrn" type="nhis:lrnBase"/></xs:sequence></xs:complexType>` ) } ), "P001" );
        const signature = find( root, "Signature" );
        assert.deepEqual( [ signature.kind, signature.tag, signature.min, signature.max, signature.children, signature.attributes ], [ "signature", "Signature", 1, 1, [], [] ] );
        assert.deepEqual( find( root, "contents/lrn" ).attributes.map( ( attribute ) => attribute.name ), [ "value" ] );
    } );

    it( "resolves a value type through named restrictions, accumulating patterns", () => {
        const root = expandMessage( setOf( { P001: message( "P001", `
          <xs:complexType name="contentsP001"><xs:sequence><xs:element name="lrn" type="nhis:lrnBase"/></xs:sequence></xs:complexType>` ) } ), "P001" );
        const empty = { minLength: null, maxLength: null, patterns: [], minInclusive: null, maxInclusive: null, enumeration: [], totalDigits: null, fractionDigits: null };
        assert.deepEqual( find( root, "contents/lrn" ).attributes, [
            { name: "value", required: true, value: { ...empty, base: "string", maxLength: 36, patterns: [ "[a-zA-Z0-9\\- ]+" ] }, fixed: null, documentation: null }
        ] );
        assert.deepEqual( find( root, "header/messageType" ).attributes, [
            { name: "value", required: true, value: { ...empty, base: "string", minLength: 4, maxLength: 4 }, fixed: null, documentation: null },
            { name: "name", required: false, value: { ...empty, base: "string" }, fixed: null, documentation: null }
        ] );
    } );

    it( "refuses a DOCTYPE (Review Focus 2)", () => {
        const text = "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"http://example.invalid/\">]><xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"/>";
        assert.throws( () => parseXsd( text, "evil.xsd" ), { name: "UnreadableSchemaError", message: /^Cannot read evil\.xsd: / } );
    } );

    it( "refuses malformed XML, naming the file", () => {
        assert.throws( () => parseXsd( "<xs:schema>", "broken.xsd" ), { name: "UnreadableSchemaError", message: /^Cannot read broken\.xsd: / } );
    } );

    it( "keeps each message file's local types to itself (Review Focus 3)", () => {
        const set = setOf( {
            D001: message( "D001", `<xs:complexType name="contentsD001"><xs:sequence><xs:element name="treatment" type="nhis:treatment"/></xs:sequence></xs:complexType>
              <xs:complexType name="treatment"><xs:sequence><xs:element name="lrn" type="nhis:lrnBase"/></xs:sequence></xs:complexType>` ),
            D003: message( "D003", `<xs:complexType name="contentsD003"><xs:sequence><xs:element name="treatment" type="nhis:treatment"/></xs:sequence></xs:complexType>
              <xs:complexType name="treatment"><xs:sequence><xs:element name="code" type="nhis:codeBase"/></xs:sequence></xs:complexType>` )
        } );
        assert.deepEqual( find( expandMessage( set, "D001" ), "contents/treatment" ).children.map( ( child ) => child.tag ), [ "lrn" ] );
        assert.deepEqual( find( expandMessage( set, "D003" ), "contents/treatment" ).children.map( ( child ) => child.tag ), [ "code" ] );
    } );

    it( "reads an element's and an attribute's documentation", () => {
        const root = expandMessage( setOf( { P001: message( "P001", `
          <xs:complexType name="contentsP001"><xs:sequence><xs:element name="lrn" type="nhis:lrnField">
            <xs:annotation><xs:documentation xml:lang="bg">Локален номер</xs:documentation><xs:documentation xml:lang="en">Local number</xs:documentation></xs:annotation>
          </xs:element></xs:sequence></xs:complexType>
          <xs:complexType name="lrnField"><xs:attribute name="value" type="xs:int" use="required">
            <xs:annotation><xs:documentation>Code list CL001.</xs:documentation></xs:annotation></xs:attribute></xs:complexType>` ) } ), "P001" );
        const lrn = find( root, "contents/lrn" );
        assert.deepEqual( lrn.documentation, { bg: "Локален номер", en: "Local number" } );
        assert.equal( lrn.attributes[ 0 ].documentation, "Code list CL001." );
        assert.equal( find( root, "header" ).documentation, null );
    } );

    it( "gives each message file's version, and skips files that are neither shared nor a message", () => {
        const set = readXsdSet( [ { name: "NHIS-Commons.xsd", text: COMMONS }, { name: "NHIS-P001.xsd", text: message( "P001", "" ) },
            { name: "xmldsig-core-schema.xsd", text: "not even XML" } ] );
        assert.deepEqual( [ [ ...set.messages.keys() ], set.messages.get( "P001" ).version, set.shared.has( "messageBase" ) ], [ [ "P001" ], "1.0.0", true ] );
    } );
} );
