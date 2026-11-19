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
 * The studio's labels (plan 9a): every one in both languages, none empty, and every key a fragment names present.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const catalogue = require( "../../studio/labels.json" );

// A leaf is an object with a language; anything else is a branch.
const leavesOf = ( node, prefix = "" ) => Object.entries( node ).flatMap( ( [ key, value ] ) => {
    const here = prefix === "" ? key : `${ prefix }.${ key }`;
    return ( typeof value === "object" && value !== null && ( "en" in value || "bg" in value ) ) ? [ [ here, value ] ] : leavesOf( value, here );
} );

describe( "The studio's labels", () => {

    it( "every studio label has Bulgarian and English", () => {
        const leaves = leavesOf( catalogue );
        assert.ok( leaves.length > 0 );
        for ( const [ key, value ] of leaves ) {
            assert.deepEqual( Object.keys( value ).sort(), [ "bg", "en" ], key );
            for ( const language of [ "bg", "en" ] ) {
                assert.equal( typeof value[ language ], "string", `${ key } (${ language })` );
                assert.notEqual( value[ language ].trim(), "", `${ key } (${ language })` );
            }
        }
    } );

    it( "every key a studio fragment names is in the catalogue", () => {
        const keys = new Set( leavesOf( catalogue ).map( ( [ key ] ) => key ) );
        const directory = path.join( __dirname, "..", "..", "public", "fragments" );
        const files = fs.readdirSync( directory, { recursive: true } ).filter( ( name ) => name.endsWith( ".html" ) );
        for ( const file of files ) {
            const html = fs.readFileSync( path.join( directory, file ), "utf8" );
            for ( const [ , key ] of html.matchAll( /x-text-label(?::[\w-]+)?="(studio\.[\w.-]+)"/g ) ) {
                assert.ok( keys.has( key ), `${ file } names ${ key }` );
            }
        }
    } );
} );
