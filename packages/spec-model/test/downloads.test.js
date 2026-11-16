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
 * The downloads of a code list (plan 8a, decision 8). spec-model may not import the data layer's test support, so the
 * content is built here.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { changelogJson, codeListCsv, codeListJson, moduleModelJson, sampleMessage } = require( "@health-dev-portal/spec-model/downloads" );
const { prescriptionMessage } = require( "./support/messages" );

const SOURCE = { sheet: "CL007", row: 5 };
const entry = ( key, overrides = {} ) => ( { key: key, description: { bg: `Запис ${ key }`, en: `Entry ${ key }` }, display: { bg: null, en: null },
    values: [ `N${ key }` ], since: "1.5.0", validUntil: null, source: SOURCE, ...overrides } );
const listOf = ( entries, version = "1.5.33" ) => ( { kind: "code-list", spec: "CL007", version: version, list: { id: "CL007", name: { bg: "Номенклатура CL007", en: null },
    status: "in-use", dynamic: false, visibility: null, remark: "вътрешна бележка", notes: [ "Източник: тест" ], keyType: "string",
    columns: [ { title: "NHIF Code", column: 6 } ], entries: entries, source: SOURCE } } );

describe( "codeListJson", () => {

    it( "writes a code list as JSON with every entry, column and version", () => {
        const parsed = JSON.parse( codeListJson( listOf( [ entry( "T1" ), entry( "T2" ) ] ) ) );
        assert.deepEqual( [ parsed.format, parsed.id, parsed.version, parsed.entries.length ], [ "nhis-code-list/1", "CL007", "1.5.33", 2 ] );
        assert.deepEqual( parsed.columns, [ "NHIF Code" ] );
        assert.deepEqual( parsed.entries[ 0 ], { key: "T1", description: { bg: "Запис T1", en: "Entry T1" }, display: { bg: null, en: null }, values: [ "NT1" ],
            since: "1.5.0", validUntil: null } );
    } );

    it( "leaves out sources, notes and the index remark, and is pretty-printed", () => {
        const text = codeListJson( listOf( [ entry( "T1" ) ] ) );
        assert.doesNotMatch( text, /source|notes|remark|sheet/ );
        assert.match( text, /^\{\n {2}"format": "nhis-code-list\/1",\n/ );
    } );
} );

describe( "codeListCsv", () => {

    it( "writes a code list as CSV for spreadsheets: BOM, CRLF, quoted fields, formulas neutralised", () => {
        const csv = codeListCsv( listOf( [ entry( "=1+1", { description: { bg: "@cmd", en: "plain" } } ) ] ) );
        assert.ok( csv.startsWith( "﻿\"key\",\"description_bg\"" ) );
        assert.match( csv, /\r\n"'=1\+1","'@cmd","plain"/ );
        assert.ok( csv.endsWith( "\r\n" ) );
    } );

    it( "names the columns in order and puts each value under its own", () => {
        const [ header, row ] = codeListCsv( listOf( [ entry( "A" ) ] ) ).slice( 1 ).split( "\r\n" );
        assert.equal( header, "\"key\",\"description_bg\",\"description_en\",\"display_bg\",\"display_en\",\"NHIF Code\",\"since\",\"valid_until\"" );
        assert.equal( row, "\"A\",\"Запис A\",\"Entry A\",\"\",\"\",\"NA\",\"1.5.0\",\"\"" );
    } );

    it( "neutralises every character a spreadsheet reads as a formula, and doubles quotes", () => {
        const keys = [ "=a", "+a", "-a", "@a", "\ta", "\ra", "a=", "say \"hi\"" ];
        const csv = codeListCsv( listOf( keys.map( ( key ) => entry( key ) ) ) );
        assert.ok( csv.includes( "\"'=a\"" ) && csv.includes( "\"'+a\"" ) && csv.includes( "\"'-a\"" ) && csv.includes( "\"'@a\"" ) );
        assert.ok( csv.includes( "\"'\ta\"" ) && csv.includes( "\"'\ra\"" ) );
        assert.ok( csv.includes( "\"a=\"" ) && csv.includes( "\"say \"\"hi\"\"\"" ) );    } );
} );

// A module version's downloads (plan 8b, decisions 3 and 4).
const LIST_TYPES = [ { id: "CL007", keyType: "string" }, { id: "CL009", keyType: "integer" }, { id: "CL011", keyType: "string" },
    { id: "CL018", keyType: "integer" }, { id: "CL035", keyType: "integer" } ];
const VERSION = Object.freeze( { spec: "e-prescription", number: "1.5.1" } );
// Two sibling fields at one path: messageShape refuses the message with a RangeError.
const brokenMessage = () => {
    const twin = () => ( { identity: "contents/identifier@value", path: "contents/identifier", kind: "field", tag: "identifier", attribute: "value", requirement: "R",
        cardinality: { min: 1, max: 1 }, dataType: "String", constraint: null, fixedValue: null, codeList: null, description: { bg: null, en: null }, children: [] } );
    return { code: "P002", elements: [ { identity: "contents", path: "contents", kind: "group", tag: "contents", attribute: null, requirement: "R",
        cardinality: { min: 1, max: 1 }, dataType: null, constraint: null, fixedValue: null, codeList: null, description: { bg: null, en: null }, children: [ twin(), twin() ] } ] };
};
const keysAtAnyDepth = ( value ) => Array.isArray( value ) ? value.flatMap( keysAtAnyDepth )
    : value && typeof value === "object" ? Object.entries( value ).flatMap( ( [ key, inner ] ) => [ key, ...keysAtAnyDepth( inner ) ] ) : [];

describe( "sampleMessage", () => {

    it( "writes a message's sample, declared and commented in both languages", () => {
        const text = sampleMessage( prescriptionMessage(), VERSION, LIST_TYPES, new Map( [ [ "CL009", "12" ] ] ) );
        assert.ok( text.startsWith( "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" ) );
        assert.match( text, /Синтетичен пример от e-prescription 1\.5\.1/ );
        assert.match( text, /Synthetic example from e-prescription 1\.5\.1/ );
        assert.match( text, /<medicationCode value="12" name="12"\/>/ );
        assert.ok( text.endsWith( "</message>\n" ) );
    } );

    it( "notes where the signature goes, before the empty one", () => {
        const message = prescriptionMessage();
        // The workbook's Signature row is a group at the root, which messageShape makes a reference to xmldsig's.
        message.elements.push( { identity: "Signature", path: "Signature", kind: "group", tag: "Signature", attribute: null, requirement: "R",
            cardinality: { min: 1, max: 1 }, dataType: null, constraint: null, fixedValue: null, codeList: null, description: { bg: null, en: null }, children: [] } );
        assert.match( sampleMessage( message, VERSION, LIST_TYPES, new Map() ), /The XML signature goes here \(xmldsig\)\. -->\n\s*<ds:Signature\/>/ );
    } );

    it( "throws the message's own RangeError, which the caller keeps to that message", () => {
        assert.throws( () => sampleMessage( brokenMessage(), VERSION, LIST_TYPES, new Map() ), RangeError );
    } );
} );

describe( "moduleModelJson", () => {

    it( "writes the model without workbook sources or the studio's bindings", () => {
        const content = { kind: "module", spec: "e-prescription", version: "1.5.1", messages: [ { ...prescriptionMessage(), source: { sheet: "P001", row: 1 } } ],
            conditions: [ { id: "CDP29", text: "…", source: { sheet: "Conditions", row: 4 } } ], conditionBindings: [ { identity: "x", condition: "CDP29" } ],
            blueprintBindings: [ { identity: "contents/prescription", blueprint: "Prescription" } ], dictionary: [ { abbreviation: "ЛЗ", source: { sheet: "Dictionary", row: 2 } } ] };
        const text = moduleModelJson( content );
        const model = JSON.parse( text );
        assert.deepEqual( Object.keys( model ), [ "format", "spec", "version", "messages", "conditions", "dictionary" ] );
        assert.deepEqual( [ model.format, model.spec, model.version, model.messages[ 0 ].code ], [ "nhis-module/1", "e-prescription", "1.5.1", "P001" ] );
        assert.equal( keysAtAnyDepth( model ).includes( "source" ), false );
        assert.ok( text.startsWith( "{\n  \"format\"" ) && text.endsWith( "}\n" ) );
    } );
} );

describe( "changelogJson", () => {

    const version = ( number ) => ( { number: number, stage: "production", expiresOn: null, enteredTesting: "2026-01-02", enteredProduction: null, replacedBy: null,
        abandoned: false, entries: { breaking: [], "dropped-plan": [], "non-breaking": [ { origin: "imported", target: null, aspect: null, before: null, after: null,
            text: { bg: `Промяна ${ number }`, en: null } } ] } } );

    it( "writes the changelog up to the version, newest first, without dates", () => {
        const log = JSON.parse( changelogJson( "e-prescription", "1.5.1", [ version( "1.5.2" ), version( "1.5.0" ), version( "1.5.1" ) ] ) );
        assert.deepEqual( [ log.format, log.spec, log.version ], [ "nhis-changelog/1", "e-prescription", "1.5.1" ] );
        assert.deepEqual( log.versions.map( ( one ) => one.number ), [ "1.5.1", "1.5.0" ] );
        assert.deepEqual( Object.keys( log.versions[ 0 ] ), [ "number", "entries" ] );
        assert.equal( log.versions[ 0 ].entries[ "non-breaking" ][ 0 ].text.bg, "Промяна 1.5.1" );
    } );
} );
