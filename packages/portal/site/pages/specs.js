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
 * The specifications (plan 8a, decision 3): the index, `/{lang}/specs`, of every module and the rules by stage; a
 * module's page, its messages by endpoint segment; the rules' page, every business rule with its error code; and a
 * module's conditions and dictionary. The code lists are not here: they have their own index under /nomenclatures. A
 * message's page is message.js.
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
const { messageKind } = require( "./message-panel" );
const { elementName } = require( "./message-tree" );
const { aheadLegend, modulesAndRules, stageTable } = require( "./stages" );
const { bySegment, conditionsTable, findShown, moduleSidebar, plannedOn, stageBand, stageVersions } = require( "./version" );

/**
 * Answers the specifications index.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.specsIndexPage = async ( context ) => {
    const { db, lang, response, nonce } = context;
    const rows = modulesAndRules( await listPublished( db ) );
    const title = label( lang, "specsIndexTitle" );
    const main = html`<h1>${ title }</h1>
${ stageTable( { lang: lang, specs: rows, link: true } ) }
${ aheadLegend( lang ) }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.specs( lang ), canonical: paths.specs( lang ), section: "specs", main: main, nonce: nonce } ) } );
};

// Sends one page of a spec version: at the address as asked, canonical at the version's fixed one (decision 3), with the
// stage switcher linking the same page at each kept stage. `address( lang, spec, at )` is the page's builder; `title`
// names what of the version it shows, `null` for the version itself.
const answer = async ( context, parts, shown, { address, title = null, main, sidebar = null } ) => {
    const { db, lang, response, nonce } = context;
    const { version } = shown;
    const band = stageBand( lang, { stages: await stageVersions( db, parts.spec ), version: version, address: ( stage ) => address( lang, parts.spec, stage ),
        planned: version.stage === STAGE.TESTING ? await plannedOn( db, version ) : null } );
    const name = `${ specName( parts.spec, lang ) } ${ version.number }`;
    send( response, { cache: shown.cache, body: page( { lang: lang, title: title === null ? name : `${ title } · ${ name }`, path: address( lang, parts.spec, parts.at ),
        canonical: address( lang, parts.spec, version.number ), section: "specs", band: band, sidebar: sidebar, main: main, nonce: nonce } ) } );
};

// A module's messages, a table per endpoint segment, then the rest of the module.
const moduleMain = ( lang, { spec, at, version } ) => {
    const messages = version.content.messages;
    const groups = bySegment( messages ).map( ( group ) => html`<section class="segment">
<h2>${ group.segment === null ? label( lang, "segmentOther" ) : group.segment }</h2>
<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnCode" ) }</th><th scope="col">${ label( lang, "columnTitle" ) }</th><th scope="col">${ label( lang, "panelAddress" ) }</th><th scope="col">${ label( lang, "columnDirection" ) }</th></tr></thead>
<tbody>
${ group.messages.map( ( message ) => html`<tr><td><a href="${ paths.message( lang, spec, at, message.code ) }">${ message.code }</a></td><td>${ localText( message.title, lang ) }</td><td>${ message.address ? html`<code>${ message.address }</code>` : null }</td><td>${ messageKind( lang, { spec: spec, at: at, message: message, messages: messages } ) }</td></tr>\n` ) }</tbody>
</table>
</section>
` );
    return html`<h1>${ specName( spec, lang ) } ${ version.number }</h1>
${ groups }<h2>${ label( lang, "moduleLinks" ) }</h2>
<ul>
<li><a href="${ paths.conditions( lang, spec, at ) }">${ label( lang, "conditions" ) }</a></li>
<li><a href="${ paths.dictionary( lang, spec, at ) }">${ label( lang, "dictionary" ) }</a></li>
<li><a href="${ paths.errors( lang ) }">${ label( lang, "sectionErrors" ) }</a></li>
<li><a href="${ paths.changes( lang, spec ) }">${ label( lang, "changelog" ) }</a></li>
</ul>`;
};

// Every business rule, anchored by its ID so that a message's links and the errors page can name it, with the error it
// raises on the errors page of the same stage: a rules version in testing raises testing's.
const rulesMain = ( lang, { version } ) => {
    const errors = paths.errors( lang, version.stage === STAGE.TESTING );
    const status = ( rule ) => rule.lifecycle === LIFECYCLE.WITHDRAWN ? html` <strong>${ label( lang, "lifecycleWithdrawn" ) }</strong>`
        : rule.lifecycle === LIFECYCLE.IN_DEVELOPMENT ? html` <strong>${ label( lang, "lifecycleInDevelopment" ) }</strong>` : null;
    return html`<h1>${ specName( version.spec, lang ) } ${ version.number }</h1>
<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnRule" ) }</th><th scope="col">${ label( lang, "columnDefinition" ) }</th><th scope="col">${ label( lang, "columnErrorCode" ) }</th><th scope="col">${ label( lang, "columnSince" ) }</th></tr></thead>
<tbody>
${ version.content.rules.map( ( rule ) => html`<tr id="${ rule.id }"><td><code>${ rule.id }</code>${ status( rule ) }</td><td><span class="lines">${ localText( rule.definition, lang ) }</span>${ rule.sourceText
        ? html`<br><span class="muted">${ label( lang, "ruleSource", { source: rule.sourceText } ) }</span>` : null }</td><td>${ rule.errorCode
        ? html`<a href="${ errors }#${ rule.errorCode }">${ rule.errorCode }</a>` : "—" }</td><td>${ rule.since || "—" }</td></tr>\n` ) }</tbody>
</table>`;
};

/**
 * Answers a module's page — its messages by endpoint segment — or the rules' page, every business rule.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string, at: string}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.specPage = async ( context, parts ) => {
    const shown = await findShown( context, parts, [ SPEC_KIND.MODULE, SPEC_KIND.RULES ] );
    if ( shown === null ) {
        return;
    }
    const { lang } = context;
    await answer( context, parts, shown, { address: paths.spec, main: shown.version.kind === SPEC_KIND.RULES ? rulesMain( lang, shown )
        : moduleMain( lang, { spec: parts.spec, at: parts.at, version: shown.version } ) } );
};

/**
 * Answers a module's conditions: every condition of the version, each anchored, with the elements that name it.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string, at: string}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.conditionsPage = async ( context, parts ) => {
    const shown = await findShown( context, parts, [ SPEC_KIND.MODULE ] );
    if ( shown === null ) {
        return;
    }
    const { lang } = context;
    const { spec, at } = parts;
    const { version } = shown;
    // Which elements name each condition, message by message, in document order.
    const uses = new Map();
    for ( const message of version.content.messages ) {
        const slugs = paths.elementSlugs( message );
        const visit = ( node ) => {
            for ( const id of node.conditions ) {
                if ( !uses.has( id ) ) {
                    uses.set( id, new Map() );
                }
                if ( !uses.get( id ).has( message ) ) {
                    uses.get( id ).set( message, [] );
                }
                const name = elementName( node );
                uses.get( id ).get( message ).push( slugs.has( node ) ? html`<a href="${ paths.element( lang, spec, at, message.code, slugs.get( node ) ) }">${ name }</a>` : html`${ name }` );
            }
            node.children.forEach( visit );
        };
        message.elements.forEach( visit );
    }
    const cell = ( id ) => html`${ [ ...( uses.get( id ) || new Map() ) ].map( ( [ message, links ], index ) => html`${ index === 0 ? null : html`<br>` }<a href="${ paths.message( lang, spec, at, message.code ) }">${ message.code }</a>: ${ links.map( ( link, place ) => place === 0 ? link : html`, ${ link }` ) }` ) }`;
    const title = label( lang, "conditions" );
    await answer( context, parts, shown, { address: paths.conditions, title: title, sidebar: moduleSidebar( lang, { spec: spec, at: at, version: version, current: "conditions" } ),
        main: html`<h1>${ title }</h1>
${ conditionsTable( lang, version.content.conditions.map( ( condition ) => ( { id: condition.id, condition: condition, uses: cell( condition.id ) } ) ) ) }` } );
};

/**
 * Answers a module's dictionary: each abbreviation with its name and description, in the page's language or marked.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string, at: string}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.dictionaryPage = async ( context, parts ) => {
    const shown = await findShown( context, parts, [ SPEC_KIND.MODULE ] );
    if ( shown === null ) {
        return;
    }
    const { lang } = context;
    const { version } = shown;
    const title = label( lang, "dictionary" );
    await answer( context, parts, shown, { address: paths.dictionary, title: title,
        sidebar: moduleSidebar( lang, { spec: parts.spec, at: parts.at, version: version, current: "dictionary" } ),
        main: html`<h1>${ title }</h1>
<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnAbbreviation" ) }</th><th scope="col">${ label( lang, "columnName" ) }</th><th scope="col">${ label( lang, "columnDescription" ) }</th></tr></thead>
<tbody>
${ version.content.dictionary.map( ( entry ) => html`<tr id="${ entry.abbreviation }"><td><code>${ entry.abbreviation }</code></td><td>${ localText( entry.name, lang ) }</td><td>${ localText( entry.description, lang ) }</td></tr>\n` ) }</tbody>
</table>` } );
};
