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
 * The Schemas section (design record §8.1; plan 8b, decision 8): the notice that /api/v1/ is obsolete, then each stage's
 * module versions with their sets and zips; and one version's set, each message's XSD and sample with the downloads of
 * the whole version.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { listPublished } = require( "@health-dev-portal/data/published" );
const { LIFECYCLE, SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, send } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { localText } = require( "#text" );
const { STAGES, compatibleUntil, modulesAndRules } = require( "./stages" );
const { findShown, plannedOn, stageBand, stageVersions } = require( "./version" );

const XMLDSIG = "xmldsig-core-schema.xsd";
// Each public stage's heading, and the field `listPublished` keeps its version under.
const STAGE_HEADINGS = Object.freeze( { [ STAGE.TESTING ]: "columnTesting", [ STAGE.PRODUCTION ]: "columnProduction", [ STAGE.PREVIOUS_PRODUCTION ]: "columnPrevious" } );
const FIELDS = Object.freeze( { [ STAGE.TESTING ]: "testing", [ STAGE.PRODUCTION ]: "production", [ STAGE.PREVIOUS_PRODUCTION ]: "previousProduction" } );

// One stage's module versions: each links its set at its number and its zip. Previous production says until when it
// stays backward compatible, as everywhere it appears (plan 8a, decision 7).
const stageSection = ( lang, stage, modules ) => {
    const rows = modules.filter( ( one ) => one[ FIELDS[ stage ] ] !== null );
    const table = rows.length === 0 ? html`<p>${ label( lang, "schemasStageNone" ) }</p>` : html`<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnSpec" ) }</th><th scope="col">${ label( lang, "columnVersion" ) }</th><th scope="col">${ label( lang, "columnArchive" ) }</th></tr></thead>
<tbody>
${ rows.map( ( one ) => {
        const version = one[ FIELDS[ stage ] ];
        const until = compatibleUntil( lang, stage, version.expiresOn );
        return html`<tr data-path="${ one.spec }"><td>${ specName( one.spec, lang ) }</td><td><a href="${ paths.schemaSet( lang, one.spec, version.number ) }">${ version.number }</a>${ until
            ? html`<br><span class="muted">${ until }</span>` : null }</td><td><a href="${ paths.specDownload( one.spec, version.number, "zip" ) }">zip</a></td></tr>\n`;
    } ) }</tbody>
</table>`;
    return html`<section>
<h2>${ label( lang, STAGE_HEADINGS[ stage ] ) }</h2>
${ table }
</section>
`;
};

/**
 * Answers the Schemas section: the notice that `/api/v1/` is obsolete, first, then a table per public stage of each
 * module's version there, in the home page's order.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.schemasIndexPage = async ( context ) => {
    const { db, lang, response, nonce } = context;
    const modules = modulesAndRules( await listPublished( db ) ).filter( ( one ) => one.kind === SPEC_KIND.MODULE );
    const title = label( lang, "schemasTitle" );
    const main = html`<h1>${ title }</h1>
<p class="notice">${ label( lang, "schemasObsolete" ) }</p>
${ STAGES.map( ( stage ) => stageSection( lang, stage, modules ) ) }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.schemas( lang ), canonical: paths.schemas( lang ), section: "schemas", main: main, nonce: nonce } ) } );
};

// A message's row: its XSD and its sample, by the version's number, or for a withdrawn message neither (plan 8b,
// decision 2) and no link at all.
const messageRow = ( lang, { spec, at, number, message } ) => {
    if ( message.lifecycle === LIFECYCLE.WITHDRAWN ) {
        return html`<tr data-path="${ message.code }"><td><code>${ message.code }</code></td><td>${ localText( message.title, lang ) } <strong>${ label( lang, "lifecycleWithdrawn" ) }</strong></td><td>—</td><td>—</td></tr>\n`;
    }
    return html`<tr data-path="${ message.code }"><td><a href="${ paths.message( lang, spec, at, message.code ) }"><code>${ message.code }</code></a></td><td>${ localText( message.title, lang ) }</td><td><a href="${ paths.schemaFile( spec, number, `NHIS-${ message.code }.xsd` ) }">NHIS-${ message.code }.xsd</a></td><td><a href="${ paths.sampleDownload( spec, number, message.code ) }">${ message.code }.xml</a></td></tr>\n`;
};

/**
 * Answers one module version's set: its stage switcher, each message's XSD and sample, and the version's zip, model and
 * xmldsig. Canonical at the version's number; every file link is at the number, whose file never changes.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string, at: string}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.schemaSetPage = async ( context, parts ) => {
    const shown = await findShown( context, parts, [ SPEC_KIND.MODULE ] );
    if ( shown === null ) {
        return;
    }
    const { db, lang, response, nonce } = context;
    const { spec, at } = parts;
    const { version } = shown;
    const number = version.number;
    const band = stageBand( lang, { stages: await stageVersions( db, spec ), version: version, address: ( stage ) => paths.schemaSet( lang, spec, stage ),
        planned: version.stage === STAGE.TESTING ? await plannedOn( db, version ) : null } );
    const name = `${ specName( spec, lang ) } ${ number }`;
    const title = `${ label( lang, "schemaSetTitle" ) } · ${ name }`;
    const main = html`<h1>${ name } · ${ label( lang, "schemaSetTitle" ) }</h1>
<p>${ label( lang, "schemaSetLede" ) }</p>
<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnCode" ) }</th><th scope="col">${ label( lang, "columnTitle" ) }</th><th scope="col">${ label( lang, "columnXsd" ) }</th><th scope="col">${ label( lang, "columnSample" ) }</th></tr></thead>
<tbody>
${ version.content.messages.map( ( message ) => messageRow( lang, { spec: spec, at: at, number: number, message: message } ) ) }</tbody>
</table>
<h2>${ label( lang, "schemaSetDownloads" ) }</h2>
<ul>
<li><a href="${ paths.specDownload( spec, number, "zip" ) }">${ label( lang, "schemaSetZip" ) }</a></li>
<li><a href="${ paths.specDownload( spec, number, "json" ) }">${ label( lang, "schemaSetModel" ) }</a></li>
<li><a href="${ paths.schemaFile( spec, number, XMLDSIG ) }">${ label( lang, "schemaSetXmldsig" ) }</a></li>
</ul>`;
    send( response, { cache: shown.cache, body: page( { lang: lang, title: title, path: paths.schemaSet( lang, spec, at ), canonical: paths.schemaSet( lang, spec, number ),
        section: "schemas", band: band, main: main, nonce: nonce } ) } );
};
