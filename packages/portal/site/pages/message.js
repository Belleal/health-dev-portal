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
 * The message page (plan 8a, decision 7; design record §8.3, mockup M1), `/{lang}/specs/{spec}/{at}/{code}` and its
 * Conditions and Changes tabs, and `…/{code}/elements/{path…}` with one element selected: every element has an address
 * of its own (decision 3). The stage switcher in the band, the module's messages in the sidebar, the heading, the tabs
 * and the tree table in the main column, the detail panel on the right. The tree is message-tree.js, the panel
 * message-panel.js.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { CHANGE_CATEGORY, SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { formatCount } = require( "#format" );
const { label, otherLanguage } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { notFound, send } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { localText } = require( "#text" );
const { elementPanel, messageKind, messagePanel } = require( "./message-panel" );
const { elementMarkers, elementName, treeTable } = require( "./message-tree" );
const { conditionsTable, findShown, moduleSidebar, plannedOn, resolvedNumbers, stageBand, stageVersions } = require( "./version" );

const TABS = Object.freeze( [
    { tab: "elements", name: ( lang ) => label( lang, "tabElements" ) },
    { tab: "conditions", name: ( lang ) => label( lang, "tabConditions" ) },
    { tab: "changes", name: ( lang ) => label( lang, "tabChanges" ) }
] );

const walk = ( nodes, out = [] ) => {
    for ( const node of nodes ) {
        out.push( node );
        walk( node.children, out );
    }
    return out;
};

// A model text as plain text, for the document's title, where no marker can go: the page's language, else the other.
const plain = ( value, lang ) => value ? value[ lang ] || value[ otherLanguage( lang ) ] || "" : "";

// The Conditions tab: the conditions the message's elements name, in the order the tree first names them, each with
// the elements of this message that name it.
const conditionsTab = ( lang, { spec, at, message, content } ) => {
    const slugs = paths.elementSlugs( message );
    const nodes = walk( message.elements );
    const named = [ ...new Set( nodes.flatMap( ( node ) => node.conditions ) ) ];
    if ( named.length === 0 ) {
        return html`<p>${ label( lang, "conditionsNone" ) }</p>`;
    }
    return conditionsTable( lang, named.map( ( id ) => ( {
        id: id,
        condition: content.conditions.find( ( one ) => one.id === id ) || null,
        uses: html`${ nodes.filter( ( node ) => node.conditions.includes( id ) ).map( ( node, index ) => {
            const name = elementName( node );
            const link = slugs.has( node ) ? html`<a href="${ paths.element( lang, spec, at, message.code, slugs.get( node ) ) }">${ name }</a>` : html`${ name }`;
            return index === 0 ? link : html`, ${ link }`;
        } ) }`
    } ) ) );
};

// A value a difference names, as a reader reads it. An added or removed element is the row itself, and a move names its
// parents' internal keys, so neither shows a value.
const shownValue = ( lang, difference, value ) => {
    if ( value === null || value === undefined || [ "added", "removed", "moved" ].includes( difference.aspect ) ) {
        return html`—`;
    }
    if ( difference.aspect === "cardinality" ) {
        return html`${ formatCount( value ) }`;
    }
    if ( difference.aspect === "constraint" ) {
        return html`<code>${ value.raw }</code>`;
    }
    if ( typeof value === "object" && !Array.isArray( value ) && Object.hasOwn( value, "bg" ) && Object.hasOwn( value, "en" ) ) {
        return localText( value, lang );
    }
    if ( Array.isArray( value ) ) {
        return html`${ value.join( ", " ) }`;
    }
    return typeof value === "object" ? html`<code>${ JSON.stringify( value ) }</code>` : html`${ String( value ) }`;
};

const ASPECTS = Object.freeze( {
    added: ( lang ) => label( lang, "markerNew" ),
    removed: ( lang ) => label( lang, "markerRemoved" ),
    moved: ( lang ) => label( lang, "markerMoved" )
} );

// The Changes tab (decision 7): on a version in testing, how the message differs from production's, item by item,
// with the comparison of the two versions and the changelog a link away. Any other version says where its changes are.
const changesTab = ( lang, { spec, version, production, markers } ) => {
    const changelog = html`<p><a href="${ paths.changes( lang, spec ) }">${ label( lang, "changelog" ) }</a></p>`;
    if ( markers === null ) {
        return html`<p>${ label( lang, "changesNotTesting" ) }</p>
${ changelog }`;
    }
    const compare = production ? html`<p><a href="${ paths.compare( lang, spec, production.number, version.number ) }">${ label( lang, "compareWithProduction" ) }</a></p>\n` : null;
    const rows = markers.differences.map( ( difference ) => html`<tr><td><code>${ difference.identity || "—" }</code></td><td>${ Object.hasOwn( ASPECTS, difference.aspect )
        ? ASPECTS[ difference.aspect ]( lang ) : html`<code>${ difference.aspect }</code>` }</td><td>${ shownValue( lang, difference, difference.before ) }</td><td>${ shownValue( lang, difference, difference.after ) }</td><td>${ difference.category === CHANGE_CATEGORY.BREAKING
        ? html`<strong>${ label( lang, "categoryBreaking" ) }</strong>` : label( lang, "categoryNonBreaking" ) }</td></tr>\n` );
    return html`<h2>${ label( lang, "changesAgainst", { number: production ? production.number : "—" } ) }</h2>
${ compare }${ rows.length === 0 ? html`<p>${ label( lang, "changesNone" ) }</p>` : html`<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnElement" ) }</th><th scope="col">${ label( lang, "columnChange" ) }</th><th scope="col">${ label( lang, "columnBefore" ) }</th><th scope="col">${ label( lang, "columnAfter" ) }</th><th scope="col">${ label( lang, "columnCategory" ) }</th></tr></thead>
<tbody>
${ rows }</tbody>
</table>` }
${ changelog }`;
};

/**
 * Answers a message's page: its Elements tab, with or without an element selected, or its Conditions or Changes tab.
 * An unknown message, or an element slug the message does not give, is the 404 page.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string, at: string, code: string, tab: string, slug: string|null}} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.messagePage = async ( context, parts ) => {
    const { db, lang, request, response, nonce } = context;
    const { spec, at, code, tab, slug } = parts;
    const shown = await findShown( context, parts, [ SPEC_KIND.MODULE ] );
    if ( shown === null ) {
        return;
    }
    const { version } = shown;
    const content = version.content;
    const message = content.messages.find( ( one ) => one.code === code );
    const slugs = message ? paths.elementSlugs( message ) : new Map();
    const selected = slug === null ? null : [ ...slugs ].find( ( [ , one ] ) => one === slug );
    if ( !message || selected === undefined ) {
        notFound( request, response );
        return;
    }
    const node = selected === null ? null : selected[ 0 ];
    const stages = await stageVersions( db, spec );
    const production = stages.find( ( one ) => one.stage === STAGE.PRODUCTION );
    // Only a testing page is marked, against production; production lacking the message, or having nothing at all,
    // makes every element new (§8.3).
    const markers = version.stage === STAGE.TESTING
        ? elementMarkers( production ? production.version.content.messages.find( ( one ) => one.code === code ) || null : null, message ) : null;
    const resolved = await resolvedNumbers( db, version );

    const here = ( where ) => node === null ? paths.message( lang, spec, where, code, tab ) : paths.element( lang, spec, where, code, slug );
    // The same page at another stage: the same element or tab where that version has them, else the message, else the
    // module.
    const elsewhere = ( stage, other ) => {
        const there = other.content.messages.find( ( one ) => one.code === code );
        if ( !there ) {
            return paths.spec( lang, spec, stage );
        }
        return node !== null && [ ...paths.elementSlugs( there ).values() ].includes( slug ) ? paths.element( lang, spec, stage, code, slug ) : paths.message( lang, spec, stage, code, tab );
    };
    const band = stageBand( lang, { stages: stages, version: version, address: elsewhere,
        planned: version.stage === STAGE.TESTING ? await plannedOn( db, version ) : null } );

    const tabs = TABS.map( ( one ) => one.tab === tab
        ? html`<li><a href="${ paths.message( lang, spec, at, code, one.tab ) }" aria-current="page">${ one.name( lang ) }</a></li>`
        : html`<li><a href="${ paths.message( lang, spec, at, code, one.tab ) }">${ one.name( lang ) }</a></li>` );
    let body;
    if ( tab === "conditions" ) {
        body = conditionsTab( lang, { spec: spec, at: at, message: message, content: content } );
    } else if ( tab === "changes" ) {
        body = changesTab( lang, { spec: spec, version: version, production: production ? production.version : null, markers: markers } );
    } else {
        body = treeTable( { lang: lang, spec: spec, at: at, message: message, markers: markers, selected: node, resolved: resolved } );
    }
    const kind = messageKind( lang, { spec: spec, at: at, message: message, messages: content.messages } );
    const main = html`<h1>${ message.code } · ${ localText( message.title, lang ) }</h1>
<p class="address">${ message.address ? html`<code>${ message.address }</code> · ` : null }${ kind }</p>
<nav aria-label="${ label( lang, "messageTabs" ) }"><ul class="tabs">${ tabs }</ul></nav>
${ body }`;
    const panel = node === null
        ? messagePanel( lang, { spec: spec, at: at, number: version.number, tab: tab, message: message, messages: content.messages } )
        : elementPanel( lang, { spec: spec, at: at, number: version.number, message: message, node: node, slug: slug, messages: content.messages, resolved: resolved } );
    const title = `${ node === null ? `${ message.code } · ${ plain( message.title, lang ) }` : `${ elementName( node ) } · ${ message.code }` } · ${ specName( spec, lang ) } ${ version.number }`;
    send( response, { cache: shown.cache, body: page( { lang: lang, title: title, path: here( at ), canonical: here( version.number ), section: "specs", band: band,
        sidebar: moduleSidebar( lang, { spec: spec, at: at, version: version, code: code } ), main: main, panel: panel, nonce: nonce } ) } );
};
