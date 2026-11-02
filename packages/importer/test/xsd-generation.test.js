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
 * The generated XSDs of the eight production modules (design record §4.10, §5.5): each reads back into the shape it
 * was written from, and each compiles in libxml2's xmllint, compiled to WebAssembly.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { validateXML } = require( "xmllint-wasm" );
const { messageShape } = require( "@health-dev-portal/spec-model/xsd-shape" );
const { generateXsds } = require( "@health-dev-portal/spec-model/xsd-writer" );
const { importSet } = require( "#set-importer" );
const { expandMessage, readXsdSet } = require( "#xsd-reader" );

const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public" );
const XMLDSIG = path.join( DIRECTORY, "api-v1", "xmldsig-core-schema.xsd" );
const NOMENCLATURES = "nomenclatures-1.5.33.xlsx";
const MODULES = Object.freeze( {
    "e-prescription": "eprescription-1.5.1.xlsx",
    "common-services": "common-services-1.2.2.xlsx",
    "e-referral": "ereferral-1.4.4.xlsx",
    "e-dental": "edental-1.0.7.xlsx",
    "e-examination": "eexamination-1.3.10.xlsx",
    "e-hospitalization": "ehospitalization-1.1.1.xlsx",
    "long-term-care": "longterm-care-1.0.4.xlsx",
    "e-immunization": "eimmunization-1.2.2.xlsx"
} );
const PRESENT = [ XMLDSIG, ...[ NOMENCLATURES, ...Object.values( MODULES ) ].map( ( file ) => path.join( DIRECTORY, file ) ) ].every( fs.existsSync );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "A public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

const withoutOrigin = ( node ) => ( { ...node, origin: null, children: node.children.map( withoutOrigin ) } );

// Each call runs xmllint in a worker of its own; a few at a time keeps 176 of them to seconds.
async function inBatches( items, size, run ) {
    const results = [];
    for ( let start = 0; start < items.length; start += size ) {
        results.push( ...await Promise.all( items.slice( start, start + size ).map( run ) ) );
    }
    return results;
}

describe( "The generated XSDs of the production modules", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let generated;
    let repeated;
    let fixedNotKeys;
    let xmldsig;

    before( async () => {
        const set = await importSet( {
            nomenclatures: { source: path.join( DIRECTORY, NOMENCLATURES ) },
            modules: Object.entries( MODULES ).map( ( [ spec, file ] ) => ( { spec: spec, source: path.join( DIRECTORY, file ) } ) )
        } );
        const lists = new Map( set.nomenclatures.version.codeLists.map( ( list ) => [ list.id, list ] ) );
        // A message whose tree repeats an identity cannot be generated: its import blocks, and nothing is written. In
        // e-Examination 1.3.10 four do, from one mis-indented group (HEL-19); every other message is generated.
        repeated = set.modules.flatMap( ( result ) => result.anomalies.filter( ( anomaly ) => anomaly.type === "duplicate-identity" ).map( ( anomaly ) => anomaly.sheet ) );
        fixedNotKeys = set.modules.flatMap( ( result ) => result.anomalies.filter( ( anomaly ) => anomaly.type === "fixed-value-not-a-key" ) );
        generated = set.modules.flatMap( ( result ) => generateXsds( { ...result.version, messages: result.version.messages.filter( ( message ) => !repeated.includes( message.code ) ) },
            set.nomenclatures.version ).map( ( file ) => ( { ...file, message: result.version.messages.find( ( message ) => message.code === file.code ), lists: lists } ) ) );
        xmldsig = fs.readFileSync( XMLDSIG, "utf8" );
    } );

    it( "reports the one fixed value that is not a key of its list, and does not fix it", () => {
        assert.deepEqual( fixedNotKeys.map( ( anomaly ) => [ anomaly.sheet, anomaly.details.identity, anomaly.details.value, anomaly.details.id ] ),
            [ [ "I006", "header/senderId@value", "NHIS", "CL018" ] ] );
        assert.ok( !generated.find( ( file ) => file.code === "I006" ).text.includes( "fixed=\"NHIS\"" ) );
    } );

    it( "writes one for each of the 172 messages that are not withdrawn and do not repeat an identity", () => {
        assert.deepEqual( [ ...new Set( repeated ) ], [ "X003", "X006", "X009", "X013" ] );
        assert.equal( generated.length, 172 );
    } );

    it( "reads a generated XSD back into the shape it was written from", () => {
        for ( const file of generated ) {
            const read = expandMessage( readXsdSet( [ { name: file.fileName, text: file.text } ] ), file.code );
            assert.deepEqual( withoutOrigin( read ), messageShape( file.message, file.lists ), file.code );
        }
    } );

    it( "writes a schema xmllint compiles, for every production message", async () => {
        const compile = ( text ) => validateXML( {
            xml: [ { fileName: "message.xml", contents: "<message xmlns=\"https://www.his.bg\"/>" } ],
            schema: [ { fileName: "NHIS-X000.xsd", contents: text } ],
            preload: [ { fileName: "xmldsig-core-schema.xsd", contents: xmldsig } ]
        } );
        // The check is only worth something if a schema that does not compile fails it.
        await assert.rejects( compile( generated[ 0 ].text.replace( "type=\"nhis:Message\"", "type=\"nhis:Missing\"" ) ), /failed to compile/ );
        const results = await inBatches( generated, 8, async ( file ) => {
            try {
                await compile( file.text );
                return null;
            } catch ( error ) {
                return `${ file.code }: ${ error.message.split( "\n" )[ 0 ] }`;
            }
        } );
        assert.deepEqual( results.filter( Boolean ), [] );
    } );
} );
