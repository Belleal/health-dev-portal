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
const { parseArgs } = require( "node:util" );
const { hasBlocking } = require( "@health-dev-portal/spec-model/anomalies" );
const { importSet } = require( "#set-importer" );
const { formatSetReport } = require( "#report" );

const USAGE = "Usage: hdp-import-set [--nomenclatures <file>] [--rules <file>] [--module <spec>=<file>]... [--json <set.json>]";

const MODULE = /^([^=\s]+)=(.+)$/;

async function main( argv ) {
    let parsed;
    try {
        parsed = parseArgs( { args: argv, options: {
            nomenclatures: { type: "string" },
            rules: { type: "string" },
            module: { type: "string", multiple: true },
            json: { type: "string" }
        } } );
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    const { values } = parsed;
    const modules = ( values.module || [] ).map( ( text ) => MODULE.exec( text ) );
    if ( modules.some( ( match ) => !match ) || ( !values.nomenclatures && !values.rules && modules.length === 0 ) ) {
        console.error( USAGE );
        return 2;
    }
    const set = await importSet( {
        nomenclatures: values.nomenclatures ? { source: values.nomenclatures } : undefined,
        rules: values.rules ? { source: values.rules } : undefined,
        modules: modules.map( ( match ) => ( { spec: match[ 1 ], source: match[ 2 ] } ) )
    } );
    console.log( formatSetReport( set ) );
    if ( values.json ) {
        fs.writeFileSync( values.json, JSON.stringify( set, null, 2 ) );
    }
    return [ set.nomenclatures, set.rules, ...set.modules ].some( ( result ) => result && hasBlocking( result.anomalies ) ) ? 1 : 0;
}

// A person reads this output: an unreadable file is one line naming it, never a stack trace.
main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    console.error( error.message );
    process.exitCode = 1;
} );
