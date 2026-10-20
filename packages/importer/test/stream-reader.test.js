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
 * The streaming reader (design record §5.7): the same raw sheets as the full reader, one at a time, so a 5 MB
 * nomenclatures workbook does not cost 751 MB.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const ExcelJS = require( "exceljs" );
const { readWorkbook } = require( "#workbook-reader" );
const { streamSheets } = require( "#stream-reader" );
const { writeWorkbook } = require( "./support/xlsx-builder" );
const { row, sheet } = require( "./support/raw-builders" );
const { withLyingSize, withSignatureInMedia, withoutSharedStrings } = require( "./support/archives" );

const drain = async ( iterable ) => {
    const sheets = [];
    for await ( const raw of iterable ) {
        sheets.push( raw );
    }
    return sheets;
};

describe( "streamSheets", () => {

    it( "reads what the full reader reads, sheet for sheet, except the tab colour", async () => {
        const file = await writeWorkbook( [
            sheet( "CL001", [ row( 1, [ "CL001 - Пол" ] ), row( 4, [ "Key", "Description BG" ], { fill: "BDD7EE" } ),
                row( 5, [ "1", "мъж" ], { indent: 2, fontColour: "C65911" } ), row( 7, [ "", "бележка" ] ) ] ),
            sheet( "Change Notes", [ row( 1, [ "Версия 1.0.0" ] ) ], "70AD47" )
        ] );
        const full = await readWorkbook( file );
        const streamed = await drain( streamSheets( file ) );
        assert.deepEqual( streamed.map( ( raw ) => raw.name ).sort(), [ "CL001", "Change Notes" ] );
        for ( const raw of streamed ) {
            assert.deepEqual( raw.rows, full.sheets.find( ( candidate ) => candidate.name === raw.name ).rows, raw.name );
            assert.equal( raw.tabColour, null );
        }
    } );

    it( "resolves theme colours through the workbook's own theme part", async () => {
        // Written with exceljs directly: the test builder writes only argb colours.
        const workbook = new ExcelJS.Workbook();
        const target = workbook.addWorksheet( "Change Notes" ).getCell( "A1" );
        target.value = "Версия 1.0.0";
        target.font = { color: { theme: 1 } };
        target.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 0 } };
        const [ raw ] = await drain( streamSheets( Buffer.from( await workbook.xlsx.writeBuffer() ) ) );
        assert.deepEqual( [ raw.rows[ 0 ].cells[ 0 ].fontColour, raw.rows[ 0 ].cells[ 0 ].fill ], [ "000000", "FFFFFF" ] );
    } );

    it( "reads a covered merged cell as empty, as the full reader does", async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet( "CL006" );
        worksheet.getCell( "A1" ).value = "1004";
        worksheet.mergeCells( "A1:A2" );
        worksheet.getCell( "B2" ).value = "00";
        const [ raw ] = await drain( streamSheets( Buffer.from( await workbook.xlsx.writeBuffer() ) ) );
        assert.deepEqual( raw.rows.map( ( entry ) => entry.cells.map( ( one ) => one.text ) ), [ [ "1004" ], [ "", "00" ] ] );
    } );

    it( "rejects bytes that are not a workbook", async () => {
        await assert.rejects( drain( streamSheets( Buffer.from( "not a workbook" ) ) ) );
    } );

    // Final review of plan 2: the re-packed archive's error went nowhere, so a damaged workbook crashed the process
    // with an unhandled 'error' event, or — where something kept the process alive — left the import pending forever.
    it( "rejects a damaged archive instead of crashing or hanging", { timeout: 15000 }, async () => {
        for ( const part of [ "xl/styles.xml", "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml" ] ) {
            await assert.rejects( drain( streamSheets( await withLyingSize( part ) ) ), /size mismatch/, part );
        }
        // A damaged part the reader has no use for is not re-packed, so it cannot fail the read.
        assert.equal( ( await drain( streamSheets( await withLyingSize( "docProps/app.xml" ) ) ) ).length, 2 );
    } );

    it( "reads a workbook whose binary part holds the bytes of a zip signature", async () => {
        // Re-packed with data descriptors, a stored part ended at the first PK\x07\x08 in its bytes.
        assert.deepEqual( ( await drain( streamSheets( await withSignatureInMedia() ) ) ).map( ( raw ) => raw.name ).sort(), [ "CL001", "Номенклатури" ] );
    } );

    // CodeRabbit on #6: a consumer that stopped early — an importer fault mid-stream — closed only the wrapper, and
    // the archive went on feeding a reader nobody read.
    it( "closes the reader when the consumer stops early", async () => {
        const prototype = ExcelJS.stream.xlsx.WorkbookReader.prototype;
        const original = prototype[ Symbol.asyncIterator ];
        let closed = 0;
        prototype[ Symbol.asyncIterator ] = function () {
            const iterator = original.call( this );
            const close = iterator.return.bind( iterator );
            iterator.return = ( value ) => {
                closed++;
                return close( value );
            };
            return iterator;
        };
        try {
            const file = await writeWorkbook( [ sheet( "A", [ row( 1, [ "a" ] ) ] ), sheet( "B", [ row( 1, [ "b" ] ) ] ), sheet( "C", [ row( 1, [ "c" ] ) ] ) ] );
            for await ( const raw of streamSheets( file ) ) {
                assert.equal( raw.name, "A" );
                break;
            }
            assert.equal( closed, 1 );
        } finally {
            prototype[ Symbol.asyncIterator ] = original;
        }
    } );

    it( "reads a workbook that has no shared-strings part", async () => {
        // Without the part the reader fell back to spooling and lost every sheet after the first.
        const bytes = await withoutSharedStrings( [ [ "Номенклатури", [ [ "ID" ] ] ], [ "CL001", [ [ "Key" ], [ "1" ] ] ], [ "Change Notes", [ [ "Версия 1.5.33" ] ] ] ] );
        const sheets = await drain( streamSheets( bytes ) );
        assert.deepEqual( sheets.map( ( raw ) => raw.name ).sort(), [ "CL001", "Change Notes", "Номенклатури" ] );
        assert.deepEqual( sheets.find( ( raw ) => raw.name === "CL001" ).rows.map( ( entry ) => entry.cells[ 0 ].text ), [ "Key", "1" ] );
    } );
} );
