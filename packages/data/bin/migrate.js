#!/usr/bin/env node

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
const { parseArgs } = require( "node:util" );
const { UnreadableWorkbookError } = require( "@health-dev-portal/importer/set" );
const { carriesPassword, openDatabase } = require( "#database" );
const { migrateSchema } = require( "#schema" );
const { directoryStore } = require( "#files" );
const { readManifest } = require( "#manifest" );
const { MigrationConflictError, MigrationOrderError, formatMigrationReport, migrate } = require( "#migration" );

const USAGE = "Usage: hdp-migrate --manifest <file> [--database <url>] [--files <directory>]\n"
    + "The database comes from --database or HDP_DATABASE_URL; the files default to .files/ next to the manifest.";

// What a person can act on from one line: a workbook or XSD that cannot be read, or a published version already stored
// with other content. Anything else is a fault in the code, and its stack is what a fix needs.
const named = ( error ) => error instanceof MigrationConflictError || error instanceof MigrationOrderError || error instanceof UnreadableWorkbookError || ( error && error.name === "UnreadableSchemaError" );

async function main( argv ) {
    let values;
    try {
        values = parseArgs( { args: argv, options: { manifest: { type: "string" }, database: { type: "string" }, files: { type: "string" } } } ).values;
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    // The URL may carry a password: it is read here and handed to the driver, and never printed (design record §10.1).
    // Given as an argument, it shows in process listings and shell history (security review of plan 5).
    if ( values.database && carriesPassword( values.database ) ) {
        console.error( "--database carries a password, which shows in process listings and shell history: pass the URL in HDP_DATABASE_URL instead." );
    }
    const url = values.database || process.env.HDP_DATABASE_URL;
    if ( !values.manifest || !url ) {
        console.error( USAGE );
        return 2;
    }
    let manifest;
    try {
        manifest = readManifest( values.manifest );
    } catch ( error ) {
        console.error( `Cannot use ${ values.manifest }: ${ error.message }` );
        return 2;
    }
    const db = await openDatabase( url );
    try {
        await migrateSchema( db );
        const report = await migrate( db, directoryStore( values.files || path.join( path.dirname( path.resolve( values.manifest ) ), ".files" ) ), manifest );
        console.log( formatMigrationReport( report ) );
        return 0;
    } finally {
        await db.close();
    }
}

main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    console.error( named( error ) ? error.message : error.stack );
    process.exitCode = 1;
} );
