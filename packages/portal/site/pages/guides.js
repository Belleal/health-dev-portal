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
 * The Guides section (plan 8c, decision 4; design record §8.1): the index, with the planned guides and the old his.bg
 * documents that cover them meanwhile, and each guide with its contents, its notice, its sources and its licence. The
 * text comes from content/, read at start (`site/content.js`).
 */

const { html } = require( "@ti-engine/web-content/html" );
const { formatDate } = require( "#format" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, notFound, send } = require( "#responses" );
const { contentLine, contentText } = require( "#text" );

// The licence of everything in content/ (design record §2), in the reader's language.
const LICENCE = ( lang ) => `https://creativecommons.org/licenses/by/4.0/deed.${ lang }`;

// An old his.bg document: its title is Bulgarian whatever the page's language.
const legacyLink = ( lang, source ) => html`<a href="${ source.url }" hreflang="bg" lang="bg">${ source.title } v${ source.version }</a> (${ label( lang, "legacyDocument" ) })`;

const isDraft = ( guide ) => guide.aiAssisted && guide.reviewed === null;

/**
 * Answers the Guides section's index: the guides in the register's order, a draft marked, then the planned ones.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.guidesIndexPage = async ( context ) => {
    const { content, lang, response, nonce } = context;
    const title = label( lang, "sectionGuides" );
    const guides = content.guides.map( ( guide ) => {
        const { text, own } = contentText( guide.texts, lang );
        return html`<li><a href="${ paths.guide( lang, guide.slug ) }">${ contentLine( text.title, own, lang ) }</a>${ isDraft( guide ) ? html` <span class="badge draft">${ label( lang, "guideDraft" ) }</span>` : null }
<br><span class="muted"${ own ? null : html` lang="bg"` }>${ text.summary }</span></li>
`;
    } );
    const planned = content.planned.map( ( one ) => html`<li>${ one.title[ lang ] } — ${ label( lang, "guidePlanned" ) }${ one.legacy === null ? null
        : html` ${ label( lang, "guidePlannedMeanwhile" ) } ${ legacyLink( lang, one.legacy ) }` }</li>
` );
    const main = html`<h1>${ title }</h1>
<p>${ label( lang, "guidesLede" ) }</p>
<ul class="guides">
${ guides }</ul>
${ planned.length === 0 ? null : html`<h2>${ label( lang, "guidesPlanned" ) }</h2>
<ul class="guides">
${ planned }</ul>` }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.guides( lang ), canonical: paths.guides( lang ), section: "guides",
        main: main, nonce: nonce } ) } );
};

/**
 * Answers one guide: its notice when it was written with the help of artificial intelligence, its text — in Bulgarian,
 * marked, where it has no English — its sources, the date it was updated and its licence, with its contents beside it.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{slug: string}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.guidePage = async ( context, parts ) => {
    const { content, lang, request, response, nonce } = context;
    const guide = content.guides.find( ( one ) => one.slug === parts.slug );
    if ( !guide ) {
        // A planned guide has no page until it is written: the index lists it.
        notFound( request, response );
        return;
    }
    const { text, own } = contentText( guide.texts, lang );
    const notice = !guide.aiAssisted ? null : html`<p class="notice">${ guide.reviewed === null ? label( lang, "guideDraftNotice" )
        : label( lang, "guideReviewedNotice", { date: formatDate( guide.reviewed, lang ) } ) }</p>
`;
    const sources = guide.sources.length === 0 ? null : html`<h2>${ label( lang, "guideSources" ) }</h2>
<ul>
${ guide.sources.map( ( source ) => html`<li>${ legacyLink( lang, source ) }</li>\n` ) }</ul>
`;
    const main = html`${ notice }<h1>${ contentLine( text.title, own, lang ) }</h1>
<p class="muted">${ label( lang, "guideUpdated", { date: formatDate( text.updated, lang ) } ) }</p>
<div class="prose"${ own ? null : html` lang="bg"` }>
${ text.html }</div>
${ sources }<p class="muted">${ label( lang, "contentLicence" ) } <a href="${ LICENCE( lang ) }" rel="license">CC BY 4.0</a>.</p>`;
    // The contents, from the headings' ids (decision 2): in Bulgarian, marked so, where the guide is.
    const sidebar = html`<p class="title"><a href="${ paths.guides( lang ) }">${ label( lang, "sectionGuides" ) }</a></p>
${ text.contents.length === 0 ? null : html`<nav aria-label="${ label( lang, "guideContents" ) }">
<h2>${ label( lang, "guideContents" ) }</h2>
<ul${ own ? null : html` lang="bg"` }>
${ text.contents.map( ( heading ) => html`<li><a href="#${ heading.id }">${ heading.title }</a></li>\n` ) }</ul>
</nav>` }`;
    const address = paths.guide( lang, guide.slug );
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: text.title, path: address, canonical: address, section: "guides",
        sidebar: sidebar, main: main, nonce: nonce } ) } );
};
