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

/**
 * The cell a missing column reads as.
 *
 * @type {Readonly<import( "#workbook-reader" ).RawCell>}
 * @public
 */
const EMPTY_CELL = Object.freeze( { text: "", fill: null, fontColour: null, indent: 0 } );
module.exports.EMPTY_CELL = EMPTY_CELL;

/**
 * Returns a row's cell at a 1-based column, or an empty cell.
 *
 * @method
 * @param {{cells: Object[]}} row
 * @param {number|null|undefined} column
 * @returns {{text: string, fill: string|null, fontColour: string|null, indent: number}}
 * @public
 */
module.exports.cellAt = ( row, column ) => ( column && row.cells[ column - 1 ] ) || EMPTY_CELL;

/**
 * Maps each non-empty header text of a row to its 1-based column; the first occurrence of a text wins.
 *
 * @method
 * @param {{cells: Object[]}} headerRow
 * @returns {Map<string, number>}
 * @public
 */
module.exports.columnMap = ( headerRow ) => {
    const map = new Map();
    headerRow.cells.forEach( ( cell, index ) => {
        if ( cell.text && !map.has( cell.text ) ) {
            map.set( cell.text, index + 1 );
        }
    } );
    return map;
};

/**
 * Finds the first row among a sheet's first rows that satisfies a predicate — a header row is not always row 1.
 *
 * @method
 * @param {{rows: Object[]}} sheet
 * @param {function( Object ): boolean} predicate
 * @param {number} [withinRows]
 * @returns {Object|null}
 * @public
 */
module.exports.findRow = ( sheet, predicate, withinRows = 10 ) => sheet.rows.find( ( row ) => row.number <= withinRows && predicate( row ) ) || null;
