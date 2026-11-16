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
 * The samples a vendor downloads validate against the XSDs the portal serves beside them (plan 8b, decisions 3 and 11),
 * in libxml2's xmllint compiled to WebAssembly, the validator plan 4's tests use. Only the empty signature is refused,
 * by xmldsig itself.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { validateXML } = require( "xmllint-wasm" );
const { SEED, SEEDED, get, seedContent, startPortal } = require( "./support/server" );

// An error that is xmldsig's alone, as plan 4 decides it (importer's test/support/xmllint.js): its element is one of
// xmldsig's and it names no his.bg element. Matching the word Signature anywhere also dropped errors about his.bg's
// patientSignature (CodeRabbit on #12).
const XMLDSIG_ELEMENT = /Element '\{http:\/\/www\.w3\.org\/2000\/09\/xmldsig#\}/;
const HIS_ELEMENT = /\{https:\/\/www\.his\.bg\}/;
const xmldsigAlone = ( message ) => XMLDSIG_ELEMENT.test( message ) && !HIS_ELEMENT.test( message );

describe( "The samples, in xmllint", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "validates every sample of e-Prescription 1.5.1 against its XSD, but for the empty signature", async () => {
        const number = SEED.ePrescription.production;
        const codes = ( await seedContent( SEED.ePrescription.spec, number ) ).messages.filter( ( message ) => message.lifecycle !== "withdrawn" ).map( ( message ) => message.code );
        assert.equal( codes.length, 21 );
        const xmldsig = ( await get( `/schemas/e-prescription/${ number }/xmldsig-core-schema.xsd` ) ).text;
        const failures = [];
        for ( const code of codes ) {
            const xsd = await get( `/schemas/e-prescription/${ number }/NHIS-${ code }.xsd` );
            const sample = await get( `/downloads/specs/e-prescription/${ number }/${ code }.xml` );
            assert.equal( xsd.status, 200, code );
            assert.equal( sample.status, 200, code );
            const result = await validateXML( { xml: [ { fileName: `${ code }.xml`, contents: sample.text } ],
                schema: [ { fileName: `NHIS-${ code }.xsd`, contents: xsd.text } ], preload: [ { fileName: "xmldsig-core-schema.xsd", contents: xmldsig } ] } );
            failures.push( ...result.errors.map( ( error ) => error.message.trim() ).filter( ( message ) => !xmldsigAlone( message ) ).map( ( message ) => `${ code }: ${ message }` ) );
        }
        assert.deepEqual( failures, [] );
    } );
} );
