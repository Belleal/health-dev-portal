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
 * A message's schema shape (design record §4.10): what its generated XSD will say, before any XML is written.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { CHARSET_PATTERNS, fitsValueType, messageShape, typeNameOf, valueTypeOf } = require( "@health-dev-portal/spec-model/xsd-shape" );
const { elementAt, prescriptionMessage } = require( "./support/messages" );

const LISTS = new Map( [ [ "CL007", { id: "CL007", keyType: "string" } ], [ "CL009", { id: "CL009", keyType: "integer" } ],
    [ "CL011", { id: "CL011", keyType: "string" } ], [ "CL018", { id: "CL018", keyType: "integer" } ], [ "CL035", { id: "CL035", keyType: "integer" } ] ] );
const NONE = Object.freeze( { minLength: null, maxLength: null, patterns: [], minInclusive: null, maxInclusive: null, enumeration: [], totalDigits: null, fractionDigits: null } );
const type = ( base, facets = {} ) => ( { base: base, ...NONE, ...facets } );
const element = ( extra ) => ( { dataType: null, constraint: null, codeList: null, ...extra } );

const find = ( node, path ) => node.path === path ? node : node.children.reduce( ( found, child ) => found || find( child, path ), null );
const types = ( node ) => [ ...( node.type ? [ [ node.path, node.type ] ] : [] ), ...node.children.flatMap( types ) ];

// A field row of the support message's shape, with whatever a test needs on it.
const row = ( identity, kind, extra = {} ) => {
    const path = identity.replace( /[@#].*$/, "" );
    return { identity: identity, path: path, kind: kind, tag: path.split( "/" ).pop(), attribute: identity.includes( "@" ) ? identity.split( "@" )[ 1 ].replace( /#.*$/, "" ) : null,
        requirement: "R", cardinality: { min: 1, max: 1 }, dataType: null, constraint: null, fixedValue: null, codeList: null,
        description: { bg: null, en: null }, children: [], ...extra };
};

describe( "typeNameOf", () => {

    it( "names types by tag path", () => {
        assert.equal( typeNameOf( "" ), "Message" );
        assert.equal( typeNameOf( "contents/prescription/lrn" ), "ContentsPrescriptionLrn" );
        assert.equal( typeNameOf( "header" ), "Header" );
    } );
} );

describe( "valueTypeOf", () => {

    it( "types values by data type and key type", () => {
        assert.deepEqual( [
            element( { dataType: "Codeable Concept", codeList: "CL007" } ),
            element( { dataType: "Codeable Concept", codeList: "CL018" } ),
            element( { dataType: "String", codeList: "CL018" } ),
            element( { dataType: "Codeable Concept" } ),
            element( { dataType: "Unsigned Int" } ),
            element( { dataType: "Positive Int" } ),
            element( { dataType: "Boolean" } ),
            element( { dataType: "Date" } ),
            element( { dataType: "Date and Time" } ),
            element( { dataType: "Decimal" } ),
            element( { dataType: "Something new" } ),
            element( { dataType: "Codeable Concept", codeList: "CL404" } )
        ].map( ( candidate ) => valueTypeOf( candidate, LISTS ).base ),
        [ "string", "int", "int", "string", "unsignedInt", "positiveInteger", "boolean", "date", "dateTime", "decimal", "string", "string" ] );
    } );

    it( "turns a constraint into facets", () => {
        assert.deepEqual( valueTypeOf( element( { dataType: "String", constraint: { raw: "max=36, chars=an", maxLength: 36, charset: "an" } } ), LISTS ),
            type( "string", { maxLength: 36, patterns: [ CHARSET_PATTERNS.an ] } ) );
        assert.deepEqual( valueTypeOf( element( { dataType: "String", constraint: { raw: "min=12, max=12, chars=n", minLength: 12, maxLength: 12, charset: "n" } } ), LISTS ),
            type( "string", { minLength: 12, maxLength: 12, patterns: [ "[0-9]+" ] } ) );
        assert.deepEqual( valueTypeOf( element( { dataType: "String", constraint: { raw: "max=255, chars=ans", maxLength: 255, charset: "ans" } } ), LISTS ),
            type( "string", { maxLength: 255 } ) );
        assert.deepEqual( valueTypeOf( element( { dataType: "String", constraint: { raw: "see the note" } } ), LISTS ), type( "string" ) );
        assert.deepEqual( valueTypeOf( element( { dataType: "String", constraint: { raw: "YYMMDD", format: "yymmdd" } } ), LISTS ), type( "string", { patterns: [ "[0-9]{6}" ] } ) );
        // On a number, the workbooks' max= is evidently a digit count — sick-leave days max=2, daysAfter max=3 — though the
        // import reads it as a value. Written as maxInclusive it refused a 14-day sick leave; today's XSDs bound none.
        assert.deepEqual( valueTypeOf( element( { dataType: "Positive Int", constraint: { raw: "max=2", maxValue: 2 } } ), LISTS ), type( "positiveInteger" ) );
        assert.deepEqual( valueTypeOf( element( { dataType: "String", constraint: { raw: "base64", format: "base64" } } ), LISTS ), type( "base64Binary" ) );
        // A code-list value is typed by its list alone: its key, not its length, is what the list defines.
        assert.deepEqual( valueTypeOf( element( { dataType: "Codeable Concept", codeList: "CL007", constraint: { raw: "max=2, chars=an", maxLength: 2, charset: "an" } } ), LISTS ),
            type( "string" ) );
    } );

    it( "tells whether a value fits a value type", () => {
        const cases = [
            [ "4", type( "int" ), true ], [ "NHIS", type( "int" ), false ], [ "-12", type( "int" ), true ], [ "2147483648", type( "int" ), false ],
            [ "0", type( "positiveInteger" ), false ], [ "7", type( "positiveInteger" ), true ], [ "0", type( "unsignedInt" ), true ],
            [ "1.5", type( "decimal" ), true ], [ "1,5", type( "decimal" ), false ], [ "true", type( "boolean" ), true ], [ "да", type( "boolean" ), false ],
            [ "2026-01-02", type( "date" ), true ], [ "02.01.2026", type( "date" ), false ], [ "2026-01-02T03:04:05", type( "dateTime" ), true ],
            [ "P001", type( "string", { minLength: 4, maxLength: 4, patterns: [ CHARSET_PATTERNS.an ] } ), true ],
            [ "Р001", type( "string", { patterns: [ CHARSET_PATTERNS.an ] } ), false ], [ "Русе", type( "string", { patterns: [ CHARSET_PATTERNS.a ] } ), true ],
            [ "12", type( "string", { minLength: 3 } ), false ], [ "5", type( "int", { minInclusive: "1", maxInclusive: "4" } ), false ]
        ];
        assert.deepEqual( cases.map( ( [ value, valueType ] ) => fitsValueType( value, valueType ) ), cases.map( ( [ , , fits ] ) => fits ) );
    } );

    it( "copies NHIS-Commons 1.13.1's character classes verbatim", () => {
        assert.deepEqual( CHARSET_PATTERNS, { n: "[0-9]+", an: "[a-zA-Z0-9\\- ]+", a: "[a-zа-яA-ZА-Я\\- ]+" } );
        assert.ok( Object.isFrozen( CHARSET_PATTERNS ) );
    } );
} );

describe( "messageShape", () => {

    it( "shapes a message: the root, its groups and fields, their attributes and occurrences", () => {
        const shape = messageShape( prescriptionMessage(), LISTS );
        assert.deepEqual( [ shape.tag, shape.path, shape.kind, shape.type, shape.min, shape.max, shape.origin ], [ "message", "", "group", "Message", 1, 1, null ] );
        assert.deepEqual( shape.children.map( ( child ) => child.path ), [ "header", "contents" ] );
        const code = find( shape, "contents/prescription/group/medication/medicationCode" );
        assert.deepEqual( [ code.kind, code.type, code.min, code.max ], [ "field", "ContentsPrescriptionGroupMedicationMedicationCode", 1, 1 ] );
        assert.deepEqual( code.attributes.map( ( attribute ) => [ attribute.name, attribute.required, attribute.value.base, attribute.documentation ] ),
            [ [ "value", true, "int", "Code list CL009." ], [ "name", true, "int", "Code list CL009." ] ] );
        const group = find( shape, "contents/prescription/group" );
        assert.deepEqual( [ group.kind, group.min, group.max, group.attributes ], [ "group", 1, null, [] ] );
    } );

    it( "makes one element of variants that share a tag, typed by the loosest", () => {
        const dose = find( messageShape( prescriptionMessage(), LISTS ), "contents/prescription/group/medication/doseQuantityCode" );
        assert.deepEqual( [ dose.kind, dose.min, dose.max, dose.attributes.map( ( attribute ) => [ attribute.name, attribute.value ] ) ],
            [ "field", 1, 1, [ [ "value", type( "string" ) ] ] ] );
    } );

    it( "makes optional elements of variants with tags of their own", () => {
        const message = { code: "X003", elements: [ row( "contents", "group", { children: [ row( "contents/answer@value", "polymorphic", { cardinality: { min: 1, max: 1 }, children: [
            row( "contents/valueQuantity@value#1", "field", { dataType: "Decimal" } ),
            row( "contents/valueCode@value#2", "field", { dataType: "Codeable Concept", codeList: "CL007", cardinality: { min: 1, max: null } } ) ] } ) ] } ) ] };
        const contents = find( messageShape( message, LISTS ), "contents" );
        assert.deepEqual( contents.children.map( ( child ) => [ child.path, child.kind, child.min, child.max, child.attributes[ 0 ].value.base ] ),
            [ [ "contents/valueQuantity", "field", 0, 1, "decimal" ], [ "contents/valueCode", "field", 0, null, "string" ] ] );
    } );

    it( "makes the Signature row a reference, and fixed values fixed", () => {
        const message = { code: "P001", elements: [
            row( "header", "group", { children: [ row( "header/messageType@value", "field", { dataType: "String", fixedValue: "P001" } ) ] } ),
            row( "Signature", "group" )
        ] };
        const shape = messageShape( message, LISTS );
        assert.deepEqual( find( shape, "header/messageType" ).attributes[ 0 ].fixed, "P001" );
        const signature = find( shape, "Signature" );
        assert.deepEqual( [ signature.kind, signature.type, signature.children, signature.attributes ], [ "signature", null, [], [] ] );
    } );

    // e-Immunization 1.2.2's I006 fixes its senderId to "NHIS" while giving it the integer list CL018: written as fixed,
    // the XSD failed to compile. The type wins, and linking reports the value (fixed-value-not-a-key).
    it( "writes no fixed value its own type would refuse", () => {
        const message = { code: "I006", elements: [ row( "header", "group", { children: [
            row( "header/senderId@value", "field", { dataType: "String", codeList: "CL018", fixedValue: "NHIS" } ),
            row( "header/sender@value", "field", { dataType: "Codeable Concept", codeList: "CL018", fixedValue: "4" } ) ] } ) ] };
        const shape = messageShape( message, LISTS );
        assert.deepEqual( [ find( shape, "header/senderId" ).attributes[ 0 ].fixed, find( shape, "header/sender" ).attributes[ 0 ].fixed ], [ null, "4" ] );
    } );

    it( "documents an element by its description in each language it has", () => {
        const message = { code: "P001", elements: [ row( "contents", "group", { children: [
            row( "contents/lrn@value", "field", { dataType: "String", description: { bg: " Локален номер\r\nна рецептата ", en: null } } ) ] } ) ] };
        const shape = messageShape( message, LISTS );
        assert.deepEqual( find( shape, "contents/lrn" ).documentation, { bg: "Локален номер\nна рецептата", en: null } );
        assert.equal( find( shape, "contents" ).documentation, null );
    } );

    it( "keeps every other type name when an element is added (Review Focus 5)", () => {
        const before = new Map( types( messageShape( prescriptionMessage(), LISTS ) ) );
        const grown = prescriptionMessage();
        elementAt( grown, "contents/prescription" ).children.splice( 1, 0, row( "contents/prescription/newField@value", "field", { dataType: "String" } ) );
        const after = new Map( types( messageShape( grown, LISTS ) ) );
        assert.equal( after.size, before.size + 1 );
        for ( const [ path, name ] of before ) {
            assert.equal( after.get( path ), name, path );
        }
    } );

    it( "refuses a shape in which one type name would name two paths", () => {
        const message = { code: "P001", elements: [ row( "contents", "group", { children: [
            row( "contents/a", "group", { children: [ row( "contents/a/bC@value", "field", { dataType: "String" } ) ] } ),
            row( "contents/aB", "group", { children: [ row( "contents/aB/c@value", "field", { dataType: "String" } ) ] } ) ] } ) ] };
        assert.throws( () => messageShape( message, LISTS ), { name: "RangeError", message: /contents\/a\/bC.*contents\/aB\/c|contents\/aB\/c.*contents\/a\/bC/ } );
    } );

    it( "refuses two sibling elements at one path", () => {
        const message = { code: "H001", elements: [ row( "contents", "group", { children: [
            row( "contents/identifier@value", "field", { dataType: "String" } ), row( "contents/identifier@value", "field", { dataType: "String" } ) ] } ) ] };
        assert.throws( () => messageShape( message, LISTS ), { name: "RangeError", message: /contents\/identifier/ } );
    } );
} );
