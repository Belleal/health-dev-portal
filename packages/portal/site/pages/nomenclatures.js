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
 * The code lists (plan 8a, decisions 3, 8 and 9; design record §4.6, §8.1): the index of every list, one list's page
 * with its filter, its expired entries, its paging and the messages that read it, and the fixed downloads. A list is
 * a spec like a module, so the version it names is found, cached and retired as `version.js` does for the others.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { fixedFile } = require( "@health-dev-portal/data/fixed-files" );
const { findPublished, findPublishedById, listPublished } = require( "@health-dev-portal/data/published" );
const { SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { compareNumbers } = require( "@health-dev-portal/spec-model/numbers" );
const { fold, needles } = require( "#fold" );
const { LANGUAGES, label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, gone, notFound, redirect, send } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { columnText, localText, plainText } = require( "#text" );
const { elementName } = require( "./message-tree" );
const { STAGES, stageCell } = require( "./stages" );
const { findShown, modulesIn, plannedOn, stageBand, stageVersions } = require( "./version" );

// What a page of a list holds (decision 9): CL011 alone has 39,005 entries.
const PAGE_SIZE = 500;

// The messages that read a list are named up to this many, then counted (decision 9).
const USED_IN_SHOWN = 10;

// A download's file name, `CL011-1.5.33.json`: the list's ID and the version's number, both of which the address parser
// holds to ASCII letters, digits and dots, so the name needs no quoting or encoding in a header.
const fileName = ( id, number, ext ) => `${ id }-${ number }.${ ext }`;

// A list's name by the id of the version it was read from. A frozen version never changes, so its name is read once;
// the index would otherwise read every list's whole content, CL011's 39,005 entries among them, on each request.
// Keyed by database as well, so that one database's ids are never taken for another's.
const NAMES = new WeakMap();

const nameOf = async ( db, version ) => {
    if ( !NAMES.has( db ) ) {
        NAMES.set( db, new Map() );
    }
    const names = NAMES.get( db );
    if ( names.has( version.id ) ) {
        return names.get( version.id );
    }
    const found = await findPublishedById( db, version.id );
    const name = found && found.content && found.content.list ? found.content.list.name : null;
    if ( version.frozen ) {
        names.set( version.id, name );
    }
    return name;
};

// The version the index names a list by, and the one it takes the name from: production's, else testing's, else
// previous production's.
const nameSource = ( published ) => published.production || published.testing || published.previousProduction;

// A form that filters, a GET with no script: `action` is the page's own address without its query, and `hidden` holds
// the other parameters that a new search keeps.
const filterForm = ( lang, { action, q, hidden = [] } ) => html`<form class="filter" method="get" action="${ action }">
<label for="q">${ label( lang, "filterLabel" ) }</label>
<input id="q" type="search" name="q" value="${ q === null ? "" : q }">
${ hidden.map( ( [ name, value ] ) => html`<input type="hidden" name="${ name }" value="${ value }">\n` ) }<button type="submit">${ label( lang, "filterButton" ) }</button>
</form>`;

/**
 * Answers the code lists' index: every published list, with its name and the version in each public stage, filtered
 * by `q` over the ID and both names (decision 9).
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {import( "#definitions" ).Address} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.listsPage = async ( context, parts ) => {
    const { db, lang, response, nonce } = context;
    const { q } = parts.query;
    const published = ( await listPublished( db ) ).filter( ( one ) => one.kind === SPEC_KIND.CODE_LIST );
    const named = await Promise.all( published.map( async ( one ) => ( { published: one, name: await nameOf( db, nameSource( one ) ) } ) ) );
    // The text is folded; the query is searched in both of its forms (`needles`). The name in each language is searched,
    // as the reader may know either.
    const forms = q === null ? null : needles( q );
    const shown = forms === null ? named : named.filter( ( one ) => {
        const text = fold( [ one.published.spec, one.name && one.name.bg, one.name && one.name.en ].filter( Boolean ).join( "\n" ) );
        return forms.some( ( form ) => text.includes( form ) );
    } );
    const title = label( lang, "sectionNomenclatures" );
    const main = html`<h1>${ title }</h1>
<p>${ label( lang, "listsLede" ) }</p>
${ filterForm( lang, { action: paths.lists( lang ), q: q } ) }
<p>${ label( lang, "listsCount", { count: shown.length } ) }</p>
${ shown.length === 0 ? html`<p>${ label( lang, "listsNone" ) }</p>` : html`<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnCode" ) }</th><th scope="col">${ label( lang, "columnName" ) }</th><th scope="col">${ label( lang, "columnTesting" ) }</th><th scope="col">${ label( lang, "columnProduction" ) }</th><th scope="col">${ label( lang, "columnPrevious" ) }</th></tr></thead>
<tbody>
${ shown.map( ( one ) => {
        const stage = one.published.production ? STAGE.PRODUCTION : one.published.testing ? STAGE.TESTING : STAGE.PREVIOUS_PRODUCTION;
        const address = ( at ) => paths.list( lang, one.published.spec, at );
        return html`<tr><td><a href="${ address( stage ) }"><code>${ one.published.spec }</code></a></td><td>${ localText( one.name, lang ) }</td>${ STAGES.map( ( at ) => stageCell( lang, one.published, at, address ) ) }</tr>\n`;
    } ) }</tbody>
</table>` }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.lists( lang, { q: q } ), canonical: paths.lists( lang, { q: q } ),
        section: "nomenclatures", main: main, nonce: nonce } ) } );
};

// Whether an entry is expired in the version shown: its `validUntil` is that version or an earlier one (decision 9).
const isExpired = ( entry, number ) => typeof entry.validUntil === "string" && compareNumbers( number, entry.validUntil ) >= 0;

// Whether an entry has text in any language for its display.
const hasDisplay = ( entry ) => Boolean( entry.display && ( entry.display.bg || entry.display.en ) );

// Each entry's folded search text, by the id of the version it was read from, so that a frozen version is folded once:
// folding all of CL011 takes about a second, which each new filter would otherwise cost the server again, and a public
// page is asked with any filter at all. Keyed by database like the names.
const HAYSTACKS = new WeakMap();

const haystackOf = ( db, version, entries ) => {
    if ( !HAYSTACKS.has( db ) ) {
        HAYSTACKS.set( db, new Map() );
    }
    const kept = HAYSTACKS.get( db );
    if ( kept.has( version.id ) ) {
        return kept.get( version.id );
    }
    const haystack = entries.map( ( entry ) => fold( searchable( entry ) ) );
    if ( version.frozen ) {
        kept.set( version.id, haystack );
    }
    return haystack;
};

// What the filter searches in an entry (decision 9): the key, both descriptions, both displays and the list's own values.
const searchable = ( entry ) => [ entry.key, entry.description && entry.description.bg, entry.description && entry.description.en,
    entry.display && entry.display.bg, entry.display && entry.display.en, ...entry.values ].filter( ( text ) => typeof text === "string" && text !== "" ).join( "\n" );

// The elements that name a list, in the module versions of the stage its page shows (design record §4.8, ruling F2): a
// page by number counts as its version's stage. Modules in spec order, their messages in theirs, the elements in
// document order. Not the module versions whose frozen resolution records name this list version: by those, CL007's
// production page named e-Prescription 1.5.2 in testing and not 1.5.1 in production, and a list released on its own
// lost every reader from its first update (final review I2). An element with no path has no address, so it is named at
// its message's.
const readingElements = async ( db, lang, listId, version ) => {
    const found = [];
    for ( const reader of await modulesIn( db, version.stage ) ) {
        for ( const message of reader.content ? reader.content.messages : [] ) {
            const nodes = [];
            const visit = ( node ) => {
                if ( node.codeList === listId ) {
                    nodes.push( node );
                }
                node.children.forEach( visit );
            };
            message.elements.forEach( visit );
            // The slugs of a message are worked out only for a message that has something to link.
            const slugs = nodes.length ? paths.elementSlugs( message ) : null;
            for ( const node of nodes ) {
                // The module version's fixed addresses: the element stays where it is when the stages move on.
                const address = slugs.has( node ) ? paths.element( lang, reader.spec, reader.number, message.code, slugs.get( node ) )
                    : paths.message( lang, reader.spec, reader.number, message.code );
                found.push( html`<li><a href="${ address }">${ specName( reader.spec, lang ) } ${ reader.number } · ${ message.code } · <code>${ elementName( node ) }</code></a></li>\n` );
            }
        }
    }
    return found;
};

const usedIn = async ( db, lang, listId, version ) => {
    const found = await readingElements( db, lang, listId, version );
    if ( found.length === 0 ) {
        return html`<p>${ label( lang, "usedInNone" ) }</p>`;
    }
    const more = found.length - USED_IN_SHOWN;
    return html`<ul>
${ found.slice( 0, USED_IN_SHOWN ) }${ more > 0 ? html`<li>${ label( lang, "usedInMore", { count: more } ) }</li>\n` : null }</ul>`;
};

// The links to the previous and next page, and where the reader is among them; empty for a single page.
const pager = ( lang, { id, at, q, expired, number, pages } ) => {
    if ( pages <= 1 ) {
        return null;
    }
    const to = ( target ) => paths.list( lang, id, at, { q: q, expired: expired, page: target } );
    return html`<nav class="pager" aria-label="${ label( lang, "pagerLabel" ) }">
${ number > 1 ? html`<a href="${ to( number - 1 ) }" rel="prev">${ label( lang, "pagePrevious" ) }</a> ` : null }<span>${ label( lang, "pageOf", { page: number, pages: pages } ) }</span>${ number < pages
        ? html` <a href="${ to( number + 1 ) }" rel="next">${ label( lang, "pageNext" ) }</a>` : null }
</nav>`;
};

// The entries' table: the key, both descriptions, the displays when the version has any, the list's own columns, and
// since and until. A bilingual column shows its own language or "—", with no marker (decision 5).
const entriesTable = ( lang, { list, rows, withDisplay } ) => html`<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnKey" ) }</th><th scope="col">${ label( lang, "columnDescriptionBg" ) }</th><th scope="col">${ label( lang, "columnDescriptionEn" ) }</th>${ withDisplay
    ? html`<th scope="col">${ label( lang, "columnDisplayBg" ) }</th><th scope="col">${ label( lang, "columnDisplayEn" ) }</th>` : null }${ list.columns.map( ( column ) => html`<th scope="col">${ column.title }</th>` ) }<th scope="col">${ label( lang, "columnSince" ) }</th><th scope="col">${ label( lang, "columnValidUntil" ) }</th></tr></thead>
<tbody>
${ rows.map( ( entry ) => html`<tr><td><code>${ entry.key }</code></td><td lang="bg">${ columnText( entry.description, "bg" ) }</td><td lang="en">${ columnText( entry.description, "en" ) }</td>${ withDisplay
    ? html`<td lang="bg">${ columnText( entry.display, "bg" ) }</td><td lang="en">${ columnText( entry.display, "en" ) }</td>` : null }${ list.columns.map( ( column, index ) => html`<td>${ entry.values[ index ] || "—" }</td>` ) }<td>${ entry.since || "—" }</td><td>${ entry.validUntil || "—" }</td></tr>\n` ) }</tbody>
</table>`;

/**
 * Answers one code list at a stage or number: its entries, filtered by `q` over the key, both descriptions, both displays
 * and its own values; with its expired entries only when asked for; 500 to a page, a page past the last being a 404.
 * With the downloads, the messages that read it and its changelog.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {import( "#definitions" ).Address} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.listPage = async ( context, parts ) => {
    const shown = await findShown( context, { spec: parts.id, at: parts.at }, [ SPEC_KIND.CODE_LIST ] );
    if ( shown === null ) {
        return;
    }
    const { db, lang, request, response, nonce } = context;
    const { version } = shown;
    const { q, expired, page: number } = parts.query;
    const list = version.content && version.content.list;
    if ( !list ) {
        notFound( request, response );
        return;
    }
    const withDisplay = list.entries.some( hasDisplay );
    const expiredCount = list.entries.filter( ( entry ) => isExpired( entry, version.number ) ).length;
    // Both sides folded the same way (decision 9).
    const forms = q === null ? null : needles( q );
    const haystack = forms === null ? null : haystackOf( db, version, list.entries );
    const matching = list.entries.filter( ( entry, index ) => ( expired || !isExpired( entry, version.number ) )
        && ( forms === null || forms.some( ( form ) => haystack[ index ].includes( form ) ) ) );
    const pages = Math.max( 1, Math.ceil( matching.length / PAGE_SIZE ) );
    // A page past the last is no page: a filter that leaves nothing still has its first, empty.
    if ( number > pages ) {
        notFound( request, response );
        return;
    }
    const first = ( number - 1 ) * PAGE_SIZE;
    const rows = matching.slice( first, first + PAGE_SIZE );
    const parameters = { q: q, expired: expired };
    const toggle = expired
        ? html`<a href="${ paths.list( lang, parts.id, parts.at, { q: q } ) }">${ label( lang, "hideExpired" ) }</a>`
        : expiredCount > 0 ? html`<a href="${ paths.list( lang, parts.id, parts.at, { q: q, expired: true } ) }">${ label( lang, "showExpired", { count: expiredCount } ) }</a>` : null;
    const band = stageBand( lang, { stages: await stageVersions( db, parts.id ), version: version, address: ( stage ) => paths.list( lang, parts.id, stage ),
        planned: version.stage === STAGE.TESTING ? await plannedOn( db, version ) : null } );
    const main = html`<h1>${ list.id } · ${ localText( list.name, lang ) }</h1>
<p>${ specName( parts.id, lang ) } ${ version.number } · ${ label( lang, "listKeyType", { type: list.keyType } ) }</p>
${ filterForm( lang, { action: paths.list( lang, parts.id, parts.at ), q: q, hidden: expired ? [ [ "expired", "1" ] ] : [] } ) }
<p>${ matching.length === 0 ? label( lang, "entriesNone" ) : label( lang, "entriesShown", { from: first + 1, to: first + rows.length, total: matching.length } ) }${ toggle ? html` · ${ toggle }` : null }</p>
${ matching.length === 0 ? null : entriesTable( lang, { list: list, rows: rows, withDisplay: withDisplay } ) }
${ pager( lang, { id: parts.id, at: parts.at, q: q, expired: expired, number: number, pages: pages } ) }
<section>
<h2>${ label( lang, "downloadsTitle" ) }</h2>
<ul>
<li><a href="${ paths.download( parts.id, version.number, "json" ) }" download="${ fileName( parts.id, version.number, "json" ) }">${ label( lang, "downloadJson" ) }</a></li>
<li><a href="${ paths.download( parts.id, version.number, "csv" ) }" download="${ fileName( parts.id, version.number, "csv" ) }">${ label( lang, "downloadCsv" ) }</a></li>
</ul>
<p>${ label( lang, "csvNote" ) }</p>
</section>
<section>
<h2>${ label( lang, "usedInTitle" ) }</h2>
${ await usedIn( db, lang, parts.id, version ) }
</section>
<p><a href="${ paths.changes( lang, parts.id ) }">${ label( lang, "changelog" ) }</a></p>`;
    const name = plainText( list.name, lang );
    send( response, { cache: shown.cache, body: page( { lang: lang, title: name === "" ? `${ list.id } ${ version.number }` : `${ list.id } · ${ name } ${ version.number }`,
        path: paths.list( lang, parts.id, parts.at, { ...parameters, page: number } ), canonical: paths.list( lang, parts.id, version.number, { ...parameters, page: number } ),
        section: "nomenclatures", band: band, main: main, nonce: nonce } ) } );
};

/**
 * Answers a code list's download: a number's fixed file, with caching that never ends since its bytes never change,
 * saved under the list's ID and number; a stage's address redirects to the fixed one of the version it names. A retired
 * version's file is gone, as its page is: 410, with its changelog. Anything else — a version that was never public, a
 * module's number, a stage with no version — is a 404.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {import( "#definitions" ).Address} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.downloadFile = async ( context, parts ) => {
    const { db, store, request, response } = context;
    const at = paths.parseAt( parts.at );
    const version = at === null ? null : await findPublished( db, parts.id, at );
    if ( version === null || version.kind !== SPEC_KIND.CODE_LIST ) {
        notFound( request, response );
        return;
    }
    // A retired version has no content to make a file of, and was answered 404 while its page answered 410 (final
    // review M5). A download is under no language: its notice is Bulgarian, as a 404 there is, and links that changelog.
    if ( version.retired ) {
        gone( request, response, paths.changes( LANGUAGES[ 0 ], parts.id ) );
        return;
    }
    if ( !Object.hasOwn( at, "number" ) ) {
        redirect( response, { status: 302, location: paths.download( parts.id, version.number, parts.ext ), cache: CACHE.BRIEF } );
        return;
    }
    // The name is made of a format the address parser has checked, and looked up among the kind's own files.
    const file = await fixedFile( db, store, version.id, `list.${ parts.ext }` );
    if ( file === null ) {
        notFound( request, response );
        return;
    }
    // Saved as `1.5.33.json` without it, a name that says nothing of the list (final review M4).
    send( response, { cache: CACHE.FOREVER, body: file.bytes, type: file.type,
        headers: { "Content-Disposition": `attachment; filename="${ fileName( parts.id, version.number, parts.ext ) }"` } } );
};
