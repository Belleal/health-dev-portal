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
 * The FAQ (plan 8c, decision 5; design record §8.1): his.bg's questions, moved unchanged, by category, each at its own
 * anchor. They are in Bulgarian only, so the English page shows them in Bulgarian, marked (§8.4).
 */

const { html } = require( "@ti-engine/web-content/html" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, send } = require( "#responses" );
const { contentLine, contentText } = require( "#text" );

/**
 * Answers the FAQ: the notice that the questions are unreviewed, then each category with its questions, in the
 * register's order. A category and a question each have an anchor, the one its key or slug names.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.faqPage = async ( context ) => {
    const { content, lang, response, nonce } = context;
    const title = label( lang, "faqTitle" );
    const categories = content.faq.categories.map( ( category ) => html`<h2 id="${ category.key }">${ category.name[ lang ] }</h2>
${ category.questions.map( ( question ) => {
        const { text, own } = contentText( question.texts, lang );
        return html`<h3 id="${ question.slug }">${ contentLine( text.question, own, lang ) }</h3>
<div class="prose"${ own ? null : html` lang="bg"` }>
${ text.html }</div>
`;
    } ) }` );
    const main = html`<h1>${ title }</h1>
<p class="notice">${ label( lang, "faqNotice" ) }</p>
${ categories }`;
    const sidebar = html`<nav aria-label="${ label( lang, "faqCategories" ) }">
<h2>${ label( lang, "faqCategories" ) }</h2>
<ul>
${ content.faq.categories.map( ( category ) => html`<li><a href="#${ category.key }">${ category.name[ lang ] }</a></li>\n` ) }</ul>
</nav>`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.faq( lang ), canonical: paths.faq( lang ), section: "faq",
        sidebar: sidebar, main: main, nonce: nonce } ) } );
};
