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
 * hdp-migrate, run as a person runs it: the exit code, the printed report, and never the database URL.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );

const { PRESENT, productionManifest } = require( "./support/public" );

const CLI = path.resolve( __dirname, "../bin/migrate.js" );

// The child gets no database URL from this process's environment unless a test gives it one.
const environment = ( extra = {} ) => Object.fromEntries( Object.entries( { ...process.env, ...extra } ).filter( ( [ name ] ) => name !== "HDP_DATABASE_URL" || extra[ name ] ) );
const run = ( args, extra ) => spawnSync( process.execPath, [ CLI, ...args ], { encoding: "utf8", env: environment( extra ) } );

describe( "hdp-migrate", () => {

    it( "prints the usage and exits 2 without a manifest or a database", () => {
        const noManifest = run( [ "--database", "sqlite::memory:" ] );
        assert.equal( noManifest.status, 2 );
        assert.match( noManifest.stderr, /Usage: hdp-migrate/ );
        const noDatabase = run( [ "--manifest", "migration.json" ] );
        assert.equal( noDatabase.status, 2 );
        assert.match( noDatabase.stderr, /HDP_DATABASE_URL/ );
    } );

    // A URL on the command line shows in process listings and shell history (security review of plan 5).
    it( "warns about a password on the command line, without repeating it", () => {
        const result = run( [ "--manifest", "missing.json", "--database", "postgres://portal:Sup3rSecret@127.0.0.1:1/portal" ] );
        assert.match( result.stderr, /--database carries a password.*HDP_DATABASE_URL/ );
        assert.ok( !result.stderr.includes( "Sup3rSecret" ) && !result.stdout.includes( "Sup3rSecret" ) );
    } );

    it( "names a manifest it cannot use, and exits 2", () => {
        const directory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-cli-" ) );
        fs.writeFileSync( path.join( directory, "migration.json" ), JSON.stringify( { nomenclatures: [ { file: "missing.xlsx", stage: "production" } ] } ) );
        const result = run( [ "--manifest", path.join( directory, "migration.json" ), "--database", "sqlite::memory:" ] );
        assert.equal( result.status, 2 );
        assert.match( result.stderr, /missing\.xlsx/ );
        assert.doesNotMatch( result.stderr, /\n\s+at / );
    } );

    it( "migrates the production set, then finds nothing to do, never printing the URL", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
        const manifest = productionManifest();
        const url = `sqlite:${ path.join( path.dirname( manifest ), "portal.db" ) }`;
        const first = run( [ "--manifest", manifest ], { HDP_DATABASE_URL: url } );
        assert.equal( first.status, 0, first.stdout + first.stderr );
        assert.match( first.stdout, /^Stored 184 versions of 185 specs \(0 skipped\); 525 retired versions of history with 1,289 entries; anomalies: 17 blocking, / );
        const second = run( [ "--manifest", manifest, "--database", url ] );
        assert.equal( second.status, 0, second.stdout + second.stderr );
        assert.match( second.stdout, /^Stored 0 versions of 185 specs \(184 skipped\)/ );
        for ( const output of [ first.stdout, first.stderr, second.stdout, second.stderr ] ) {
            assert.ok( !output.includes( url ), "the database URL was printed" );
        }
        assert.ok( fs.existsSync( path.join( path.dirname( manifest ), ".files" ) ) );
    } );
} );
