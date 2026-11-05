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
 * A new content matched to stored rows by identity (plan 6a, decisions 3 and 4): only what differs changes, and every
 * other row keeps its number and revision.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { encodeContent } = require( "#items" );
const { diffRows, keyRows } = require( "#item-diff" );
const { moduleVersion } = require( "./support/models" );

// What plan 5 stores for a content.
const rowsOf = ( content ) => encodeContent( "module", content ).items.map( ( item ) => ( { ...item, revision: 1 } ) );

describe( "keyRows", () => {

    it( "keys stored rows as itemKeys keys the content", () => {
        const keys = [ ...keyRows( "module", rowsOf( moduleVersion( null ) ) ).keys() ];
        assert.deepEqual( keys.filter( ( key ) => key.includes( "note@value" ) ), [ "element:P001:contents/note@value#1", "element:P001:contents/note@value#2" ] );
        assert.ok( keys.includes( "message:P002" ) && keys.includes( "condition:CDP01" ) && keys.includes( "dictionary:ЛРН" ) );
    } );
} );

describe( "diffRows", () => {

    it( "changes nothing for the same content", () => {
        assert.deepEqual( diffRows( "module", rowsOf( moduleVersion( null ) ), moduleVersion( null ) ), { updates: [], inserts: [], deletes: [], moves: [] } );
    } );

    it( "keeps both of two messages with one code, each with its own elements", () => {
        const twice = moduleVersion( null );
        twice.messages.push( { ...twice.messages[ 1 ], title: { bg: "Второ", en: null }, elements: [] } );
        const stored = rowsOf( twice );
        assert.deepEqual( diffRows( "module", stored, twice ), { updates: [], inserts: [], deletes: [], moves: [] } );
        const changed = moduleVersion( null );
        changed.messages.push( { ...changed.messages[ 1 ], title: { bg: "Променено", en: null }, elements: [] } );
        const { updates, deletes } = diffRows( "module", stored, changed );
        assert.deepEqual( [ updates.map( ( row ) => [ row.identity, row.position_no ] ), deletes ], [ [ [ "P002", 2 ] ], [] ] );
    } );

    // A field set to undefined is not written, so it cannot differ from a stored row that lacks it.
    it( "takes a field left undefined for one that is absent", () => {
        const content = moduleVersion( null );
        content.dictionary[ 0 ].remark = undefined;
        assert.deepEqual( diffRows( "module", rowsOf( moduleVersion( null ) ), content ), { updates: [], inserts: [], deletes: [], moves: [] } );
    } );

    it( "matches repeated identities by occurrence", () => {
        // moduleVersion() has two contents/note@value; the second changes, the first does not.
        const changed = moduleVersion( null );
        changed.messages[ 0 ].elements[ 0 ].children[ 3 ].requirement = "O";
        const { updates } = diffRows( "module", rowsOf( moduleVersion( null ) ), changed );
        assert.deepEqual( updates.map( ( row ) => [ row.identity, row.position_no, row.revision ] ), [ [ "contents/note@value", 3, 2 ] ] );
    } );

    it( "numbers an inserted item after the highest, and deletes what is gone", () => {
        const stored = rowsOf( moduleVersion( null ) );
        const changed = moduleVersion( null );
        changed.messages.pop();
        changed.dictionary.push( { abbreviation: "НЗИС", name: { bg: "Система", en: null }, description: { bg: null, en: null }, source: null } );
        const { inserts, deletes } = diffRows( "module", stored, changed );
        assert.deepEqual( inserts.map( ( row ) => [ row.kind, row.identity, row.item_no ] ),
            [ [ "dictionary", "НЗИС", Math.max( ...stored.map( ( row ) => row.item_no ) ) + 1 ] ] );
        assert.deepEqual( deletes.filter( ( row ) => row.kind === "message" ).map( ( row ) => row.identity ), [ "P002" ] );
    } );

    it( "moves a row without raising its revision, and treats its new place as its own", () => {
        const changed = moduleVersion( null );
        const children = changed.messages[ 0 ].elements[ 0 ].children;
        children.unshift( children.splice( 2, 1 )[ 0 ] );    // the first contents/note@value goes first
        const { updates, moves } = diffRows( "module", rowsOf( moduleVersion( null ) ), changed );
        assert.deepEqual( updates, [] );
        assert.deepEqual( moves.map( ( row ) => [ row.identity, row.position_no, row.revision ] ),
            [ [ "contents/note@value", 0, 1 ], [ "contents/lrn", 1, 1 ], [ "contents/dose@value", 2, 1 ] ] );
    } );

    // Bindings are derived, but matched by their identity like any item: a save that leaves them as they were moves none.
    it( "matches bindings by identity, removing the one that is gone", () => {
        const changed = moduleVersion( null );
        changed.blueprintBindings = [];
        const { deletes, inserts } = diffRows( "module", rowsOf( moduleVersion( null ) ), changed );
        assert.deepEqual( [ deletes.map( ( row ) => row.kind ), inserts ], [ [ "blueprint-binding" ], [] ] );
    } );
} );
