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

const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { CODE_LIST_STATUS } = require( "@health-dev-portal/spec-model/kinds" );
const { cellAt, columnMap, findRow } = require( "#raw" );
const { noneToNull } = require( "#cells" );
const { foldCode } = require( "#scripts" );

/**
 * @typedef {Object} IndexEntry One list as the index sheet "Номенклатури" describes it.
 * @property {string} id
 * @property {string|null} name
 * @property {string|null} status One of `CODE_LIST_STATUS`.
 * @property {boolean|null} dynamic
 * @property {string|null} visibility
 * @property {string|null} remark
 * @property {import( "@health-dev-portal/spec-model/definitions" ).SourceRef} source
 */

// The six statuses nomenclatures 1.5.33 uses (design record §4.6).
const STATUS_NAMES = Object.freeze( {
    "В УПОТРЕБА": CODE_LIST_STATUS.IN_USE,
    "ПРЕМАХНАТА": CODE_LIST_STATUS.REMOVED,
    "ЗА РЕВИЗИЯ": CODE_LIST_STATUS.UNDER_REVISION,
    "РЕЗЕРВИРАНА": CODE_LIST_STATUS.RESERVED,
    "В РАЗРАБОТКА": CODE_LIST_STATUS.IN_DEVELOPMENT,
    "ЗА ДОПЪЛВАНЕ": CODE_LIST_STATUS.INCOMPLETE
} );

const COLUMNS = Object.freeze( { name: "Номенклатура", id: "ID", status: "Статус", dynamic: "Динамична", visibility: "Видимост", remark: "Забележка" } );

function readFlag( text, source, anomalies ) {
    const flag = text.toLowerCase();
    if ( flag === "true" || flag === "false" ) {
        return flag === "true";
    }
    if ( text ) {
        anomalies.push( createAnomaly( "invalid-flag", source, { value: text } ) );
    }
    return null;
}

/**
 * Reads the nomenclatures workbook's index sheet "Номенклатури": for each listed code list its name, status, "dynamic"
 * flag, visibility and remark (design record §4.6).
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{lists: IndexEntry[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readNomenclatureIndex = ( sheet ) => {
    const anomalies = [];
    const titled = ( row, title ) => row.cells.some( ( cell ) => cell.text === title );
    const header = findRow( sheet, ( row ) => titled( row, COLUMNS.id ) || titled( row, COLUMNS.status ) );
    if ( !header ) {
        return { lists: [], anomalies: [ createAnomaly( "missing-header-row", { sheet: sheet.name } ) ] };
    }
    const columns = columnMap( header );
    const idColumn = columns.get( COLUMNS.id );
    if ( !idColumn ) {
        return { lists: [], anomalies: [ createAnomaly( "missing-column", { sheet: sheet.name, row: header.number }, { column: COLUMNS.id } ) ] };
    }

    const lists = [];
    const firstRows = new Map();
    for ( const row of sheet.rows.filter( ( candidate ) => candidate.number > header.number ) ) {
        const idText = cellAt( row, idColumn ).text;
        if ( !idText ) {
            continue;
        }
        const at = ( column ) => ( { sheet: sheet.name, row: row.number, column: column } );
        const id = foldCode( idText, at( idColumn ), anomalies );
        if ( firstRows.has( id ) ) {
            anomalies.push( createAnomaly( "duplicate-list", { sheet: sheet.name, row: row.number }, { id: id, firstRow: firstRows.get( id ), row: row.number } ) );
            continue;
        }
        firstRows.set( id, row.number );
        const text = ( title ) => cellAt( row, columns.get( title ) ).text;
        const statusText = text( COLUMNS.status );
        const status = Object.hasOwn( STATUS_NAMES, statusText ) ? STATUS_NAMES[ statusText ] : null;
        if ( statusText && !status ) {
            anomalies.push( createAnomaly( "unknown-list-status", at( columns.get( COLUMNS.status ) ), { value: statusText } ) );
        }
        lists.push( {
            id: id,
            name: noneToNull( text( COLUMNS.name ) ),
            status: status,
            dynamic: readFlag( text( COLUMNS.dynamic ), at( columns.get( COLUMNS.dynamic ) ), anomalies ),
            visibility: noneToNull( text( COLUMNS.visibility ) ),
            remark: noneToNull( text( COLUMNS.remark ) ),
            source: { sheet: sheet.name, row: row.number }
        } );
    }
    return { lists: lists, anomalies: anomalies };
};
