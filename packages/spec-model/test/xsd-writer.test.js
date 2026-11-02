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
 * The XSD writer (design record §4.10). spec-model parses no XML, so what a written file reads back as is the importer's
 * test (xsd-generation.test.js); here, what the text says.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { messageShape } = require( "@health-dev-portal/spec-model/xsd-shape" );
const { generateXsds, writeMessageXsd } = require( "@health-dev-portal/spec-model/xsd-writer" );
const { prescriptionMessage } = require( "./support/messages" );

const LISTS = new Map( [ [ "CL007", { id: "CL007", keyType: "string" } ], [ "CL009", { id: "CL009", keyType: "integer" } ],
    [ "CL011", { id: "CL011", keyType: "string" } ], [ "CL018", { id: "CL018", keyType: "integer" } ], [ "CL035", { id: "CL035", keyType: "integer" } ] ] );
const count = ( text, pattern ) => ( text.match( pattern ) || [] ).length;
const nodes = ( node ) => [ node, ...node.children.flatMap( nodes ) ];

describe( "writeMessageXsd", () => {

    it( "writes one top-level type per group and field, and no include, extension or choice", () => {
        const shape = messageShape( prescriptionMessage(), LISTS );
        const text = writeMessageXsd( shape, { version: "1.5.1" } );
        assert.match( text, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<xs:schema / );
        assert.match( text, / targetNamespace="https:\/\/www\.his\.bg" elementFormDefault="qualified" version="1\.5\.1">/ );
        assert.match( text, /<xs:import namespace="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#" schemaLocation="xmldsig-core-schema\.xsd"\/>/ );
        assert.match( text, /<xs:element name="message" type="nhis:Message"\/>/ );
        assert.equal( count( text, /<xs:complexType name="/g ), nodes( shape ).filter( ( node ) => node.type ).length );
        assert.equal( count( text, /<xs:complexType name="ContentsPrescriptionLrn">/g ), 1 );
        for ( const absent of [ "xs:include", "xs:extension", "xs:choice", "dataType" ] ) {
            assert.ok( !text.includes( absent ), absent );
        }
        assert.match( text, /<xs:element name="group" type="nhis:ContentsPrescriptionGroup" minOccurs="1" maxOccurs="unbounded"\/>/ );
        assert.match( text, /<xs:attribute name="value" type="xs:int" use="required">/ );
    } );

    it( "writes facets as an inline restriction, and the signature by reference", () => {
        const message = { code: "P001", elements: [
            { identity: "contents", path: "contents", kind: "group", tag: "contents", requirement: "R", cardinality: { min: 1, max: 1 }, description: {},
                children: [ { identity: "contents/lrn@value", path: "contents/lrn", kind: "field", tag: "lrn", attribute: "value", requirement: "R", cardinality: { min: 0, max: 1 },
                    dataType: "String", constraint: { raw: "max=36, chars=an", maxLength: 36, charset: "an" }, fixedValue: null, codeList: null, description: {}, children: [] } ] },
            { identity: "Signature", path: "Signature", kind: "group", tag: "Signature", requirement: "R", cardinality: { min: 1, max: 1 }, description: {}, children: [] }
        ] };
        const text = writeMessageXsd( messageShape( message, LISTS ), { version: null } );
        assert.ok( !/version="/.test( text.split( "\n" )[ 1 ] ) );
        assert.match( text, /<xs:element ref="ds:Signature" minOccurs="1" maxOccurs="1"\/>/ );
        assert.match( text, /<xs:restriction base="xs:string">\s*<xs:maxLength value="36"\/>\s*<xs:pattern value="\[a-zA-Z0-9\\- \]\+"\/>\s*<\/xs:restriction>/ );
    } );

    it( "escapes text and attribute values (Review Focus 1)", () => {
        const message = { code: "P001", elements: [ { identity: "header", path: "header", kind: "group", tag: "header", requirement: "R", cardinality: { min: 1, max: 1 },
            description: { bg: "a < b & \"c\" 'd'", en: null }, children: [ { identity: "header/messageType@value", path: "header/messageType", kind: "field", tag: "messageType",
                attribute: "value", requirement: "R", cardinality: { min: 1, max: 1 }, dataType: "String", constraint: null, fixedValue: "x\"y<z&\tw", codeList: null,
                description: {}, children: [] } ] } ] };
        const text = writeMessageXsd( messageShape( message, LISTS ), { version: "1.0.0" } );
        assert.match( text, /<xs:documentation xml:lang="bg">a &lt; b &amp; "c" 'd'<\/xs:documentation>/ );
        assert.match( text, / fixed="x&quot;y&lt;z&amp;&#9;w"/ );
    } );
} );

describe( "generateXsds", () => {

    const version = ( messages ) => ( { kind: "module", spec: "e-prescription", version: "1.5.1", messages: messages } );
    const NOMENCLATURES = { kind: "nomenclatures", spec: "nomenclatures", version: "1.5.33", codeLists: [ ...LISTS.values() ] };

    it( "writes one file per message, a withdrawn one excepted", () => {
        const withdrawn = { ...prescriptionMessage(), code: "P011", lifecycle: "withdrawn" };
        const files = generateXsds( version( [ { ...prescriptionMessage(), lifecycle: "active" }, withdrawn ] ), NOMENCLATURES );
        assert.deepEqual( files.map( ( file ) => [ file.code, file.fileName ] ), [ [ "P001", "NHIS-P001.xsd" ] ] );
        assert.match( files[ 0 ].text, /version="1\.5\.1"/ );
    } );

    it( "needs the nomenclatures the version resolved against", () => {
        assert.throws( () => generateXsds( version( [ prescriptionMessage() ] ), null ), { name: "TypeError" } );
    } );
} );
