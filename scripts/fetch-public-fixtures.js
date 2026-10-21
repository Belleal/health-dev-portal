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
 * Downloads the public workbooks the regression tests read into the git-ignored .fixtures/public/. They are never
 * committed: they are published by the Ministry of Health on his.bg, not by this project.
 *
 * Each file is pinned by its SHA-256, so a test never silently runs against a different file than the one its
 * assertions were measured on. If his.bg replaces a file, this fails and the assertions are re-measured.
 */

const crypto = require( "node:crypto" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const DIRECTORY = path.resolve( __dirname, "..", ".fixtures", "public" );

const FIXTURES = Object.freeze( [ {
    file: "eprescription-1.5.1.xlsx",
    // The production e-Prescription workbook listed on https://his.bg/bg/dev/specifications, measured on 2026-10-13.
    url: "https://his.bg/upload/523/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%A0%D0%B5%D1%86%D0%B5%D0%BF%D1%82%D0%B0+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.5.1.xlsx",
    sha256: "6b53e64b01526ee4cee9ba47e4a6be1a6854115ecc7b9a378f35ca66a1a4b7ed"
}, {
    file: "nomenclatures-1.5.33.xlsx",
    // The nomenclatures workbook the specifications page names, measured on 2026-10-19 (design record §4.6, §5.7).
    url: "https://his.bg/upload/657/%D0%9D%D0%97%D0%98%D0%A1+%D0%9D%D0%BE%D0%BC%D0%B5%D0%BD%D0%BA%D0%BB%D0%B0%D1%82%D1%83%D1%80%D0%B8+-+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.5.33.xlsx",
    sha256: "4dd02562329c003f3c038f492bea7d840218fa904dd7274ca8f1d68086cc603e"
}, {
    file: "rules-1.1.1.xlsx",
    // The production business-rules workbook (1.1.2 is in test), measured on 2026-10-19 (design record §4.6.1).
    url: "https://his.bg/upload/446/%D0%9D%D0%97%D0%98%D0%A1+-+API+%D0%91%D0%B8%D0%B7%D0%BD%D0%B5%D1%81+%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0+-+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.1.1.xlsx",
    sha256: "686283df949d30fe19f31d063c460c49eb1d42e5ceed19c5701e0700cda4a75d"
}, {
    file: "common-services-1.2.2.xlsx",
    // The other seven production module workbooks the specifications page lists, measured on 2026-10-21 for their
    // conditions (design record §6.9). This one is Общи медицински услуги.
    url: "https://his.bg/upload/378/%D0%9D%D0%97%D0%98%D0%A1+%D0%9E%D0%B1%D1%89%D0%B8+%D0%9C%D0%B5%D0%B4%D0%B8%D1%86%D0%B8%D0%BD%D1%81%D0%BA%D0%B8+%D0%A3%D1%81%D0%BB%D1%83%D0%B3%D0%B8+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.2.2.xlsx",
    sha256: "af928ef5c8fd6d11009dec2be912cccaa68572e02905ed20e3e0ca27402a4991"
}, {
    file: "ereferral-1.4.4.xlsx",
    url: "https://his.bg/upload/463/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%9D%D0%B0%D0%BF%D1%80%D0%B0%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.4.4.xlsx",
    sha256: "6f704b34dd0fa0e26697f93b827c3b926bea137da2c52b1ad2613357e82808a2"
}, {
    file: "edental-1.0.7.xlsx",
    // his.bg serves this one under a name ending "(1)".
    url: "https://his.bg/upload/548/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%94%D0%B5%D0%BD%D1%82%D0%B0%D0%BB%D0%BD%D0%BE+%D0%BB%D0%B5%D1%87%D0%B5%D0%BD%D0%B8%D0%B5+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.0.7+%281%29.xlsx",
    sha256: "29721e399d2b89e01e1bdc54077f44456cd7ff36f3ea46f278e741a1801429de"
}, {
    file: "eexamination-1.3.10.xlsx",
    url: "https://his.bg/upload/594/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%9F%D1%80%D0%B5%D0%B3%D0%BB%D0%B5%D0%B4+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.3.10.xlsx",
    sha256: "7596c537c9ba1274edc1b9ff7fac445b5479e97528bc449cc08fb4544ff7312d"
}, {
    file: "ehospitalization-1.1.1.xlsx",
    url: "https://his.bg/upload/595/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%A5%D0%BE%D1%81%D0%BF%D0%B8%D1%82%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.1.1.xlsx",
    sha256: "2bd063bffa50ee51c63f5da46cc3b259499467274838054cb7df32669c9f3ab3"
}, {
    file: "longterm-care-1.0.4.xlsx",
    // No conditions, but a production module all the same: its structure is read like every other's.
    url: "https://his.bg/upload/596/%D0%9D%D0%97%D0%98%D0%A1+%D0%94%D1%8A%D0%BB%D0%B3%D0%BE%D1%81%D1%80%D0%BE%D1%87%D0%BD%D0%B0+%D0%B3%D1%80%D0%B8%D0%B6%D0%B0+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.0.4.xlsx",
    sha256: "89d4c9a9e8933a1fafa6cc2b12b064c007d46b135c77192155494497413d3883"
}, {
    file: "eimmunization-1.2.2.xlsx",
    url: "https://his.bg/upload/618/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%98%D0%BC%D1%83%D0%BD%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.2.2.xlsx",
    sha256: "31a5c1a91aa814ce1c37ae56cac19e66dc9223a9409f0e11d8aa42d266a5ac76"
} ] );

const DOWNLOAD_TIMEOUT_MS = 60000;

const digest = ( buffer ) => crypto.createHash( "sha256" ).update( buffer ).digest( "hex" );

async function fetchFixture( fixture ) {
    const target = path.join( DIRECTORY, fixture.file );
    if ( fs.existsSync( target ) && digest( fs.readFileSync( target ) ) === fixture.sha256 ) {
        console.log( `${ fixture.file }: present` );
        return;
    }
    // One deadline for the request and the body together: a server sending slowly must fail the step, not hold it.
    const response = await fetch( fixture.url, { signal: AbortSignal.timeout( DOWNLOAD_TIMEOUT_MS ) } );
    if ( !response.ok ) {
        throw new Error( `${ fixture.file }: HTTP ${ response.status } from ${ fixture.url }` );
    }
    const buffer = Buffer.from( await response.arrayBuffer() );
    const actual = digest( buffer );
    if ( actual !== fixture.sha256 ) {
        throw new Error( `${ fixture.file }: his.bg now serves a different file (SHA-256 ${ actual }); re-measure the regression test before updating the pin.` );
    }
    fs.writeFileSync( target, buffer );
    console.log( `${ fixture.file }: downloaded, ${ buffer.length } bytes` );
}

( async () => {
    fs.mkdirSync( DIRECTORY, { recursive: true } );
    for ( const fixture of FIXTURES ) {
        await fetchFixture( fixture );
    }
} )().catch( ( error ) => {
    console.error( error.message );
    process.exitCode = 1;
} );
