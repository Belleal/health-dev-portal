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
const { SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { readChangeNotes } = require( "#change-notes" );
const { readRulesSheet } = require( "#rules-sheet" );
const { ambiguousSheets, workbookVersion } = require( "#workbook-checks" );

const SHEETS = Object.freeze( {
    rules: "Rules",
    changeNotes: "Change Notes"
} );

/**
 * Imports a business-rules workbook into a rules version (design record §4.6.1). The workbook is small (30 KB for
 * 1.1.1), so it takes the full reader's output, which sees merges.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawWorkbook} workbook
 * @param {{fileName?: string}} [options] `fileName`, when given, is checked against the version in the change notes.
 * @returns {{version: import( "@health-dev-portal/spec-model/definitions" ).RulesVersion, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.importRulesWorkbook = ( workbook, options = {} ) => {
    const anomalies = [ ...ambiguousSheets( workbook.sheets.map( ( candidate ) => candidate.name ) ) ];
    const required = ( name ) => {
        const found = workbook.sheets.find( ( candidate ) => candidate.name.trim() === name ) || null;
        if ( !found ) {
            anomalies.push( createAnomaly( "missing-sheet", {}, { sheet: name } ) );
        }
        return found;
    };

    const rulesSheet = required( SHEETS.rules );
    const rules = rulesSheet ? readRulesSheet( rulesSheet ) : { rules: [], anomalies: [] };
    anomalies.push( ...rules.anomalies );

    const notesSheet = required( SHEETS.changeNotes );
    const notes = notesSheet ? readChangeNotes( notesSheet ) : { versions: [], latest: null, anomalies: [] };
    anomalies.push( ...notes.anomalies );
    const version = workbookVersion( notes, notesSheet ? notesSheet.name : null, options.fileName );
    anomalies.push( ...version.anomalies );

    return deepFreeze( {
        version: {
            kind: SPEC_KIND.RULES,
            spec: SPEC_KIND.RULES,
            version: version.version,
            rules: rules.rules,
            changeNotes: notes.versions
        },
        anomalies: anomalies
    } );
};
