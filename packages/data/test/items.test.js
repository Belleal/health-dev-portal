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
 * A version's content as items (design record §3.2): one row per message, element, condition, entry or rule, keyed by
 * identity, so a later plan can edit and compare identity by identity (§7.5).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { decodeContent, encodeContent } = require( "#items" );
const { codeListVersion, moduleVersion, rulesVersion } = require( "./support/models" );

describe( "encodeContent and decodeContent", () => {

    it( "gives the same hash to the same content, and another to a change", () => {
        const content = moduleVersion();
        assert.equal( encodeContent( "module", content ).hash, encodeContent( "module", moduleVersion() ).hash );
        content.messages[ 0 ].elements[ 0 ].description.bg = "друго";
        assert.notEqual( encodeContent( "module", content ).hash, encodeContent( "module", moduleVersion() ).hash );
    } );

    it( "decodes what it encoded, for each kind", () => {
        for ( const [ kind, content ] of [ [ "module", moduleVersion() ], [ "code-list", codeListVersion( "CL009", [ "1", "2" ] ) ], [ "rules", rulesVersion( [ "RL001" ] ) ] ] ) {
            assert.deepEqual( decodeContent( kind, content.spec, content.version, encodeContent( kind, content ).items ), content, kind );
        }
    } );

    it( "keys each item by its identity, and keeps the tree in parent and position", () => {
        const { items } = encodeContent( "module", moduleVersion() );
        assert.deepEqual( items.slice( 0, 4 ).map( ( item ) => [ item.item_no, item.kind, item.identity, item.parent_no, item.position_no ] ), [
            [ 1, "message", "P001", null, 0 ],
            [ 2, "element", "contents", 1, 0 ],
            [ 3, "element", "contents/lrn", 2, 0 ],
            [ 4, "element", "contents/lrn@value", 3, 0 ]
        ] );
        assert.deepEqual( items.filter( ( item ) => item.identity === "contents/note@value" ).length, 2 );
        assert.deepEqual( [ ...new Set( items.map( ( item ) => item.kind ) ) ], [ "message", "element", "condition", "dictionary", "condition-binding", "blueprint-binding" ] );
    } );

    it( "leaves out change notes, which the changelog keeps", () => {
        assert.equal( encodeContent( "rules", { ...rulesVersion( [ "RL001" ] ), changeNotes: [ { version: "1.1.1", notes: [] } ] } ).hash,
            encodeContent( "rules", rulesVersion( [ "RL001" ] ) ).hash );
    } );

    it( "refuses content it could not give back whole", () => {
        assert.throws( () => encodeContent( "module", { ...moduleVersion(), extra: [] } ), { name: "TypeError", message: /extra/ } );
        assert.throws( () => encodeContent( "common-schema", moduleVersion() ), { name: "TypeError" } );
    } );
} );
