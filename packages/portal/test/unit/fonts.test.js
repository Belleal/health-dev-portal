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
 * The self-hosted fonts (plan 8a, decision 6; design record §9): the files under public/fonts/sofia-sans-5.3.0/ are the
 * pinned @fontsource packages' own, byte for byte, with their licence, and the stylesheet names each one.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { FONT_DIRECTORY, FONTS, PACKAGES } = require( "#copy-fonts" );

const STYLESHEET = path.resolve( __dirname, "../../public/portal/portal.css" );

describe( "Fonts", () => {

    it( "copies the pinned fonts byte for byte, with their licence", () => {
        for ( const name of PACKAGES ) {
            assert.equal( JSON.parse( fs.readFileSync( require.resolve( `${ name }/package.json` ), "utf8" ) ).version, "5.3.0", name );
        }
        assert.deepEqual( fs.readdirSync( FONT_DIRECTORY ).sort(), FONTS.map( ( font ) => font.name ).sort() );
        for ( const font of FONTS ) {
            assert.ok( fs.readFileSync( path.join( FONT_DIRECTORY, font.name ) ).equals( fs.readFileSync( font.source ) ), font.name );
        }
        // Sofia Sans 400, 600 and 700 and Sofia Sans Extra Condensed 700, in Cyrillic and Latin, and each family's licence.
        assert.equal( FONTS.filter( ( font ) => font.name.endsWith( ".woff2" ) ).length, 8 );
        assert.equal( FONTS.filter( ( font ) => /^OFL-.*\.txt$/.test( font.name ) ).length, 2 );
        assert.ok( FONT_DIRECTORY.endsWith( path.join( "public", "fonts", "sofia-sans-5.3.0" ) ) );
    } );

    it( "names every font file in the stylesheet, and no other", () => {
        const named = [ ...fs.readFileSync( STYLESHEET, "utf8" ).matchAll( /url\(\s*"?\/static\/fonts\/sofia-sans-5\.3\.0\/([^")\s]+)"?\s*\)/g ) ].map( ( match ) => match[ 1 ] );
        assert.deepEqual( [ ...new Set( named ) ].sort(), FONTS.filter( ( font ) => font.name.endsWith( ".woff2" ) ).map( ( font ) => font.name ).sort() );
    } );
} );
