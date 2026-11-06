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
 * Copies the self-hosted fonts from the pinned @fontsource packages into public/fonts/sofia-sans-5.3.0/ (plan 8a,
 * decision 6; design record §9): Sofia Sans 400, 600 and 700 for text and Sofia Sans Extra Condensed 700 for display
 * headings, in the Cyrillic and Latin subsets, as WOFF2, with each family's licence (OFL-1.1). Run it by hand — `npm run
 * fonts --workspace packages/portal` — when the pinned version changes; the copies are committed.
 *
 * The version is in the directory's name, and the framework serves everything under /static/fonts/ as immutable, so a
 * file there must never change: a new version goes into a new directory, never over this one. The two licences differ
 * in their first line, which names the family's own font file, so each is kept under its family's name.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );

const VERSION = "5.3.0";

/**
 * The two pinned packages.
 *
 * @type {string[]}
 * @public
 */
module.exports.PACKAGES = Object.freeze( [ "@fontsource/sofia-sans", "@fontsource/sofia-sans-extra-condensed" ] );

/**
 * Where the copies go.
 *
 * @type {string}
 * @public
 */
module.exports.FONT_DIRECTORY = path.resolve( __dirname, "..", "public", "fonts", `sofia-sans-${ VERSION }` );

const font = ( family, subset, weight ) => {
    const name = `${ family }-${ subset }-${ weight }-normal.woff2`;
    // Resolved through each package's exports map, which names its files/*.woff2 and its LICENSE.
    return { name: name, source: require.resolve( `@fontsource/${ family }/files/${ name }` ) };
};

/**
 * Each file the directory holds, and the package file it is a copy of.
 *
 * @type {Array<{name: string, source: string}>}
 * @public
 */
module.exports.FONTS = Object.freeze( [
    ...[ "cyrillic", "latin" ].flatMap( ( subset ) => [ 400, 600, 700 ].map( ( weight ) => font( "sofia-sans", subset, weight ) ) ),
    ...[ "cyrillic", "latin" ].map( ( subset ) => font( "sofia-sans-extra-condensed", subset, 700 ) ),
    { name: "OFL-sofia-sans.txt", source: require.resolve( "@fontsource/sofia-sans/LICENSE" ) },
    { name: "OFL-sofia-sans-extra-condensed.txt", source: require.resolve( "@fontsource/sofia-sans-extra-condensed/LICENSE" ) }
].map( Object.freeze ) );

if ( require.main === module ) {
    for ( const name of module.exports.PACKAGES ) {
        const installed = JSON.parse( fs.readFileSync( require.resolve( `${ name }/package.json` ), "utf8" ) ).version;
        if ( installed !== VERSION ) {
            console.error( `${ name } is ${ installed }, not ${ VERSION }: a new version goes into a directory of its own, never over this one.` );
            process.exit( 1 );
        }
    }
    fs.mkdirSync( module.exports.FONT_DIRECTORY, { recursive: true } );
    const wanted = new Set( module.exports.FONTS.map( ( one ) => one.name ) );
    for ( const name of fs.readdirSync( module.exports.FONT_DIRECTORY ) ) {
        if ( !wanted.has( name ) ) {
            fs.rmSync( path.join( module.exports.FONT_DIRECTORY, name ) );
        }
    }
    for ( const one of module.exports.FONTS ) {
        fs.copyFileSync( one.source, path.join( module.exports.FONT_DIRECTORY, one.name ) );
    }
    console.log( `Copied ${ module.exports.FONTS.length } files into ${ module.exports.FONT_DIRECTORY }.` );
}
