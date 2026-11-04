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
 * The differences between two contents, and the category each is proposed (design record §7.5).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { compareContents, itemKeys } = require( "@health-dev-portal/spec-model/differences" );

const text = ( bg ) => ( { bg: bg, en: null } );
// An R 1..1 String field, in the order of an ElementNode's own fields.
const field = ( identity, extra = {} ) => ( {
    identity: identity, path: identity ? identity.split( "@" )[ 0 ] : null, depth: 1, kind: "field", name: text( "Поле" ), requirement: "R",
    cardinality: { min: 1, max: 1 }, dataType: "String", constraint: null, fixedValue: null, defaultValue: null, rules: [], conditions: [], codeList: null,
    tag: identity ? identity.split( "@" )[ 0 ].split( "/" ).pop() : null, attribute: "value", description: text( null ), source: { sheet: "P001", row: 5 },
    children: [], ...extra
} );
// Message P001 with a contents group holding the given fields.
const moduleWith = ( fields ) => ( {
    kind: "module", spec: "e-prescription", version: null,
    messages: [ { code: "P001", title: text( "Съобщение" ), address: "/v1/p001", direction: "request", sender: null, recipient: null, pairedWith: null,
        source: { sheet: "Съобщения", row: 4 }, lifecycle: "active", changedInVersion: false,
        elements: [ { ...field( "contents" ), kind: "group", path: "contents", tag: "contents", attribute: null, dataType: null, depth: 0, children: fields } ] } ],
    conditions: [], conditionBindings: [], blueprintBindings: [], dictionary: []
} );
const entry = ( key, extra = {} ) => ( { key: key, description: text( `Запис ${ key }` ), display: text( null ), values: [], since: "1.5.0", validUntil: null,
    source: { sheet: "CL009", row: 5 }, ...extra } );
const listWith = ( entries ) => ( { kind: "code-list", spec: "CL009", version: null, list: { id: "CL009", name: text( "Лекарства" ), status: "in-use", dynamic: false,
    visibility: null, remark: null, notes: [], keyType: "integer", columns: [], entries: entries, source: { sheet: "CL009", row: 4 } } } );
const rulesWith = ( ids ) => ( { kind: "rules", spec: "rules", version: null, rules: ids.map( ( id ) => ( { id: id, definition: text( `Правило ${ id }` ), sourceText: null,
    errorCode: "E002", since: "1.0.0", lifecycle: "active", changedInVersion: false, source: { sheet: "Бизнес правила", row: 3 } } ) ) } );
const keys = ( differences ) => differences.map( ( difference ) => [ difference.key, difference.category ] );

describe( "itemKeys", () => {

    it( "keys repeated identities by occurrence, and an element without one by its place", () => {
        const content = moduleWith( [ field( "contents/note@value" ), field( "contents/note@value" ), field( null ) ] );
        assert.deepEqual( [ ...itemKeys( "module", content ).keys() ].filter( ( key ) => key.startsWith( "element:" ) ),
            [ "element:P001:contents#1", "element:P001:contents/note@value#1", "element:P001:contents/note@value#2", "element:element:P001:contents#1@2" ] );
    } );

    // A repeated code is reported (duplicate-message and the like) and loaded as published; a Map keyed without occurrence
    // kept only the last, and replacing the content then deleted the first and moved its elements under the second.
    it( "keeps every one of a repeated message code, condition, dictionary entry and rule", () => {
        const content = moduleWith( [] );
        content.messages.push( { ...content.messages[ 0 ], elements: [] } );
        content.conditions = [ { id: "CDP01", text: "a" }, { id: "CDP01", text: "b" } ];
        content.dictionary = [ { abbreviation: "ЛРН" }, { abbreviation: "ЛРН" } ];
        assert.deepEqual( [ ...itemKeys( "module", content ).keys() ].filter( ( key ) => !key.startsWith( "element:" ) ),
            [ "message:P001", "message:P001#2", "condition:CDP01", "condition:CDP01#2", "dictionary:ЛРН", "dictionary:ЛРН#2" ] );
        assert.deepEqual( [ ...itemKeys( "rules", rulesWith( [ "RL001", "RL001" ] ) ).keys() ], [ "rule:RL001", "rule:RL001#2" ] );
    } );

    it( "gives each item its own fields, its parent's key and its place", () => {
        const item = itemKeys( "module", moduleWith( [ field( "contents/a@value" ) ] ) ).get( "element:P001:contents/a@value#1" );
        assert.deepEqual( [ item.kind, item.identity, item.parent, item.position, "children" in item.data ], [ "element", "contents/a@value", "element:P001:contents#1", 0, false ] );
    } );
} );

describe( "compareContents", () => {

    it( "proposes breaking for a raised minimum and non-breaking for a new description", () => {
        const base = moduleWith( [ field( "contents/lrn@value", { cardinality: { min: 0, max: 1 }, requirement: "O" } ) ] );
        const current = moduleWith( [ field( "contents/lrn@value", { cardinality: { min: 1, max: 1 }, requirement: "R", description: { bg: "ново", en: null } } ) ] );
        assert.deepEqual( keys( compareContents( "module", base, current ) ), [
            [ "element:P001:contents/lrn@value#1|requirement", "breaking" ],
            [ "element:P001:contents/lrn@value#1|cardinality", "breaking" ],
            [ "element:P001:contents/lrn@value#1|description", "non-breaking" ]
        ] );
    } );

    it( "proposes an optional addition non-breaking, a required one and a removal breaking", () => {
        const base = moduleWith( [ field( "contents/a@value" ) ] );
        const current = moduleWith( [ field( "contents/b@value", { requirement: "O", cardinality: { min: 0, max: 1 } } ), field( "contents/c@value" ) ] );
        assert.deepEqual( keys( compareContents( "module", base, current ) ), [
            [ "element:P001:contents/b@value#1|added", "non-breaking" ],
            [ "element:P001:contents/c@value#1|added", "breaking" ],
            [ "element:P001:contents/a@value#1|removed", "breaking" ]
        ] );
    } );

    it( "judges a constraint by whether it narrows", () => {
        const at = ( constraint ) => moduleWith( [ field( "contents/x@value", { constraint } ) ] );
        const one = ( a, b ) => compareContents( "module", at( a ), at( b ) )[ 0 ].category;
        assert.equal( one( { raw: "max=36", maxLength: 36 }, { raw: "max=20", maxLength: 20 } ), "breaking" );
        assert.equal( one( { raw: "max=20", maxLength: 20 }, { raw: "max=36", maxLength: 36 } ), "non-breaking" );
        assert.equal( one( null, { raw: "chars=n", charset: "n" } ), "breaking" );
        assert.equal( one( { raw: "chars=n", charset: "n" }, null ), "non-breaking" );
    } );

    // XSDs are sequences in the workbook's row order (design record §4.10): an element moved changes the wire.
    it( "proposes an element that moved breaking, and does not call its shifted siblings moved", () => {
        const [ a, b, c ] = [ "contents/a@value", "contents/b@value", "contents/c@value" ].map( ( identity ) => field( identity ) );
        // A swap of two moves one of them: here b, before a. Which one is a choice; that it is one is the point.
        assert.deepEqual( keys( compareContents( "module", moduleWith( [ a, b, c ] ), moduleWith( [ b, a, c ] ) ) ),
            [ [ "element:P001:contents/b@value#1|moved", "breaking" ] ] );
        assert.deepEqual( keys( compareContents( "module", moduleWith( [ a, b, c ] ), moduleWith( [ b, c, a ] ) ) ),
            [ [ "element:P001:contents/a@value#1|moved", "breaking" ] ] );
        assert.deepEqual( keys( compareContents( "module", moduleWith( [ a, c ] ), moduleWith( [ a, b, c ] ) ) ),
            [ [ "element:P001:contents/b@value#1|added", "breaking" ] ] );
    } );

    it( "compares code lists entry by entry, and a withdrawn entry is breaking", () => {
        const base = listWith( [ entry( "1" ), entry( "2" ) ] );
        const current = listWith( [ entry( "1", { validUntil: "1.5.34" } ), entry( "3" ) ] );
        assert.deepEqual( keys( compareContents( "code-list", base, current ) ), [
            [ "entry:1#1|validUntil", "breaking" ], [ "entry:3#1|added", "non-breaking" ], [ "entry:2#1|removed", "breaking" ]
        ] );
    } );

    it( "compares rules, and proposes an added rule breaking", () => {
        assert.deepEqual( keys( compareContents( "rules", rulesWith( [ "RL001" ] ), rulesWith( [ "RL001", "RL002" ] ) ) ), [ [ "rule:RL002|added", "breaking" ] ] );
    } );

    it( "finds nothing between equal contents, whatever their key order or where they were read", () => {
        const reordered = moduleWith( [ field( "contents/a@value", { source: { sheet: "P001", row: 99 } } ) ] );
        reordered.messages[ 0 ].elements[ 0 ].children[ 0 ] = Object.fromEntries( Object.entries( reordered.messages[ 0 ].elements[ 0 ].children[ 0 ] ).reverse() );
        assert.deepEqual( compareContents( "module", moduleWith( [ field( "contents/a@value" ) ] ), reordered ), [] );
    } );

    it( "adds everything when there is no base, and never proposes dropped-plan", () => {
        const differences = compareContents( "rules", null, rulesWith( [ "RL001" ] ) );
        assert.deepEqual( keys( differences ), [ [ "rule:RL001|added", "breaking" ] ] );
        assert.deepEqual( [ differences[ 0 ].target, differences[ 0 ].identity, differences[ 0 ].before ], [ "rule", "RL001", null ] );
    } );
} );
