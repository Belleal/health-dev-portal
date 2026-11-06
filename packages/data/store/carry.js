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
const { compareContents, itemKeys } = require( "@health-dev-portal/spec-model/differences" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { ConstraintError } = require( "#database" );
const { EditConflictError, applyEdits, authorOf, recheckVersion } = require( "#editing" );
const { decodeContent, encodeContent } = require( "#items" );
const { diffRows, keyRows, nextAfter } = require( "#item-diff" );
const { guardStatements, staleStatement } = require( "#schema" );
const { FrozenVersionError, findVersion, loadItems, loadVersion, rowStatements } = require( "#versions" );

// The development version edited without pause changes under the carry; past this, the approver's step decides.
const ATTEMPTS = 3;

// Where each kind of item sits in a content: at the top, in its own array; else in its parent's.
const TOP = Object.freeze( { message: "messages", condition: "conditions", dictionary: "dictionary", rule: "rules" } );
const SHELL = Object.freeze( { message: () => ( { elements: [] } ), element: () => ( { children: [] } ) } );
const CHILDREN = new Set( [ "elements", "children", "columns", "entries" ] );

const itemOf = ( differenceKey ) => differenceKey.slice( 0, differenceKey.lastIndexOf( "|" ) );
const asJson = ( item ) => item ? JSON.stringify( item.data ) : null;

// The array an item sits in, found through its parent's key; `null` when that parent is not there.
const siblingsOf = ( content, keyed, item ) => {
    if ( item.parent === null ) {
        return content[ TOP[ item.kind ] ] || null;
    }
    const parent = keyed.get( item.parent );
    if ( !parent ) {
        return null;
    }
    if ( item.kind === "element" ) {
        return Array.isArray( parent.node.children ) ? parent.node.children : parent.node.elements;
    }
    return item.kind === "column" ? parent.node.columns : parent.node.entries;
};

const under = ( keyed, key, ancestor ) => {
    for ( let item = keyed.get( key ); item && item.parent !== null; item = keyed.get( item.parent ) ) {
        if ( item.parent === ancestor ) {
            return true;
        }
    }
    return false;
};

// An item's own fields replaced, its children kept: they are items of their own.
const setOwn = ( node, data ) => {
    Object.keys( node ).filter( ( field ) => !CHILDREN.has( field ) ).forEach( ( field ) => delete node[ field ] );
    Object.assign( node, structuredClone( data ) );
};

// Where an item goes among development's siblings: right after the nearest one it follows upstream that development
// also has, else first. At its index upstream it came in among development's own items, and development's changelog
// then showed a move nobody made (final review, I5).
const placeAmong = ( siblings, node, upstream, key, mine ) => {
    for ( let index = upstream.indexOf( key ) - 1; index >= 0; index -= 1 ) {
        const anchor = mine.get( upstream[ index ] );
        const at = anchor ? siblings.indexOf( anchor.node ) : -1;
        if ( at >= 0 ) {
            siblings.splice( at + 1, 0, node );
            return;
        }
    }
    siblings.unshift( node );
};

// The development content with the upstream change applied wherever development left the item as `before` had it, and
// a conflict wherever it did not (design record §7.8). Removals go first, so an insertion's place is found among the
// siblings that stay.
const merge = ( kind, before, after, content ) => {
    const was = itemKeys( kind, before );
    const now = itemKeys( kind, after );
    const mine = itemKeys( kind, content );
    // Each item's siblings upstream, in order, grouped once: a list can hold 39,005 entries.
    const groups = new Map();
    for ( const [ key, item ] of now ) {
        const group = `${ item.parent }\u0000${ item.kind }`;
        if ( !groups.has( group ) ) {
            groups.set( group, [] );
        }
        groups.get( group ).push( key );
    }
    const upstreamOf = ( key ) => groups.get( `${ now.get( key ).parent }\u0000${ now.get( key ).kind }` );
    const touched = new Set( compareContents( kind, before, content ).map( ( difference ) => itemOf( difference.key ) ) );
    const upstream = compareContents( kind, before, after );
    const moved = new Set( upstream.filter( ( difference ) => difference.aspect === "moved" ).map( ( difference ) => itemOf( difference.key ) ) );
    const keys = [ ...new Set( upstream.map( ( difference ) => itemOf( difference.key ) ) ) ].sort( ( a, b ) => Number( now.has( a ) ) - Number( now.has( b ) ) );
    const conflicts = [];
    let applied = 0;
    const conflict = ( key ) => conflicts.push( { key: key, base: asJson( was.get( key ) ), upstream: asJson( now.get( key ) ), current: asJson( mine.get( key ) ) } );
    for ( const key of keys ) {
        const theirs = now.get( key );
        const ours = mine.get( key );
        if ( touched.has( key ) ) {
            conflict( key );
        } else if ( !theirs ) {
            // Removed upstream. Development's own work beneath it would go with it, so that is a conflict too.
            if ( [ ...touched ].some( ( changed ) => under( mine, changed, key ) ) ) {
                conflict( key );
                continue;
            }
            const siblings = ours ? siblingsOf( content, mine, ours ) : null;
            if ( siblings && siblings.includes( ours.node ) ) {
                siblings.splice( siblings.indexOf( ours.node ), 1 );
            }
            applied += 1;
        } else if ( !ours ) {
            const siblings = siblingsOf( content, mine, theirs );
            if ( !siblings ) {
                conflict( key );
                continue;
            }
            const node = { ...structuredClone( theirs.data ), ...( SHELL[ theirs.kind ] ? SHELL[ theirs.kind ]() : {} ) };
            placeAmong( siblings, node, upstreamOf( key ), key, mine );
            mine.set( key, { ...theirs, node: node } );
            applied += 1;
        } else {
            const target = moved.has( key ) ? siblingsOf( content, mine, theirs ) : null;
            if ( moved.has( key ) && !target ) {
                conflict( key );
                continue;
            }
            setOwn( ours.node, theirs.data );
            if ( target ) {
                const from = siblingsOf( content, mine, ours );
                from.splice( from.indexOf( ours.node ), 1 );
                placeAmong( target, ours.node, upstreamOf( key ), key, mine );
                mine.set( key, { ...ours, parent: theirs.parent } );
            }
            applied += 1;
        }
    }
    return { content: content, applied: applied, conflicts: conflicts };
};

/**
 * Carries a change approved into implementation to the spec's development version (design record §7.8, plan 6a
 * decision 10). For each item the change touched:
 * - where development has it as it was before the change, the change is applied: set, inserted, moved or removed;
 * - otherwise a conflict records the item's data before the change, after it, and in development, for the editor.
 * Development's base becomes the changed version, and in one batch with the content and the conflicts, behind the lock,
 * the frozen guard and the stale check. It is then rechecked, which refreshes its changelog: an applied change is in the
 * new base, so it is no difference of development's. With no development version it does nothing.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Where the blueprint catalogue is.
 * @param {string} spec
 * @param {Object} before The content in implementation before the change.
 * @param {Object} after And after it.
 * @param {string} upstreamId The version in implementation, which now holds `after`.
 * @returns {Promise<{applied: number, conflicts: number}>} Items, by key.
 * @throws {Error} When development changed under every one of three attempts.
 * @public
 */
module.exports.carryChange = async ( db, store, spec, before, after, upstreamId ) => {
    for ( let attempt = 1; attempt <= ATTEMPTS; attempt += 1 ) {
        const found = await findVersion( db, spec, { stage: STAGE.DEVELOPMENT } );
        if ( !found ) {
            return { applied: 0, conflicts: 0 };
        }
        // The hash is read before the rows, so an edit landing between them makes the batch stale rather than undone.
        const version = await db.get( "SELECT v.number, v.content_hash, v.next_item_no, s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?",
            [ found.id ] );
        const rows = await loadItems( db, found.id );
        const { content, applied, conflicts } = merge( version.kind, before, after, decodeContent( version.kind, spec, version.number, rows ) );
        const diff = diffRows( version.kind, rows, content, version.next_item_no );
        const now = new Date().toISOString();
        try {
            await db.batch( [
                ...guardStatements( found.id ),
                staleStatement( found.id, version.content_hash, version.next_item_no ),
                ...rowStatements( found.id, diff ),
                { sql: "UPDATE versions SET base_id = ?, content_hash = ?, next_item_no = ? WHERE id = ?",
                    params: [ upstreamId, encodeContent( version.kind, content ).hash, nextAfter( version.next_item_no, diff ), found.id ] },
                // One conflict per item: a later change to it replaces the earlier, whose upstream is no longer there to choose.
                ...conflicts.flatMap( ( conflict ) => [
                    { sql: "DELETE FROM conflicts WHERE version_id = ? AND item_key = ?", params: [ found.id, conflict.key ] },
                    { sql: "INSERT INTO conflicts ( id, version_id, item_key, base_data, upstream_data, current_data, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ? )",
                        params: [ crypto.randomUUID(), found.id, conflict.key, conflict.base, conflict.upstream, conflict.current, now ] }
                ] )
            ] );
        } catch ( error ) {
            if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
                throw new FrozenVersionError( found.id );
            }
            if ( error instanceof ConstraintError && error.constraint === "stale_guard" ) {
                continue;
            }
            throw error;
        }
        await recheckVersion( db, store, found.id );
        return { applied: applied, conflicts: conflicts.length };
    }
    throw new Error( `The development version of ${ spec } changed while a change was carried to it, ${ ATTEMPTS } times over.` );
};

const parsed = ( json ) => json === null ? null : JSON.parse( json );

const kindOf = async ( db, versionId ) => ( await db.get( "SELECT s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?", [ versionId ] ) ).kind;

/**
 * A version's open conflicts, oldest first, each with the development item's revision now: the one a choice made on
 * what is shown is checked against.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<import( "#definitions" ).Conflict[]>}
 * @public
 */
module.exports.listConflicts = async ( db, versionId ) => {
    const rows = await db.all( "SELECT id, version_id, item_key, base_data, upstream_data, current_data, created_at FROM conflicts WHERE version_id = ?", [ versionId ] );
    if ( !rows.length ) {
        return [];
    }
    const keyed = keyRows( await kindOf( db, versionId ), await loadItems( db, versionId ) );
    // Sorted here, never by SQL: the two databases order text differently (design record §3.2).
    return rows.sort( ( a, b ) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.item_key < b.item_key ? -1 : a.item_key > b.item_key ? 1 : 0 )
        .map( ( row ) => ( { id: row.id, version: row.version_id, key: row.item_key, base: parsed( row.base_data ), upstream: parsed( row.upstream_data ),
            current: parsed( row.current_data ), revision: keyed.has( row.item_key ) ? keyed.get( row.item_key ).revision : null } ) );
};

// The edit that makes the development item hold the chosen data, made against the revision the editor saw: against the
// one at the moment of resolving, an edit made since was overwritten unseen (final review, I6). An item development no
// longer has goes back where its base has it.
const editFor = async ( db, conflict, rows, chosen, seen ) => {
    const keyed = keyRows( conflict.kind, rows );
    const row = keyed.get( conflict.item_key );
    if ( ( row ? row.revision : null ) !== seen ) {
        throw new EditConflictError( conflict.version_id, row ? row.item_no : null, seen );
    }
    if ( chosen === null ) {
        return row ? { op: "remove", item: row.item_no, revision: seen } : null;
    }
    if ( row ) {
        return { op: "update", item: row.item_no, revision: seen, data: chosen };
    }
    const base = conflict.base_id ? await loadVersion( db, conflict.base_id ) : null;
    const item = base && base.content ? itemKeys( conflict.kind, base.content ).get( conflict.item_key ) : undefined;
    const parent = item && item.parent !== null ? keyed.get( item.parent ) : null;
    if ( !item || parent === undefined ) {
        throw new TypeError( `${ conflict.item_key } has no place in the development version to go back to.` );
    }
    const parentNo = parent ? parent.item_no : null;
    const siblings = rows.filter( ( candidate ) => candidate.parent_no === parentNo && candidate.kind === item.kind ).length;
    return { op: "insert", kind: item.kind, parent: parentNo, position: Math.min( item.position, siblings ), data: chosen };
};

/**
 * Settles a conflict by the editor's choice: the upstream data, development's current data, or a combination the
 * editor wrote. The choice is applied as an edit (`applyEdits`) against the revision the editor saw, so it is checked
 * and its changelog written like any edit, and the conflict goes.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {string} conflictId
 * @param {{choose: string, data?: Object, revision?: number|null, actor: string, now: Date}} choice `choose` is
 *     `upstream`, `current` or `combined`; `data` is the combined item's own fields; `revision` is the one `listConflicts`
 *     showed, `null` for an item development did not have, and is needed for all but `current`; `actor` and `now` say
 *     who chose and when, as for any edit (design record §10.1).
 * @returns {Promise<void>}
 * @throws {RangeError} When there is no such conflict.
 * @throws {TypeError} For a choice that is none, combined data that is not an object, no revision, or an item with
 *     nowhere to go.
 * @throws {import( "#editing" ).EditConflictError} When the item has changed since the editor saw it; the conflict stays.
 * @public
 */
module.exports.resolveConflict = async ( db, store, conflictId, choice ) => {
    const author = authorOf( choice );
    const conflict = await db.get( `SELECT c.version_id, c.item_key, c.upstream_data, v.base_id, s.kind FROM conflicts c JOIN versions v ON v.id = c.version_id
        JOIN specs s ON s.id = v.spec_id WHERE c.id = ?`, [ conflictId ] );
    if ( !conflict ) {
        throw new RangeError( `There is no conflict ${ conflictId }.` );
    }
    let chosen;
    if ( choice.choose === "upstream" ) {
        chosen = parsed( conflict.upstream_data );
    } else if ( choice.choose === "combined" ) {
        if ( !choice.data || typeof choice.data !== "object" || Array.isArray( choice.data ) ) {
            throw new TypeError( "A combined choice gives the item's own fields as an object." );
        }
        chosen = choice.data;
    } else if ( choice.choose !== "current" ) {
        throw new TypeError( `"${ choice.choose }" is not a choice: upstream, current and combined are.` );
    }
    if ( choice.choose !== "current" ) {
        if ( choice.revision === undefined ) {
            throw new TypeError( "A choice names the revision of the development item it was made on, as listConflicts gave it." );
        }
        const edit = await editFor( db, conflict, await loadItems( db, conflict.version_id ), chosen, choice.revision );
        if ( edit ) {
            await applyEdits( db, store, conflict.version_id, [ edit ], author );
        }
    }
    try {
        await db.batch( [ ...guardStatements( conflict.version_id ), { sql: "DELETE FROM conflicts WHERE id = ?", params: [ conflictId ] } ] );
    } catch ( error ) {
        if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
            throw new FrozenVersionError( conflict.version_id );
        }
        throw error;
    }
};
