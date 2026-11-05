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

const crypto = require( "node:crypto" );
const { itemKeys } = require( "@health-dev-portal/spec-model/differences" );
const { SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { decodeRows } = require( "#items" );

const sha256 = ( text ) => crypto.createHash( "sha256" ).update( text ).digest( "hex" );

// The same value whatever order its keys were written in: stored data and an edited item may differ only in that.
const canonical = ( value ) => {
    if ( Array.isArray( value ) ) {
        return `[${ value.map( canonical ).join( "," ) }]`;
    }
    if ( value && typeof value === "object" ) {
        return `{${ Object.keys( value ).sort().map( ( key ) => `${ JSON.stringify( key ) }:${ canonical( value[ key ] ) }` ).join( "," ) }}`;
    }
    return JSON.stringify( value === undefined ? null : value );
};

// Bindings are derived, but matched by their identity like any item, so a save that leaves them as they were moves none.
const BINDINGS = Object.freeze( [
    [ "condition-binding", "conditionBindings", ( binding ) => `${ binding.message } ${ binding.element } ${ binding.condition }` ],
    [ "blueprint-binding", "blueprintBindings", ( binding ) => `${ binding.message } ${ binding.element }` ]
] );

// Every item of a content under its key (plan 6a, decision 4), with the content's own object as `node`.
const keyedItems = ( kind, content ) => {
    const items = itemKeys( kind, content );
    if ( kind === SPEC_KIND.MODULE ) {
        for ( const [ itemKind, field, identityOf ] of BINDINGS ) {
            const seen = new Map();
            content[ field ].forEach( ( binding, index ) => {
                const identity = identityOf( binding );
                const occurrence = ( seen.get( identity ) || 0 ) + 1;
                seen.set( identity, occurrence );
                items.set( `${ itemKind }:${ identity }#${ occurrence }`, { kind: itemKind, identity: identity, data: binding, parent: null, position: index, node: binding } );
            } );
        }
    }
    return items;
};

/**
 * Whether two items' stored data hold the same fields and values, whatever order they were written in. Both are compared
 * as written: a field set to undefined is not written, and compared before writing it differed from a row without it.
 *
 * @method
 * @param {string} left JSON, as `items.data` holds it.
 * @param {string} right
 * @returns {boolean}
 * @public
 */
module.exports.sameData = ( left, right ) => canonical( JSON.parse( left ) ) === canonical( JSON.parse( right ) );

/**
 * The version's next item number once a diff is written: past every number it inserts.
 *
 * @method
 * @param {number} next The number it was computed from.
 * @param {{inserts: import( "#definitions" ).ItemRow[]}} diff
 * @returns {number}
 * @public
 */
module.exports.nextAfter = ( next, diff ) => diff.inserts.reduce( ( highest, row ) => Math.max( highest, row.item_no + 1 ), next );

/**
 * Stored rows under their item keys, keyed by the same function as a content (`itemKeys`): the rows are decoded, and each
 * object traced back to the row it came from.
 *
 * @method
 * @param {string} kind One of `SPEC_KIND`: module, code-list or rules.
 * @param {import( "#definitions" ).ItemRow[]} rows
 * @returns {Map<string, import( "#definitions" ).ItemRow>}
 * @public
 */
module.exports.keyRows = ( kind, rows ) => {
    const { content, rowOf } = decodeRows( kind, null, null, rows );
    return new Map( [ ...keyedItems( kind, content ) ].map( ( [ key, item ] ) => [ key, rowOf.get( item.node ) ] ) );
};

/**
 * What it takes to make stored rows hold a new content, matching them by item key (plan 6a, decision 3).
 * - A matched row whose data differs is updated, its revision raised by one.
 * - A matched row that only changed parent or place is moved; a place is not content, so its revision stays.
 * - An unmatched item is inserted, numbered from the version's next item number, in document order.
 * - An unmatched stored row is deleted.
 *
 * @method
 * @param {string} kind One of `SPEC_KIND`: module, code-list or rules.
 * @param {import( "#definitions" ).ItemRow[]} stored With their revisions.
 * @param {Object} content
 * @param {number} [next] The version's `next_item_no`. A number is never taken twice, so a removed item's never goes to
 *     another (final review, C1); without it, the highest stored plus one.
 * @returns {{updates: import( "#definitions" ).ItemRow[], inserts: import( "#definitions" ).ItemRow[], deletes: import( "#definitions" ).ItemRow[],
 *     moves: import( "#definitions" ).ItemRow[]}} Rows as they are to be written; deletes as they were.
 * @public
 */
module.exports.diffRows = ( kind, stored, content, next ) => {
    const before = module.exports.keyRows( kind, stored );
    const after = keyedItems( kind, content );
    next = Math.max( next || 0, stored.reduce( ( highest, row ) => Math.max( highest, row.item_no ), 0 ) + 1 );
    const numbers = new Map( [ ...after.keys() ].map( ( key ) => [ key, before.has( key ) ? before.get( key ).item_no : next++ ] ) );
    const result = { updates: [], inserts: [], deletes: [], moves: [] };
    for ( const [ key, item ] of after ) {
        const parent = item.parent === null ? null : numbers.get( item.parent );
        const data = JSON.stringify( item.data );
        const row = before.get( key );
        if ( !row ) {
            result.inserts.push( { item_no: numbers.get( key ), kind: item.kind, identity: item.identity, parent_no: parent, position_no: item.position, data: data,
                hash: sha256( data ), revision: 1 } );
        } else if ( !module.exports.sameData( row.data, data ) ) {
            result.updates.push( { ...row, identity: item.identity, parent_no: parent, position_no: item.position, data: data, hash: sha256( data ), revision: row.revision + 1 } );
        } else if ( row.parent_no !== parent || row.position_no !== item.position ) {
            result.moves.push( { ...row, parent_no: parent, position_no: item.position } );
        }
    }
    const kept = new Set( [ ...before.keys() ].filter( ( key ) => after.has( key ) ).map( ( key ) => before.get( key ).item_no ) );
    result.deletes = stored.filter( ( row ) => !kept.has( row.item_no ) );
    return result;
};
