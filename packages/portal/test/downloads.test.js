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
 * A module version's XSDs and downloads (design record §7.7, §7.9; plan 8b, decision 7): fixed addresses by number,
 * stage addresses that redirect to them, and the same 404 and 410 as plan 8a's downloads.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const crypto = require( "node:crypto" );
const http = require( "node:http" );
const JSZip = require( "jszip" );
const { SEED, SEEDED, assertPublic, get, startPortal } = require( "./support/server" );

const BRIEF = "public, max-age=60";
const GONE = "public, max-age=86400";
const FOREVER = "public, max-age=31536000, immutable";
const XML = "application/xml; charset=utf-8";
// The xmldsig his.bg serves at /api/v1/ (scripts/api-v1.sha256), which the portal serves beside every set.
const XMLDSIG_SHA256 = "cfdd3c471dca1ee14ed47a6a2eb8c634b1300d082c44e33c74eea1ba6b5e2362";

describe( "A module version's XSDs and downloads", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    // A download's bytes: `get` reads text, and a zip is not text.
    const bytesOf = async ( path ) => Buffer.from( await ( await fetch( `${ portal.url }${ path }`, { redirect: "manual" } ) ).arrayBuffer() );
    // The status of a GET whose path goes out exactly as written, as a hand-made request's would.
    const rawStatus = ( path ) => new Promise( ( resolve, reject ) => {
        const request = http.get( { host: new URL( portal.url ).hostname, port: new URL( portal.url ).port, path: path }, ( response ) => {
            response.resume();
            resolve( response.statusCode );
        } );
        request.on( "error", reject );
    } );

    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "serves a fixed XSD inline, as XML, forever", async () => {
        const response = await get( "/schemas/e-prescription/1.5.1/NHIS-P001.xsd" );
        assert.equal( response.status, 200 );
        assertPublic( response, FOREVER, XML );
        // Inline, so that a validator given the address reads it as a schema.
        assert.equal( response.headers.get( "content-disposition" ), null );
        assert.match( response.text, /targetNamespace="https:\/\/www\.his\.bg"[^>]*version="1\.5\.1"/ );
    } );

    it( "redirects a stage XSD to the one module that has the message", async () => {
        for ( const [ stage, number ] of [ [ "testing", SEED.ePrescription.testing ], [ "production", SEED.ePrescription.production ] ] ) {
            const response = await get( `/schemas/${ stage }/NHIS-P001.xsd` );
            assert.equal( response.status, 302, stage );
            assertPublic( response, BRIEF, null );
            assert.equal( response.headers.get( "location" ), `/schemas/e-prescription/${ number }/NHIS-P001.xsd` );
        }
        // e-Prescription has no previous production in the seed, and no module has R001 at all.
        assert.equal( ( await get( "/schemas/previous-production/NHIS-P001.xsd" ) ).status, 404 );
        assert.equal( ( await get( "/schemas/testing/NHIS-R001.xsd" ) ).status, 404 );
    } );

    it( "serves xmldsig beside every set, the same bytes", async () => {
        for ( const address of [ "/schemas/e-prescription/1.5.1/xmldsig-core-schema.xsd", "/schemas/production/xmldsig-core-schema.xsd" ] ) {
            const response = await get( address );
            assert.equal( response.status, 200, address );
            assertPublic( response, FOREVER, XML );
            assert.equal( crypto.createHash( "sha256" ).update( await bytesOf( address ) ).digest( "hex" ), XMLDSIG_SHA256, address );
        }
    } );

    it( "serves a version's zip, model and samples as attachments", async () => {
        const zip = await get( "/downloads/specs/e-prescription/1.5.1.zip" );
        assert.equal( zip.status, 200 );
        assertPublic( zip, FOREVER, "application/zip" );
        assert.equal( zip.headers.get( "content-disposition" ), "attachment; filename=\"e-prescription-1.5.1.zip\"" );
        const files = Object.keys( ( await JSZip.loadAsync( await bytesOf( "/downloads/specs/e-prescription/1.5.1.zip" ) ) ).files );
        // 23 messages, of which P011 and P012 are withdrawn: 21 XSDs, and xmldsig beside them.
        assert.equal( files.filter( ( name ) => name.endsWith( ".xsd" ) ).length, 22 );
        const model = await get( "/downloads/specs/e-prescription/1.5.1.json" );
        assertPublic( model, FOREVER, "application/json; charset=utf-8" );
        assert.equal( model.headers.get( "content-disposition" ), "attachment; filename=\"e-prescription-1.5.1.json\"" );
        assert.equal( JSON.parse( model.text ).format, "nhis-module/1" );
        const sample = await get( "/downloads/specs/e-prescription/1.5.1/P001.xml" );
        assertPublic( sample, FOREVER, XML );
        assert.equal( sample.headers.get( "content-disposition" ), "attachment; filename=\"e-prescription-1.5.1-P001.xml\"" );
        assert.match( sample.text, /^<\?xml version="1\.0" encoding="UTF-8"\?>/ );
    } );

    it( "redirects a stage download to its fixed address", async () => {
        for ( const [ path, location ] of [ [ "/downloads/specs/e-prescription/testing.zip", "/downloads/specs/e-prescription/1.5.2.zip" ],
            [ "/downloads/specs/e-prescription/production.json", "/downloads/specs/e-prescription/1.5.1.json" ],
            [ "/downloads/specs/e-prescription/testing/P001.xml", "/downloads/specs/e-prescription/1.5.2/P001.xml" ] ] ) {
            const response = await get( path );
            assert.equal( response.status, 302, path );
            assertPublic( response, BRIEF, null );
            assert.equal( response.headers.get( "location" ), location );
        }
    } );

    it( "answers a withdrawn message's files with 404", async () => {
        for ( const address of [ "/schemas/e-prescription/1.5.1/NHIS-P011.xsd", "/downloads/specs/e-prescription/1.5.1/P011.xml",
            "/schemas/production/NHIS-P012.xsd" ] ) {
            const response = await get( address );
            assert.equal( response.status, 404, address );
            assertPublic( response, BRIEF );
        }
    } );

    it( "answers unknown and hostile file names with 404", async () => {
        for ( const address of [ "/schemas/e-prescription/1.5.1/NHIS-p001.xsd", "/schemas/e-prescription/1.5.1/NHIS-P001.xsd.bak",
            "/schemas/e-prescription/1.5.1/NHIS-Z999.xsd", "/schemas/e-prescription/1.5.1/%2e%2e/NHIS-P001.xsd",
            "/schemas/e-prescription/1.5.1/..%2fNHIS-P001.xsd", "/schemas/e-prescription/1.5.1/model.json", "/schemas/e-prescription/1.5.1/all.zip",
            "/downloads/specs/CL007/1.5.34.zip", "/downloads/specs/e-prescription/1.5.1.csv", "/downloads/specs/e-prescription/1.5.1/NHIS-P001.xsd",
            "/schemas/rules/1.1.1/NHIS-P001.xsd", "/downloads/specs/rules/1.1.1.zip", "/schemas/e-prescription/9.9.9/NHIS-P001.xsd" ] ) {
            // Sent as written: fetch resolves `%2e%2e` to `..` and drops a segment before sending (WHATWG URL, measured), so
            // through `get` the dot-segment case never reached the server in the form an attacker can send it.
            assert.equal( await rawStatus( address ), 404, address );
        }
    } );

    it( "answers a retired version with 410 and one never public with 404", async () => {
        for ( const address of [ `/schemas/e-prescription/${ SEED.history }/NHIS-P001.xsd`, `/downloads/specs/e-prescription/${ SEED.history }.zip`,
            `/downloads/specs/e-prescription/${ SEED.history }/P001.xml` ] ) {
            const response = await get( address );
            assert.equal( response.status, 410, address );
            assertPublic( response, GONE );
        }
        assert.equal( ( await get( `/downloads/specs/CL008/${ SEED.cl008Abandoned }.zip` ) ).status, 404 );
    } );
} );
