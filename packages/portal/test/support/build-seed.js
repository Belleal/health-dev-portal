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
 * Builds the seed the portal's HTTP tests start from (plan 8a, decision 12), as the portal's `pretest`: once per test
 * run, since the migration alone takes seconds, too long to repeat in every test file. It migrates the public production
 * set — nomenclatures 1.5.33, rules 1.1.1 and e-Prescription 1.5.1, with the /api/v1/ XSDs — then runs decision 13
 * (seed.js), and writes .fixtures/portal/seed.sqlite and .fixtures/portal/files/, which git ignores.
 *
 * The database is built in memory and written out whole with VACUUM INTO: measured on this set, the migration took
 * 4.4 s in memory and 20.4 s into a file. It is built beside the seed and then put in its place, so an interrupted build
 * never leaves a half-built seed for the tests to start from.
 *
 * Without the fixtures it exits 0 with a note, and the HTTP tests skip; in CI it exits 1 naming them, since a skipped
 * test looks exactly like a passing one there.
 */

const crypto = require( "node:crypto" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { directoryStore } = require( "@health-dev-portal/data/files" );
const { readManifest } = require( "@health-dev-portal/data/manifest" );
const { migrate } = require( "@health-dev-portal/data/migration" );
const { migrateSchema } = require( "@health-dev-portal/data/schema" );
const { SEED_DIRECTORY, seed } = require( "./seed" );

const FIXTURES = path.resolve( __dirname, "../../../../.fixtures/public" );
const SET = Object.freeze( { nomenclatures: "nomenclatures-1.5.33.xlsx", rules: "rules-1.1.1.xlsx", module: "eprescription-1.5.1.xlsx", xsd: "api-v1" } );

const build = async () => {
    const missing = Object.values( SET ).filter( ( file ) => !fs.existsSync( path.join( FIXTURES, file ) ) );
    if ( missing.length ) {
        const note = `The portal's seed needs the public fixtures ${ missing.join( ", " ) } in ${ FIXTURES }: run \`npm run fixtures:fetch\`.`;
        if ( process.env.CI ) {
            console.error( note );
            process.exit( 1 );
        }
        // A seed from an earlier run would otherwise stand in for one this code would build.
        fs.rmSync( SEED_DIRECTORY, { recursive: true, force: true } );
        console.log( `${ note } The portal's HTTP tests skip.` );
        return;
    }
    const started = Date.now();
    const building = `${ SEED_DIRECTORY }.building-${ crypto.randomBytes( 4 ).toString( "hex" ) }`;
    const manifestDirectory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-portal-manifest-" ) );
    fs.mkdirSync( path.join( building, "files" ), { recursive: true } );
    const db = await openDatabase( "sqlite::memory:" );
    try {
        const manifest = path.join( manifestDirectory, "migration.json" );
        fs.writeFileSync( manifest, JSON.stringify( {
            xsd: path.join( FIXTURES, SET.xsd ),
            nomenclatures: [ { file: path.join( FIXTURES, SET.nomenclatures ), stage: "production" } ],
            rules: [ { file: path.join( FIXTURES, SET.rules ), stage: "production" } ],
            modules: [ { spec: "e-prescription", file: path.join( FIXTURES, SET.module ), stage: "production" } ]
        } ) );
        const store = directoryStore( path.join( building, "files" ) );
        await migrateSchema( db );
        await migrate( db, store, readManifest( manifest ) );
        await seed( db, store );
        // SQLite's own copy of a whole database into a new file; the portal's tests run on SQLite only (decision 12).
        await db.run( "VACUUM INTO ?", [ path.join( building, "seed.sqlite" ) ] );
    } catch ( error ) {
        fs.rmSync( building, { recursive: true, force: true } );
        throw error;
    } finally {
        await db.close();
        fs.rmSync( manifestDirectory, { recursive: true, force: true } );
    }
    fs.rmSync( SEED_DIRECTORY, { recursive: true, force: true } );
    fs.renameSync( building, SEED_DIRECTORY );
    console.log( `Built the portal's seed in ${ ( ( Date.now() - started ) / 1000 ).toFixed( 1 ) } s: ${ SEED_DIRECTORY }` );
};

build().catch( ( error ) => {
    console.error( error );
    process.exit( 1 );
} );
