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
const { carriesPassword, openDatabase } = require( "#database" );
const { TABLES } = require( "#schema" );
const { directoryStore } = require( "#files" );
const { CopyTargetError, copyDatabase, copyFiles } = require( "#copy" );

const USAGE = "Usage: hdp-copy [--from <url>] [--to <url>] [--files-from <directory> --files-to <directory>]\n"
    + "The databases come from --from and --to, or from HDP_COPY_FROM_URL and HDP_COPY_TO_URL; a URL with a password belongs in the environment.";
const URLS = Object.freeze( { from: "HDP_COPY_FROM_URL", to: "HDP_COPY_TO_URL" } );

async function main( argv ) {
    let values;
    try {
        values = parseArgs( { args: argv, options: { from: { type: "string" }, to: { type: "string" }, "files-from": { type: "string" }, "files-to": { type: "string" } } } ).values;
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    // Either URL may carry a password: neither is ever printed (design record §10.1). Given as an argument, it shows in
    // process listings and shell history, so the person is told where it belongs (security review of plan 5).
    for ( const [ option, variable ] of Object.entries( URLS ) ) {
        if ( values[ option ] && carriesPassword( values[ option ] ) ) {
            console.error( `--${ option } carries a password, which shows in process listings and shell history: pass the URL in ${ variable } instead.` );
        }
    }
    const from = values.from || process.env[ URLS.from ];
    const to = values.to || process.env[ URLS.to ];
    const stores = Boolean( values[ "files-from" ] );
    // Files are copied between two stores or not at all: one directory alone is a mistake, not a choice.
    if ( !from || !to || stores !== Boolean( values[ "files-to" ] ) ) {
        console.error( USAGE );
        return 2;
    }
    const source = await openDatabase( from );
    try {
        // Copied without them, the target would name files it does not have, the blueprint catalogue among them
        // (CodeRabbit on #13): refused before the target is even opened.
        const named = ( await source.get( "SELECT COUNT(*) AS n FROM files" ) ).n;
        if ( named > 0 && !stores ) {
            console.error( `The source names ${ named } files: give --files-from and --files-to, or the copy would name files it does not have.` );
            return 2;
        }
        const target = await openDatabase( to );
        try {
            const counts = await copyDatabase( source, target );
            const files = stores ? await copyFiles( source, directoryStore( values[ "files-from" ] ), directoryStore( values[ "files-to" ] ) ) : 0;
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
