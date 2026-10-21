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
 * A set of workbooks of one slot — nomenclatures, rules and modules — read from real .xlsx files, imported and linked
 * (design record §4.8, §5.3).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { importSet } = require( "#set-importer" );
const { formatSetReport } = require( "#report" );
const { writeWorkbook } = require( "./support/xlsx-builder" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets, nomenclatureSheets, rulesSheets } = require( "./support/fixtures" );

// What moduleSheets() references.
const MODULE_LISTS = [ "CL007", "CL009", "CL018", "CL035" ];
const MODULE_RULES = [ "RL023", "RL026", "RL027", "RL059", "RL083" ];

const importOf = async ( { lists = MODULE_LISTS, rules = MODULE_RULES, withNomenclatures = true, withRules = true } = {} ) => importSet( {
    nomenclatures: withNomenclatures ? { source: await writeWorkbook( nomenclatureSheets( lists ) ) } : undefined,
    rules: withRules ? { source: await writeWorkbook( rulesSheets( rules ) ) } : undefined,
    modules: [ { spec: "e-prescription", source: await writeWorkbook( moduleSheets() ) } ]
} );

describe( "importSet", () => {

    it( "imports a sound set with no anomaly", async () => {
        const result = await importOf();
        assert.deepEqual( [ result.nomenclatures.anomalies, result.rules.anomalies, result.modules[ 0 ].anomalies ], [ [], [], [] ] );
        assert.match( formatSetReport( result ), /Set accepted\.$/ );
    } );

    it( "links a module against the set, and refuses the set when a reference is missing", async () => {
        const result = await importOf( { lists: [ "CL007", "CL009", "CL018" ], rules: MODULE_RULES.slice( 1 ) } );
        assert.deepEqual( result.modules[ 0 ].anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.id ] ).sort(),
            [ [ "unknown-code-list", "CL035" ], [ "unknown-rule", "RL023" ] ] );
        assert.match( formatSetReport( result ), /Set refused: 1 of 3 workbooks have blocking anomalies\.$/ );
    } );

    it( "links nothing a set does not include, and says so", async () => {
        const result = await importOf( { withNomenclatures: false, withRules: false } );
        assert.deepEqual( result.modules[ 0 ].anomalies, [] );
        const report = formatSetReport( result );
        assert.match( report, /Code lists were not linked: no nomenclatures workbook was given\./ );
        assert.match( report, /Rules were not linked: no rules workbook was given\./ );
    } );

    it( "blocks a condition value the set's nomenclatures do not define", async () => {
        // CL007 defines T1 to T3, so a category of T9 can never be sent and the condition can never hold.
        const sheets = moduleSheets().map( ( candidate ) => ( candidate.name !== "Conditions" ? candidate : sheet( "Conditions", [
            ...candidate.rows.filter( ( line ) => line.number !== 7 ),
            row( 7, [ "CDP19", "IF 'prescription.category'.value = 'T9'" ] )
        ].sort( ( a, b ) => a.number - b.number ) ) ) );
        const result = await importSet( {
            nomenclatures: { source: await writeWorkbook( nomenclatureSheets( MODULE_LISTS ) ) },
            modules: [ { spec: "e-prescription", source: await writeWorkbook( sheets ) } ]
        } );
        assert.deepEqual( result.modules[ 0 ].anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.row, anomaly.details.value, anomaly.details.list ] ),
            [ [ "unknown-condition-value", "blocking", 7, "T9", "CL007" ] ] );
        assert.match( formatSetReport( result ), /Set refused/ );
    } );

    it( "names the file it cannot read (Review Focus 5)", async () => {
        await assert.rejects( importSet( { nomenclatures: { source: Buffer.from( "not a workbook" ), fileName: "broken.xlsx" } } ),
            /^Error: Cannot read broken\.xlsx: / );
    } );

    // Final review of plan 2: the rules workbook given as --nomenclatures left e-Prescription 1.5.1 with 224 blocking
    // unknown-code-list anomalies, and the set report blamed the module for the wrong file.
    it( "links nothing against a workbook that lacks its defining sheet, and says so", async () => {
        const result = await importSet( {
            nomenclatures: { source: await writeWorkbook( rulesSheets( MODULE_RULES ) ), fileName: "rules.xlsx" },
            rules: { source: await writeWorkbook( nomenclatureSheets( MODULE_LISTS ) ), fileName: "nomenclatures.xlsx" },
            modules: [ { spec: "e-prescription", source: await writeWorkbook( moduleSheets() ) } ]
        } );
        assert.deepEqual( result.modules[ 0 ].anomalies, [] );
        const report = formatSetReport( result );
        assert.match( report, /Code lists were not linked: the nomenclatures workbook has no "Номенклатури" sheet\./ );
        assert.match( report, /Rules were not linked: the rules workbook has no "Rules" sheet\./ );
        assert.match( report, /Set refused: 2 of 3 workbooks have blocking anomalies\.$/ );
    } );

    // CodeRabbit on #6: rules imported without nomenclatures skipped the CL999 check, and the report said only "Set
    // accepted".
    it( "says when the rules' error codes were not checked, and why", async () => {
        const rules = { source: await writeWorkbook( rulesSheets() ) };
        const reportOf = async ( nomenclatures ) => formatSetReport( await importSet( { nomenclatures: nomenclatures, rules: rules } ) );
        assert.match( await reportOf( undefined ), /Error codes were not checked: no nomenclatures workbook was given\./ );
        assert.match( await reportOf( { source: await writeWorkbook( rulesSheets() ), fileName: "rules.xlsx" } ),
            /Error codes were not checked: the nomenclatures workbook has no "Номенклатури" sheet\./ );
        assert.match( await reportOf( { source: await writeWorkbook( nomenclatureSheets( [ "CL001" ] ) ) } ), /Error codes were not checked: the nomenclatures define no CL999\./ );
        assert.doesNotMatch( await reportOf( { source: await writeWorkbook( nomenclatureSheets( [ "CL999" ] ) ) } ), /not checked/ );
    } );
} );
