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
 * hdp-import-set, run as a person runs it: real .xlsx files on disk, the exit code, the printed reports.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );
const { writeWorkbook } = require( "./support/xlsx-builder" );
const { moduleSheets, nomenclatureSheets, rulesSheets } = require( "./support/fixtures" );

const CLI = path.resolve( __dirname, "../bin/import-set.js" );
const run = ( args ) => spawnSync( process.execPath, [ CLI, ...args ], { encoding: "utf8" } );

describe( "hdp-import-set", () => {

    it( "imports a set, prints each report, writes the JSON and exits 0", async () => {
        const nomenclatures = await writeWorkbook( nomenclatureSheets( [ "CL009", "CL018", "CL035" ] ) );
        const rules = await writeWorkbook( rulesSheets( [ "RL023", "RL026", "RL027", "RL059", "RL083" ] ) );
        const module = await writeWorkbook( moduleSheets() );
        const out = path.join( path.dirname( module ), "set.json" );
        const result = run( [ "--nomenclatures", nomenclatures, "--rules", rules, "--module", `e-prescription=${ module }`, "--json", out ] );
        assert.equal( result.status, 0, result.stdout + result.stderr );
        assert.match( result.stdout, /^nomenclatures 1\.5\.33: /m );
        assert.match( result.stdout, /^rules 1\.1\.1: /m );
        assert.match( result.stdout, /^e-prescription /m );
        assert.match( result.stdout, /Set accepted\./ );
        assert.equal( JSON.parse( fs.readFileSync( out, "utf8" ) ).modules[ 0 ].version.spec, "e-prescription" );
    } );

    it( "refuses the wrong workbook for an option with a readable report (Review Focus 5)", async () => {
        const result = run( [ "--nomenclatures", await writeWorkbook( rulesSheets() ) ] );
        assert.equal( result.status, 1 );
        assert.match( result.stdout, /missing-sheet: The workbook has no sheet named "Номенклатури"\./ );
        assert.match( result.stdout, /Set refused/ );
        assert.doesNotMatch( result.stderr, /\n\s+at / );
    } );

    it( "exits 1 naming a file that is not a workbook", () => {
        const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "hdp-cli-" ) ), "broken.xlsx" );
        fs.writeFileSync( file, "not a workbook" );
        const result = run( [ "--rules", file ] );
        assert.equal( result.status, 1 );
        assert.match( result.stderr, /^Cannot read broken\.xlsx: / );
        assert.doesNotMatch( result.stderr, /\n\s+at / );
    } );

    it( "exits 2 with the usage for no workbook, a --module without spec=file, or an unknown option", () => {
        for ( const args of [ [], [ "--module", "book.xlsx" ], [ "--module", "=book.xlsx" ], [ "--module", "e-prescription=" ], [ "--nope", "x" ] ] ) {
            const result = run( args );
            assert.equal( result.status, 2, JSON.stringify( args ) );
            assert.match( result.stderr, /Usage: hdp-import-set/ );
        }
    } );
} );
