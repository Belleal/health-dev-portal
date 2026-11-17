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
 * The content register and its loader (plan 8c, decisions 2 and 3; design record §3.5): guides and questions in
 * Markdown, each file named in `content.yml`, read once at start. Every folder here is built in code, so no broken file
 * — and no front matter that is code — is ever committed.
 */

const { after, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { CONTENT_DIRECTORY, ContentError, loadContent } = require( "#content" );

const folders = [];

// The ContentError a load throws: `assert.throws` checks an error but does not hand it back.
const refusal = ( files ) => {
    try {
        loadContent( folder( files ) );
    } catch ( error ) {
        assert.ok( error instanceof ContentError, error.message );
        return error;
    }
    return assert.fail( "the content was loaded" );
};

// A content folder holding exactly these files, by their path under it.
const folder = ( files ) => {
    const root = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-content-" ) );
    folders.push( root );
    for ( const [ name, text ] of Object.entries( files ) ) {
        fs.mkdirSync( path.dirname( path.join( root, name ) ), { recursive: true } );
        fs.writeFileSync( path.join( root, name ), text );
    }
    return root;
};

const REGISTER = `guides:
  - slug: first
    aiAssisted: true
    reviewed:
    sources:
      - { title: "Стар документ", version: "1.0.2", url: "https://www.his.bg/upload/1/old.pdf" }
  - slug: second
    aiAssisted: false
    reviewed: 2026-11-20
    sources: []
planned:
  - slug: later
    title: { bg: "По-късно", en: "Later" }
    legacy:
  - slug: old
    title: { bg: "Старо", en: "Old" }
    legacy: { title: "Стар документ", version: "1.0.1", url: "https://www.his.bg/upload/2/old.pdf" }
faq:
  source: "https://www.his.bg/bg/dev/faq"
  retrieved: "2026-11-17"
  categories:
    - key: authentication
      name: { bg: "Автентикация и подпис", en: "Authentication and signing" }
      questions: [ one ]
    - key: messages
      name: { bg: "Съобщения", en: "Messages" }
      questions: [ two ]
`;

const guide = ( title, body = "## Среди {#environments}\n\nТекст." ) => `---
title: ${ title }
summary: Кратко.
updated: 2026-11-17
---
${ body }
`;

const question = ( text, answer = "Отговор." ) => `---
question: ${ text }
---
${ answer }
`;

// A register and every file it names, valid: each test changes what it is about.
const FILES = Object.freeze( {
    "content.yml": REGISTER,
    "guides/first.bg.md": guide( "Първо" ),
    "guides/first.en.md": guide( "First", "## Environments {#environments}\n\nText." ),
    "guides/second.bg.md": guide( "Второ", "## Начало {#start}\n\nТекст.\n\n## Край {#end}\n\nТекст." ),
    "faq/one.bg.md": question( "Първи въпрос?" ),
    "faq/two.bg.md": question( "Втори въпрос?" )
} );

describe( "The content register and its loader", () => {

    after( () => {
        for ( const root of folders ) {
            fs.rmSync( root, { recursive: true, force: true } );
        }
    } );

    it( "loads the register's guides, planned guides and questions in its order", () => {
        const content = loadContent( folder( FILES ) );
        assert.deepEqual( content.guides.map( ( one ) => one.slug ), [ "first", "second" ] );
        assert.deepEqual( content.planned.map( ( one ) => one.slug ), [ "later", "old" ] );
        assert.deepEqual( content.planned[ 1 ].legacy, { title: "Стар документ", version: "1.0.1", url: "https://www.his.bg/upload/2/old.pdf" } );
        assert.equal( content.planned[ 0 ].legacy, null );
        assert.deepEqual( content.faq.categories.map( ( one ) => one.key ), [ "authentication", "messages" ] );
        assert.equal( content.faq.categories[ 0 ].questions[ 0 ].texts.bg.question, "Първи въпрос?" );
        assert.equal( content.faq.retrieved, "2026-11-17" );
        assert.deepEqual( content.guides.map( ( one ) => [ one.aiAssisted, one.reviewed ] ), [ [ true, null ], [ false, "2026-11-20" ] ] );
        assert.deepEqual( content.guides[ 0 ].sources, [ { title: "Стар документ", version: "1.0.2", url: "https://www.his.bg/upload/1/old.pdf" } ] );
    } );

    it( "renders a guide's headings with their ids and lists them as its contents", () => {
        const text = loadContent( folder( FILES ) ).guides[ 0 ].texts.bg;
        assert.match( String( text.html ), /<h2 id="environments">Среди<\/h2>/ );
        assert.deepEqual( text.contents, [ { id: "environments", title: "Среди" } ] );
        assert.equal( text.title, "Първо" );
        assert.equal( text.summary, "Кратко." );
        assert.equal( text.updated, "2026-11-17" );
        // The searchable text keeps the words and drops the marks that only give an id.
        assert.match( text.plain, /Среди/ );
        assert.doesNotMatch( text.plain, /\{#/ );
    } );

    it( "refuses front matter that does not open with a plain --- line, without running it", () => {
        globalThis.__contentRan = false;
        const error = refusal( { ...FILES, "faq/one.bg.md": "---js\n{ question: ( globalThis.__contentRan = true, \"x\" ) }\n---\nОтговор." } );
        // gray-matter's JavaScript engine evaluates a `---js` block (measured, plan 8c decision 3): the loader must refuse
        // it before parsing, or the assignment above would have run.
        assert.equal( globalThis.__contentRan, false );
        assert.match( error.message, /faq[\\/]one\.bg\.md/ );
        assert.ok( error.problems.some( ( problem ) => /faq[\\/]one\.bg\.md/.test( problem ) ) );
    } );

    it( "refuses a heading without an id, a missing Bulgarian file, a repeated slug and a malformed one, naming each", () => {
        const register = REGISTER.replace( "  - slug: second", "  - slug: First_Guide\n    aiAssisted: true\n    sources: []\n  - slug: second" )
            .replace( "questions: [ two ]", "questions: [ two, one ]" );
        const files = { ...FILES, "content.yml": register, "guides/first.bg.md": guide( "Първо", "## Без id\n\nТекст." ) };
        delete files[ "faq/two.bg.md" ];
        const error = refusal( files );
        const problems = error.problems.join( "\n" );
        assert.match( problems, /guides[\\/]first\.bg\.md.*Без id/ );
        assert.match( problems, /faq[\\/]two\.bg\.md/ );
        assert.match( problems, /"one".*more than once/ );
        assert.match( problems, /"First_Guide"/ );
        assert.equal( error.problems.length, 4 );
    } );

    it( "leaves a missing English text null", () => {
        const content = loadContent( folder( FILES ) );
        assert.equal( content.faq.categories[ 0 ].questions[ 0 ].texts.en, null );
        assert.equal( content.guides[ 1 ].texts.en, null );
        assert.equal( content.guides[ 0 ].texts.en.title, "First" );
    } );

    it( "reads no file the register does not name", () => {
        const content = loadContent( folder( { ...FILES, "faq/stray.bg.md": "---js\n{ question: ( globalThis.__contentRan = true, \"x\" ) }\n---\n" } ) );
        assert.equal( content.faq.categories.flatMap( ( one ) => one.questions ).length, 2 );
    } );

    it( "loads the repository's own content", () => {
        const content = loadContent( CONTENT_DIRECTORY );
        assert.deepEqual( content.faq.categories.map( ( one ) => [ one.key, one.questions.length ] ),
            [ [ "authentication", 3 ], [ "messages", 3 ], [ "e-referral", 4 ], [ "nomenclatures", 1 ] ] );
        assert.equal( content.faq.categories[ 0 ].questions[ 0 ].texts.bg.question,
            "При обръщението към https://auth.his.bg кой метод се използва – POST или GET?" );
        assert.equal( content.planned.length, 7 );
    } );

    it( "has the two guide drafts, in both languages, marked as unreviewed", () => {
        const content = loadContent( CONTENT_DIRECTORY );
        assert.deepEqual( content.guides.map( ( one ) => one.slug ), [ "getting-started", "environments" ] );
        for ( const guide of content.guides ) {
            assert.equal( guide.aiAssisted, true, guide.slug );
            assert.equal( guide.reviewed, null, guide.slug );
            assert.ok( guide.texts.en, guide.slug );
            assert.ok( guide.sources.length > 0, guide.slug );
            // The two languages are the same guide, section by section, so a heading's address is the same in both.
            assert.deepEqual( guide.texts.en.contents.map( ( one ) => one.id ), guide.texts.bg.contents.map( ( one ) => one.id ), guide.slug );
        }
        assert.deepEqual( content.guides[ 0 ].texts.bg.contents.map( ( one ) => one.id ),
            [ "what", "environments", "certificate", "token", "signing", "first-message", "changes", "questions" ] );
        assert.deepEqual( content.guides[ 1 ].texts.bg.contents.map( ( one ) => one.id ), [ "overview", "versions", "status", "hospital-network" ] );
        assert.deepEqual( content.planned.map( ( one ) => one.slug ).includes( "getting-started" ), false );
    } );

    it( "names no host the sources do not", () => {
        // Every *.his.bg host in either guide, in either language, is one the sources name (plan 8c, Task 2): a host the
        // drafts made up would send a vendor's software somewhere that is not NHIS.
        const KNOWN = new Set( [ "auth", "api", "ptest-auth", "ptest-api", "hospital-auth", "hospital-api", "hospital-cc", "www" ].map( ( one ) => `${ one }.his.bg` ) );
        const named = new Set();
        for ( const guide of loadContent( CONTENT_DIRECTORY ).guides ) {
            for ( const text of [ guide.texts.bg, guide.texts.en ] ) {
                for ( const host of text.plain.match( /[a-z0-9-]+(?:\.[a-z0-9-]+)*\.his\.bg/g ) || [] ) {
                    assert.ok( KNOWN.has( host ), `${ guide.slug }: ${ host }` );
                    named.add( host );
                }
            }
        }
        // The Environments guide names every host of every environment.
        for ( const host of [ "auth", "api", "ptest-auth", "ptest-api", "hospital-auth", "hospital-api", "hospital-cc" ] ) {
            assert.ok( named.has( `${ host }.his.bg` ), host );
        }
    } );

    it( "writes no token-like value and names no person", () => {
        for ( const guide of loadContent( CONTENT_DIRECTORY ).guides ) {
            for ( const text of [ guide.texts.bg, guide.texts.en ] ) {
                // The authentication PDF's sample token is abbreviated as "imSXTs…"; the drafts use "…" instead.
                assert.doesNotMatch( text.plain, /accessToken value="[^"…]{4,}/, guide.slug );
                assert.doesNotMatch( text.plain, /Authorization: Bearer [A-Za-z0-9]{4,}/, guide.slug );
                assert.doesNotMatch( text.plain, /Костадинов|Kostadinov/, guide.slug );
            }
        }
    } );
} );
