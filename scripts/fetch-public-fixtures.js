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
} ] );

const digest = ( buffer ) => crypto.createHash( "sha256" ).update( buffer ).digest( "hex" );

async function fetchFixture( fixture ) {
    const target = path.join( DIRECTORY, fixture.file );
    if ( fs.existsSync( target ) && digest( fs.readFileSync( target ) ) === fixture.sha256 ) {
        console.log( `${ fixture.file }: present` );
        return;
    }
    const response = await fetch( fixture.url );
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
