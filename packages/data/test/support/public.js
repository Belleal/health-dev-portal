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
 * The public production set the migration tests read, fetched by `npm run fixtures:fetch` into the git-ignored
 * .fixtures/ (CLAUDE.md, "Data rules").
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );

const FIXTURES = path.resolve( __dirname, "../../../../.fixtures/public" );
const FILES = Object.freeze( { nomenclatures: "nomenclatures-1.5.33.xlsx", rules: "rules-1.1.1.xlsx", module: "eprescription-1.5.1.xlsx", xsd: "api-v1" } );

/**
 * Whether every file of the production set is there.
 *
 * @type {boolean}
 */
module.exports.PRESENT = Object.values( FILES ).every( ( file ) => fs.existsSync( path.join( FIXTURES, file ) ) );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !module.exports.PRESENT && process.env.CI ) {
    throw new Error( "The public fixtures are missing: CI must run `npm run fixtures:fetch` before the tests." );
}

/**
 * The path of one file of the production set.
 *
 * @param {string} name `nomenclatures`, `rules`, `module` or `xsd`.
 * @returns {string}
 */
module.exports.fixture = ( name ) => path.join( FIXTURES, FILES[ name ] );

/**
 * Writes the manifest of the production set, all at the production stage, to a directory of its own.
 *
 * @returns {string} The manifest's path.
 */
module.exports.productionManifest = () => {
    const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "hdp-migration-" ) ), "migration.json" );
    fs.writeFileSync( file, JSON.stringify( {
        xsd: module.exports.fixture( "xsd" ),
        nomenclatures: [ { file: module.exports.fixture( "nomenclatures" ), stage: "production" } ],
        rules: [ { file: module.exports.fixture( "rules" ), stage: "production" } ],
        modules: [ { spec: "e-prescription", file: module.exports.fixture( "module" ), stage: "production" } ]
    } ) );
    return file;
};
