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

const fs = require( "node:fs" );
const path = require( "node:path" );
const { parseArgs } = require( "node:util" );
const { hasBlocking } = require( "@health-dev-portal/spec-model/anomalies" );
const { readWorkbook } = require( "#workbook-reader" );
const { importModuleWorkbook } = require( "#module-importer" );
const { formatReport } = require( "#report" );

const USAGE = "Usage: hdp-import-module --spec <key> [--json <model.json>] <workbook.xlsx>";

async function main( argv ) {
    let parsed;
    try {
        parsed = parseArgs( { args: argv, options: { spec: { type: "string" }, json: { type: "string" } }, allowPositionals: true } );
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    const { values, positionals } = parsed;
    if ( !values.spec || positionals.length !== 1 ) {
        console.error( USAGE );
        return 2;
    }
    const file = positionals[ 0 ];
    const workbook = await readWorkbook( file );
    const result = importModuleWorkbook( workbook, { spec: values.spec, fileName: path.basename( file ) } );
    console.log( formatReport( result ) );
    if ( values.json ) {
        fs.writeFileSync( values.json, JSON.stringify( result, null, 2 ) );
    }
    return hasBlocking( result.anomalies ) ? 1 : 0;
}

// A person reads this output: an unreadable file is one line naming it, never a stack trace.
main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    console.error( `Cannot import: ${ error.message }` );
    process.exitCode = 1;
} );
