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
 * The search page, `/{lang}/search?q=…` (plan 8c, decision 7): its form, which works without a script, and what the
 * server's search finds, by group. Each result links the page that holds it at the stage it was found in, and a stage
 * address is used so that the link holds until the thing leaves that stage, when the index is built again.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, send } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { localText, plainText } = require( "#text" );

// How much of an entry's text a result shows: enough to tell two results apart, no more.
const EXCERPT = 160;

// Each group's heading.
const GROUP_LABELS = Object.freeze( { guide: "searchGroupGuide", faq: "searchGroupFaq", spec: "searchGroupSpec", message: "searchGroupMessage",
    condition: "searchGroupCondition", rule: "searchGroupRule", list: "searchGroupList", error: "searchGroupError", warning: "searchGroupWarning",
    element: "searchGroupElement" } );

/**
 * Where a result links: the page that holds it, at the stage it was found in, and at its anchor where it has one.
 *
 * @method
 * @param {string} lang
 * @param {import( "#definitions" ).SearchEntry} entry
 * @returns {string}
 * @public
 */
module.exports.resultLink = ( lang, entry ) => {
    switch ( entry.kind ) {
        case "guide": return paths.guide( lang, entry.slug );
        case "faq": return `${ paths.faq( lang ) }#${ entry.slug }`;
        case "spec": return paths.spec( lang, entry.spec, entry.stage );
        case "message": return paths.message( lang, entry.spec, entry.stage, entry.code );
        case "element": return paths.element( lang, entry.spec, entry.stage, entry.code, entry.slug );
        case "condition": return `${ paths.conditions( lang, entry.spec, entry.stage ) }#${ entry.code }`;
        case "rule": return `${ paths.spec( lang, entry.spec, entry.stage ) }#${ entry.code }`;
        case "list": return paths.list( lang, entry.spec, entry.stage );
        // The errors page of the stage found: a key only in testing is on the testing page.
        case "error": return `${ paths.errors( lang, entry.stage === STAGE.TESTING ) }#${ entry.code }`;
        case "warning": return `${ paths.errors( lang, entry.stage === STAGE.TESTING ) }#warning-${ entry.code }`;
        default: throw new RangeError( `There is no search result of the kind "${ entry.kind }".` );
    }
};

// A result's title as its kind shows it: a code where it has one, and its name in the page's language, or marked.
const titleOf = ( lang, entry ) => {
    switch ( entry.kind ) {
        case "message": return html`<code>${ entry.code }</code> · ${ localText( entry.title, lang ) }`;
        case "element": return html`<code>${ entry.title.bg }</code>`;
        case "condition":
        case "rule":
        case "error":
        case "warning": return html`<code>${ entry.code }</code>`;
        case "list": return html`<code>${ entry.code }</code> · ${ localText( entry.title, lang ) }`;
        default: return localText( entry.title, lang );
    }
};

// The kinds whose group already names their spec: a list's ID is its own title, and the rules, the errors and the
// warnings each come from one spec only. Named again, it said nothing ("CL009 · … CL009").
const OWN_SPEC = Object.freeze( [ "spec", "list", "rule", "error", "warning" ] );

// Where a result stands: its spec where the group does not say it, an element's message, and the stage when it is testing.
const contextOf = ( lang, entry ) => {
    const parts = [ entry.spec === null || OWN_SPEC.includes( entry.kind ) ? null : specName( entry.spec, lang ), entry.kind === "element" ? entry.code : null,
        entry.stage === STAGE.TESTING ? label( lang, "searchTesting" ) : null ].filter( Boolean );
    return parts.length === 0 ? null : html` <span class="muted">${ parts.join( " · " ) }</span>`;
};

const excerptOf = ( lang, entry ) => {
    const text = plainText( entry.text, lang ).replace( /\s+/g, " " ).trim();
    return text === "" ? null : html`<br><span class="excerpt">${ text.length > EXCERPT ? `${ text.slice( 0, EXCERPT ).trimEnd() }…` : text }</span>`;
};

const groupOf = ( lang, group ) => html`<h2>${ label( lang, GROUP_LABELS[ group.kind ] ) } (${ group.total })</h2>
<ul class="results-list">
${ group.entries.map( ( entry ) => html`<li><a href="${ module.exports.resultLink( lang, entry ) }">${ titleOf( lang, entry ) }</a>${ contextOf( lang, entry ) }${ excerptOf( lang, entry ) }</li>\n` ) }</ul>
${ group.total > group.entries.length ? html`<p class="muted">${ label( lang, "searchMore", { shown: group.entries.length, total: group.total } ) }</p>\n` : null }`;

/**
 * Answers the search page: the form, then what the query finds, or why it was not searched.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{query: {q: string|null}}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.searchPage = async ( context, parts ) => {
    const { lang, response, nonce } = context;
    const results = await context.search( parts.query.q );
    const title = label( lang, "searchTitle" );
    const found = results.groups.reduce( ( sum, group ) => sum + group.total, 0 );
    const answer = results.state === "empty" ? html`<p>${ label( lang, "searchLede" ) }</p>`
        : results.state === "short" ? html`<p>${ label( lang, "searchShort" ) }</p>`
            : results.state === "long" ? html`<p>${ label( lang, "searchLong" ) }</p>`
                : found === 0 ? html`<p>${ label( lang, "searchNone", { q: results.query } ) }</p>`
                    : html`<p>${ label( lang, "searchCount", { q: results.query, count: found } ) }</p>
<div class="results">
${ results.groups.map( ( group ) => groupOf( lang, group ) ) }</div>`;
    const main = html`<h1>${ title }</h1>
<form class="filter" role="search" method="get" action="${ paths.search( lang ) }">
<label for="search-query">${ label( lang, "searchLabel" ) }</label>
<input id="search-query" type="search" name="q" value="${ parts.query.q === null ? "" : parts.query.q }">
<button type="submit">${ label( lang, "searchButton" ) }</button>
</form>
${ answer }`;
    const address = paths.search( lang, parts.query.q );
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: address, canonical: address, main: main, nonce: nonce } ) } );
};
