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

const { CHANGE_CATEGORY, SPEC_KIND } = require( "#kinds" );

const BREAKING = CHANGE_CATEGORY.BREAKING;
const NON_BREAKING = CHANGE_CATEGORY.NON_BREAKING;

// Where an item was read or sits, the tab colour's claim, and what is derived from a condition's text: none of them is
// what the item says, so none is compared.
const NEVER_COMPARED = new Set( [ "source", "depth", "path", "changedInVersion", "parsed", "printed" ] );

// The same value, whatever order its keys were written in: an edited item and an imported one differ in key order.
const canonical = ( value ) => {
    if ( Array.isArray( value ) ) {
        return `[${ value.map( canonical ).join( "," ) }]`;
    }
    if ( value && typeof value === "object" ) {
        return `{${ Object.keys( value ).sort().map( ( key ) => `${ JSON.stringify( key ) }:${ canonical( value[ key ] ) }` ).join( "," ) }}`;
    }
    return JSON.stringify( value === undefined ? null : value );
};
const same = ( a, b ) => canonical( a ) === canonical( b );

const own = ( node, ...children ) => Object.fromEntries( Object.entries( node ).filter( ( [ field ] ) => !children.includes( field ) ) );

/**
 * Every keyed item of a content (design record §4.3): its key, its own fields without children, its parent's key and
 * its place among its siblings. A repeated identity is told apart by its occurrence in document order (HEL-19), and an
 * element with no identity by its parent and place. Bindings are derived and have no key.
 *
 * @method
 * @param {string} kind One of `SPEC_KIND`: module, code-list or rules.
 * @param {Object} content
 * @returns {Map<string, {kind: string, identity: string|null, data: Object, parent: string|null, position: number, node: Object}>}
 *     In document order. `node` is the content's own object.
 * @public
 */
module.exports.itemKeys = ( kind, content ) => {
    const items = new Map();
    const occurrences = new Map();
    const numbered = ( scope ) => {
        const next = ( occurrences.get( scope ) || 0 ) + 1;
        occurrences.set( scope, next );
        return next;
    };
    // A code, ID, abbreviation or title is a key on its own. A repeat of one is reported (duplicate-message and the like)
    // and loaded as published, so it takes its occurrence: under the first's key the Map kept only the last, and replacing
    // the content deleted the first and moved its elements under the other.
    const counted = ( key ) => {
        const occurrence = numbered( key );
        return occurrence === 1 ? key : `${ key }#${ occurrence }`;
    };
    const add = ( key, itemKind, identity, data, parent, position, node ) => {
        items.set( key, { kind: itemKind, identity: identity === undefined ? null : identity, data: data, parent: parent, position: position, node: node } );
        return key;
    };
    if ( kind === SPEC_KIND.MODULE ) {
        const element = ( node, code, parent, position ) => {
            const key = node.identity
                ? `element:${ code }:${ node.identity }#${ numbered( `element:${ code }:${ node.identity }` ) }`
                : `element:${ parent }@${ position }`;
            add( key, "element", node.identity, own( node, "children" ), parent, position, node );
            node.children.forEach( ( child, index ) => element( child, code, key, index ) );
        };
        content.messages.forEach( ( message, index ) => {
            const key = add( counted( `message:${ message.code }` ), "message", message.code, own( message, "elements" ), null, index, message );
            message.elements.forEach( ( node, position ) => element( node, message.code, key, position ) );
        } );
        content.conditions.forEach( ( condition, index ) => add( counted( `condition:${ condition.id }` ), "condition", condition.id, condition, null, index, condition ) );
        content.dictionary.forEach( ( entry, index ) => add( counted( `dictionary:${ entry.abbreviation }` ), "dictionary", entry.abbreviation, entry, null, index, entry ) );
    } else if ( kind === SPEC_KIND.CODE_LIST ) {
        const list = add( `list:${ content.list.id }`, "list", content.list.id, own( content.list, "columns", "entries" ), null, 0, content.list );
        content.list.columns.forEach( ( column, index ) => add( counted( `column:${ column.title }` ), "column", column.title, column, list, index, column ) );
        content.list.entries.forEach( ( entry, index ) => add( `entry:${ entry.key }#${ numbered( `entry:${ entry.key }` ) }`, "entry", entry.key, entry, list, index, entry ) );
    } else {
        content.rules.forEach( ( rule, index ) => add( counted( `rule:${ rule.id }` ), "rule", rule.id, rule, null, index, rule ) );
    }
    return items;
};

// A constraint narrows when a bound is added or tightened, or a character class or format is added or changed.
const narrows = ( before, after ) => {
    const b = before || {};
    const a = after || {};
    const tighter = ( field, lower ) => a[ field ] !== undefined && ( b[ field ] === undefined || ( lower ? a[ field ] < b[ field ] : a[ field ] > b[ field ] ) );
    const changed = ( field ) => a[ field ] !== undefined && a[ field ] !== b[ field ];
    return tighter( "maxLength", true ) || tighter( "maxValue", true ) || tighter( "minLength", false ) || tighter( "minValue", false ) || changed( "charset" ) || changed( "format" );
};
const added = ( before, after ) => ( after || [] ).some( ( value ) => !( before || [] ).includes( value ) );

// Proposed categories (plan 6a, decision 8); dropped-plan is never proposed (design record §7.5).
const FIELD_RULES = {
    message: ( field, before, after ) => {
        if ( [ "address", "direction", "sender", "recipient", "pairedWith" ].includes( field ) ) {
            return BREAKING;
        }
        return field === "lifecycle" && after === "withdrawn" ? BREAKING : NON_BREAKING;
    },
    element: ( field, before, after ) => {
        switch ( field ) {
            case "cardinality": {
                const b = before || { min: 0, max: null };
                const a = after || { min: 0, max: null };
                const lowered = a.max !== null && ( b.max === null || a.max < b.max );
                return a.min > b.min || lowered ? BREAKING : NON_BREAKING;
            }
            case "requirement":
                return after === "R" && before !== "R" ? BREAKING : NON_BREAKING;
            case "constraint":
                return narrows( before, after ) ? BREAKING : NON_BREAKING;
            case "fixedValue":
                return after !== null && after !== undefined ? BREAKING : NON_BREAKING;
            case "rules":
            case "conditions":
                return added( before, after ) ? BREAKING : NON_BREAKING;
            case "kind":
            case "dataType":
            case "tag":
            case "attribute":
            case "codeList":
                return BREAKING;
            default:
                return NON_BREAKING;
        }
    },
    condition: ( field ) => field === "text" ? BREAKING : NON_BREAKING,
    dictionary: () => NON_BREAKING,
    list: ( field, before, after ) => field === "keyType" || ( field === "status" && after === "removed" ) ? BREAKING : NON_BREAKING,
    column: () => NON_BREAKING,
    entry: ( field, before, after ) => field === "validUntil" && after !== null && after !== undefined && ( before === null || before === undefined ) ? BREAKING : NON_BREAKING,
    // A rule withdrawn loosens; one changed constrains differently.
    rule: ( field ) => field === "definition" || field === "errorCode" ? BREAKING : NON_BREAKING
};

const ADDED = {
    element: ( data ) => data.requirement === "R" && data.cardinality && data.cardinality.min > 0 ? BREAKING : NON_BREAKING,
    // A new condition or business rule constrains senders (plan 6a, decision 8).
    condition: () => BREAKING,
    rule: () => BREAKING
};
// A removed condition loosens; everything else removed is breaking (design record §7.5).
const REMOVED = { condition: () => NON_BREAKING, dictionary: () => NON_BREAKING };
// An element's order is the XSD's sequence (design record §4.10); anything else moving is presentation.
const MOVED = { element: () => BREAKING };

const difference = ( key, item, aspect, before, after, category ) => ( { key: `${ key }|${ aspect }`, target: item.kind, identity: item.identity, aspect: aspect,
    before: before === undefined ? null : before, after: after === undefined ? null : after, category: category } );

// The items kept in both contents that moved: a changed parent, or, among siblings kept under the same parent, the fewest
// whose taking out leaves the rest in their old order (outside a longest increasing run of old positions). An insertion
// or removal moves no one, and a swap of two moves one, not three.
const movedKeys = ( before, after, kept ) => {
    const moved = new Set();
    const siblings = new Map();
    for ( const [ key, item ] of after ) {
        if ( !kept.has( key ) ) {
            continue;
        }
        if ( before.get( key ).parent !== item.parent ) {
            moved.add( key );
            continue;
        }
        siblings.set( item.parent, [ ...( siblings.get( item.parent ) || [] ), key ] );
    }
    const order = new Map( [ ...before.keys() ].map( ( key, index ) => [ key, index ] ) );
    for ( const keys of siblings.values() ) {
        // Patience sorting: tails[ k ] ends the best run of length k + 1; links reconstruct it.
        const tails = [];
        const links = new Map();
        for ( const key of keys ) {
            let low = 0;
            let high = tails.length;
            while ( low < high ) {
                const middle = ( low + high ) >> 1;
                if ( order.get( tails[ middle ] ) < order.get( key ) ) {
                    low = middle + 1;
                } else {
                    high = middle;
                }
            }
            links.set( key, low > 0 ? tails[ low - 1 ] : null );
            tails[ low ] = key;
        }
        const inOrder = new Set();
        for ( let key = tails[ tails.length - 1 ]; key; key = links.get( key ) ) {
            inOrder.add( key );
        }
        keys.filter( ( key ) => !inOrder.has( key ) ).forEach( ( key ) => moved.add( key ) );
    }
    return moved;
};

/**
 * The differences between a version and its base, one per item key and aspect (design record §7.5). An aspect is
 * `added`, `removed`, `moved`, or a field that changed; each has a proposed category, never dropped-plan. They come in
 * the current content's document order, then the removals in the base's. With no base, every item is added.
 *
 * @method
 * @param {string} kind One of `SPEC_KIND`: module, code-list or rules.
 * @param {Object|null} base
 * @param {Object} current
 * @returns {import( "#definitions" ).Difference[]}
 * @public
 */
module.exports.compareContents = ( kind, base, current ) => {
    const before = base ? module.exports.itemKeys( kind, base ) : new Map();
    const after = module.exports.itemKeys( kind, current );
    const kept = new Set( [ ...after.keys() ].filter( ( key ) => before.has( key ) ) );
    const moved = movedKeys( before, after, kept );
    const differences = [];
    for ( const [ key, item ] of after ) {
        if ( !before.has( key ) ) {
            differences.push( difference( key, item, "added", null, item.data, ( ADDED[ item.kind ] || ( () => NON_BREAKING ) )( item.data ) ) );
            continue;
        }
        const old = before.get( key );
        if ( moved.has( key ) ) {
            differences.push( difference( key, item, "moved", old.parent, item.parent, ( MOVED[ item.kind ] || ( () => NON_BREAKING ) )() ) );
        }
        const fields = [ ...Object.keys( item.data ), ...Object.keys( old.data ).filter( ( field ) => !( field in item.data ) ) ];
        for ( const field of fields.filter( ( name ) => !NEVER_COMPARED.has( name ) ) ) {
            if ( !same( old.data[ field ], item.data[ field ] ) ) {
                differences.push( difference( key, item, field, old.data[ field ], item.data[ field ], FIELD_RULES[ item.kind ]( field, old.data[ field ], item.data[ field ] ) ) );
            }
        }
    }
    for ( const [ key, item ] of before ) {
        if ( !after.has( key ) ) {
            differences.push( difference( key, item, "removed", item.data, null, ( REMOVED[ item.kind ] || ( () => BREAKING ) )() ) );
        }
    }
    return differences;
};
