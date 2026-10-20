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
 * Workbook archives the streaming reader must survive, built byte by byte: a damaged one, one with a binary part,
 * one without a shared-strings part. Found by plan 2's final review.
 */

const ExcelJS = require( "exceljs" );
const JSZip = require( "jszip" );

const CENTRAL_DIRECTORY_RECORD = 0x02014b50;

// A small sound workbook as exceljs writes it.
async function soundWorkbook( decorate = () => {} ) {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet( "Номенклатури" ).getCell( "A1" ).value = "Номенклатури използвани от НЗИС";
    workbook.addWorksheet( "CL001" ).getCell( "A1" ).value = "CL001 - Пол";
    decorate( workbook );
    return Buffer.from( await workbook.xlsx.writeBuffer() );
}

/**
 * A workbook whose central directory overstates one part's uncompressed size by a byte, its data intact: the zip
 * library refuses the part only when it is read.
 *
 * @param {string} part e.g. `docProps/app.xml`, which no reader needs.
 * @returns {Promise<Buffer>}
 */
async function withLyingSize( part ) {
    const zip = await JSZip.loadAsync( await soundWorkbook() );
    const bytes = await zip.generateAsync( { type: "nodebuffer", compression: "DEFLATE" } );
    const name = Buffer.from( part );
    // A part's name appears twice, in its local header and then in its central directory record, 46 bytes in.
    const record = bytes.indexOf( name, bytes.indexOf( name ) + 1 ) - 46;
    if ( bytes.readUInt32LE( record ) !== CENTRAL_DIRECTORY_RECORD ) {
        throw new Error( `No central directory record for ${ part }.` );
    }
    bytes.writeUInt32LE( bytes.readUInt32LE( record + 24 ) + 1, record + 24 );
    return bytes;
}

/**
 * A sound workbook with an embedded image whose bytes contain the zip data-descriptor signature `PK\x07\x08`, as an
 * embedded zip or an unlucky run of bytes may.
 *
 * @returns {Promise<Buffer>}
 */
function withSignatureInMedia() {
    const png = Buffer.from( "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082", "hex" );
    return soundWorkbook( ( workbook ) => {
        const image = workbook.addImage( { buffer: Buffer.concat( [ png, Buffer.from( "504B0708DEADBEEF00000000", "hex" ) ] ), extension: "png" } );
        workbook.getWorksheet( "Номенклатури" ).addImage( image, "E1:F3" );
    } );
}

const sheetXml = ( rows ) => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    + "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"
    + rows.map( ( cells, index ) => `<row r="${ index + 1 }">${ cells.map( ( text, column ) =>
        `<c r="${ String.fromCharCode( 65 + column ) }${ index + 1 }" t="inlineStr"><is><t>${ text }</t></is></c>` ).join( "" ) }</row>` ).join( "" )
    + "</sheetData></worksheet>";

/**
 * A valid workbook written as streaming writers write one: inline strings and no shared-strings part.
 *
 * @param {Array<[string, string[][]]>} sheets Each sheet's name and its rows of cell texts, from row 1.
 * @returns {Promise<Buffer>}
 */
function withoutSharedStrings( sheets ) {
    const zip = new JSZip();
    const overrides = sheets.map( ( sheet, index ) => `<Override PartName="/xl/worksheets/sheet${ index + 1 }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` );
    zip.file( "[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
        + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>"
        + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" + overrides.join( "" ) + "</Types>" );
    zip.file( "_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
        + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>" );
    zip.file( "xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" "
        + "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>"
        + sheets.map( ( [ name ], index ) => `<sheet name="${ name }" sheetId="${ index + 1 }" r:id="rId${ index + 1 }"/>` ).join( "" ) + "</sheets></workbook>" );
    zip.file( "xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
        + sheets.map( ( sheet, index ) => `<Relationship Id="rId${ index + 1 }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${ index + 1 }.xml"/>` ).join( "" )
        + "</Relationships>" );
    sheets.forEach( ( [ , rows ], index ) => zip.file( `xl/worksheets/sheet${ index + 1 }.xml`, sheetXml( rows ) ) );
    return zip.generateAsync( { type: "nodebuffer", compression: "DEFLATE" } );
}

module.exports = { withLyingSize, withSignatureInMedia, withoutSharedStrings };
