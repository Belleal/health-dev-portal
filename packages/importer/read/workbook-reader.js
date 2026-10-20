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

const ExcelJS = require( "exceljs" );
const { parseThemeColours } = require( "#colours" );
const { colourOf, toRawRow } = require( "#raw-cell" );

/**
 * @typedef {Object} RawCell
 * @property {string} text The value as trimmed text; a formula's cached result, never evaluated.
 * @property {string|null} fill Six hex digits of a pattern fill, or `null`.
 * @property {string|null} fontColour
 * @property {number} indent
 */

/**
 * @typedef {Object} RawRow
 * @property {number} number The Excel row number.
 * @property {RawCell[]} cells Index 0 is column A.
 */

/**
 * @typedef {Object} RawSheet
 * @property {string} name
 * @property {string|null} tabColour
 * @property {RawRow[]} rows Only rows with values.
 */

/**
 * @typedef {Object} RawWorkbook
 * @property {RawSheet[]} sheets
 * @property {Object<string, string>} themeColours
 */

function toRawSheet( worksheet, themeColours ) {
    const rows = [];
    worksheet.eachRow( { includeEmpty: false }, ( row ) => {
        rows.push( toRawRow( row, themeColours ) );
    } );
    return Object.freeze( {
        name: worksheet.name,
        tabColour: colourOf( worksheet.properties.tabColor, themeColours ),
        rows: Object.freeze( rows )
    } );
}

/**
 * Reads a workbook into raw sheets: values as text plus the formatting that carries meaning in the specification
 * template (design record §5.1, §5.7).
 *
 * @method
 * @param {string|Buffer} source A file path or the file's bytes.
 * @returns {Promise<RawWorkbook>}
 * @throws {Error} When the file cannot be read as a workbook.
 * @public
 */
module.exports.readWorkbook = async ( source ) => {
    const workbook = new ExcelJS.Workbook();
    if ( Buffer.isBuffer( source ) ) {
        await workbook.xlsx.load( source );
    } else {
        await workbook.xlsx.readFile( source );
    }
    // exceljs keeps the theme part only as raw XML on this field; it is the only way theme-indexed colours resolve.
    const themeColours = Object.freeze( parseThemeColours( workbook._themes && workbook._themes.theme1 ) );
    return Object.freeze( {
        sheets: Object.freeze( workbook.worksheets.map( ( worksheet ) => toRawSheet( worksheet, themeColours ) ) ),
        themeColours: themeColours
    } );
};
