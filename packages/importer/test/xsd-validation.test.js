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
 * The like-for-like synthetic messages against both XSDs, in xmllint (design record §5.5). A message built from the
 * workbook is valid against the generated XSD; against today's published one, it fails exactly where the drift report
 * says the two differ, and nowhere else.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { synthesizeMessage } = require( "@health-dev-portal/spec-model/synthetic-message" );
const { messageShape } = require( "@health-dev-portal/spec-model/xsd-shape" );
const { writeMessageXsd } = require( "@health-dev-portal/spec-model/xsd-writer" );
const { importSet } = require( "#set-importer" );
const { importXsdSet } = require( "#xsd-importer" );
const { expandMessage } = require( "#xsd-reader" );
const { errorsOf, inBatches, publishedSchema, xmldsig } = require( "./support/xmllint" );

const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public" );
const EXPECTED = path.join( __dirname, "expected" );
const PAIRS = Object.freeze( { "e-dental": [ "edental-1.0.5.xlsx", "drift-edental-1.0.5.json" ], "e-hospitalization": [ "ehospitalization-1.0.6.xlsx", "drift-ehospitalization-1.0.6.json" ] } );
const PRESENT = [ "api-v1/NHIS-Entities.xsd", "nomenclatures-1.5.33.xlsx", ...Object.values( PAIRS ).map( ( [ file ] ) => file ) ]
    .every( ( file ) => fs.existsSync( path.join( DIRECTORY, file ) ) );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "A public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

const nodes = ( node ) => [ node, ...node.children.flatMap( nodes ) ];

// Measured on 2026-11-03: how many errors today's XSD reports for each message, every one at a difference the drift
// report lists. No like-for-like message validates against today's XSDs: every e-Dental request trips the messageType
// pattern that leaves out D, and every response the shared header's required senderISName, which no workbook lists.
const PUBLISHED_ERRORS = Object.freeze( {
    D001: 4, D002: 1, D003: 1, D004: 1, D005: 1, D006: 4, D007: 1, D008: 1, D009: 1, D010: 1, D099: 2,
    H004: 1, H005: 4, H006: 1, H007: 2, H008: 1, H010: 1, H012: 1, H013: 1, H014: 1, H015: 1, H016: 1, H099: 2
} );

describe( "The like-for-like synthetic messages, in xmllint", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let cases;

    before( async () => {
        const xsd = await importXsdSet( path.join( DIRECTORY, "api-v1" ) );
        const set = await importSet( { nomenclatures: { source: path.join( DIRECTORY, "nomenclatures-1.5.33.xlsx" ) },
            modules: Object.entries( PAIRS ).map( ( [ spec, [ file ] ] ) => ( { spec: spec, source: path.join( DIRECTORY, file ) } ) ) } );
        const lists = new Map( set.nomenclatures.version.codeLists.map( ( list ) => [ list.id, list ] ) );
        cases = set.modules.flatMap( ( module ) => {
            const report = JSON.parse( fs.readFileSync( path.join( EXPECTED, PAIRS[ module.version.spec ][ 1 ] ), "utf8" ) );
            const skipped = report.skipped.map( ( entry ) => entry.code );
            return module.version.messages.filter( ( message ) => !skipped.includes( message.code ) ).map( ( message ) => {
                const shape = messageShape( message, lists );
                // Where today's XSD makes a choice, the message has only its first alternative (§5.5).
                const choices = new Map();
                nodes( expandMessage( xsd.set, message.code ) ).filter( ( node ) => node.origin && node.origin.choice )
                    .forEach( ( node ) => choices.set( node.origin.choice, [ ...( choices.get( node.origin.choice ) || [] ), node.path ] ) );
                // The names an error may give for this message: every element the drift report lists, and for an order
                // difference every child it names.
                const listed = new Set( report.entries.filter( ( entry ) => entry.message === message.code ).flatMap( ( entry ) => [
                    entry.path.split( "/" ).pop(), ...( entry.kind === "order" ? `${ entry.published } ${ entry.generated }`.split( " " ) : [] ) ] ) );
                return {
                    code: message.code,
                    xml: synthesizeMessage( shape, { omit: new Set( [ ...choices.values() ].flatMap( ( paths ) => paths.slice( 1 ) ) ) } ),
                    generated: { schema: [ { fileName: `NHIS-${ message.code }.xsd`, contents: writeMessageXsd( shape, { version: module.version.version } ) } ], preload: [ xmldsig() ] },
                    listed: listed
                };
            } );
        } );
    } );

    // CodeRabbit on #12: the filter dropped every error that mentioned Signature, his.bg's patientSignature included.
    it( "sets aside only errors about xmldsig's elements", async () => {
        const schema = writeMessageXsd( { tag: "message", path: "", kind: "group", min: 1, max: 1, type: "Message", attributes: [], documentation: null, origin: null,
            children: [ { tag: "patientSignature", path: "patientSignature", kind: "group", min: 1, max: 1, type: "PatientSignature", attributes: [], children: [], documentation: null, origin: null },
                { tag: "Signature", path: "Signature", kind: "signature", min: 1, max: 1, type: null, attributes: [], children: [], documentation: null, origin: null } ] }, { version: null } );
        const schemas = { schema: [ { fileName: "NHIS-T001.xsd", contents: schema } ], preload: [ xmldsig() ] };
        const xmldsigNamespace = "xmlns:ds=\"http://www.w3.org/2000/09/xmldsig#\"";
        assert.deepEqual( await errorsOf( `<message xmlns="https://www.his.bg" ${ xmldsigNamespace }><patientSignature/><ds:Signature/></message>`, schemas ), [] );
        const missing = await errorsOf( `<message xmlns="https://www.his.bg" ${ xmldsigNamespace }><ds:Signature/></message>`, schemas );
        assert.equal( missing.length, 1 );
        assert.match( missing[ 0 ], /patientSignature/ );
    } );

    it( "covers the 23 importable like-for-like messages", () => {
        assert.deepEqual( cases.map( ( entry ) => entry.code ), Object.keys( PUBLISHED_ERRORS ) );
    } );

    it( "is valid against its generated XSD", async () => {
        const results = await inBatches( cases, 8, async ( entry ) => ( await errorsOf( entry.xml, entry.generated ) ).map( ( error ) => `${ entry.code }: ${ error }` ) );
        assert.deepEqual( results.flat(), [] );
    } );

    it( "fails against today's XSD only where the drift report says they differ", async () => {
        const results = await inBatches( cases, 8, async ( entry ) => ( { entry: entry, errors: await errorsOf( entry.xml, publishedSchema( entry.code ) ) } ) );
        assert.deepEqual( Object.fromEntries( results.map( ( { entry, errors } ) => [ entry.code, errors.length ] ) ), PUBLISHED_ERRORS );
        const unexplained = results.flatMap( ( { entry, errors } ) => errors
            .filter( ( error ) => ![ ...error.matchAll( /\{https:\/\/www\.his\.bg\}(\w+)/g ) ].some( ( match ) => entry.listed.has( match[ 1 ] ) ) )
            .map( ( error ) => `${ entry.code }: ${ error }` ) );
        assert.deepEqual( unexplained, [] );
    } );
} );
