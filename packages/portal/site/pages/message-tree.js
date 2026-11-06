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
 * The message page's tree table (plan 8a, decision 7; design record §8.3, mockup M1): every element of a message in
 * document order, one row each, indented by depth, each a link to its own address; and on a version in testing, each
 * element marked new, changed or removed against production. Without the script the tree is shown fully expanded; the
 * script only adds collapsing, through the toggles rendered hidden here.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { compareContents, itemKeys } = require( "@health-dev-portal/spec-model/differences" );
const { ELEMENT_KIND, SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { describeConstraint, formatCount } = require( "#format" );
const { label } = require( "#labels" );
const paths = require( "#paths" );

/**
 * The tag an element is written with: its own, or for a choice, which has none, the last segment of its path.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} node
 * @returns {string}
 * @public
 */
module.exports.tagOf = ( node ) => node.tag || ( typeof node.path === "string" && node.path !== "" ? node.path.split( "/" ).at( -1 ) : "—" );

/**
 * An element's name where it stands alone, out of the tree: its tag, and an attribute's as `tag@attribute`, since
 * outside the tree nothing shows which field it belongs to.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} node
 * @returns {string}
 * @public
 */
module.exports.elementName = ( node ) => node.kind === ELEMENT_KIND.ATTRIBUTE ? `${ module.exports.tagOf( node ) }@${ node.attribute }` : module.exports.tagOf( node );

// One message as a whole content, so that the comparison and its keys cover that message alone: `itemKeys` names an
// element by its message's code and its identity's occurrence in that message, so the keys are the ones the whole
// content's would be, and the rest of the version is not compared on every request.
const alone = ( message ) => ( { messages: [ message ], conditions: [], dictionary: [] } );

/**
 * Marks a message's elements against production's (decision 7): `compareContents` on the message alone, each element
 * difference matched to its element by the item key both share. An element production lacks is new; one with any field
 * changed, or moved among its siblings, is changed; one only production has is removed, and is placed under its former
 * parent.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message|null} base Production's message; `null` when
 *     production has none, and so everything is new.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message} current
 * @returns {import( "#definitions" ).ElementMarkers}
 * @public
 */
module.exports.elementMarkers = ( base, current ) => {
    const now = itemKeys( SPEC_KIND.MODULE, alone( current ) );
    const before = base ? itemKeys( SPEC_KIND.MODULE, alone( base ) ) : new Map();
    const differences = compareContents( SPEC_KIND.MODULE, base ? alone( base ) : null, alone( current ) );
    const marks = new Map();
    const removed = new Map();
    for ( const difference of differences.filter( ( one ) => one.target === "element" ) ) {
        // An identity may hold "|" no more than "#": the aspect is what follows the last bar.
        const key = difference.key.slice( 0, difference.key.lastIndexOf( "|" ) );
        if ( difference.aspect === "removed" ) {
            const item = before.get( key );
            if ( !removed.has( item.parent ) ) {
                removed.set( item.parent, [] );
            }
            removed.get( item.parent ).push( { key: key, node: item.node } );
        } else if ( difference.aspect === "added" ) {
            marks.set( now.get( key ).node, "new" );
        } else if ( !marks.has( now.get( key ).node ) ) {
            marks.set( now.get( key ).node, "changed" );
        }
    }
    const keys = new Map( [ ...now ].filter( ( [ , item ] ) => item.kind === "element" ).map( ( [ key, item ] ) => [ item.node, key ] ) );
    const root = [ ...now ].find( ( [ , item ] ) => item.kind === "message" )[ 0 ];
    return { marks: marks, removed: removed, keys: keys, root: root, differences: differences };
};

const REQUIREMENTS = Object.freeze( {
    R: ( lang ) => label( lang, "requirementR" ),
    C: ( lang ) => label( lang, "requirementC" ),
    O: ( lang ) => label( lang, "requirementO" )
} );

/**
 * A requirement's cell: the letter, with what it means in a `title`, classed for its colour.
 *
 * @method
 * @param {string|null} requirement `R`, `C`, `O` or `null`.
 * @param {string} lang
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.requirementCell = ( requirement, lang ) => Object.hasOwn( REQUIREMENTS, requirement )
    ? html`<td class="${ requirement }"><abbr title="${ REQUIREMENTS[ requirement ]( lang ) }">${ requirement }</abbr></td>`
    : html`<td></td>`;

/**
 * An element's type as a reader names it: its data type, or that it is a group or a choice.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} node
 * @param {string} lang
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.typeOf = ( node, lang ) => {
    if ( node.kind === ELEMENT_KIND.GROUP ) {
        return html`<span class="muted">${ label( lang, "typeGroup" ) }</span>`;
    }
    if ( node.kind === ELEMENT_KIND.POLYMORPHIC ) {
        return html`<span class="muted">${ label( lang, "typeChoice" ) }</span>`;
    }
    return html`${ node.dataType || "" }`;
};

/**
 * Each link of an element (decision 7, as ruling F2 corrects it): its code list and each business rule at the fixed
 * address of the version in the stage the page shows (design record §4.8), and each condition at its anchor on the
 * message's Conditions tab. A list or the rules with no version there is named without a link.
 *
 * @method
 * @param {string} lang
 * @param {Object} parts
 * @param {string} parts.spec
 * @param {string} parts.at
 * @param {string} parts.code
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} parts.node
 * @param {Map<string, string>} parts.linked The number to link of each spec, `version.linkedNumbers`.
 * @returns {import( "@ti-engine/web-content/html" ).SafeString[]}
 * @public
 */
module.exports.elementLinks = ( lang, { spec, at, code, node, linked } ) => {
    const links = [];
    if ( node.codeList ) {
        links.push( linked.has( node.codeList ) ? html`<a href="${ paths.list( lang, node.codeList, linked.get( node.codeList ) ) }">${ node.codeList }</a>` : html`${ node.codeList }` );
    }
    for ( const rule of node.rules ) {
        links.push( linked.has( "rules" ) ? html`<a href="${ paths.spec( lang, "rules", linked.get( "rules" ) ) }#${ rule }">${ rule }</a>` : html`${ rule }` );
    }
    for ( const condition of node.conditions ) {
        links.push( html`<a href="${ paths.message( lang, spec, at, code, "conditions" ) }#${ condition }">${ condition }</a>` );
    }
    return links;
};

const MARKERS = Object.freeze( {
    new: ( lang ) => label( lang, "markerNew" ),
    changed: ( lang ) => label( lang, "markerChanged" ),
    removed: ( lang ) => label( lang, "markerRemoved" )
} );
const badge = ( lang, marker ) => html` <span class="badge ${ marker }">${ MARKERS[ marker ]( lang ) }</span>`;
const joined = ( parts ) => parts.map( ( part, index ) => index === 0 ? part : html` ${ part }` );

/**
 * The tree table of a message.
 *
 * @method
 * @param {Object} parts
 * @param {string} parts.lang
 * @param {string} parts.spec
 * @param {string} parts.at As the address has it: every link keeps to the stage or the number the reader chose.
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message} parts.message
 * @param {import( "#definitions" ).ElementMarkers|null} parts.markers `null` on a page that is not marked: any but testing's.
 * @param {Object|null} parts.selected The element selected, its row marked `aria-current`.
 * @param {Map<string, string>} parts.linked
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.treeTable = ( { lang, spec, at, message, markers, selected, linked } ) => {
    const slugs = paths.elementSlugs( message );
    const rows = [];
    // Hidden: without the script it could do nothing, and the tree is whole (decision 6).
    const toggle = ( node, nested ) => nested
        ? html`<button class="twisty" type="button" data-toggle aria-expanded="true" aria-label="${ label( lang, "nestedOf", { tag: module.exports.tagOf( node ) } ) }" hidden></button>` : null;
    // In the tree an attribute stands under its field, so its own name is enough.
    const tagCell = ( node ) => html`<code>${ node.kind === ELEMENT_KIND.ATTRIBUTE ? `@${ node.attribute }` : module.exports.tagOf( node ) }</code>`;
    // The cells after the first: requirement, count, type, constraints.
    const facts = ( node ) => html`${ module.exports.requirementCell( node.requirement, lang ) }<td>${ formatCount( node.cardinality ) }</td><td>${ module.exports.typeOf( node, lang ) }</td><td>${ describeConstraint( node, lang ) }</td>`;
    // A removed element, and under it whatever else was removed from under it, struck through and with no link: it has
    // no address in this version.
    const removedRow = ( { key, node }, depth ) => {
        const under = markers.removed.get( key ) || [];
        rows.push( html`<tr class="removed" data-depth="${ depth }" data-path="${ node.path || "" }"><td>${ toggle( node, under.length > 0 ) }${ tagCell( node ) }${ badge( lang, "removed" ) }</td>${ facts( node ) }<td></td></tr>\n` );
        under.forEach( ( child ) => removedRow( child, depth + 1 ) );
    };
    const removedUnder = ( key, depth ) => {
        for ( const item of markers ? markers.removed.get( key ) || [] : [] ) {
            removedRow( item, depth );
        }
    };
    const row = ( node, depth ) => {
        const slug = slugs.get( node );
        const name = slug === undefined ? tagCell( node ) : html`<a href="${ paths.element( lang, spec, at, message.code, slug ) }">${ tagCell( node ) }</a>`;
        const nested = node.children.length > 0 || ( markers !== null && markers.removed.has( markers.keys.get( node ) ) );
        const marker = markers !== null && markers.marks.has( node ) ? badge( lang, markers.marks.get( node ) ) : null;
        const current = node === selected ? html` aria-current="true"` : null;
        const links = module.exports.elementLinks( lang, { spec: spec, at: at, code: message.code, node: node, linked: linked } );
        rows.push( html`<tr${ current } data-depth="${ depth }" data-path="${ node.path || "" }"><td>${ toggle( node, nested ) }${ name }${ marker }</td>${ facts( node ) }<td>${ joined( links ) }</td></tr>\n` );
        node.children.forEach( ( child ) => row( child, depth + 1 ) );
        // After the parent's current children, what was removed from under it (§8.3).
        if ( markers !== null ) {
            removedUnder( markers.keys.get( node ), depth + 1 );
        }
    };
    message.elements.forEach( ( node ) => row( node, 1 ) );
    if ( markers !== null ) {
        removedUnder( markers.root, 1 );
    }
    return html`<table class="rows tree">
<thead><tr><th scope="col">${ label( lang, "columnElement" ) }</th><th scope="col"><abbr title="${ label( lang, "columnRequirement" ) }">R/C/O</abbr></th><th scope="col">${ label( lang, "columnCount" ) }</th><th scope="col">${ label( lang, "columnType" ) }</th><th scope="col">${ label( lang, "columnConstraints" ) }</th><th scope="col">${ label( lang, "columnLinks" ) }</th></tr></thead>
<tbody>
${ rows }</tbody>
</table>`;
};
