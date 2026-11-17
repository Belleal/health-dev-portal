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
 * The site's search (plan 8c, decision 7; design record §3.4), on versions and content built here: what is indexed, from
 * which stage, and how a query finds and orders it.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { fingerprintOf, indexEntries, matchEntries } = require( "#search" );

const text = ( bg, en = bg ) => ( { bg: bg, en: en } );
const element = ( path, extra = {} ) => ( { path: path, kind: "element", tag: path.split( "/" ).at( -1 ), attribute: null, name: text( "Поле", "Field" ),
    description: text( "Описание", "Description" ), children: [], ...extra } );
const message = ( code, title, elements = [], extra = {} ) => ( { code: code, title: title, lifecycle: null, elements: elements, ...extra } );
const module_ = ( messages, conditions = [] ) => ( { messages: messages, conditions: conditions, dictionary: [] } );
const CONTENT = Object.freeze( {
    guides: [
        { slug: "other", texts: { bg: { title: "Други неща", summary: "Кратко.", plain: "Тук се споменава токен." }, en: null } },
        { slug: "token", texts: { bg: { title: "Токен за достъп", summary: "Как.", plain: "Текст." }, en: { title: "Access token", summary: "How.", plain: "Text." } } }
    ],
    planned: [],
    faq: { categories: [ { key: "general", name: text( "Общи", "General" ), questions: [ { slug: "one", texts: { bg: { question: "Кой метод?", plain: "GET." }, en: null } } ] } ] }
} );

const VERSIONS = [
    { spec: "e-prescription", kind: "module", stage: "production", content: module_( [
        message( "P002", text( "Отговор на P001", "Answer to P001" ) ),
        message( "P001", text( "Рецепта", "Prescription" ), [ element( "contents/prescription", { children: [ element( "contents/prescription/lrn" ) ] } ) ] ),
        message( "P011", text( "Оттеглено", "Withdrawn" ), [ element( "contents/gone" ) ], { lifecycle: "withdrawn" } )
    ], [ { id: "CDP01", text: "IF x THEN y" } ] ) },
    { spec: "e-prescription", kind: "module", stage: "testing", content: module_( [
        message( "P001", text( "Рецепта (нова)", "Prescription (new)" ), [ element( "contents/prescription", { children: [ element( "contents/prescription/exampleNote" ) ] } ) ] ),
        message( "P099", text( "Нова заявка", "New request" ) )
    ] ) },
    { spec: "rules", kind: "rules", stage: "production", content: { rules: [ { id: "RL001", definition: text( "Правило за рецепта" ) } ] } },
    { spec: "CL009", kind: "code-list", stage: "production", content: null },
    { spec: "CL999", kind: "code-list", stage: "production", content: { list: { name: text( "Грешки", "Errors" ), entries: [
        { key: "E002", description: text( "Невалиден подпис", "Invalid signature" ), display: text( null, null ) } ] } } }
];
const NAMES = new Map( [ [ "CL009", text( "Лекарствени продукти", "Medicinal products" ) ], [ "CL999", text( "Грешки", "Errors" ) ] ] );

const entries = indexEntries( { versions: VERSIONS, listNames: NAMES, content: CONTENT } );
const group = ( results, kind ) => results.groups.find( ( one ) => one.kind === kind ) || { total: 0, entries: [] };

describe( "Search", () => {

    it( "indexes production before testing, and testing only for what production lacks", () => {
        const messages = entries.filter( ( one ) => one.kind === "message" );
        assert.deepEqual( messages.map( ( one ) => [ one.code, one.stage ] ), [ [ "P002", "production" ], [ "P001", "production" ], [ "P099", "testing" ] ] );
        const notes = entries.filter( ( one ) => one.kind === "element" && one.slug === "contents/prescription/exampleNote" );
        assert.deepEqual( notes.map( ( one ) => [ one.code, one.stage ] ), [ [ "P001", "testing" ] ] );
        // The same element in both stages is one entry, production's.
        assert.equal( entries.filter( ( one ) => one.kind === "element" && one.slug === "contents/prescription" ).length, 1 );
    } );

    it( "leaves a withdrawn message and its elements out", () => {
        assert.equal( entries.some( ( one ) => one.code === "P011" ), false );
        assert.equal( entries.some( ( one ) => one.slug === "contents/gone" ), false );
    } );

    it( "indexes guides, questions, specs, conditions, rules, lists and errors", () => {
        const kinds = new Set( entries.map( ( one ) => one.kind ) );
        assert.deepEqual( [ ...kinds ].sort(), [ "condition", "element", "error", "faq", "guide", "list", "message", "rule", "spec" ] );
        assert.deepEqual( entries.find( ( one ) => one.kind === "list" && one.spec === "CL009" ).title, text( "Лекарствени продукти", "Medicinal products" ) );
        assert.equal( entries.find( ( one ) => one.kind === "error" ).code, "E002" );
    } );

    it( "puts a code that equals a word first, then title matches, then the rest", () => {
        assert.deepEqual( group( matchEntries( entries, "p001" ), "message" ).entries.map( ( one ) => one.code ), [ "P001", "P002" ] );
        // "Други неща" comes first in the index, but only mentions the word; "Токен за достъп" has it in its title.
        assert.deepEqual( group( matchEntries( entries, "токен" ), "guide" ).entries.map( ( one ) => one.slug ), [ "token", "other" ] );
    } );

    it( "requires every word", () => {
        assert.deepEqual( group( matchEntries( entries, "рецепта нова" ), "message" ).entries.map( ( one ) => one.code ), [] );
        assert.deepEqual( group( matchEntries( entries, "нова заявка" ), "message" ).entries.map( ( one ) => one.code ), [ "P099" ] );
    } );

    it( "finds by look-alike letters, romanisation and code in any case", () => {
        for ( const query of [ "PeЦeпTA", "retsepta", "Рецепта", "prescription" ] ) {
            assert.ok( group( matchEntries( entries, query ), "message" ).entries.some( ( one ) => one.code === "P001" ), query );
        }
        assert.equal( group( matchEntries( entries, "cl009" ), "list" ).entries[ 0 ].spec, "CL009" );
        assert.equal( group( matchEntries( entries, "e002" ), "error" ).entries[ 0 ].code, "E002" );
        assert.equal( group( matchEntries( entries, "cdp01" ), "condition" ).entries[ 0 ].code, "CDP01" );
    } );

    it( "answers short, long and hostile queries", () => {
        assert.equal( matchEntries( entries, "" ).state, "empty" );
        assert.equal( matchEntries( entries, null ).state, "empty" );
        assert.equal( matchEntries( entries, "   " ).state, "empty" );
        assert.equal( matchEntries( entries, "a" ).state, "short" );
        assert.equal( matchEntries( entries, "x".repeat( 201 ) ).state, "long" );
        // Each two characters or more, so that each is searched: the words are found with `includes`, never as a pattern.
        for ( const query of [ ".*(", "<script>", "\\\\", "[(" ] ) {
            const results = matchEntries( entries, query );
            assert.equal( results.state, "done", query );
            assert.equal( results.query, query );
        }
    } );

    it( "changes its fingerprint when a version moves stage under the same ID", () => {
        // A spec's first promotion to production keeps its version's ID and replaces nothing, so a fingerprint of the IDs
        // alone stayed the same, and the index kept linking the testing address (final review, CodeRabbit on #6).
        const at = ( testing, production ) => [ { spec: "e-new", kind: "module", testing: testing && { id: testing }, production: production && { id: production },
            previousProduction: null } ];
        assert.notEqual( fingerprintOf( at( "v1", null ) ), fingerprintOf( at( null, "v1" ) ) );
        assert.equal( fingerprintOf( at( "v2", "v1" ) ), fingerprintOf( at( "v2", "v1" ) ) );
        // Previous production is not indexed, so a version moving there from production changes the set as it leaves it.
        assert.notEqual( fingerprintOf( at( null, "v1" ) ), fingerprintOf( at( null, null ) ) );
    } );

    it( "shows twenty of a group at most, with the group's total", () => {
        const many = indexEntries( { versions: [ { spec: "e-big", kind: "module", stage: "production", content: module_(
            Array.from( { length: 25 }, ( unused, index ) => message( `B${ String( index ).padStart( 3, "0" ) }`, text( "Масова заявка", "Bulk request" ) ) ) ) } ],
        listNames: new Map(), content: { guides: [], planned: [], faq: { categories: [] } } } );
        const found = group( matchEntries( many, "масова" ), "message" );
        assert.equal( found.total, 25 );
        assert.equal( found.entries.length, 20 );
    } );
} );
