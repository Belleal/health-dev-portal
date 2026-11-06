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
 * The changes pages (plan 8a, decision 10; design record §7.10): the index of every spec's changelog, one spec's changelog
 * with its comparison form, and the comparison of two kept versions. Every page here is built from the public changelog
 * (`publishedChangelog`), which holds no person's name and no version that was never public.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { findPublished, listPublished, publishedChangelog, publications } = require( "@health-dev-portal/data/published" );
const { compareContents } = require( "@health-dev-portal/spec-model/differences" );
const { CHANGE_CATEGORY, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { compareNumbers } = require( "@health-dev-portal/spec-model/numbers" );
const { formatDate } = require( "#format" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, notFound, send } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { localText } = require( "#text" );
const { aspectName, differenceRow, shownValue } = require( "./message" );
const { modulesAndRules } = require( "./stages" );

// A changelog's groups, in the order a version lists them (decision 10).
const GROUPS = Object.freeze( [
    { category: CHANGE_CATEGORY.BREAKING, name: "groupBreaking" },
    { category: CHANGE_CATEGORY.DROPPED_PLAN, name: "groupDroppedPlan" },
    { category: CHANGE_CATEGORY.NON_BREAKING, name: "groupNonBreaking" }
] );

const STAGE_LABELS = Object.freeze( {
    [ STAGE.TESTING ]: "stageTesting",
    [ STAGE.PRODUCTION ]: "stageProduction",
    [ STAGE.PREVIOUS_PRODUCTION ]: "stagePreviousProduction",
    [ STAGE.RETIRED ]: "stageRetired"
} );

// How many publications the index lists.
const LATEST = 20;

/**
 * A public stage in words, in a language.
 *
 * @method
 * @param {string} lang
 * @param {string} stage `testing`, `production`, `previous-production` or `retired`.
 * @returns {string}
 * @public
 */
module.exports.stageName = ( lang, stage ) => label( lang, STAGE_LABELS[ stage ] );

// The versions that can be compared: those with content, which is every public version still in a stage. A retired one
// has none, and is only in the changelog.
const keptVersions = ( changelog ) => changelog.filter( ( version ) => version.stage !== STAGE.RETIRED );

// What a version says about when it was published and what became of it: the dates that were recorded, or that none were;
// the fix it was retired for; "abandoned" when it was abandoned in testing.
const versionNotes = ( lang, version ) => {
    const notes = [ module.exports.stageName( lang, version.stage ) ];
    if ( version.enteredTesting ) {
        notes.push( label( lang, "versionTestingSince", { date: formatDate( version.enteredTesting, lang ) } ) );
    }
    if ( version.enteredProduction ) {
        notes.push( label( lang, "versionProductionSince", { date: formatDate( version.enteredProduction, lang ) } ) );
    }
    if ( !version.enteredTesting && !version.enteredProduction ) {
        notes.push( label( lang, "versionDatesNone" ) );
    }
    if ( version.replacedBy ) {
        notes.push( label( lang, "versionReplacedBy", { number: version.replacedBy } ) );
    }
    if ( version.abandoned ) {
        notes.push( label( lang, "versionAbandoned" ) );
    }
    return notes.join( " · " );
};

// One entry: what it concerns, what changed and the values. An editor's or imported entry has text, which takes the cells
// after the target; a detected one names its aspect, read like a comparison's difference, with the values before and after.
const entryRow = ( lang, entry ) => {
    const target = entry.target ? html`<code>${ entry.target.identity || entry.target.kind }</code>` : html`—`;
    if ( entry.text.bg || entry.text.en || !entry.aspect ) {
        return html`<tr><td>${ target }</td><td colspan="3">${ localText( entry.text, lang ) }</td></tr>\n`;
    }
    return html`<tr><td>${ target }</td><td>${ aspectName( lang, entry.aspect ) }</td><td>${ shownValue( lang, entry, entry.before ) }</td><td>${ shownValue( lang, entry, entry.after ) }</td></tr>\n`;
};

// One version's section: its heading, at `level`, with the notes, then its entries by group, each group with its count.
const versionSection = ( lang, version, level ) => {
    const groups = GROUPS.filter( ( group ) => version.entries[ group.category ].length > 0 );
    return html`<section class="version" id="v${ version.number }">
<h${ level }>${ label( lang, "versionHeading", { number: version.number } ) } <span class="muted">· ${ versionNotes( lang, version ) }</span></h${ level }>
${ groups.length === 0 ? html`<p class="muted">${ label( lang, "changelogNone" ) }</p>\n` : groups.map( ( group ) => html`<h${ level + 1 }>${ label( lang, "groupCount", { group: label( lang, group.name ), count: version.entries[ group.category ].length } ) }</h${ level + 1 }>
<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnAbout" ) }</th><th scope="col">${ label( lang, "columnChange" ) }</th><th scope="col">${ label( lang, "columnBefore" ) }</th><th scope="col">${ label( lang, "columnAfter" ) }</th></tr></thead>
<tbody>
${ version.entries[ group.category ].map( ( entry ) => entryRow( lang, entry ) ) }</tbody>
</table>
` ) }</section>
`;
};

// The comparison form: a GET form with two selects of the kept versions, so that it works without JavaScript. It starts on
// the newest pair, the version before the newest and the newest; with fewer than two there is nothing to compare.
const comparisonForm = ( lang, spec, kept ) => {
    if ( kept.length < 2 ) {
        return html`<p class="muted">${ label( lang, "compareNeedTwo" ) }</p>`;
    }
    const options = ( chosen ) => kept.map( ( version ) => html`<option value="${ version.number }"${ version.number === chosen ? html` selected` : null }>${ version.number } · ${ module.exports.stageName( lang, version.stage ) }</option>\n` );
    return html`<form class="filter" method="get" action="${ paths.changes( lang, spec ) }/compare">
<label for="compare-from">${ label( lang, "compareFrom" ) }</label>
<select id="compare-from" name="from">
${ options( kept[ 1 ].number ) }</select>
<label for="compare-to">${ label( lang, "compareTo" ) }</label>
<select id="compare-to" name="to">
${ options( kept[ 0 ].number ) }</select>
<button type="submit">${ label( lang, "compareButton" ) }</button>
</form>`;
};

/**
 * Answers the changes index: every spec's changelog and the latest publications, with the feed of everything.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.changesIndexPage = async ( context ) => {
    const { db, lang, response, nonce } = context;
    const published = await listPublished( db );
    const own = modulesAndRules( published );
    const lists = published.filter( ( one ) => !own.includes( one ) );
    const latest = await publications( db, { limit: LATEST } );
    const link = ( one ) => html`<a href="${ paths.changes( lang, one.spec ) }">${ specName( one.spec, lang ) }</a>`;
    const title = label( lang, "changesIndexTitle" );
    const main = html`<h1>${ title }</h1>
<p>${ label( lang, "changesLede" ) }</p>
<p><a href="${ paths.feed( lang ) }">${ label( lang, "changesFeedAll" ) }</a></p>
<h2>${ label( lang, "sectionSpecs" ) }</h2>
<ul>
${ own.map( ( one ) => html`<li>${ link( one ) }</li>\n` ) }</ul>
<h2>${ label( lang, "sectionNomenclatures" ) }</h2>
<p>${ lists.map( ( one, index ) => index === 0 ? link( one ) : html`, ${ link( one ) }` ) }</p>
<h2>${ label( lang, "changesLatest" ) }</h2>
${ latest.length === 0 ? html`<p class="muted">${ label( lang, "changesLatestNone" ) }</p>` : html`<ul class="releases">
${ latest.map( ( one ) => html`<li><span class="muted">${ formatDate( one.on, lang ) }</span> <a href="${ paths.changes( lang, one.spec ) }#v${ one.number }">${ specName( one.spec, lang ) } ${ one.number }</a> · ${ module.exports.stageName( lang, one.stage ) }</li>\n` ) }</ul>` }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.changes( lang ), canonical: paths.changes( lang ), section: "changes", main: main, nonce: nonce } ) } );
};

/**
 * Answers one spec's changelog: its public versions newest first, each with its entries by group, and the comparison
 * form. A spec that is not published is the 404 page.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.changelogPage = async ( context, parts ) => {
    const { db, lang, request, response, nonce } = context;
    const { spec } = parts;
    if ( !( await listPublished( db ) ).some( ( one ) => one.spec === spec ) ) {
        notFound( request, response );
        return;
    }
    const changelog = await publishedChangelog( db, spec );
    const name = specName( spec, lang );
    const main = html`<h1>${ name } · ${ label( lang, "changelog" ) }</h1>
<p><a href="${ paths.feed( lang, spec ) }">${ label( lang, "changesFeedSpec" ) }</a></p>
<h2>${ label( lang, "compareLegend" ) }</h2>
${ comparisonForm( lang, spec, keptVersions( changelog ) ) }
${ changelog.length === 0 ? html`<p>${ label( lang, "changelogNoVersions" ) }</p>` : changelog.map( ( version ) => versionSection( lang, version, 2 ) ) }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: `${ name } · ${ label( lang, "changelog" ) }`, path: paths.changes( lang, spec ),
        canonical: paths.changes( lang, spec ), section: "changes", main: main, nonce: nonce } ) } );
};

// The structural differences between two contents, as one table per category: breaking first. A category with none is left
// out, and no difference at all says so.
const differenceTables = ( lang, differences ) => {
    const groups = [ CHANGE_CATEGORY.BREAKING, CHANGE_CATEGORY.NON_BREAKING ].map( ( category ) => ( { category: category, rows: differences.filter( ( one ) => one.category === category ) } ) )
        .filter( ( group ) => group.rows.length > 0 );
    if ( groups.length === 0 ) {
        return html`<p>${ label( lang, "compareStructureNone" ) }</p>`;
    }
    return html`${ groups.map( ( group ) => html`<h3>${ label( lang, "groupCount", { group: label( lang, group.category === CHANGE_CATEGORY.BREAKING ? "groupBreaking" : "groupNonBreaking" ), count: group.rows.length } ) }</h3>
<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnElement" ) }</th><th scope="col">${ label( lang, "columnChange" ) }</th><th scope="col">${ label( lang, "columnBefore" ) }</th><th scope="col">${ label( lang, "columnAfter" ) }</th><th scope="col">${ label( lang, "columnCategory" ) }</th></tr></thead>
<tbody>
${ group.rows.map( ( difference ) => differenceRow( lang, difference ) ) }</tbody>
</table>
` ) }`;
};

/**
 * Answers the comparison of two kept versions of a spec: the structural differences by category, then the changelog
 * entries of the public versions after the first up to the second. A reversed pair is swapped; an equal pair, an unknown
 * or retired version, and an unpublished spec are the 404 page.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string, from: string, to: string}} parts Both are version numbers, as `parseAddress` has checked.
 * @returns {Promise<void>}
 * @public
 */
module.exports.comparePage = async ( context, parts ) => {
    const { db, lang, request, response, nonce } = context;
    const { spec } = parts;
    const order = compareNumbers( parts.from, parts.to );
    if ( order === 0 ) {
        notFound( request, response );
        return;
    }
    const [ from, to ] = order < 0 ? [ parts.from, parts.to ] : [ parts.to, parts.from ];
    const changelog = await publishedChangelog( db, spec );
    const kept = new Set( keptVersions( changelog ).map( ( version ) => version.number ) );
    // Only what the changelog holds is looked up, so an address names a published version or nothing: `from=../1.5.1` never
    // got this far, and a number the spec never had is no query.
    const base = kept.has( from ) ? await findPublished( db, spec, { number: from } ) : null;
    const current = kept.has( to ) ? await findPublished( db, spec, { number: to } ) : null;
    if ( !base || !current || !base.content || !current.content ) {
        notFound( request, response );
        return;
    }
    const differences = compareContents( current.kind, base.content, current.content );
    const between = changelog.filter( ( version ) => compareNumbers( version.number, from ) > 0 && compareNumbers( version.number, to ) <= 0 );
    const name = specName( spec, lang );
    const title = label( lang, "compareTitle", { name: name, from: from, to: to } );
    const address = paths.compare( lang, spec, from, to );
    const main = html`<h1>${ title }</h1>
<p><a href="${ paths.changes( lang, spec ) }">${ label( lang, "compareBack" ) }</a></p>
<h2>${ label( lang, "compareStructure" ) }</h2>
${ differenceTables( lang, differences ) }
<h2>${ label( lang, "compareEntries" ) }</h2>
${ between.length === 0 ? html`<p>${ label( lang, "compareEntriesNone" ) }</p>` : between.map( ( version ) => versionSection( lang, version, 3 ) ) }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: address, canonical: address, section: "changes", main: main, nonce: nonce } ) } );
};
