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
const { generateXsds } = require( "@health-dev-portal/spec-model/xsd-writer" );
const { UnreadableWorkbookError, importSet } = require( "#set-importer" );
const { driftReport, importXsdSet } = require( "#xsd-importer" );
const { UnreadableSchemaError } = require( "#xsd-reader" );
const { formatDrift } = require( "#report" );

const USAGE = "Usage: hdp-xsd <module.xlsx> --nomenclatures <file> --out <directory> [--compare <xsd directory>] [--spec <key>]";

async function main( argv ) {
    let parsed;
    try {
        parsed = parseArgs( { args: argv, allowPositionals: true, options: {
            nomenclatures: { type: "string" },
            out: { type: "string" },
            compare: { type: "string" },
            spec: { type: "string" }
        } } );
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    const { values, positionals } = parsed;
    // An option given with an empty value is a mistake, not an option left out (CodeRabbit on #6, for hdp-import-set).
    const given = ( name ) => values[ name ] !== undefined;
    const empty = [ "nomenclatures", "out", "compare", "spec" ].some( ( name ) => given( name ) && values[ name ].trim() === "" );
    if ( empty || positionals.length !== 1 || !given( "nomenclatures" ) || !given( "out" ) ) {
        console.error( USAGE );
        return 2;
    }
    const workbook = positionals[ 0 ];
    const spec = given( "spec" ) ? values.spec : path.basename( workbook, path.extname( workbook ) );
    const set = await importSet( { nomenclatures: { source: values.nomenclatures }, modules: [ { spec: spec, source: workbook } ] } );
    const module = set.modules[ 0 ];
    // A blocked import is not written (design record §5.3), and neither are its XSDs. The nomenclatures' own blocking
    // anomalies concern the nomenclatures: the key types are read all the same.
    const blocking = module.anomalies.filter( ( anomaly ) => anomaly.level === "blocking" ).length;
    if ( hasBlocking( module.anomalies ) ) {
        console.error( `${ path.basename( workbook ) }: the import has ${ blocking } blocking anomal${ blocking === 1 ? "y" : "ies" }, so nothing is written. hdp-import-set prints them.` );
        return 1;
    }
    // The published set is read before anything is written: a --compare that cannot be read leaves no half-done output.
    const published = given( "compare" ) ? ( await importXsdSet( values.compare ) ).set : null;
    const files = generateXsds( module.version, set.nomenclatures.version );
    fs.mkdirSync( values.out, { recursive: true } );
    for ( const file of files ) {
        fs.writeFileSync( path.join( values.out, file.fileName ), file.text );
    }
    if ( published ) {
        const report = driftReport( module.version, set.nomenclatures.version, published );
        console.log( formatDrift( report.entries ) );
        report.skipped.forEach( ( skipped ) => console.log( `${ skipped.code } not compared: ${ skipped.reason }` ) );
    }
    console.log( `${ files.length } XSDs written to ${ values.out }.` );
    return 0;
}

// A person reads this output: an unreadable file is one line naming it, never a stack trace. Anything else is a fault,
// and its stack is what a fix needs.
main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    const readable = error instanceof UnreadableWorkbookError || error instanceof UnreadableSchemaError;
    console.error( readable ? error.message : error.stack );
    process.exitCode = 1;
} );
