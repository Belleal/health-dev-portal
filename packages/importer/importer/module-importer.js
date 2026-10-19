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
const { buildMessageTree } = require( "#message-tree" );
const { readMessageIndex } = require( "#messages-sheet" );
const { readChangeNotes } = require( "#change-notes" );
const { readConditions, readDictionary } = require( "#side-sheets" );
const { TAB_STATUS } = require( "#legend" );

const SHEETS = Object.freeze( {
    messages: "Съобщения",
    changeNotes: "Change Notes",
    conditions: "Conditions",
    dictionary: "Dictionary"
} );

const MESSAGE_SHEET = /^[A-Z]\d{3}$/;
const FILE_VERSION = /v(\d+\.\d+\.\d+)/i;

/**
 * Imports one module specification workbook into a module version (design record §4, §5).
 *
 * Sheets are matched by trimmed name: Excel online keeps a trailing space in a tab name, and it is invisible
 * (Review Focus 4).
 *
 * @method
 * @param {import( "#workbook-reader" ).RawWorkbook} workbook
 * @param {{spec: string, fileName?: string}} options `spec` is the module's key, e.g. `e-prescription`; `fileName`,
 *     when given, is checked against the version in the change notes.
 * @returns {{version: import( "@health-dev-portal/spec-model/definitions" ).ModuleVersion, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @throws {TypeError} When no spec key is given.
 * @public
 */
module.exports.importModuleWorkbook = ( workbook, options ) => {
    if ( !options || typeof options.spec !== "string" || options.spec === "" ) {
        throw new TypeError( "importModuleWorkbook needs options.spec, the module's key." );
    }
    const anomalies = [];
    const sheetNamed = ( name ) => workbook.sheets.find( ( candidate ) => candidate.name.trim() === name ) || null;
    const required = ( name ) => {
        const found = sheetNamed( name );
        if ( !found ) {
            anomalies.push( createAnomaly( "missing-sheet", {}, { sheet: name } ) );
        }
        return found;
    };

    const indexSheet = required( SHEETS.messages );
    const index = indexSheet ? readMessageIndex( indexSheet ) : { messages: [], anomalies: [] };
    anomalies.push( ...index.anomalies );

    const messages = index.messages.map( ( entry ) => {
        const messageSheet = sheetNamed( entry.code );
        if ( !messageSheet ) {
            anomalies.push( createAnomaly( "message-without-sheet", entry.source, { code: entry.code } ) );
            return { ...entry, lifecycle: null, changedInVersion: null, elements: [] };
        }
        const status = messageSheet.tabColour && Object.hasOwn( TAB_STATUS, messageSheet.tabColour ) ? TAB_STATUS[ messageSheet.tabColour ] : null;
        if ( !status ) {
            anomalies.push( createAnomaly( "unknown-tab-colour", { sheet: messageSheet.name }, { colour: messageSheet.tabColour || "none" } ) );
        }
        const tree = buildMessageTree( messageSheet );
        anomalies.push( ...tree.anomalies );
        return {
            ...entry,
            lifecycle: status ? status.lifecycle : null,
            changedInVersion: status ? status.changed : null,
            elements: tree.elements
        };
    } );

    for ( const candidate of workbook.sheets ) {
        const name = candidate.name.trim();
        if ( MESSAGE_SHEET.test( name ) && !index.messages.some( ( message ) => message.code === name ) ) {
            anomalies.push( createAnomaly( "sheet-without-message", { sheet: candidate.name }, { sheet: candidate.name } ) );
        }
    }

    const notesSheet = required( SHEETS.changeNotes );
    const notes = notesSheet ? readChangeNotes( notesSheet ) : { versions: [], anomalies: [] };
    anomalies.push( ...notes.anomalies );
    const latest = notes.versions[ notes.versions.length - 1 ] || null;
    if ( !latest ) {
        anomalies.push( createAnomaly( "missing-version", notesSheet ? { sheet: notesSheet.name } : {} ) );
    }
    const fileVersion = FILE_VERSION.exec( options.fileName || "" );
    if ( latest && fileVersion && fileVersion[ 1 ] !== latest.version ) {
        anomalies.push( createAnomaly( "version-mismatch", {}, { fileVersion: fileVersion[ 1 ], version: latest.version } ) );
    }

    const conditionsSheet = required( SHEETS.conditions );
    const conditions = conditionsSheet ? readConditions( conditionsSheet ) : { conditions: [], anomalies: [] };
    anomalies.push( ...conditions.anomalies );

    // Not every module has a dictionary, so its absence is not an anomaly.
    const dictionarySheet = sheetNamed( SHEETS.dictionary );
    const dictionary = dictionarySheet ? readDictionary( dictionarySheet ) : { entries: [], anomalies: [] };
    anomalies.push( ...dictionary.anomalies );

    return deepFreeze( {
        version: {
            spec: options.spec,
            version: latest ? latest.version : null,
            messages: messages,
            conditions: conditions.conditions,
            dictionary: dictionary.entries,
            changeNotes: notes.versions
        },
        anomalies: anomalies
    } );
};
