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
 * The workbook reader: exceljs in, plain frozen raw sheets out, with the formatting the importer depends on — fill,
 * indentation, font colour, tab colour — and every cell as trimmed text.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const ExcelJS = require( "exceljs" );
const { readWorkbook } = require( "#workbook-reader" );
const { cellAt, columnMap, findRow } = require( "#raw" );

async function sampleBuffer() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet( "P001", { properties: { tabColor: { argb: "FF70AD47" } } } );
    sheet.getCell( "A1" ).value = "Name";
    sheet.getCell( "B1" ).value = "Изпращач ";
    const group = sheet.getCell( "A3" );
    group.value = "Header";
    group.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBDD7EE" } };
    const field = sheet.getCell( "A4" );
    field.value = "Type of sender";
    field.alignment = { indent: 1 };
    sheet.getCell( "A5" ).value = { richText: [ { text: "Rich " }, { text: "text" } ] };
    const note = sheet.getCell( "A6" );
    note.value = "Breaking change";
    note.font = { color: { argb: "FFC65911" } };
    sheet.getCell( "F7" ).value = 4;
    sheet.getCell( "A8" ).value = { formula: "1+1", result: 2 };
    workbook.addWorksheet( "Change Notes" ).getCell( "A1" ).value = "Версия 1.0.0";
    return workbook.xlsx.writeBuffer();
}

describe( "readWorkbook", () => {
    let workbook;

    before( async () => {
        workbook = await readWorkbook( Buffer.from( await sampleBuffer() ) );
    } );

    it( "lists the sheets in order with their tab colours", () => {
        assert.deepEqual( workbook.sheets.map( ( sheet ) => sheet.name ), [ "P001", "Change Notes" ] );
        assert.equal( workbook.sheets[ 0 ].tabColour, "70AD47" );
        assert.equal( workbook.sheets[ 1 ].tabColour, null );
    } );

    it( "keeps fills and indentation, and only non-empty rows, numbered as in Excel", () => {
        const sheet = workbook.sheets[ 0 ];
        assert.deepEqual( sheet.rows.map( ( row ) => row.number ), [ 1, 3, 4, 5, 6, 7, 8 ] );
        const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === "Header" );
        assert.equal( cellAt( header, 1 ).fill, "BDD7EE" );
        assert.equal( cellAt( header, 1 ).indent, 0 );
        assert.equal( cellAt( findRow( sheet, ( row ) => row.number === 4 ), 1 ).indent, 1 );
        assert.equal( cellAt( findRow( sheet, ( row ) => row.number === 4 ), 1 ).fill, null );
    } );

    it( "turns every value into trimmed text without evaluating formulas", () => {
        const sheet = workbook.sheets[ 0 ];
        const byNumber = ( number ) => sheet.rows.find( ( row ) => row.number === number );
        assert.equal( columnMap( byNumber( 1 ) ).get( "Изпращач" ), 2 );
        assert.equal( cellAt( byNumber( 5 ), 1 ).text, "Rich text" );
        assert.equal( cellAt( byNumber( 7 ), 6 ).text, "4" );
        assert.equal( cellAt( byNumber( 8 ), 1 ).text, "2" );
    } );

    it( "keeps font colours", () => {
        const row = workbook.sheets[ 0 ].rows.find( ( candidate ) => candidate.number === 6 );
        assert.equal( cellAt( row, 1 ).fontColour, "C65911" );
    } );

    it( "returns empty cells for columns a row does not have", () => {
        const row = workbook.sheets[ 0 ].rows[ 0 ];
        assert.deepEqual( cellAt( row, 40 ), { text: "", fill: null, fontColour: null, indent: 0 } );
        assert.deepEqual( cellAt( row, null ).text, "" );
    } );

    it( "freezes what it returns", () => {
        assert.ok( Object.isFrozen( workbook.sheets ) );
        assert.ok( Object.isFrozen( workbook.sheets[ 0 ].rows[ 0 ].cells[ 0 ] ) );
    } );

    it( "reads the cells a merge covers as empty, keeping the text in its first cell", async () => {
        // exceljs gives every covered cell the first cell's value: a note merged across a row then read as an element
        // with an invalid requirement, and a condition ID merged down its lines split it into several (final review).
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet( "P001" );
        sheet.getCell( "A2" ).value = "Забележка";
        sheet.mergeCells( "A2:M2" );
        sheet.getCell( "A4" ).value = "CDP01";
        sheet.mergeCells( "A4:A6" );
        const raw = await readWorkbook( Buffer.from( await book.xlsx.writeBuffer() ) );
        const at = ( number, column ) => {
            const found = raw.sheets[ 0 ].rows.find( ( candidate ) => candidate.number === number );
            return found ? cellAt( found, column ).text : "";
        };
        assert.equal( at( 2, 1 ), "Забележка" );
        assert.equal( at( 2, 2 ), "" );
        assert.equal( at( 2, 13 ), "" );
        assert.equal( at( 4, 1 ), "CDP01" );
        assert.equal( at( 5, 1 ), "" );
        assert.equal( at( 6, 1 ), "" );
    } );

    it( "marks a colour it cannot resolve instead of reading it as none", async () => {
        // An indexed palette colour read as "no fill" would turn a group row into a field without a word (final review).
        const book = new ExcelJS.Workbook();
        const cell = book.addWorksheet( "P001" ).getCell( "A1" );
        cell.value = "Header";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { indexed: 10 } };
        const raw = await readWorkbook( Buffer.from( await book.xlsx.writeBuffer() ) );
        assert.equal( cellAt( raw.sheets[ 0 ].rows[ 0 ], 1 ).fill, "unresolved" );
    } );

    it( "reads a file path as well as a buffer", async () => {
        const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "hdp-reader-" ) ), "sample.xlsx" );
        fs.writeFileSync( file, Buffer.from( await sampleBuffer() ) );
        const fromFile = await readWorkbook( file );
        assert.equal( fromFile.sheets[ 0 ].tabColour, "70AD47" );
    } );
} );
