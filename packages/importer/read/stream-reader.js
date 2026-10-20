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
 *   then parsed straight from the archive: no temporary files, and on 1.5.33 1.4 s at a 261 MB peak instead of 2.2 s.
 *
 * The re-pack brings three hazards of its own, each found by plan 2's final review and each guarded below: an error in
 * the re-packed stream went nowhere (crash or hang), data descriptors let a binary part end at the first PK\x07\x08 in
 * its bytes, and an archive without shared strings fell back to the spooling the re-pack exists to avoid.
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
const SHARED_STRINGS_PART = "xl/sharedStrings.xml";

// The parts the WorkbookReader must have read before a worksheet, by the names it recognises them by.
const PARTS_FIRST = Object.freeze( [ "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
    SHARED_STRINGS_PART, "xl/styles.xml" ] );

// The reader parses a worksheet in place only once it has seen shared strings; a workbook of inline strings, as
// streaming writers produce, has none, and lost every sheet after the first. An empty table stands in for it.
const EMPTY_SHARED_STRINGS = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" count=\"0\" uniqueCount=\"0\"/>";

const WORKSHEET_PART = /^xl\/worksheets\/sheet\d+\.xml$/;

function repack( zip ) {
    const names = Object.keys( zip.files ).filter( ( name ) => !zip.files[ name ].dir );
    // Only the parts the reader reads, all of them XML. The re-packed stream carries data descriptors, and the reader's
    // unzipper finds the end of a stored part by scanning for PK\x07\x08: a binary part holding those bytes — an image,
    // an embedded file — ended early and the workbook was refused. XML cannot hold the bytes 0x07 and 0x08. Writing
    // sizes into local headers instead (streamFiles: false) also fixed it, but let jszip run ahead of the reader: the
    // 1.5.33 import peaked at 450 MB instead of 297 MB.
    const ordered = [ ...PARTS_FIRST.filter( ( name ) => names.includes( name ) ), ...names.filter( ( name ) => WORKSHEET_PART.test( name ) ) ];
    const repacked = new JSZip();
    for ( const name of ordered ) {
        // A stream, so each part is inflated only when the generator reaches it, not all 44 MB of 1.5.33 at once.
        repacked.file( name, zip.file( name ).nodeStream(), { compression: "STORE" } );
        if ( name === "xl/_rels/workbook.xml.rels" && !names.includes( SHARED_STRINGS_PART ) ) {
            repacked.file( SHARED_STRINGS_PART, EMPTY_SHARED_STRINGS, { compression: "STORE" } );
        }
    }
    return repacked.generateNodeStream( { streamFiles: true, compression: "STORE" } );
}

// The re-packed stream's error reaches neither pipe nor reader: unheard, it crashed the process ("Unhandled 'error'
// event"), and where the process was kept alive the reader waited forever for data that would never come. So the
// error is heard here, and wakes whichever step is waiting.
function failureOf( stream, onFailure ) {
    const failure = { error: null, waiting: new Set() };
    stream.once( "error", ( error ) => {
        failure.error = error;
        onFailure();
        failure.waiting.forEach( ( wake ) => wake( error ) );
    } );
    return failure;
}

// Each step of an async iterator, unless the archive fails first. Not Promise.race against one long-lived promise:
// every race leaves a reaction on it, and over 1.5.33's 64,397 rows that took the peak from 297 MB to 481 MB.
async function* untilFailure( iterable, failure ) {
    const iterator = iterable[ Symbol.asyncIterator ]();
    while ( true ) {
        if ( failure.error ) {
            throw failure.error;
        }
        const step = await new Promise( ( resolve, reject ) => {
            const settle = ( outcome ) => ( value ) => {
                failure.waiting.delete( fail );
                outcome( value );
            };
            const fail = settle( reject );
            failure.waiting.add( fail );
            iterator.next().then( settle( resolve ), fail );
        } );
        if ( step.done ) {
            return;
        }
        yield step.value;
    }
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
 * @throws {Error} When the bytes are not a workbook, or a part of the archive is damaged.
 * @public
 */
module.exports.streamSheets = async function* ( source ) {
    const bytes = Buffer.isBuffer( source ) ? source : await fs.promises.readFile( source );
    const zip = await JSZip.loadAsync( bytes );
    const themePart = zip.file( THEME_PART );
    const themeColours = Object.freeze( parseThemeColours( themePart ? await themePart.async( "string" ) : null ) );
    const archive = repack( zip );
    // jszip's stream comes from the readable-stream package, which the WorkbookReader does not accept as a stream.
    const through = new PassThrough();
    const failure = failureOf( archive, () => through.destroy() );
    archive.pipe( through );
    const reader = new ExcelJS.stream.xlsx.WorkbookReader( through, {
        worksheets: "emit", sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", entries: "ignore"
    } );
    for await ( const worksheet of untilFailure( reader, failure ) ) {
        const rows = [];
        for await ( const row of untilFailure( worksheet, failure ) ) {
            // The rows eachRow( { includeEmpty: false } ) visits in the full reader: a row that is only styled is skipped.
            if ( row.hasValues ) {
                rows.push( toRawRow( row, themeColours ) );
            }
        }
        yield Object.freeze( { name: worksheet.name, tabColour: null, rows: Object.freeze( rows ) } );
    }
};
