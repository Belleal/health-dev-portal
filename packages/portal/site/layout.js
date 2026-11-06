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
 * The document every page is (plan 8a, decision 6; design record §8.4, §8.5, §9): one HTML document built with
 * web-content's escaping template, with the portal's own head. web-content's `composeHead` is not used: it always writes
 * Open Graph and Twitter tags and an article's JSON-LD, and points `x-default` at English, where `/` here goes to `/bg/`.
 *
 * Nothing is inline: one stylesheet and one deferred script, each by its content hash and with the response's nonce, and
 * no `style` attribute. Without the script everything is readable; it only adds collapsing and "copy link".
 */

const { html } = require( "@ti-engine/web-content/html" );
const { SCRIPT, STYLESHEET, assetPath } = require( "#assets" );
const { LANGUAGES, label, otherLanguage } = require( "#labels" );
const { absolute, changes, errors, home, lists, other, specs } = require( "#paths" );

// The top bar's sections, in order; plan 8b adds schemas, guides and tools.
const SECTIONS = Object.freeze( [
    { section: "specs", address: specs, name: ( lang ) => label( lang, "sectionSpecs" ) },
    { section: "nomenclatures", address: lists, name: ( lang ) => label( lang, "sectionNomenclatures" ) },
    { section: "errors", address: errors, name: ( lang ) => label( lang, "sectionErrors" ) },
    { section: "changes", address: changes, name: ( lang ) => label( lang, "sectionChanges" ) }
] );

// The canonical address and its alternates, each language's version of the canonical page: hreflang names canonical
// addresses, so a stage page's alternates are its fixed address in each language. `x-default` is Bulgarian, where `/`
// goes (design record §8.1). A page with no canonical, a 404, has none of them.
const alternates = ( lang, canonical ) => {
    if ( !canonical ) {
        return null;
    }
    const inLanguage = ( one ) => one === lang ? canonical : other( canonical );
    const links = LANGUAGES.filter( ( one ) => inLanguage( one ) !== null )
        .map( ( one ) => html`<link rel="alternate" hreflang="${ one }" href="${ absolute( inLanguage( one ) ) }">\n` );
    const fallback = inLanguage( LANGUAGES[ 0 ] );
    return html`<link rel="canonical" href="${ absolute( canonical ) }">
${ links }${ fallback === null ? null : html`<link rel="alternate" hreflang="x-default" href="${ absolute( fallback ) }">\n` }`;
};

/**
 * A whole page.
 *
 * @method
 * @param {Object} parts
 * @param {string} parts.lang The page's language.
 * @param {string} parts.title Its own title; the site's name follows it.
 * @param {string} parts.path Its own address, which the language switch links in the other language.
 * @param {string|null} [parts.canonical] Its canonical address — a stage page's fixed one (decision 3) — written with
 *     its `hreflang` alternates; `null` for a page that should have none, such as a 404.
 * @param {string|null} [parts.section] The top bar's entry to mark: `specs`, `nomenclatures`, `errors` or `changes`.
 * @param {import( "@ti-engine/web-content/html" ).SafeString|null} [parts.band] The mint band's content.
 * @param {import( "@ti-engine/web-content/html" ).SafeString|null} [parts.sidebar]
 * @param {import( "@ti-engine/web-content/html" ).SafeString} parts.main
 * @param {import( "@ti-engine/web-content/html" ).SafeString|null} [parts.panel] The detail panel, on the right.
 * @param {string} parts.nonce The response's CSP nonce, `response.locals.nonce`.
 * @returns {string}
 * @throws {RangeError} For a language the site does not have.
 * @public
 */
module.exports.page = ( { lang, title, path, canonical = null, section = null, band = null, sidebar = null, main, panel = null, nonce } ) => {
    const switchTo = otherLanguage( lang );
    const sections = SECTIONS.map( ( one ) => one.section === section
        ? html`<li><a href="${ one.address( lang ) }" aria-current="true">${ one.name( lang ) }</a></li>`
        : html`<li><a href="${ one.address( lang ) }">${ one.name( lang ) }</a></li>` );
    const layout = [ "layout", sidebar ? "with-sidebar" : null, panel ? "with-panel" : null ].filter( Boolean ).join( " " );
    return String( html`<!DOCTYPE html>
<html lang="${ lang }">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ title } · ${ label( lang, "siteName" ) }</title>
${ alternates( lang, canonical ) }<link rel="icon" href="data:,">
<link rel="stylesheet" href="${ assetPath( STYLESHEET ) }" nonce="${ nonce }">
<script src="${ assetPath( SCRIPT ) }" defer nonce="${ nonce }"></script>
</head>
<body>
<a class="skip" href="#main">${ label( lang, "skipToContent" ) }</a>
<header class="top">
<a class="wordmark" href="${ home( lang ) }"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span> <span>${ label( lang, "siteName" ) }</span></a>
<nav class="sections" aria-label="${ label( lang, "mainSections" ) }"><ul>
${ sections }
</ul></nav>
<div class="language"><a href="${ other( path ) || home( switchTo ) }" hreflang="${ switchTo }" lang="${ switchTo }">${ label( switchTo, "languageName" ) }</a></div>
</header>
${ band ? html`<div class="band">
${ band }
</div>
` : null }<div class="${ layout }">
${ sidebar ? html`<aside class="sidebar" aria-label="${ label( lang, "sidebar" ) }">
${ sidebar }
</aside>
` : null }<main id="main" tabindex="-1">
${ main }
</main>
${ panel ? html`<aside class="panel" aria-label="${ label( lang, "panel" ) }">
${ panel }
</aside>
` : null }</div>
<footer class="foot"><p>${ label( lang, "footer" ) }</p></footer>
</body>
</html>
` );
};
