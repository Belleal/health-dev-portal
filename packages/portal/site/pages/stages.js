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
 * The table of versions by stage that the home page and the specifications index both show (design record §8.2): one
 * row per module and for the rules, the version in testing, in production and kept as previous production. The two
 * pages differ only in whether a version is a link, so the table is written once; its cell is the lists' index's too.
 * Here also is how a page says until when previous production stays backward compatible, for every page that names it.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { formatDate } = require( "#format" );
const { label } = require( "#labels" );
const { spec: specPath } = require( "#paths" );
const { SPEC_NAMES, specName } = require( "#spec-names" );

/**
 * The public stages, in the order a table's columns show them: testing, production, previous production.
 *
 * @type {string[]}
 * @public
 */
const STAGES = module.exports.STAGES = Object.freeze( [ STAGE.TESTING, STAGE.PRODUCTION, STAGE.PREVIOUS_PRODUCTION ] );

/**
 * Whether a spec's testing version carries what production does not, which a page marks in red: it differs from the
 * production one, or there is none in production at all, as a new spec is.
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).PublishedSpec} published
 * @returns {boolean}
 * @public
 */
module.exports.isAhead = ( published ) => published.testing !== null
    && ( published.production === null || published.testing.number !== published.production.number );

/**
 * The modules and the rules among the published specs, in the home page's order: those `spec-names.js` names first, in
 * its order, then any other by ID, which `listPublished` already sorts by.
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).PublishedSpec[]} published
 * @returns {import( "@health-dev-portal/data/definitions" ).PublishedSpec[]}
 * @public
 */
module.exports.modulesAndRules = ( published ) => {
    const own = published.filter( ( one ) => one.kind === SPEC_KIND.MODULE || one.kind === SPEC_KIND.RULES );
    const named = SPEC_NAMES.map( ( one ) => own.find( ( found ) => found.spec === one.spec ) ).filter( Boolean );
    return [ ...named, ...own.filter( ( one ) => !named.includes( one ) ) ];
};

/**
 * Until when a version in previous production stays backward compatible, in words: "обратно съвместима до dd.mm.yyyy" /
 * "backward compatible until …". Previous production says it wherever it appears (design record §7.6), and every page
 * that names a version says it through this one function: the lists' index had a cell of its own, and the changelog and
 * the comparison form did not say it at all (final review M3, M9).
 *
 * @method
 * @param {string} lang
 * @param {string} stage The stage the version is named in.
 * @param {string|null} expiresOn The version's `expiresOn`, `yyyy-mm-dd`.
 * @returns {string|null} `null` for any other stage, or for no date.
 * @public
 */
module.exports.compatibleUntil = ( lang, stage, expiresOn ) => stage === STAGE.PREVIOUS_PRODUCTION && expiresOn
    ? label( lang, "backwardCompatibleUntil", { date: formatDate( expiresOn, lang ) } ) : null;

/**
 * One stage's cell of a spec's row: the version's number, red when it is the testing one ahead of production, a link
 * when the page gives an address, and for previous production until when it is backward compatible; "—" for a stage
 * with no version. The versions-by-stage table and the lists' index both write their cells with it (final review M9).
 *
 * @method
 * @param {string} lang
 * @param {import( "@health-dev-portal/data/definitions" ).PublishedSpec} published
 * @param {string} stage `testing`, `production` or `previous-production`.
 * @param {(function( string ): string)|null} address The page of the spec at a stage, or `null` for no link.
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.stageCell = ( lang, published, stage, address ) => {
    const version = { [ STAGE.TESTING ]: published.testing, [ STAGE.PRODUCTION ]: published.production, [ STAGE.PREVIOUS_PRODUCTION ]: published.previousProduction }[ stage ];
    if ( version === null ) {
        return html`<td>${ label( lang, "noVersion" ) }</td>`;
    }
    const number = stage === STAGE.TESTING && module.exports.isAhead( published ) ? html`<span class="ahead">${ version.number }</span>` : version.number;
    const shown = address ? html`<a href="${ address( stage ) }">${ number }</a>` : number;
    const until = module.exports.compatibleUntil( lang, stage, version.expiresOn );
    return html`<td>${ shown }${ until ? html`<br><span class="muted">${ until }</span>` : null }</td>`;
};

/**
 * The legend under the table: what the red mark means. The square carries the mark's colour and is hidden from a screen
 * reader, which gets the words; colour alone would say nothing to it.
 *
 * @method
 * @param {string} lang
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.aheadLegend = ( lang ) => html`<p class="legend"><span class="ahead" aria-hidden="true">■</span> ${ label( lang, "aheadLegend" ) }</p>`;

/**
 * The table of versions by stage.
 *
 * @method
 * @param {Object} parts
 * @param {string} parts.lang
 * @param {import( "@health-dev-portal/data/definitions" ).PublishedSpec[]} parts.specs The rows, in order.
 * @param {boolean} parts.link Whether each version is a link to its spec page.
 * @param {import( "@ti-engine/web-content/html" ).SafeString|null} [parts.extra] Further rows, after the specs'.
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.stageTable = ( { lang, specs, link, extra = null } ) => html`<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnSpec" ) }</th><th scope="col">${ label( lang, "columnTesting" ) }</th><th scope="col">${ label( lang, "columnProduction" ) }</th><th scope="col">${ label( lang, "columnPrevious" ) }</th></tr></thead>
<tbody>
${ specs.map( ( one ) => {
        const address = link ? ( stage ) => specPath( lang, one.spec, stage ) : null;
        return html`<tr><td>${ specName( one.spec, lang ) }</td>${ STAGES.map( ( stage ) => module.exports.stageCell( lang, one, stage, address ) ) }</tr>\n`;
    } ) }${ extra }</tbody>
</table>`;
