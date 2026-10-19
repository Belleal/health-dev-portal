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

// SpreadsheetML numbers theme colours in this order — not the order the scheme is written in the theme part, where dk1
// comes first. Measured on e-Prescription 1.5.1: the default font colour is { theme: 1 } and renders black, which only
// holds if index 1 is dk1.
const THEME_ORDER = Object.freeze( [ "lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink" ] );

/**
 * What the reader records for a colour that is set but cannot be resolved (an indexed palette entry, a missing theme
 * slot). It matches no legend entry, so it is reported rather than read as "no colour".
 *
 * @type {string}
 * @public
 */
module.exports.UNRESOLVED = "unresolved";

/**
 * Reads the colour scheme of a workbook's theme part.
 *
 * @method
 * @param {string|undefined} themeXml The raw XML of `xl/theme/theme1.xml`.
 * @returns {Object<string, string>} Slot name (`dk1`, `accent6`, …) to six upper-case hex digits.
 * @public
 */
module.exports.parseThemeColours = ( themeXml ) => {
    const colours = {};
    if ( typeof themeXml !== "string" ) {
        return colours;
    }
    const scheme = themeXml.match( /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/ );
    if ( !scheme ) {
        return colours;
    }
    for ( const slot of THEME_ORDER ) {
        const element = scheme[ 0 ].match( new RegExp( `<a:${ slot }>([\\s\\S]*?)</a:${ slot }>` ) );
        if ( !element ) {
            continue;
        }
        // A system colour (windowText, window) carries its rendered value as lastClr.
        const value = element[ 1 ].match( /srgbClr val="([0-9A-Fa-f]{6})"/ ) || element[ 1 ].match( /lastClr="([0-9A-Fa-f]{6})"/ );
        if ( value ) {
            colours[ slot ] = value[ 1 ].toUpperCase();
        }
    }
    return colours;
};

const toHex = ( unit ) => Math.round( Math.min( 1, Math.max( 0, unit ) ) * 255 ).toString( 16 ).padStart( 2, "0" ).toUpperCase();

function hueToChannel( p, q, t ) {
    let hue = t;
    if ( hue < 0 ) {
        hue += 1;
    }
    if ( hue > 1 ) {
        hue -= 1;
    }
    if ( hue < 1 / 6 ) {
        return p + ( q - p ) * 6 * hue;
    }
    if ( hue < 1 / 2 ) {
        return q;
    }
    if ( hue < 2 / 3 ) {
        return p + ( q - p ) * ( 2 / 3 - hue ) * 6;
    }
    return p;
}

// SpreadsheetML's tint works on HSL luminance: a negative tint darkens by that fraction, a positive one moves the
// luminance that fraction of the way to white.
function applyTint( hex, tint ) {
    if ( !tint ) {
        return hex;
    }
    const [ r, g, b ] = [ 0, 2, 4 ].map( ( index ) => parseInt( hex.slice( index, index + 2 ), 16 ) / 255 );
    const max = Math.max( r, g, b );
    const min = Math.min( r, g, b );
    let hue = 0;
    let saturation = 0;
    let luminance = ( max + min ) / 2;
    if ( max !== min ) {
        const delta = max - min;
        saturation = luminance > 0.5 ? delta / ( 2 - max - min ) : delta / ( max + min );
        hue = max === r ? ( g - b ) / delta + ( g < b ? 6 : 0 ) : max === g ? ( b - r ) / delta + 2 : ( r - g ) / delta + 4;
        hue /= 6;
    }
    luminance = tint < 0 ? luminance * ( 1 + tint ) : luminance * ( 1 - tint ) + tint;
    if ( saturation === 0 ) {
        return toHex( luminance ).repeat( 3 );
    }
    const q = luminance < 0.5 ? luminance * ( 1 + saturation ) : luminance + saturation - luminance * saturation;
    const p = 2 * luminance - q;
    return toHex( hueToChannel( p, q, hue + 1 / 3 ) ) + toHex( hueToChannel( p, q, hue ) ) + toHex( hueToChannel( p, q, hue - 1 / 3 ) );
}

/**
 * Resolves an exceljs colour object to six upper-case hex digits.
 *
 * @method
 * @param {{argb?: string, theme?: number, tint?: number, indexed?: number}|null|undefined} colour
 * @param {Object<string, string>} themeColours From `parseThemeColours`.
 * @returns {string|null} `null` when there is no colour or it cannot be resolved (indexed palette, unknown theme slot).
 * @public
 */
module.exports.resolveColour = ( colour, themeColours ) => {
    if ( !colour ) {
        return null;
    }
    if ( typeof colour.argb === "string" && /^[0-9A-Fa-f]{8}$/.test( colour.argb ) ) {
        return applyTint( colour.argb.slice( 2 ).toUpperCase(), colour.tint );
    }
    if ( Number.isInteger( colour.theme ) ) {
        const base = themeColours[ THEME_ORDER[ colour.theme ] ];
        return base ? applyTint( base, colour.tint ) : null;
    }
    return null;
};
