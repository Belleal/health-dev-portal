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
 * The message page's detail panel (plan 8a, decision 7; design record §8.3): the selected element's definition in full —
 * its description, its constraints in words, what it links to, the other messages that have it, and the XML it
 * produces — or, with none selected, the message's own. Its "copy link" names the fixed address, which never moves.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { ELEMENT_KIND, LIFECYCLE, MESSAGE_DIRECTION } = require( "@health-dev-portal/spec-model/kinds" );
const { formatCount, spellConstraint } = require( "#format" );
const { label } = require( "#labels" );
const paths = require( "#paths" );
const { localText } = require( "#text" );
const { elementLinks, elementName, tagOf, typeOf } = require( "./message-tree" );

const joined = ( parts, separator ) => parts.map( ( part, index ) => index === 0 ? part : html`${ separator }${ part }` );

// One term of the panel's list, left out when it has nothing to say rather than shown as an empty line.
const fact = ( term, value ) => value === null || value === undefined || ( Array.isArray( value ) ? value.length === 0 : String( value ) === "" )
    ? null : html`<dt>${ term }</dt><dd>${ value }</dd>\n`;

const copyButton = ( lang, address ) => html`<p><button class="copy" type="button" data-copy="${ address }" data-copied="${ label( lang, "copied" ) }" hidden>${ label( lang, "copyLink" ) }</button></p>`;

/**
 * The XML an element produces (decision 7): a field or a choice as its tag with its value's attribute — the fixed value
 * where there is one — an attribute as its field's tag with that attribute, and a group elided.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} node
 * @returns {string} Plain text: the page escapes it.
 * @public
 */
module.exports.xmlOf = ( node ) => {
    const tag = tagOf( node );
    if ( node.kind === ELEMENT_KIND.GROUP ) {
        return `<nhis:${ tag }>…</nhis:${ tag }>`;
    }
    const value = node.kind !== ELEMENT_KIND.ATTRIBUTE && node.fixedValue !== null && node.fixedValue !== undefined ? node.fixedValue : "…";
    return `<nhis:${ tag } ${ node.attribute || "value" }="${ value }"/>`;
};

// The other messages of the version with an element at the same path, each linked to that element there: the one with
// the same identity where there is one, so that an attribute leads to the attribute rather than to its field, else the
// first at the path.
const usedAlsoIn = ( lang, { spec, at, message, node, messages } ) => {
    if ( typeof node.path !== "string" || node.path === "" ) {
        return [];
    }
    const links = [];
    for ( const other of messages.filter( ( one ) => one !== message ) ) {
        const slugs = paths.elementSlugs( other );
        const nodes = [ ...slugs.keys() ];
        const found = ( node.identity && nodes.find( ( one ) => one.identity === node.identity ) ) || nodes.find( ( one ) => one.path === node.path );
        if ( found ) {
            links.push( html`<a href="${ paths.element( lang, spec, at, other.code, slugs.get( found ) ) }">${ other.code }</a>` );
        }
    }
    return links;
};

/**
 * The panel of the selected element.
 *
 * @method
 * @param {string} lang
 * @param {Object} parts
 * @param {string} parts.spec
 * @param {string} parts.at As the address has it.
 * @param {string} parts.number The version's number, for the fixed address "copy link" gives.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message} parts.message
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} parts.node
 * @param {string} parts.slug The element's slug.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message[]} parts.messages The version's messages.
 * @param {Map<string, string>} parts.linked The number to link of each list and of the rules, `version.linkedNumbers`.
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.elementPanel = ( lang, { spec, at, number, message, node, slug, messages, linked } ) => {
    const links = elementLinks( lang, { spec: spec, at: at, code: message.code, node: node, linked: linked } );
    const lists = node.codeList ? links.slice( 0, 1 ) : [];
    const rules = links.slice( lists.length, lists.length + node.rules.length );
    const conditions = links.slice( lists.length + rules.length );
    const requirement = [ "R", "C", "O" ].includes( node.requirement ) ? html` class="${ node.requirement }"` : null;
    const value = ( text ) => text === null || text === undefined ? null : html`<code>${ text }</code>`;
    const facts = [
        fact( label( lang, "columnConstraints" ), joined( spellConstraint( node, lang ).map( ( words ) => html`${ words }` ), html`<br>` ) ),
        fact( label( lang, "panelCodeList" ), lists ),
        fact( label( lang, "panelRules" ), joined( rules, html` ` ) ),
        fact( label( lang, "panelConditions" ), joined( conditions, html` ` ) ),
        fact( label( lang, "panelDefault" ), value( node.defaultValue ) ),
        fact( label( lang, "panelFixed" ), value( node.fixedValue ) ),
        fact( label( lang, "panelUsedAlsoIn" ), joined( usedAlsoIn( lang, { spec: spec, at: at, message: message, node: node, messages: messages } ), html` ` ) )
    ];
    return html`<h2><code>${ elementName( node ) }</code></h2>
<p class="name">${ localText( node.name, lang ) }</p>
<p class="description">${ localText( node.description, lang ) }</p>
<dl class="facts">
<dt>${ label( lang, "panelPath" ) }</dt><dd><code>${ node.identity || node.path || "—" }</code></dd>
<dt>${ label( lang, "columnRequirement" ) }</dt><dd${ requirement }>${ node.requirement || "—" } · ${ formatCount( node.cardinality ) || "—" }</dd>
<dt>${ label( lang, "columnType" ) }</dt><dd>${ typeOf( node, lang ) }</dd>
${ facts }</dl>
<h3>${ label( lang, "panelXml" ) }</h3>
<pre>${ module.exports.xmlOf( node ) }</pre>
${ copyButton( lang, paths.element( lang, spec, number, message.code, slug ) ) }`;
};

/**
 * What a message is and where it goes, said once: its kind, and the message it answers or is answered by, linked when
 * this version has it.
 *
 * @method
 * @param {string} lang
 * @param {Object} parts
 * @param {string} parts.spec
 * @param {string} parts.at
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message} parts.message
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message[]} parts.messages
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.messageKind = ( lang, { spec, at, message, messages } ) => {
    const parts = [];
    if ( message.direction === MESSAGE_DIRECTION.REQUEST ) {
        parts.push( html`${ label( lang, "directionRequest" ) }` );
    } else if ( message.direction === MESSAGE_DIRECTION.RESPONSE ) {
        parts.push( html`${ label( lang, "directionResponse" ) }` );
    }
    if ( message.pairedWith ) {
        const paired = messages.some( ( one ) => one.code === message.pairedWith )
            ? html`<a href="${ paths.message( lang, spec, at, message.pairedWith ) }">${ message.pairedWith }</a>` : html`${ message.pairedWith }`;
        parts.push( html`${ message.direction === MESSAGE_DIRECTION.RESPONSE ? label( lang, "respondsTo" ) : label( lang, "respondedBy" ) } ${ paired }` );
    }
    if ( message.lifecycle === LIFECYCLE.WITHDRAWN ) {
        parts.push( html`<strong>${ label( lang, "lifecycleWithdrawn" ) }</strong>` );
    } else if ( message.lifecycle === LIFECYCLE.IN_DEVELOPMENT ) {
        parts.push( html`<strong>${ label( lang, "lifecycleInDevelopment" ) }</strong>` );
    }
    return html`${ joined( parts, html` · ` ) }`;
};

/**
 * The panel of a message, when no element is selected.
 *
 * @method
 * @param {string} lang
 * @param {Object} parts
 * @param {string} parts.spec
 * @param {string} parts.at
 * @param {string} parts.number
 * @param {string} parts.tab The tab shown, whose fixed address "copy link" gives.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message} parts.message
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message[]} parts.messages
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.messagePanel = ( lang, { spec, at, number, tab, message, messages } ) => {
    // The workbooks name the parties in Bulgarian only, as plain text rather than a text in both languages.
    const party = ( text ) => text ? html`<span lang="bg">${ text }</span>` : null;
    let count = 0;
    const walk = ( nodes ) => nodes.forEach( ( node ) => {
        count += 1;
        walk( node.children );
    } );
    walk( message.elements );
    const facts = [
        fact( label( lang, "panelAddress" ), message.address ? html`<code>${ message.address }</code>` : null ),
        fact( label( lang, "columnDirection" ), module.exports.messageKind( lang, { spec: spec, at: at, message: message, messages: messages } ) ),
        fact( label( lang, "panelSender" ), party( message.sender ) ),
        fact( label( lang, "panelRecipient" ), party( message.recipient ) ),
        fact( label( lang, "tabElements" ), String( count ) )
    ];
    return html`<h2>${ message.code }</h2>
<p>${ localText( message.title, lang ) }</p>
<dl class="facts">
${ facts }</dl>
${ copyButton( lang, paths.message( lang, spec, number, message.code, tab ) ) }`;
};
