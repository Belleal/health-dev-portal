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
 * Writes raw-sheet descriptions to a real .xlsx file, so the reader and the CLI are exercised end to end.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const ExcelJS = require( "exceljs" );

const writeWorkbook = async ( sheets ) => {
    const workbook = new ExcelJS.Workbook();
    for ( const sheet of sheets ) {
        const worksheet = workbook.addWorksheet( sheet.name, sheet.tabColour ? { properties: { tabColor: { argb: "FF" + sheet.tabColour } } } : {} );
        for ( const row of sheet.rows ) {
            row.cells.forEach( ( cell, index ) => {
                if ( !cell.text && !cell.fill ) {
                    return;
                }
                const target = worksheet.getCell( row.number, index + 1 );
                if ( cell.text ) {
                    target.value = cell.text;
                }
                if ( cell.fill ) {
                    target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + cell.fill } };
                }
                if ( cell.indent ) {
                    target.alignment = { indent: cell.indent };
                }
                if ( cell.fontColour ) {
                    target.font = { color: { argb: "FF" + cell.fontColour } };
                }
            } );
        }
    }
    const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "hdp-cli-" ) ), "workbook.xlsx" );
    await workbook.xlsx.writeFile( file );
    return file;
};

module.exports = { writeWorkbook };
