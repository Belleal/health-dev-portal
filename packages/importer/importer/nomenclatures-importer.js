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
const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );
const { CODE_LIST_STATUS, SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { readChangeNotes } = require( "#change-notes" );
const { readCodeListSheet } = require( "#code-list-sheet" );
const { readNomenclatureIndex } = require( "#nomenclature-index" );
const { ambiguousSheets, workbookVersion } = require( "#workbook-checks" );

const SHEETS = Object.freeze( {
    index: "Номенклатури",
    changeNotes: "Change Notes"
} );

/**
 * The sheet that makes a workbook the nomenclatures: without it no sheet can be told a code list.
 *
 * @type {string}
 * @public
 */
module.exports.INDEX_SHEET = SHEETS.index;

const CODE_LIST_SHEET = /^CL[A-Z0-9]+$/;

function joinIndex( id, listed, read, codeLists, anomalies ) {
    if ( listed && read ) {
        anomalies.push( ...read.anomalies );
        codeLists.push( {
            ...read.codeList,
            name: { bg: read.codeList.name.bg || listed.name, en: null },
            status: listed.status,
            dynamic: listed.dynamic,
            visibility: listed.visibility,
            remark: listed.remark
        } );
    } else if ( listed && listed.status === CODE_LIST_STATUS.REMOVED ) {
        // CL068 in 1.5.33: removed, and its sheet with it. A module may still name it, which linking reports.
        codeLists.push( { id: id, name: { bg: listed.name, en: null }, status: listed.status, dynamic: listed.dynamic,
            visibility: listed.visibility, remark: listed.remark, notes: [], columns: [], entries: [], source: listed.source } );
    } else if ( listed ) {
        anomalies.push( createAnomaly( "list-without-sheet", listed.source, { id: id, status: listed.status || "unknown" } ) );
    } else {
        // CLS01 and CLS02 in 1.5.33 are relation tables, not code lists: read as one, CLS01 would block for its missing
        // Key header. The index decides what is a code list, so its own anomalies are dropped (plan 2, Decision 4).
        anomalies.push( createAnomaly( "sheet-not-listed", { sheet: read.sheetName }, { sheet: read.sheetName } ) );
    }
}

/**
 * Imports the nomenclatures workbook into a nomenclatures version (design record §4.6): every code list the index
 * sheet "Номенклатури" lists, with its status and flags, and the dated change notes.
 *
 * Sheets may arrive in any order — the streaming reader yields them in zip order, the index late — so each is read as
 * it comes and nothing is decided until the last. No raw sheet is kept once read, which is what bounds the memory.
 *
 * @method
 * @param {Iterable<import( "#workbook-reader" ).RawSheet>|AsyncIterable<import( "#workbook-reader" ).RawSheet>} sheets
 * @param {{fileName?: string}} [options] `fileName`, when given, is checked against the version in the change notes.
 * @returns {Promise<{version: import( "@health-dev-portal/spec-model/definitions" ).NomenclaturesVersion, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}>}
 * @public
 */
module.exports.importNomenclaturesWorkbook = async ( sheets, options = {} ) => {
    const names = [];
    const lists = new Map();
    let index = null;
    let notes = null;
    let notesSheetName = null;
    for await ( const sheet of sheets ) {
        names.push( sheet.name );
        const name = sheet.name.trim();
        // The first of two sheets whose names differ only in spaces is read; ambiguousSheets reports the pair.
        if ( name === SHEETS.index && !index ) {
            index = readNomenclatureIndex( sheet );
        } else if ( name === SHEETS.changeNotes && !notes ) {
            notes = readChangeNotes( sheet );
            notesSheetName = sheet.name;
        } else if ( CODE_LIST_SHEET.test( name ) && !lists.has( name ) ) {
            lists.set( name, { ...readCodeListSheet( sheet ), sheetName: sheet.name } );
        }
    }

    const anomalies = [ ...ambiguousSheets( names ) ];
    const codeLists = [];
    if ( !index ) {
        // Without the index no sheet can be told a code list, and the missing sheet says it all.
        anomalies.push( createAnomaly( "missing-sheet", {}, { sheet: SHEETS.index } ) );
    } else {
        anomalies.push( ...index.anomalies );
        const listed = new Map( index.lists.map( ( entry ) => [ entry.id, entry ] ) );
        for ( const id of [ ...new Set( [ ...listed.keys(), ...lists.keys() ] ) ].sort() ) {
            joinIndex( id, listed.get( id ), lists.get( id ), codeLists, anomalies );
        }
    }

    if ( notes ) {
        anomalies.push( ...notes.anomalies );
    } else {
        anomalies.push( createAnomaly( "missing-sheet", {}, { sheet: SHEETS.changeNotes } ) );
    }
    const version = workbookVersion( notes || { latest: null }, notesSheetName, options.fileName );
    anomalies.push( ...version.anomalies );

    return deepFreeze( {
        version: {
            kind: SPEC_KIND.NOMENCLATURES,
            spec: SPEC_KIND.NOMENCLATURES,
            version: version.version,
            codeLists: codeLists,
            changeNotes: notes ? notes.versions : []
        },
        anomalies: anomalies
    } );
};
