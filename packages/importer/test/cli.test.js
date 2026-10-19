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
 * The command-line tool, run as a person runs it: a real .xlsx on disk, the exit code, the printed report.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );
const { writeWorkbook } = require( "./support/xlsx-builder" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

const CLI = path.resolve( __dirname, "../bin/import-module.js" );
const run = ( args ) => spawnSync( process.execPath, [ CLI, ...args ], { encoding: "utf8" } );

describe( "hdp-import-module", () => {

    it( "imports a sound workbook, prints the report, writes the model and exits 0", async () => {
        const file = await writeWorkbook( moduleSheets() );
        const out = path.join( path.dirname( file ), "model.json" );
        const result = run( [ "--spec", "e-prescription", "--json", out, file ] );
        assert.equal( result.status, 0, result.stderr );
        assert.match( result.stdout, /^e-prescription 1\.1\.0: 3 messages, 0 blocking, 0 warnings$/m );
        assert.match( result.stdout, /Import accepted\./ );
        const model = JSON.parse( fs.readFileSync( out, "utf8" ) );
        assert.equal( model.version.messages[ 0 ].code, "P001" );
        assert.equal( model.version.messages[ 0 ].elements[ 0 ].identity, "header" );
    } );

    it( "refuses a workbook that is not a specification (Review Focus 5)", async () => {
        const file = await writeWorkbook( [ sheet( "Sheet1", [ row( 1, [ "Budget 2026" ] ) ] ) ] );
        const result = run( [ "--spec", "e-prescription", file ] );
        assert.equal( result.status, 1 );
        assert.match( result.stdout, /\[blocking\] \(workbook\) missing-sheet: The workbook has no sheet named "Съобщения"\./ );
        assert.match( result.stdout, /Import refused/ );
        assert.equal( result.stderr, "" );
    } );

    it( "exits 1 with a message, not a stack trace, when the file cannot be read", () => {
        const result = run( [ "--spec", "e-prescription", path.join( __dirname, "no-such-file.xlsx" ) ] );
        assert.equal( result.status, 1 );
        assert.match( result.stderr, /no-such-file\.xlsx/ );
        assert.doesNotMatch( result.stderr, /\n\s+at / );
    } );

    it( "exits 2 with the usage when an argument is missing or unknown", () => {
        for ( const args of [ [], [ "--spec", "e" ], [ "book.xlsx" ], [ "--nope", "x", "book.xlsx" ] ] ) {
            const result = run( args );
            assert.equal( result.status, 2, JSON.stringify( args ) );
            assert.match( result.stderr, /Usage: hdp-import-module/ );
        }
    } );
} );
