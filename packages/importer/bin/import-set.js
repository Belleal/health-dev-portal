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
const { UnreadableWorkbookError, importSet } = require( "#set-importer" );
const { importXsdSet } = require( "#xsd-importer" );
const { UnreadableSchemaError } = require( "#xsd-reader" );
const { formatSetReport } = require( "#report" );

const USAGE = "Usage: hdp-import-set [--nomenclatures <file>] [--rules <file>] [--module <spec>=<file>]... [--xsd <directory>] [--json <set.json>]";

// The published XSD set the blueprints are learned from (design record §5.2). A directory that is not there is the
// person's mistake, so it reads as one line, like a file that cannot be read.
async function catalogueFrom( directory ) {
    try {
        return ( await importXsdSet( directory ) ).catalogue;
    } catch ( error ) {
        if ( error instanceof UnreadableSchemaError ) {
            throw error;
        }
        if ( error.code === "ENOENT" || error.code === "ENOTDIR" ) {
            throw new UnreadableSchemaError( `Cannot read ${ directory }: ${ error.message }`, { cause: error } );
        }
        throw error;
    }
}

const MODULE = /^([^=\s]+)=(.+)$/;

async function main( argv ) {
    let parsed;
    try {
        parsed = parseArgs( { args: argv, options: {
            nomenclatures: { type: "string" },
            rules: { type: "string" },
            module: { type: "string", multiple: true },
            xsd: { type: "string" },
            json: { type: "string" }
        } } );
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    const { values } = parsed;
    const modules = ( values.module || [] ).map( ( text ) => MODULE.exec( text ) );
    // An option given with an empty value — `--nomenclatures="$UNSET"` — is a mistake, not an option left out: read as
    // absent, it imported the set without that workbook and could accept it (CodeRabbit on #6).
    const given = ( name ) => values[ name ] !== undefined;
    const empty = [ "nomenclatures", "rules", "xsd", "json" ].some( ( name ) => given( name ) && values[ name ].trim() === "" );
    if ( empty || modules.some( ( match ) => !match ) || ( !given( "nomenclatures" ) && !given( "rules" ) && modules.length === 0 ) ) {
        console.error( USAGE );
        return 2;
    }
    const set = await importSet( {
        nomenclatures: given( "nomenclatures" ) ? { source: values.nomenclatures } : undefined,
        rules: given( "rules" ) ? { source: values.rules } : undefined,
        modules: modules.map( ( match ) => ( { spec: match[ 1 ], source: match[ 2 ] } ) ),
        catalogue: given( "xsd" ) ? await catalogueFrom( values.xsd ) : undefined
    } );
    console.log( formatSetReport( set ) );
    if ( given( "json" ) ) {
        fs.writeFileSync( values.json, JSON.stringify( set, null, 2 ) );
    }
    return [ set.nomenclatures, set.rules, ...set.modules ].some( ( result ) => result && hasBlocking( result.anomalies ) ) ? 1 : 0;
}

// A person reads this output: an unreadable file is one line naming it, never a stack trace. Anything else is a fault
// in the importer, and its stack is what a fix needs.
main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    console.error( error instanceof UnreadableWorkbookError || error instanceof UnreadableSchemaError ? error.message : error.stack );
    process.exitCode = 1;
} );
