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
const { checkContent } = require( "@health-dev-portal/importer/check" );
const { SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { refreshChangelog } = require( "#changelog" );
const { ConstraintError } = require( "#database" );
const { decodeContent, decodeRows, encodeContent } = require( "#items" );
const { diffRows, nextAfter, sameData } = require( "#item-diff" );
const { editStatement, guardStatements, staleStatement } = require( "#schema" );
const { loadTargets } = require( "#targets" );
const { FrozenVersionError, anomalyReplacement, loadItems, rowStatements, rowsAfter } = require( "#versions" );

// Another edit of other items in between makes the batch stale; it is computed again, this many times at most.
const ATTEMPTS = 3;

// What an editor makes, by kind of version, and where it goes: `null` at the top, else the kinds its parent may be.
// Bindings are derived from the rest, and a code list's one list item is not added or taken away.
const EDITABLE = Object.freeze( {
    [ SPEC_KIND.MODULE ]: Object.freeze( { message: null, element: [ "message", "element" ], condition: null, dictionary: null } ),
    [ SPEC_KIND.CODE_LIST ]: Object.freeze( { column: [ "list" ], entry: [ "list" ] } ),
    [ SPEC_KIND.RULES ]: Object.freeze( { rule: null } )
} );

// What an editor only updates: a code list's own fields — its name and status could otherwise change only through a
// workbook (final review, I3).
const UPDATED_ONLY = Object.freeze( { [ SPEC_KIND.CODE_LIST ]: Object.freeze( [ "list" ] ) } );

// The field each kind of item is identified by, as `encodeContent` stores it.
const IDENTITY = Object.freeze( { message: "code", element: "identity", condition: "id", dictionary: "abbreviation", column: "title", entry: "key", rule: "id",
    list: "id" } );

const DONE = Object.freeze( { update: "edited", insert: "inserted", remove: "removed", move: "moved" } );

// Children are items of their own; an update never carries them (decision 2).
const CHILDREN = Object.freeze( { message: [ "elements" ], element: [ "children" ] } );

const sha256 = ( text ) => crypto.createHash( "sha256" ).update( text ).digest( "hex" );

/**
 * An edit made against a revision the item is no longer at, or to an item no longer there (design record §7.4: nothing
 * is overwritten unseen). Nothing of its batch is written.
 *
 * @public
 */
class EditConflictError extends Error {

    /**
     * @param {string} version The version's ID.
     * @param {number} item The item's number.
     * @param {number} revision The revision the edit was made against.
     */
    constructor( version, item, revision ) {
        super( `Item ${ item } of version ${ version } is no longer at revision ${ revision }: someone changed it since it was read.` );
        this.name = "EditConflictError";
        this.version = version;
        this.item = item;
        this.revision = revision;
    }
}
module.exports.EditConflictError = EditConflictError;

// An edit's own fields, as an item stores them.
const own = ( kind, data ) => {
    if ( !data || typeof data !== "object" || Array.isArray( data ) ) {
        throw new TypeError( `A ${ kind }'s data is an object of its own fields.` );
    }
    const fields = Object.fromEntries( Object.entries( data ).filter( ( [ field ] ) => !( CHILDREN[ kind ] || [] ).includes( field ) ) );
    const json = JSON.stringify( fields );
    const identity = fields[ IDENTITY[ kind ] ];
    return { identity: identity === undefined ? null : identity, data: json, hash: sha256( json ) };
};

// The edits applied in memory, in order, to copies of the stored rows: numbers stay, an insert takes the version's next
// number, never one used before, and siblings are placed again from 0 (decision 3). Each edit's revision is checked
// against the stored one as it comes, so the first stale item is the one named.
const edited = ( versionId, kind, stored, edits, first ) => {
    const allowed = EDITABLE[ kind ];
    const was = new Map( stored.map( ( row ) => [ row.item_no, row ] ) );
    const rows = new Map( stored.map( ( row ) => [ row.item_no, { ...row } ] ) );
    const touched = new Set();
    const inserted = [];
    let next = Math.max( first, stored.reduce( ( highest, row ) => Math.max( highest, row.item_no ), 0 ) + 1 );

    const siblings = ( parent, itemKind ) => [ ...rows.values() ].filter( ( row ) => row.parent_no === parent && row.kind === itemKind )
        .sort( ( a, b ) => a.position_no - b.position_no || a.item_no - b.item_no );
    const placeAgain = ( group ) => group.forEach( ( row, index ) => {
        row.position_no = index;
    } );
    const kindOf = ( itemKind, op ) => {
        if ( !Object.hasOwn( allowed, itemKind ) && !( op === "update" && ( UPDATED_ONLY[ kind ] || [] ).includes( itemKind ) ) ) {
            throw new TypeError( `A ${ itemKind } is not ${ DONE[ op ] } in a ${ kind } version.` );
        }
        // An entry's values follow the columns by place: a column added, taken away or moved shifted every value under
        // another title (final review, I4). Until a column's values move with it, its place is fixed while there are entries.
        if ( itemKind === "column" && op !== "update" && [ ...rows.values() ].some( ( row ) => row.kind === "entry" ) ) {
            throw new TypeError( `A column is not ${ DONE[ op ] } while the list has entries: each entry's values follow the columns by place.` );
        }
        return itemKind;
    };
    const parentFor = ( itemKind, parent ) => {
        const kinds = allowed[ itemKind ];
        if ( kinds === null ) {
            if ( parent !== null && parent !== undefined ) {
                throw new TypeError( `A ${ itemKind } goes at the top, under no item.` );
            }
            return null;
        }
        const row = rows.get( parent );
        if ( !row || !kinds.includes( row.kind ) ) {
            throw new TypeError( `A ${ itemKind } goes under a ${ kinds.join( " or " ) }, and item ${ parent } is none.` );
        }
        return parent;
    };
    const place = ( row, parent, position ) => {
        const group = siblings( parent, row.kind ).filter( ( other ) => other !== row );
        if ( !Number.isInteger( position ) || position < 0 || position > group.length ) {
            throw new RangeError( `Position ${ position } is not between 0 and ${ group.length }.` );
        }
        row.parent_no = parent;
        group.splice( position, 0, row );
        placeAgain( group );
    };
    const target = ( edit ) => {
        if ( !Number.isInteger( edit.item ) || !Number.isInteger( edit.revision ) ) {
            throw new TypeError( `A ${ edit.op } names its item and the revision it was made against.` );
        }
        const before = was.get( edit.item );
        if ( !before || before.revision !== edit.revision ) {
            throw new EditConflictError( versionId, edit.item, edit.revision );
        }
        const row = rows.get( edit.item );
        if ( !row ) {
            throw new RangeError( `Item ${ edit.item } was removed by an earlier edit of the same batch.` );
        }
        kindOf( row.kind, edit.op );
        return row;
    };

    for ( const edit of edits ) {
        if ( edit.op === "update" ) {
            const row = target( edit );
            Object.assign( row, own( row.kind, edit.data ) );
            touched.add( row.item_no );
        } else if ( edit.op === "insert" ) {
            const itemKind = kindOf( edit.kind, edit.op );
            const row = { item_no: next, kind: itemKind, ...own( itemKind, edit.data ), parent_no: null, position_no: 0, revision: 1 };
            place( row, parentFor( itemKind, edit.parent ), edit.position );
            rows.set( next, row );
            inserted.push( next );
            next += 1;
        } else if ( edit.op === "remove" ) {
            const row = target( edit );
            const gone = new Set( [ row.item_no ] );
            for ( let grew = true; grew; ) {
                grew = false;
                for ( const other of rows.values() ) {
                    if ( !gone.has( other.item_no ) && gone.has( other.parent_no ) ) {
                        gone.add( other.item_no );
                        grew = true;
                    }
                }
            }
            gone.forEach( ( number ) => rows.delete( number ) );
            placeAgain( siblings( row.parent_no, row.kind ) );
        } else if ( edit.op === "move" ) {
            const row = target( edit );
            const parent = parentFor( row.kind, edit.parent );
            for ( let above = parent; above !== null; above = rows.get( above ).parent_no ) {
                if ( above === row.item_no ) {
                    throw new TypeError( `Item ${ row.item_no } cannot go under itself.` );
                }
            }
            const from = row.parent_no;
            place( row, parent, edit.position );
            placeAgain( siblings( from, row.kind ) );
            touched.add( row.item_no );
        } else {
            throw new TypeError( `"${ edit.op }" is not an edit: update, insert, remove and move are.` );
        }
    }
    return { rows: [ ...rows.values() ].sort( ( a, b ) => a.item_no - b.item_no ), touched: touched, inserted: inserted, next: next };
};

// What the batch writes, by number against the stored rows. An item edited, or whose data the check changed, goes up one
// revision, once however many edits named it; one that only changed place keeps its revision, a place not being content.
const changes = ( stored, rows, touched ) => {
    const now = new Map( rows.map( ( row ) => [ row.item_no, row ] ) );
    const result = { updates: [], inserts: [], deletes: [], moves: [] };
    for ( const row of stored ) {
        const after = now.get( row.item_no );
        if ( !after ) {
            result.deletes.push( row );
        } else if ( touched.has( row.item_no ) || !sameData( row.data, after.data ) ) {
            result.updates.push( { ...after, revision: row.revision + 1 } );
        } else if ( after.parent_no !== row.parent_no || after.position_no !== row.position_no || after.identity !== row.identity ) {
            result.moves.push( { ...after, revision: row.revision } );
        }
    }
    const was = new Set( stored.map( ( row ) => row.item_no ) );
    result.inserts = rows.filter( ( row ) => !was.has( row.item_no ) ).map( ( row ) => ( { ...row, revision: 1 } ) );
    return result;
};

const edit = async ( db, store, versionId, edits ) => {
    for ( let attempt = 1; attempt <= ATTEMPTS; attempt += 1 ) {
        // The hash is read before the rows: an edit landing between them makes this batch stale, and never lets it write
        // over rows newer than the hash it checks.
        const version = await db.get( `SELECT v.spec_id, v.number, v.stage, v.content_hash, v.next_item_no, s.kind FROM versions v JOIN specs s ON s.id = v.spec_id
            WHERE v.id = ?`, [ versionId ] );
        if ( !version ) {
            throw new RangeError( `There is no version ${ versionId }.` );
        }
        if ( version.stage !== STAGE.DEVELOPMENT ) {
            throw new TypeError( `Version ${ versionId } is in ${ version.stage }: only a development version is edited (plan 6a, decision 1).` );
        }
        if ( version.content_hash === null ) {
            throw new TypeError( `Version ${ versionId } has no content to edit.` );
        }
        const stored = await loadItems( db, versionId );
        const working = edited( versionId, version.kind, stored, edits, version.next_item_no );
        // Checked as it now stands, and its derived parts — conditions, bindings, a list's key type — folded back by key, so
        // an unchanged one keeps its number and revision.
        const { content } = decodeRows( version.kind, version.spec_id, version.number, working.rows );
        const checked = checkContent( version.kind, content, await loadTargets( db, store, versionId ) );
        const folded = diffRows( version.kind, working.rows, checked.content, working.next );
        const rows = rowsAfter( working.rows, folded );
        const change = changes( stored, rows, working.touched );
        // Hashed as `storeContent` hashes, from the content the rows hold, so equal content hashes alike whatever its history.
        const hash = encodeContent( version.kind, decodeContent( version.kind, version.spec_id, version.number, rows ) ).hash;
        try {
            await db.batch( [
                ...guardStatements( versionId ),
                staleStatement( versionId, version.content_hash, version.next_item_no ),
                ...edits.filter( ( one ) => one.op !== "insert" ).map( ( one ) => editStatement( versionId, one.item, one.revision ) ),
                ...rowStatements( versionId, change ),
                ...anomalyReplacement( versionId, rows, checked.anomalies ),
                { sql: "UPDATE versions SET content_hash = ?, next_item_no = ? WHERE id = ?", params: [ hash, nextAfter( working.next, folded ), versionId ] }
            ] );
        } catch ( error ) {
            if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
                throw new FrozenVersionError( versionId );
            }
            // A stale item is found and named by the next attempt's own check.
            if ( error instanceof ConstraintError && ( error.constraint === "stale_guard" || error.constraint === "edit_guard" ) ) {
                continue;
            }
            throw error;
        }
        // Every content write is followed by its own refresh, so one that loses to a later edit is made good by that edit's.
        await refreshChangelog( db, versionId );
        return {
            revisions: Object.fromEntries( change.updates.map( ( row ) => [ row.item_no, row.revision ] ) ),
            inserted: working.inserted,
            anomalies: checked.anomalies
        };
    }
    throw new Error( `Version ${ versionId } changed while it was edited, ${ ATTEMPTS } times over.` );
};

/**
 * Applies a batch of edits to a development version, all or nothing (plan 6a, decision 2), and checks the result as a
 * workbook is checked (design record §5.4). The version's anomalies become the check's, so those that described a
 * workbook's layout go at the first edit (decision 6). One batch writes the changed rows, the anomalies and the content
 * hash behind the lock, the frozen guard, the stale guard and a revision guard per edited item.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Where the blueprint catalogue is.
 * @param {string} versionId
 * @param {import( "#definitions" ).Edit[]} edits Applied in order.
 * @returns {Promise<import( "#definitions" ).EditResult>}
 * @throws {EditConflictError} When an edit names a revision its item is no longer at; nothing is written.
 * @throws {TypeError} For a version outside development, or an edit that is none.
 * @throws {RangeError} For no such version, a position outside the siblings, or an item an earlier edit removed.
 * @throws {Error} When other edits changed the version under every one of three attempts.
 * @public
 */
module.exports.applyEdits = async ( db, store, versionId, edits ) => edit( db, store, versionId, edits );

/**
 * Checks a development version as it stands and writes what the check gives: its derived parts and its anomalies. The
 * workbook route and a carried change call it after they write content.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store
 * @param {string} versionId
 * @returns {Promise<import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]>}
 * @throws {TypeError} For a version outside development.
 * @public
 */
module.exports.recheckVersion = async ( db, store, versionId ) => ( await edit( db, store, versionId, [] ) ).anomalies;
