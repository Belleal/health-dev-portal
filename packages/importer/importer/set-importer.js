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

const path = require( "node:path" );
const { ERROR_CODE_LIST, linkModule, linkRules } = require( "@health-dev-portal/spec-model/links" );
const { readWorkbook } = require( "#workbook-reader" );
const { streamSheets } = require( "#stream-reader" );
const { importModuleWorkbook } = require( "#module-importer" );
const { INDEX_SHEET, importNomenclaturesWorkbook } = require( "#nomenclatures-importer" );
const { RULES_SHEET, importRulesWorkbook } = require( "#rules-importer" );

/**
 * @typedef {Object} SetInput One workbook of a set.
 * @property {string|Buffer} source A file path or the file's bytes.
 * @property {string} [fileName] Checked against the change notes' version; defaults to a path's base name.
 */

const fileNameOf = ( input ) => input.fileName || ( typeof input.source === "string" ? path.basename( input.source ) : "the workbook" );

/**
 * A workbook that cannot be read — not a fault in the importer, which surfaces as itself.
 *
 * @public
 */
class UnreadableWorkbookError extends Error {}
module.exports.UnreadableWorkbookError = UnreadableWorkbookError;

// A person reads which file failed: jszip's "Can't find end of central directory" names none.
const unreadable = ( input, error ) => new UnreadableWorkbookError( `Cannot read ${ fileNameOf( input ) }: ${ error.message }`, { cause: error } );

async function reading( input, read ) {
    try {
        return await read();
    } catch ( error ) {
        throw unreadable( input, error );
    }
}

// Only what the reader throws is the file's fault. The streamed import used to be wrapped whole, so a TypeError in a
// pure stage reported a sound workbook as unreadable (final review of plan 2).
async function* readingSheets( input, sheets ) {
    const iterator = sheets[ Symbol.asyncIterator ]();
    while ( true ) {
        let step;
        try {
            step = await iterator.next();
        } catch ( error ) {
            throw unreadable( input, error );
        }
        if ( step.done ) {
            return;
        }
        yield step.value;
    }
}

// Linking adds to a result its importer has already frozen.
const withLinks = ( result, links ) => Object.freeze( { version: result.version, anomalies: Object.freeze( [ ...result.anomalies, ...links ] ) } );

// A workbook without its defining sheet defines nothing to link against: given the rules workbook as nomenclatures,
// e-Prescription 1.5.1 drew 224 blocking unknown-code-list anomalies for the wrong file (final review of plan 2).
const defines = ( result, sheet ) => Boolean( result ) && !result.anomalies.some( ( anomaly ) => anomaly.type === "missing-sheet" && anomaly.details.sheet === sheet );

/**
 * Imports a set of workbooks of one slot — nomenclatures, rules and modules — and links them: each module's code-list
 * and rule references against the set's nomenclatures and rules, and each rule's error code against CL999 (design
 * record §4.8, §5.3). A kind the set does not include, or whose workbook lacks its defining sheet, is not linked;
 * `linked` says which were. Workbooks are read one after another, so only one is in memory while being read.
 *
 * @method
 * @param {{nomenclatures?: SetInput, rules?: SetInput, modules?: Array<SetInput & {spec: string}>}} inputs
 * @returns {Promise<{nomenclatures: Object|null, rules: Object|null, modules: Object[], linked: {codeLists: boolean, rules: boolean, errorCodes: boolean}}>}
 *     Each result is `{ version, anomalies }`, with the link anomalies added to the workbook they concern.
 *     `linked.errorCodes` says whether the rules' error codes were checked against CL999.
 * @throws {UnreadableWorkbookError} "Cannot read <file>: …" when a workbook cannot be read.
 * @public
 */
module.exports.importSet = async ( inputs ) => {
    const nomenclatures = inputs.nomenclatures
        ? await importNomenclaturesWorkbook( readingSheets( inputs.nomenclatures, streamSheets( inputs.nomenclatures.source ) ), { fileName: fileNameOf( inputs.nomenclatures ) } )
        : null;
    let rules = inputs.rules
        ? importRulesWorkbook( await reading( inputs.rules, () => readWorkbook( inputs.rules.source ) ), { fileName: fileNameOf( inputs.rules ) } )
        : null;
    const codeLists = defines( nomenclatures, INDEX_SHEET );
    const linked = Object.freeze( {
        codeLists: codeLists,
        rules: defines( rules, RULES_SHEET ),
        // Without CL999 linkRules has nothing to check against; the report says so rather than "Set accepted" alone.
        errorCodes: codeLists && defines( rules, RULES_SHEET ) && nomenclatures.version.codeLists.some( ( list ) => list.id === ERROR_CODE_LIST )
    } );
    if ( linked.errorCodes ) {
        rules = withLinks( rules, linkRules( rules.version, nomenclatures.version ) );
    }
    const modules = [];
    for ( const input of inputs.modules || [] ) {
        const workbook = await reading( input, () => readWorkbook( input.source ) );
        const result = importModuleWorkbook( workbook, { spec: input.spec, fileName: fileNameOf( input ) } );
        modules.push( withLinks( result, linkModule( result.version, {
            nomenclatures: linked.codeLists ? nomenclatures.version : null,
            rules: linked.rules ? rules.version : null
        } ) ) );
    }
    return { nomenclatures: nomenclatures, rules: rules, modules: modules, linked: linked };
};
