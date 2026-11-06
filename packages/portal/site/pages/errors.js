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
 * The errors page (plan 8a, decision 11): each error of CL999 with the business rules that raise it, and each warning
 * of CL998 with its source. Production's page always exists; the testing page exists only while one of CL999, CL998
 * or the rules has a version in testing, and is a 404 otherwise.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { findPublished } = require( "@health-dev-portal/data/published" );
const { ERROR_CODE_LIST } = require( "@health-dev-portal/spec-model/links" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, notFound, send } = require( "#responses" );
const { localText } = require( "#text" );

// The warnings' list is named nowhere in the code packages: it is an ordinary list of the nomenclatures.
const WARNING_LIST = "CL998";
const RULES = "rules";

// The text an entry is shown by: its display when it has one in either language, else its description.
const textOf = ( entry ) => entry.display && ( entry.display.bg || entry.display.en ) ? entry.display : entry.description;

// The versions a page reads, one per spec. On the testing page a spec with no testing version is read in production,
// which is what stays in force beside the one in testing; the page says so.
const readVersions = async ( db, testing ) => {
    const found = {};
    const fallback = {};
    for ( const spec of [ ERROR_CODE_LIST, WARNING_LIST, RULES ] ) {
        const wanted = await findPublished( db, spec, { stage: testing ? STAGE.TESTING : STAGE.PRODUCTION } );
        found[ spec ] = wanted || ( testing ? await findPublished( db, spec, { stage: STAGE.PRODUCTION } ) : null );
        fallback[ spec ] = wanted === null && found[ spec ] !== null;
    }
    return { found: found, fallback: fallback };
};

// One error: its code as the anchor the rules page links to, its text, and the rules of the same stage that raise it. The
// match is on the code exactly as stored: a look-alike spelling on either side is a data defect to see, never to fold.
const errorEntry = ( lang, entry, rules ) => {
    const raising = rules === null ? [] : rules.content.rules.filter( ( rule ) => rule.errorCode === entry.key );
    return html`<section id="${ entry.key }">
<h3><code>${ entry.key }</code> · ${ localText( textOf( entry ), lang ) }</h3>
${ raising.length === 0 ? html`<p class="muted">${ label( lang, "errorsNoRules" ) }</p>` : html`<p>${ label( lang, "errorsRaisedBy" ) }:</p>
<ul>
${ raising.map( ( rule ) => html`<li><a href="${ paths.spec( lang, RULES, rules.number ) }#${ rule.id }"><code>${ rule.id }</code></a> · <span class="lines">${ localText( rule.definition, lang ) }</span></li>\n` ) }</ul>` }
</section>
`;
};

// The warnings, as a table: key, text, and the list's own columns (CL998 has `Source`), shown as they are.
const warningsTable = ( lang, list ) => html`<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnKey" ) }</th><th scope="col">${ label( lang, "columnDescription" ) }</th>${ list.columns.map( ( column ) => html`<th scope="col">${ column.title }</th>` ) }</tr></thead>
<tbody>
${ list.entries.map( ( entry ) => html`<tr id="warning-${ entry.key }"><td><code>${ entry.key }</code></td><td>${ localText( textOf( entry ), lang ) }</td>${ list.columns.map( ( column, index ) => html`<td>${ entry.values[ index ] || "—" }</td>` ) }</tr>\n` ) }</tbody>
</table>`;

/**
 * Answers the errors page: production's, or with `testing` the testing one, which is a 404 while none of CL999, CL998
 * and the rules has a testing version. Each CL999 entry carries `id="{code}"`, which the rules page links to.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {import( "#definitions" ).Address} parts `testing` is whether the testing page is asked for.
 * @returns {Promise<void>}
 * @public
 */
module.exports.errorsPage = async ( context, parts ) => {
    const { db, lang, request, response, nonce } = context;
    const testing = parts.testing === true;
    // Only a version of its own in testing makes the testing page; a production one read in its place does not.
    const hasTesting = ( await Promise.all( [ ERROR_CODE_LIST, WARNING_LIST, RULES ].map( ( spec ) => findPublished( db, spec, { stage: STAGE.TESTING } ) ) ) )
        .some( ( version ) => version !== null );
    if ( testing && !hasTesting ) {
        notFound( request, response );
        return;
    }
    const { found, fallback } = await readVersions( db, testing );
    const errors = found[ ERROR_CODE_LIST ];
    const warnings = found[ WARNING_LIST ];
    const rules = found[ RULES ];
    const title = label( lang, testing ? "errorsTitleTesting" : "errorsTitleProduction" );
    const versions = [ ERROR_CODE_LIST, WARNING_LIST, RULES ].filter( ( spec ) => found[ spec ] !== null ).map( ( spec ) => html`<li>${ label( lang, fallback[ spec ] ? "errorsFromProduction" : "errorsFromStage",
        { spec: spec, number: found[ spec ].number } ) }</li>\n` );
    // The two pages link to each other, the testing one only where it exists.
    const other = testing ? html`<a href="${ paths.errors( lang ) }">${ label( lang, "errorsProductionLink" ) }</a>`
        : hasTesting ? html`<a href="${ paths.errors( lang, true ) }">${ label( lang, "errorsTestingLink" ) }</a>` : null;
    const main = html`<h1>${ title }</h1>
<p>${ label( lang, "errorsLede" ) }</p>
${ other ? html`<p>${ other }</p>` : null }<p>${ label( lang, "errorsVersions" ) }:</p>
<ul>
${ versions }</ul>
<div>
<h2>${ label( lang, "errorsSectionErrors" ) }</h2>
${ errors === null ? html`<p>${ label( lang, "errorsNone" ) }</p>` : errors.content.list.entries.map( ( entry ) => errorEntry( lang, entry, rules ) ) }</div>
<div>
<h2>${ label( lang, "errorsSectionWarnings" ) }</h2>
${ warnings === null ? html`<p>${ label( lang, "errorsNone" ) }</p>` : warningsTable( lang, warnings.content.list ) }</div>`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.errors( lang, testing ), canonical: paths.errors( lang, testing ),
        section: "errors", main: main, nonce: nonce } ) } );
};
