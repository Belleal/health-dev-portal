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
 * Colour resolution. Tab colours in the real workbooks are often theme colours ({ theme: 9 }) that only the workbook's
 * own theme part turns into a value; openpyxl could not, and its reading wrongly found most tabs uncoloured (design
 * record §5.1).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { parseThemeColours, resolveColour } = require( "#colours" );

// The colour scheme of e-Prescription 1.5.1's theme part, as measured on 2026-10-19.
const THEME_XML = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements><a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="5B9BD5"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>
<a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme></a:themeElements></a:theme>`;

const theme = parseThemeColours( THEME_XML );

const channels = ( hex ) => [ 0, 2, 4 ].map( ( index ) => parseInt( hex.slice( index, index + 2 ), 16 ) );

describe( "colours", () => {

    it( "reads the scheme, system colours included", () => {
        assert.equal( theme.dk1, "000000" );
        assert.equal( theme.lt1, "FFFFFF" );
        assert.equal( theme.accent6, "70AD47" );
        assert.equal( theme.folHlink, "954F72" );
    } );

    it( "resolves theme indices in SpreadsheetML order, where 0 is lt1 and 1 is dk1", () => {
        // Measured: the default font colour is { theme: 1 } and renders black — only true if index 1 is dk1.
        assert.equal( resolveColour( { theme: 1 }, theme ), "000000" );
        assert.equal( resolveColour( { theme: 0 }, theme ), "FFFFFF" );
        // The real tabs: { theme: 9 } is green ("working, unchanged"), { theme: 5 } orange ("not yet working").
        assert.equal( resolveColour( { theme: 9 }, theme ), "70AD47" );
        assert.equal( resolveColour( { theme: 5 }, theme ), "ED7D31" );
    } );

    it( "applies a negative tint by darkening", () => {
        // The real "Change Notes" tab: white darkened 15% is Excel's D9D9D9.
        assert.equal( resolveColour( { theme: 0, tint: -0.1499984740745262 }, theme ), "D9D9D9" );
    } );

    it( "applies a positive tint by lightening, within one step per channel of Excel's value", () => {
        // The real "Легенда" tab: accent1 lightened 80% is Excel's DDEBF7. Excel rounds through 0–255 integers.
        const got = channels( resolveColour( { theme: 4, tint: 0.7999816888943144 }, theme ) );
        channels( "DDEBF7" ).forEach( ( expected, index ) => assert.ok( Math.abs( got[ index ] - expected ) <= 1, `${ got } vs DDEBF7` ) );
    } );

    it( "resolves direct colours and drops the alpha byte", () => {
        assert.equal( resolveColour( { argb: "FFC65911" }, theme ), "C65911" );
        assert.equal( resolveColour( { argb: "ff70ad47" }, theme ), "70AD47" );
    } );

    it( "returns null for what it cannot resolve", () => {
        assert.equal( resolveColour( null, theme ), null );
        assert.equal( resolveColour( undefined, theme ), null );
        assert.equal( resolveColour( { indexed: 64 }, theme ), null );
        assert.equal( resolveColour( { theme: 42 }, theme ), null );
        assert.equal( resolveColour( { theme: 9 }, {} ), null );
        assert.deepEqual( parseThemeColours( undefined ), {} );
        assert.deepEqual( parseThemeColours( "<not-a-theme/>" ), {} );
    } );
} );
