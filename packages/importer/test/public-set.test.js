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
 * The three published workbooks of production, imported and linked as one set (design record §4.8). e-Prescription
 * 1.5.1 names 29 code lists and 40 rules, all of which exist and none of which is removed or withdrawn (measured
 * 2026-10-19), so linking must add nothing to it.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { readWorkbook } = require( "#workbook-reader" );
const { importModuleWorkbook } = require( "#module-importer" );
const { importSet } = require( "#set-importer" );
const { formatSetReport } = require( "#report" );

const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public" );
const FILES = Object.freeze( { module: "eprescription-1.5.1.xlsx", nomenclatures: "nomenclatures-1.5.33.xlsx", rules: "rules-1.1.1.xlsx" } );
const PRESENT = Object.values( FILES ).every( ( file ) => fs.existsSync( path.join( DIRECTORY, file ) ) );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "A public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

const at = ( name ) => path.join( DIRECTORY, FILES[ name ] );

describe( "The published production set, linked", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let set;
    let alone;

    before( async () => {
        set = await importSet( {
            nomenclatures: { source: at( "nomenclatures" ), fileName: "НЗИС Номенклатури - Спецификация v1.5.33.xlsx" },
            rules: { source: at( "rules" ), fileName: "НЗИС - API Бизнес Правила - Спецификация v1.1.1.xlsx" },
            modules: [ { spec: "e-prescription", source: at( "module" ), fileName: "НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx" } ]
        } );
        alone = importModuleWorkbook( await readWorkbook( at( "module" ) ), { spec: "e-prescription", fileName: "НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx" } );
    } );

    it( "adds no link anomaly to e-Prescription: its 29 lists and 40 rules all resolve", () => {
        assert.deepEqual( set.modules[ 0 ].anomalies, alone.anomalies );
    } );

    it( "finds every rule's error code in CL999", () => {
        assert.equal( set.rules.anomalies.filter( ( anomaly ) => anomaly.type === "unknown-error-code" ).length, 0 );
    } );

    it( "refuses the set for the nomenclatures' 17 repeated keys alone (plan 2, Decision 1)", () => {
        assert.match( formatSetReport( set ), /Set refused: 1 of 3 workbooks have blocking anomalies\.$/ );
    } );
} );
