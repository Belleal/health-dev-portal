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
 * The blueprint catalogue (design record §4.4): which business objects the published set defines, folded by
 * derivation, and which groups of the published messages carry them.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { learnCatalogue } = require( "#blueprint-catalogue" );
const { importXsdSet } = require( "#xsd-importer" );
const { readXsdSet } = require( "#xsd-reader" );

const schema = ( body ) => `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:nhis="https://www.his.bg" targetNamespace="https://www.his.bg"
  elementFormDefault="qualified" version="1.0.0">${ body }</xs:schema>`;

const extending = ( name, base, body = "" ) => `<xs:complexType name="${ name }"><xs:complexContent><xs:extension base="nhis:${ base }">
  <xs:sequence>${ body }</xs:sequence></xs:extension></xs:complexContent></xs:complexType>`;

// Field types live in NHIS-Fields, as in the published set: NHIS-Entities defines business objects only.
const FIELDS = schema( "<xs:complexType name=\"text\"><xs:attribute name=\"value\" type=\"xs:string\" use=\"required\"/></xs:complexType>" );

// NHIS-Entities' shape: a, b extending a, c extending b, and an unrelated other.
const ENTITIES = schema( `
  <xs:complexType name="a"><xs:sequence><xs:element name="id" type="nhis:text"/></xs:sequence></xs:complexType>
  ${ extending( "b", "a", "<xs:element name=\"name\" type=\"nhis:text\"/>" ) }
  ${ extending( "c", "b" ) }
  <xs:complexType name="other"><xs:sequence><xs:element name="id" type="nhis:text"/></xs:sequence></xs:complexType>` );

const MESSAGE = schema( `
  <xs:element name="message" type="nhis:messageP001"/>
  <xs:complexType name="messageP001"><xs:sequence><xs:element name="contents" type="nhis:contentsP001"/></xs:sequence></xs:complexType>
  <xs:complexType name="contentsP001"><xs:sequence>
    <xs:element name="subject" type="nhis:d"/>
    <xs:element name="requester" type="nhis:other"/>
    <xs:element name="prescription"><xs:complexType><xs:sequence><xs:element name="id" type="nhis:text"/></xs:sequence></xs:complexType></xs:element>
  </xs:sequence></xs:complexType>
  ${ extending( "d", "c" ) }` );

const setOf = () => readXsdSet( [ { name: "NHIS-Fields.xsd", text: FIELDS }, { name: "NHIS-Entities.xsd", text: ENTITIES }, { name: "NHIS-P001.xsd", text: MESSAGE } ] );

describe( "The blueprint catalogue", () => {

    it( "folds a chain of extensions into the type it starts from", () => {
        assert.deepEqual( learnCatalogue( setOf() ).blueprints, [ { key: "a", types: [ "a", "b", "c", "d" ] }, { key: "other", types: [ "other" ] } ] );
    } );

    it( "binds the groups whose type folds into a blueprint, and no others", () => {
        assert.deepEqual( learnCatalogue( setOf() ).published, { P001: { "contents/subject": "a", "contents/requester": "other" } } );
    } );

    it( "is frozen", () => {
        assert.ok( Object.isFrozen( learnCatalogue( setOf() ).blueprints[ 0 ].types ) );
    } );

    it( "imports a directory's XSDs", async () => {
        const directory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-xsd-" ) );
        fs.writeFileSync( path.join( directory, "NHIS-Fields.xsd" ), FIELDS );
        fs.writeFileSync( path.join( directory, "NHIS-Entities.xsd" ), ENTITIES );
        fs.writeFileSync( path.join( directory, "NHIS-P001.xsd" ), MESSAGE );
        fs.writeFileSync( path.join( directory, "readme.txt" ), "not an XSD" );
        const { set, catalogue } = await importXsdSet( directory );
        assert.deepEqual( [ [ ...set.messages.keys() ], catalogue.blueprints.length ], [ [ "P001" ], 2 ] );
    } );

    it( "names the file it cannot read", async () => {
        const directory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-xsd-" ) );
        fs.writeFileSync( path.join( directory, "NHIS-Entities.xsd" ), "<xs:schema" );
        await assert.rejects( importXsdSet( directory ), { name: "UnreadableSchemaError", message: /^Cannot read NHIS-Entities\.xsd: / } );
    } );
} );
