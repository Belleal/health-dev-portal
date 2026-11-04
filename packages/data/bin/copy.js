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

const { parseArgs } = require( "node:util" );
const { openDatabase } = require( "#database" );
const { TABLES } = require( "#schema" );
const { directoryStore } = require( "#files" );
const { CopyTargetError, copyDatabase, copyFiles } = require( "#copy" );

const USAGE = "Usage: hdp-copy --from <url> --to <url> [--files-from <directory> --files-to <directory>]";

async function main( argv ) {
    let values;
    try {
        values = parseArgs( { args: argv, options: { from: { type: "string" }, to: { type: "string" }, "files-from": { type: "string" }, "files-to": { type: "string" } } } ).values;
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    // Files are copied between two stores or not at all: one directory alone is a mistake, not a choice.
    if ( !values.from || !values.to || Boolean( values[ "files-from" ] ) !== Boolean( values[ "files-to" ] ) ) {
        console.error( USAGE );
        return 2;
    }
    // Either URL may carry a password: neither is ever printed (design record §10.1).
    const source = await openDatabase( values.from );
    try {
        const target = await openDatabase( values.to );
        try {
            const counts = await copyDatabase( source, target );
            const files = values[ "files-from" ] ? await copyFiles( source, directoryStore( values[ "files-from" ] ), directoryStore( values[ "files-to" ] ) ) : 0;
            const rows = Object.values( counts ).reduce( ( sum, count ) => sum + count, 0 );
            console.log( `Copied ${ rows.toLocaleString( "en-US" ) } rows in ${ TABLES.length } tables; ${ files.toLocaleString( "en-US" ) } files.` );
            return 0;
        } finally {
            await target.close();
        }
    } finally {
        await source.close();
    }
}

main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    console.error( error instanceof CopyTargetError ? error.message : error.stack );
    process.exitCode = 1;
} );
