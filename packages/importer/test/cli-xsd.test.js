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
 * hdp-xsd, run as a person runs it, on the published files: the generated XSDs on disk, the drift report, the exit code.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );

const CLI = path.resolve( __dirname, "../bin/xsd.js" );
const run = ( args ) => spawnSync( process.execPath, [ CLI, ...args ], { encoding: "utf8" } );
const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public" );
const NOMENCLATURES = path.join( DIRECTORY, "nomenclatures-1.5.33.xlsx" );
const PRESENT = [ NOMENCLATURES, path.join( DIRECTORY, "edental-1.0.5.xlsx" ), path.join( DIRECTORY, "ehospitalization-1.0.6.xlsx" ),
    path.join( DIRECTORY, "api-v1", "NHIS-Entities.xsd" ) ].every( fs.existsSync );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "A public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

const outDirectory = () => fs.mkdtempSync( path.join( os.tmpdir(), "hdp-xsd-out-" ) );

describe( "hdp-xsd", () => {

    it( "exits 2 with the usage for a missing workbook, --nomenclatures or --out, or an unknown option", () => {
        for ( const args of [ [], [ "book.xlsx" ], [ "book.xlsx", "--nomenclatures", "n.xlsx" ], [ "--nomenclatures", "n.xlsx", "--out", "x" ],
            [ "book.xlsx", "--nomenclatures", "n.xlsx", "--out", "x", "--nope" ], [ "book.xlsx", "--nomenclatures=", "--out", "x" ] ] ) {
            const result = run( args );
            assert.equal( result.status, 2, JSON.stringify( args ) );
            assert.match( result.stderr, /Usage: hdp-xsd/ );
        }
    } );

    describe( "on the published files", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {

        it( "writes the files and prints the drift report", () => {
            const out = outDirectory();
            const result = run( [ path.join( DIRECTORY, "edental-1.0.5.xlsx" ), "--nomenclatures", NOMENCLATURES, "--out", out, "--compare", path.join( DIRECTORY, "api-v1" ) ] );
            assert.equal( result.status, 0, result.stdout + result.stderr );
            assert.deepEqual( fs.readdirSync( out ).sort().slice( 0, 2 ), [ "NHIS-D001.xsd", "NHIS-D002.xsd" ] );
            assert.equal( fs.readdirSync( out ).length, 11 );
            assert.match( result.stdout, /^D002 header\/senderISName only-published \[shared-type\]: published field, generated —$/m );
            assert.match( result.stdout, /^shared-type: 7$/m );
        } );

        it( "exits 1 on a blocked import and writes nothing", () => {
            const out = outDirectory();
            const result = run( [ path.join( DIRECTORY, "ehospitalization-1.0.6.xlsx" ), "--nomenclatures", NOMENCLATURES, "--out", out ] );
            assert.equal( result.status, 1 );
            assert.match( result.stderr, /blocking anomal/ );
            assert.deepEqual( fs.readdirSync( out ), [] );
        } );
    } );
} );
