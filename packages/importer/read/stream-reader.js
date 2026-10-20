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
 * The streaming reader, for the nomenclatures workbook: the full reader took 751 MB for its 5 MB (design record §5.7).
 * exceljs' WorkbookReader has two habits, both measured with exceljs 4.4.0, that this file works around:
 *
 * - It skips the theme part, so theme-indexed colours (1,005 change-note fonts of nomenclatures 1.5.33 are
 *   `{ theme: 1 }`) would never resolve. The theme is read here from the same bytes with jszip, the zip library
 *   exceljs itself uses.
 * - A worksheet that arrives before the shared strings is spooled to a temporary file, and while that spool is pending
 *   the reader's entry iterator loses the rest of the archive: on a workbook exceljs writes (worksheets first,
 *   workbook part last) it then fails with "Cannot read properties of undefined (reading 'sheets')". Excel stores
 *   its workbook part early, which is why 1.5.33 survived — after spooling all 185 sheets to disk. So the archive is
 *   re-packed, uncompressed and one part at a time, with the parts a worksheet depends on first. Every worksheet is
 *   then parsed straight from the archive: no temporary files, and on 1.5.33 1.05 s at a 190 MB peak instead of 2.2 s.
 *
 * It ignores merged ranges and tab colours. Covered cells carry no value in the file, so they read as empty — as the
 * full reader reads them — and a code list needs no tab colour: its status is in the index sheet.
 */

const fs = require( "node:fs" );
const { PassThrough } = require( "node:stream" );
const ExcelJS = require( "exceljs" );
const JSZip = require( "jszip" );
const { parseThemeColours } = require( "#colours" );
const { toRawRow } = require( "#raw-cell" );

const THEME_PART = "xl/theme/theme1.xml";

// The parts the WorkbookReader must have read before a worksheet, by the names it recognises them by.
const PARTS_FIRST = Object.freeze( [ "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
    "xl/sharedStrings.xml", "xl/styles.xml" ] );

function repack( zip ) {
    const names = Object.keys( zip.files ).filter( ( name ) => !zip.files[ name ].dir );
    const ordered = [ ...PARTS_FIRST.filter( ( name ) => names.includes( name ) ), ...names.filter( ( name ) => !PARTS_FIRST.includes( name ) ) ];
    const repacked = new JSZip();
    for ( const name of ordered ) {
        // A stream, so each part is inflated only when the reader reaches it, not all 44 MB of 1.5.33 at once.
        repacked.file( name, zip.file( name ).nodeStream(), { compression: "STORE" } );
    }
    // jszip's stream comes from the readable-stream package, which the WorkbookReader does not accept as a stream.
    return repacked.generateNodeStream( { streamFiles: true, compression: "STORE" } ).pipe( new PassThrough() );
}

/**
 * Reads a workbook one sheet at a time, yielding raw sheets of the same shape as `readWorkbook`'s. Only one sheet's
 * rows are held at a time; once the consumer lets a yielded sheet go, its rows can be collected.
 *
 * Sheets arrive in the order of the zip archive, not of the tabs, and `tabColour` is always `null`.
 *
 * @method
 * @param {string|Buffer} source A file path or the file's bytes.
 * @returns {AsyncGenerator<import( "#workbook-reader" ).RawSheet>}
 * @throws {Error} When the bytes are not a workbook.
 * @public
 */
module.exports.streamSheets = async function* ( source ) {
    const bytes = Buffer.isBuffer( source ) ? source : await fs.promises.readFile( source );
    const zip = await JSZip.loadAsync( bytes );
    const themePart = zip.file( THEME_PART );
    const themeColours = Object.freeze( parseThemeColours( themePart ? await themePart.async( "string" ) : null ) );
    const reader = new ExcelJS.stream.xlsx.WorkbookReader( repack( zip ), {
        worksheets: "emit", sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", entries: "ignore"
    } );
    for await ( const worksheet of reader ) {
        const rows = [];
        for await ( const row of worksheet ) {
            // The rows eachRow( { includeEmpty: false } ) visits in the full reader: a row that is only styled is skipped.
            if ( row.hasValues ) {
                rows.push( toRawRow( row, themeColours ) );
            }
        }
        yield Object.freeze( { name: worksheet.name, tabColour: null, rows: Object.freeze( rows ) } );
    }
};
