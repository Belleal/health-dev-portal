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
const { linkModule, linkRules } = require( "@health-dev-portal/spec-model/links" );
const { readWorkbook } = require( "#workbook-reader" );
const { streamSheets } = require( "#stream-reader" );
const { importModuleWorkbook } = require( "#module-importer" );
const { importNomenclaturesWorkbook } = require( "#nomenclatures-importer" );
const { importRulesWorkbook } = require( "#rules-importer" );

/**
 * @typedef {Object} SetInput One workbook of a set.
 * @property {string|Buffer} source A file path or the file's bytes.
 * @property {string} [fileName] Checked against the change notes' version; defaults to a path's base name.
 */

const fileNameOf = ( input ) => input.fileName || ( typeof input.source === "string" ? path.basename( input.source ) : "the workbook" );

// A person reads which file failed: jszip's "Can't find end of central directory" names none.
async function reading( input, read ) {
    try {
        return await read();
    } catch ( error ) {
        throw new Error( `Cannot read ${ fileNameOf( input ) }: ${ error.message }`, { cause: error } );
    }
}

// Linking adds to a result its importer has already frozen.
const withLinks = ( result, links ) => Object.freeze( { version: result.version, anomalies: Object.freeze( [ ...result.anomalies, ...links ] ) } );

/**
 * Imports a set of workbooks of one slot — nomenclatures, rules and modules — and links them: each module's code-list
 * and rule references against the set's nomenclatures and rules, and each rule's error code against CL999 (design
 * record §4.8, §5.3). A kind the set does not include is not linked. Workbooks are read one after another, so only
 * one is in memory while being read.
 *
 * @method
 * @param {{nomenclatures?: SetInput, rules?: SetInput, modules?: Array<SetInput & {spec: string}>}} inputs
 * @returns {Promise<{nomenclatures: Object|null, rules: Object|null, modules: Object[]}>} Each result is
 *     `{ version, anomalies }`, with the link anomalies added to the workbook they concern.
 * @throws {Error} "Cannot read <file>: …" when a workbook cannot be read.
 * @public
 */
module.exports.importSet = async ( inputs ) => {
    const nomenclatures = inputs.nomenclatures
        ? await reading( inputs.nomenclatures, () => importNomenclaturesWorkbook( streamSheets( inputs.nomenclatures.source ), { fileName: fileNameOf( inputs.nomenclatures ) } ) )
        : null;
    let rules = inputs.rules
        ? importRulesWorkbook( await reading( inputs.rules, () => readWorkbook( inputs.rules.source ) ), { fileName: fileNameOf( inputs.rules ) } )
        : null;
    if ( rules && nomenclatures ) {
        rules = withLinks( rules, linkRules( rules.version, nomenclatures.version ) );
    }
    const modules = [];
    for ( const input of inputs.modules || [] ) {
        const workbook = await reading( input, () => readWorkbook( input.source ) );
        const result = importModuleWorkbook( workbook, { spec: input.spec, fileName: fileNameOf( input ) } );
        modules.push( withLinks( result, linkModule( result.version, {
            nomenclatures: nomenclatures ? nomenclatures.version : null,
            rules: rules ? rules.version : null
        } ) ) );
    }
    return { nomenclatures: nomenclatures, rules: rules, modules: modules };
};
