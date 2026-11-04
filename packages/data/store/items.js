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
const { SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );

// The fields each kind of content has. A field outside these would be lost on the way back, so it is refused instead;
// change notes are known and left out, since the changelog keeps them (design record §4.7).
const FIELDS = Object.freeze( {
    [ SPEC_KIND.MODULE ]: [ "kind", "spec", "version", "messages", "conditions", "conditionBindings", "blueprintBindings", "dictionary", "changeNotes" ],
    [ SPEC_KIND.CODE_LIST ]: [ "kind", "spec", "version", "list", "changeNotes" ],
    [ SPEC_KIND.RULES ]: [ "kind", "spec", "version", "rules", "changeNotes" ]
} );

const sha256 = ( text ) => crypto.createHash( "sha256" ).update( text ).digest( "hex" );

// A shallow copy without the given fields: the content comes frozen from the importer and is never changed here.
const without = ( object, ...fields ) => Object.fromEntries( Object.entries( object ).filter( ( [ field ] ) => !fields.includes( field ) ) );

/**
 * Turns a version's content into items: one per message, element, condition, dictionary entry, binding, code-list
 * column, entry or rule (design record §3.2). Each keeps its identity, its parent and its position among its siblings,
 * and its own fields as JSON without its children. The content's hash is over the items, so the same content always
 * hashes alike.
 *
 * @method
 * @param {string} kind One of `SPEC_KIND`: module, code-list or rules.
 * @param {import( "#definitions" ).VersionContent} content Change notes, if present, are left out.
 * @returns {{items: import( "#definitions" ).ItemRow[], hash: string}}
 * @throws {TypeError} For a kind without content, or a field the items could not give back.
 * @public
 */
module.exports.encodeContent = ( kind, content ) => {
    const fields = FIELDS[ kind ];
    if ( !fields ) {
        throw new TypeError( `A ${ kind } version has no content to store.` );
    }
    const unknown = Object.keys( content ).filter( ( field ) => !fields.includes( field ) );
    if ( unknown.length ) {
        throw new TypeError( `A ${ kind } version cannot store ${ unknown.join( ", " ) }: it would not come back.` );
    }
    const items = [];
    const add = ( itemKind, identity, parent, position, data ) => {
        const json = JSON.stringify( data );
        items.push( { item_no: items.length + 1, kind: itemKind, identity: identity === undefined ? null : identity, parent_no: parent, position_no: position, data: json,
            hash: sha256( json ) } );
        return items.length;
    };
    if ( kind === SPEC_KIND.MODULE ) {
        const element = ( node, parent, position ) => {
            const number = add( "element", node.identity, parent, position, without( node, "children" ) );
            node.children.forEach( ( child, index ) => element( child, number, index ) );
        };
        content.messages.forEach( ( message, index ) => {
            const number = add( "message", message.code, null, index, without( message, "elements" ) );
            message.elements.forEach( ( node, position ) => element( node, number, position ) );
        } );
        content.conditions.forEach( ( condition, index ) => add( "condition", condition.id, null, index, condition ) );
        content.dictionary.forEach( ( entry, index ) => add( "dictionary", entry.abbreviation, null, index, entry ) );
        content.conditionBindings.forEach( ( binding, index ) => add( "condition-binding", `${ binding.message } ${ binding.element } ${ binding.condition }`, null, index, binding ) );
        content.blueprintBindings.forEach( ( binding, index ) => add( "blueprint-binding", `${ binding.message } ${ binding.element }`, null, index, binding ) );
    } else if ( kind === SPEC_KIND.CODE_LIST ) {
        const list = add( "list", content.list.id, null, 0, without( content.list, "columns", "entries" ) );
        content.list.columns.forEach( ( column, index ) => add( "column", column.title, list, index, column ) );
        content.list.entries.forEach( ( entry, index ) => add( "entry", entry.key, list, index, entry ) );
    } else {
        content.rules.forEach( ( rule, index ) => add( "rule", rule.id, null, index, rule ) );
    }
    return { items: items, hash: sha256( JSON.stringify( items.map( ( item ) => [ item.kind, item.identity, item.parent_no, item.position_no, item.data ] ) ) ) };
};

/**
 * Builds a version's content back from its items, whatever order they arrive in: siblings are ordered by position,
 * then by item number.
 *
 * @method
 * @param {string} kind One of `SPEC_KIND`: module, code-list or rules.
 * @param {string} spec
 * @param {string|null} number The stored version's number, which the content's `version` takes.
 * @param {import( "#definitions" ).ItemRow[]} items
 * @returns {import( "#definitions" ).VersionContent}
 * @public
 */
module.exports.decodeContent = ( kind, spec, number, items ) => {
    const order = new Map();
    const objects = new Map();
    const lists = new Map();
    const place = ( array, object, item ) => {
        order.set( object, [ item.position_no, item.item_no ] );
        array.push( object );
        lists.set( array, true );
    };
    const top = { messages: [], conditions: [], dictionary: [], conditionBindings: [], blueprintBindings: [], rules: [] };
    let list = null;
    for ( const item of items ) {
        const data = JSON.parse( item.data );
        const parent = item.parent_no === null ? null : objects.get( item.parent_no );
        let object = data;
        if ( item.kind === "message" ) {
            object = { ...data, elements: [] };
            place( top.messages, object, item );
        } else if ( item.kind === "element" ) {
            object = { ...data, children: [] };
            place( parent.elements || parent.children, object, item );
        } else if ( item.kind === "list" ) {
            object = list = { ...data, columns: [], entries: [] };
        } else if ( item.kind === "column" ) {
            place( parent.columns, object, item );
        } else if ( item.kind === "entry" ) {
            place( parent.entries, object, item );
        } else if ( item.kind === "condition" ) {
            place( top.conditions, object, item );
        } else if ( item.kind === "dictionary" ) {
            place( top.dictionary, object, item );
        } else if ( item.kind === "condition-binding" ) {
            place( top.conditionBindings, object, item );
        } else if ( item.kind === "blueprint-binding" ) {
            place( top.blueprintBindings, object, item );
        } else if ( item.kind === "rule" ) {
            place( top.rules, object, item );
        } else {
            throw new TypeError( `Unknown item kind "${ item.kind }" in ${ spec } ${ number }.` );
        }
        objects.set( item.item_no, object );
    }
    for ( const array of lists.keys() ) {
        array.sort( ( a, b ) => order.get( a )[ 0 ] - order.get( b )[ 0 ] || order.get( a )[ 1 ] - order.get( b )[ 1 ] );
    }
    if ( kind === SPEC_KIND.MODULE ) {
        return { kind: kind, spec: spec, version: number, messages: top.messages, conditions: top.conditions, conditionBindings: top.conditionBindings,
            blueprintBindings: top.blueprintBindings, dictionary: top.dictionary };
    }
    if ( kind === SPEC_KIND.CODE_LIST ) {
        return { kind: kind, spec: spec, version: number, list: list };
    }
    return { kind: kind, spec: spec, version: number, rules: top.rules };
};
