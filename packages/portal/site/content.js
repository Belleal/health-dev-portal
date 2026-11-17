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
 * The guides and the questions (plan 8c, decisions 2 and 3; design record §3.5): Markdown in the repository's `content/`,
 * each file named in `content.yml`, read once when the portal starts. A file the register does not name is never read:
 * web-content's own stance, since scanning a content folder is how a file nobody meant to publish ends up served.
 *
 * Every problem is collected before anything is thrown, so one start names every file to fix. The content ships with the
 * portal, so a file that cannot be read is a broken build, and a test that loads the real folder catches it in CI.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const { render } = require( "@ti-engine/web-content/markdown" );
const { parseRecord, parseVocabulary } = require( "@ti-engine/web-content/sources" );

const REGISTER = "content.yml";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/;
// A level-two heading, and its id as markdown-it-attrs reads one: `## Среди {#environments}` is written
// `<h2 id="environments">` (measured through web-content's `render`, plan 8c decision 2).
const HEADING = /^##[ \t]+(.*?)[ \t]*$/;
const MARKED = /^(.*?)[ \t]*\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}$/;
const ID_MARK = /[ \t]*\{#[a-z0-9]+(?:-[a-z0-9]+)*\}/g;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/**
 * The repository's own content folder.
 *
 * @type {string}
 * @public
 */
module.exports.CONTENT_DIRECTORY = path.resolve( __dirname, "../../../content" );

/**
 * Content that cannot be loaded: every problem found, each naming its file.
 *
 * @class ContentError
 * @extends Error
 * @public
 */
class ContentError extends Error {

    /**
     * @constructor
     * @param {string[]} problems
     */
    constructor( problems ) {
        super( `The content cannot be loaded:\n- ${ problems.join( "\n- " ) }` );
        this.name = "ContentError";
        this.problems = problems;
    }
}

module.exports.ContentError = ContentError;

const isText = ( value ) => typeof value === "string" && value.trim() !== "";

// A date as YAML gives it: quoted, the string itself; unquoted, the moment at UTC midnight that web-content's
// `normalizeDates` writes (measured: `2026-11-17T00:00:00.000Z`). `null` for anything else.
const dateOf = ( value ) => {
    const match = typeof value === "string" ? DATE.exec( value ) : null;
    const day = match ? match[ 1 ] : null;
    return day !== null && !Number.isNaN( Date.parse( `${ day }T00:00:00Z` ) ) && new Date( `${ day }T00:00:00Z` ).toISOString().startsWith( day ) ? day : null;
};

const localText = ( value ) => value && isText( value.bg ) && isText( value.en ) ? { bg: value.bg, en: value.en } : null;

// Freezes plain objects and arrays all the way down; a rendered text, web-content's SafeString, is left as it is.
const frozen = ( value ) => {
    if ( Array.isArray( value ) || ( value !== null && typeof value === "object" && Object.getPrototypeOf( value ) === Object.prototype ) ) {
        Object.values( value ).forEach( frozen );
        Object.freeze( value );
    }
    return value;
};

// Reads one registered file. Its first line must be exactly `---`: gray-matter's JavaScript engine evaluates a `---js`
// block, and web-content's `parseRecord` hands it every engine (measured 2026-11-17, plan 8c decision 3), so a Markdown
// file could otherwise run code when the portal starts. The check comes before any parsing.
const readRecord = ( root, name, problems, { required } ) => {
    const file = path.join( root, ...name.split( "/" ) );
    if ( !fs.existsSync( file ) ) {
        if ( required ) {
            problems.push( `${ name }: missing; the Bulgarian text is required` );
        }
        return null;
    }
    // A byte-order mark, which some editors on Windows write, is not part of the first line.
    const text = fs.readFileSync( file, "utf8" ).replace( /^\uFEFF/, "" );
    if ( text.split( "\n", 1 )[ 0 ].replace( /\r$/, "" ) !== "---" ) {
        problems.push( `${ name }: the front matter must open with a line that is exactly "---"; any other, such as "---js", is refused, since it would run as code` );
        return null;
    }
    try {
        return parseRecord( text, { format: "markdown" } );
    } catch ( error ) {
        problems.push( `${ name }: ${ error.message }` );
        return null;
    }
};

// The level-two headings outside code blocks, each with the id it must carry.
const headingsOf = ( body, name, problems ) => {
    const contents = [];
    let fence = null;
    for ( const line of body.split( /\r?\n/ ) ) {
        const opening = FENCE.exec( line );
        if ( opening ) {
            fence = fence === null ? opening[ 1 ][ 0 ] : opening[ 1 ][ 0 ] === fence ? null : fence;
            continue;
        }
        const heading = fence === null ? HEADING.exec( line ) : null;
        if ( !heading ) {
            continue;
        }
        const marked = MARKED.exec( heading[ 1 ] );
        if ( !marked ) {
            problems.push( `${ name }: the heading "${ heading[ 1 ] }" has no id; write it as "## ${ heading[ 1 ] } {#an-id}"` );
        } else if ( contents.some( ( one ) => one.id === marked[ 2 ] ) ) {
            problems.push( `${ name }: the id "${ marked[ 2 ] }" is on more than one heading` );
        } else {
            contents.push( { id: marked[ 2 ], title: marked[ 1 ] } );
        }
    }
    return contents;
};

const guideText = ( root, slug, lang, problems ) => {
    const name = `guides/${ slug }.${ lang }.md`;
    const record = readRecord( root, name, problems, { required: lang === "bg" } );
    if ( record === null ) {
        return null;
    }
    const updated = dateOf( record.updated );
    const missing = [ isText( record.title ) ? null : "title", isText( record.summary ) ? null : "summary", updated ? null : "updated (a date)",
        isText( record.body ) ? null : "a body" ].filter( Boolean );
    if ( missing.length > 0 ) {
        problems.push( `${ name }: needs ${ missing.join( ", " ) }` );
        return null;
    }
    return { title: record.title, summary: record.summary, updated: updated, html: render( record.body ), contents: headingsOf( record.body, name, problems ),
        plain: record.body.replace( ID_MARK, "" ) };
};

const questionText = ( root, slug, lang, problems ) => {
    const name = `faq/${ slug }.${ lang }.md`;
    const record = readRecord( root, name, problems, { required: lang === "bg" } );
    if ( record === null ) {
        return null;
    }
    if ( !isText( record.question ) || !isText( record.body ) ) {
        problems.push( `${ name }: needs a question and an answer` );
        return null;
    }
    return { question: record.question, html: render( record.body ), plain: record.body };
};

const sourceOf = ( value, where, problems ) => {
    if ( value && isText( value.title ) && isText( String( value.version ?? "" ) ) && typeof value.url === "string" && value.url.startsWith( "https://" ) ) {
        return { title: value.title, version: String( value.version ), url: value.url };
    }
    problems.push( `${ REGISTER }: ${ where } needs a title, a version and an https:// address` );
    return null;
};

// Whether a slug may be used: well formed and not taken. A slug that may not is reported and read no further, so one
// mistake is one problem.
const slugChecker = ( problems ) => {
    const seen = new Set();
    return ( slug, what ) => {
        if ( typeof slug !== "string" || !SLUG.test( slug ) ) {
            problems.push( `${ REGISTER }: ${ JSON.stringify( slug ) } is not a ${ what } slug such as getting-started` );
            return false;
        }
        if ( seen.has( slug ) ) {
            problems.push( `${ REGISTER }: the ${ what } slug "${ slug }" is used more than once` );
            return false;
        }
        seen.add( slug );
        return true;
    };
};

const listOf = ( value, where, problems ) => {
    if ( value === undefined || value === null ) {
        return [];
    }
    if ( !Array.isArray( value ) ) {
        problems.push( `${ REGISTER }: ${ where } must be a list` );
        return [];
    }
    return value;
};

/**
 * Reads the register and every file it names.
 *
 * @method
 * @param {string} directory The content folder: `CONTENT_DIRECTORY`, or another for a test.
 * @returns {import( "#definitions" ).Content} Frozen.
 * @throws {ContentError} With every problem found: a register that cannot be read, a malformed or repeated slug, a missing
 *     Bulgarian file, front matter that does not open with a plain `---` line, a missing field, a heading without an id.
 * @public
 */
module.exports.loadContent = ( directory ) => {
    const problems = [];
    let register;
    try {
        register = parseVocabulary( fs.readFileSync( path.join( directory, REGISTER ), "utf8" ) );
    } catch ( error ) {
        throw new ContentError( [ `${ REGISTER }: ${ error.message }` ] );
    }
    const guideSlug = slugChecker( problems );
    const guides = listOf( register.guides, "guides", problems ).filter( ( one ) => guideSlug( one && one.slug, "guide" ) ).map( ( one ) => {
        if ( typeof one.aiAssisted !== "boolean" ) {
            problems.push( `${ REGISTER }: the guide "${ one.slug }" needs aiAssisted: true or false` );
        }
        const reviewed = one.reviewed === null || one.reviewed === undefined ? null : dateOf( one.reviewed );
        if ( reviewed === null && one.reviewed !== null && one.reviewed !== undefined ) {
            problems.push( `${ REGISTER }: the guide "${ one.slug }" has a reviewed date that is not a date` );
        }
        return { slug: one.slug, aiAssisted: one.aiAssisted === true, reviewed: reviewed,
            sources: listOf( one.sources, `the guide "${ one.slug }"'s sources`, problems ).map( ( source ) => sourceOf( source, `a source of "${ one.slug }"`, problems ) ).filter( Boolean ),
            texts: { bg: guideText( directory, one.slug, "bg", problems ), en: guideText( directory, one.slug, "en", problems ) } };
    } );
    const planned = listOf( register.planned, "planned", problems ).filter( ( one ) => guideSlug( one && one.slug, "guide" ) ).map( ( one ) => {
        const title = localText( one.title );
        if ( title === null ) {
            problems.push( `${ REGISTER }: the planned guide "${ one.slug }" needs a title in bg and en` );
        }
        return { slug: one.slug, title: title, legacy: one.legacy === null || one.legacy === undefined ? null : sourceOf( one.legacy, `the planned guide "${ one.slug }"`, problems ) };
    } );
    const faq = register.faq || {};
    const retrieved = dateOf( faq.retrieved );
    if ( typeof faq.source !== "string" || !faq.source.startsWith( "https://" ) || retrieved === null ) {
        problems.push( `${ REGISTER }: faq needs its source, an https:// address, and the date it was retrieved` );
    }
    // A category's key and a question's slug are both anchors on the one FAQ page, so no two of them may be the same.
    const faqSlug = slugChecker( problems );
    const categories = listOf( faq.categories, "faq.categories", problems ).filter( ( one ) => faqSlug( one && one.key, "category" ) ).map( ( one ) => {
        const name = localText( one.name );
        if ( name === null ) {
            problems.push( `${ REGISTER }: the category "${ one.key }" needs a name in bg and en` );
        }
        return { key: one.key, name: name, questions: listOf( one.questions, `the category "${ one.key }"'s questions`, problems )
            .filter( ( slug ) => faqSlug( slug, "question" ) )
            .map( ( slug ) => ( { slug: slug, texts: { bg: questionText( directory, slug, "bg", problems ), en: questionText( directory, slug, "en", problems ) } } ) ) };
    } );
    if ( problems.length > 0 ) {
        throw new ContentError( problems );
    }
    return frozen( { guides: guides, planned: planned, faq: { source: faq.source, retrieved: retrieved, categories: categories } } );
};
