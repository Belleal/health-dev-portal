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
const { codeListCsv, codeListJson } = require( "@health-dev-portal/spec-model/downloads" );

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
