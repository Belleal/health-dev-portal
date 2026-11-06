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
 * The interface's own words (plan 8a, decision 5): both languages hold the same keys, and every `label( … )` call in
 * site/ names a key that exists, so a missing word fails here rather than on a page.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { LABELS, label } = require( "#labels" );

const SITE = path.resolve( __dirname, "../../site" );

// Every .js file under site/, however deep the pages go.
const sources = ( directory ) => fs.readdirSync( directory, { withFileTypes: true } ).flatMap( ( entry ) => {
    const full = path.join( directory, entry.name );
    return entry.isDirectory() ? sources( full ) : entry.name.endsWith( ".js" ) ? [ full ] : [];
} );

describe( "Labels", () => {

    it( "holds both languages to the same keys, and every label call to a key", () => {
        assert.deepEqual( Object.keys( LABELS ).sort(), [ "bg", "en" ] );
        assert.deepEqual( Object.keys( LABELS.en ).sort(), Object.keys( LABELS.bg ).sort() );
        for ( const lang of [ "bg", "en" ] ) {
            for ( const [ key, text ] of Object.entries( LABELS[ lang ] ) ) {
                assert.ok( typeof text === "string" && text.trim() !== "", `${ lang }.${ key } is empty` );
            }
        }
        const called = [];
        for ( const file of sources( SITE ) ) {
            for ( const match of fs.readFileSync( file, "utf8" ).matchAll( /\blabel\(\s*[^,()]+,\s*"([^"]+)"/g ) ) {
                called.push( match[ 1 ] );
                assert.ok( Object.hasOwn( LABELS.bg, match[ 1 ] ), `${ path.relative( SITE, file ) } calls label "${ match[ 1 ] }", which does not exist` );
            }
        }
        // The sweep found the calls the layout makes, so a regex that matched nothing cannot pass for a clean sweep.
        assert.ok( called.includes( "untranslated" ) && called.length > 10, `only ${ called.length } label calls found` );
    } );

    it( "fills in named values, and refuses a key or language it does not have", () => {
        assert.equal( label( "bg", "untranslated" ), "не е преведено" );
        assert.equal( label( "en", "untranslated" ), "not yet translated" );
        assert.equal( label( "en", "notFoundTitle" ), "Page not found" );
        assert.equal( label( "bg", "backwardCompatibleUntil", { date: "30.04.2027" } ), "обратно съвместима до 30.04.2027" );
        assert.equal( label( "en", "backwardCompatibleUntil", { date: "30 Apr 2027" } ), "backward compatible until 30 Apr 2027" );
        assert.throws( () => label( "en", "backwardCompatibleUntil" ), RangeError );
        assert.throws( () => label( "bg", "no-such-label" ), RangeError );
        assert.throws( () => label( "fr", "untranslated" ), RangeError );
    } );
} );
