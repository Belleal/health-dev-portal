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
 * The published /api/v1/ XSD set, as his.bg serves it (design record §5.8). Every expected value was measured on
 * 2026-11-02 with a reader independent of this code, the one the design record's figures come from.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { expandMessage, readXsdSet } = require( "#xsd-reader" );

const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public/api-v1" );
const PRESENT = fs.existsSync( path.join( DIRECTORY, "NHIS-Entities.xsd" ) );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "The public XSD set is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

// Every identity of a shape, as the recon counted them: a group by its path, a field by each attribute.
const identities = ( node ) => [
    ...( node.kind === "group" && node.path !== "" ? [ node.path ] : [] ),
    ...node.attributes.map( ( attribute ) => `${ node.path }@${ attribute.name }` ),
    ...node.children.flatMap( identities )
];
const signatures = ( node ) => [ ...( node.kind === "signature" ? [ node ] : [] ), ...node.children.flatMap( signatures ) ];

describe( "The published XSD set", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let set;

    before( () => {
        set = readXsdSet( fs.readdirSync( DIRECTORY ).map( ( name ) => ( { name: name, text: fs.readFileSync( path.join( DIRECTORY, name ), "utf8" ) } ) ) );
    } );

    it( "reads all 117 published XSDs, and indexes 113 messages", () => {
        assert.equal( fs.readdirSync( DIRECTORY ).filter( ( name ) => name.startsWith( "NHIS-" ) ).length, 117 );
        assert.equal( set.messages.size, 113 );
    } );

    it( "expands e-Dental's eleven messages as the recon measured", () => {
        const codes = [ ...set.messages.keys() ].filter( ( code ) => code.startsWith( "D" ) ).sort();
        assert.equal( codes.length, 11 );
        const roots = codes.map( ( code ) => expandMessage( set, code ) );
        assert.equal( roots.flatMap( identities ).length, 353 );
        // The recon skipped the Signature references; the reader keeps them, in the five requests.
        assert.deepEqual( codes.filter( ( code, index ) => signatures( roots[ index ] ).length === 1 ), [ "D001", "D003", "D005", "D007", "D009" ] );
    } );

    it( "gives each message file's version", () => {
        assert.deepEqual( [ "D001", "H001", "P001", "S001" ].map( ( code ) => set.messages.get( code ).version ), [ "1.0.5", "1.0.6", "1.3.2", "1.6.2" ] );
    } );

    it( "expands every published message", () => {
        for ( const code of set.messages.keys() ) {
            assert.equal( expandMessage( set, code ).tag, "message", code );
        }
    } );
} );
