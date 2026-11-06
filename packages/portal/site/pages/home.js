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
 * The home page, `/{lang}/` (design record §8.2, option H1): the versions by stage in the main column, and in the right
 * one what is upcoming in production and what was published last. The environments' status band and the newcomer's link
 * come with plan 8b.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { listPublished, publications, upcoming } = require( "@health-dev-portal/data/published" );
const { SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { formatDate } = require( "#format" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const { compare, home, lists } = require( "#paths" );
const { CACHE, send } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { aheadLegend, isAhead, modulesAndRules, stageTable } = require( "./stages" );

// How many publications the right column lists.
const LATEST = 10;

// The code lists are one row, not forty: how many there are and how many have a testing version ahead, linked to their
// index.
const nomenclaturesRow = ( lang, published ) => {
    const codeLists = published.filter( ( one ) => one.kind === SPEC_KIND.CODE_LIST );
    const ahead = codeLists.filter( isAhead ).length;
    return html`<tr><td><a href="${ lists( lang ) }">${ label( lang, "sectionNomenclatures" ) }</a></td><td colspan="3">${ label( lang, "nomenclaturesSummary", { count: codeLists.length, ahead: ahead } ) }</td></tr>\n`;
};

// One release due in production: its date, or that there is none yet; each version, with a link to what production
// would change to; and how many of its changes break.
const dueRelease = ( lang, release ) => html`<li><strong>${ release.plannedOn === null ? label( lang, "dateNotSet" ) : formatDate( release.plannedOn, lang ) }</strong>
<span class="muted">${ label( lang, "breakingChanges", { count: release.breaking } ) }</span>
<ul>
${ release.versions.map( ( version ) => version.production === null
        ? html`<li>${ specName( version.spec, lang ) } ${ version.number }</li>\n`
        : html`<li>${ specName( version.spec, lang ) } ${ version.production } → ${ version.number } <a href="${ compare( lang, version.spec, version.production, version.number ) }">${ label( lang, "compareWithProduction" ) }</a></li>\n` ) }</ul>
</li>
`;

/**
 * Answers the home page.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.homePage = async ( context ) => {
    const { db, lang, response, nonce } = context;
    const published = await listPublished( db );
    const due = await upcoming( db );
    const latest = await publications( db, { limit: LATEST } );
    const main = html`<h1>${ label( lang, "versionsByStage" ) }</h1>
${ stageTable( { lang: lang, specs: modulesAndRules( published ), link: false, extra: nomenclaturesRow( lang, published ) } ) }
${ aheadLegend( lang ) }`;
    const panel = html`<h2>${ label( lang, "upcomingTitle" ) }</h2>
${ due.length === 0 ? html`<p class="muted">${ label( lang, "upcomingNone" ) }</p>` : html`<ul class="releases">
${ due.map( ( release ) => dueRelease( lang, release ) ) }</ul>` }
<h2>${ label( lang, "latestTitle" ) }</h2>
${ latest.length === 0 ? html`<p class="muted">${ label( lang, "latestNone" ) }</p>` : html`<ul class="releases">
${ latest.map( ( one ) => html`<li><span class="muted">${ formatDate( one.on, lang ) }</span> ${ specName( one.spec, lang ) } ${ one.number } · ${ label( lang, one.stage === STAGE.TESTING ? "stageTesting" : "stageProduction" ) }</li>\n` ) }</ul>` }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: label( lang, "homeTitle" ), path: home( lang ), canonical: home( lang ), main: main, panel: panel, nonce: nonce } ) } );
};
