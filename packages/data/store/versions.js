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
const { ConstraintError, insertStatements } = require( "#database" );
const { GUARD_SQL } = require( "#schema" );
const { decodeContent, encodeContent } = require( "#items" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );

/**
 * A write to a frozen version (design record §7.7): its content and what it resolved against never change again.
 *
 * @public
 */
class FrozenVersionError extends Error {

    /**
     * @param {string} version The version's ID.
     */
    constructor( version ) {
        super( `Version ${ version } is frozen: its content never changes again (design record §7.7).` );
        this.name = "FrozenVersionError";
        this.version = version;
    }
}
module.exports.FrozenVersionError = FrozenVersionError;

const ITEM_COLUMNS = [ "version_id", "item_no", "kind", "identity", "parent_no", "position_no", "data", "hash" ];
const ANOMALY_COLUMNS = [ "version_id", "anomaly_no", "item_no", "type", "level", "message", "sheet", "row_number", "column_number", "details" ];
const STAGE_COLUMNS = [ "version_id", "stage", "entered_on" ];
const SELECT = "SELECT v.id, v.spec_id, s.kind, v.number, v.stage, v.frozen, v.release_id, v.base_id, v.content_hash FROM versions v JOIN specs s ON s.id = v.spec_id";

const orNull = ( value ) => value === undefined ? null : value;
const at = ( sheet, row ) => `${ sheet }\u0000${ row }`;

// The statements that write a version's items and anomalies, and its content hash. Each anomaly is mapped to the first
// item read from the same sheet and row, so the staff side can show it where it is (design record §7.11).
const contentStatements = ( versionId, kind, content, anomalies ) => {
    const encoded = content ? encodeContent( kind, content ) : { items: [], hash: null };
    const bySource = new Map();
    for ( const item of encoded.items ) {
        const source = JSON.parse( item.data ).source;
        if ( source && !bySource.has( at( source.sheet, source.row ) ) ) {
            bySource.set( at( source.sheet, source.row ), item.item_no );
        }
    }
    return {
        hash: encoded.hash,
        statements: [
            ...insertStatements( "items", ITEM_COLUMNS, encoded.items.map( ( item ) => [ versionId, item.item_no, item.kind, item.identity, item.parent_no, item.position_no,
                item.data, item.hash ] ) ),
            ...insertStatements( "anomalies", ANOMALY_COLUMNS, anomalies.map( ( anomaly, index ) => [ versionId, index + 1,
                orNull( bySource.get( at( anomaly.sheet, anomaly.row ) ) ), anomaly.type, anomaly.level, anomaly.message, orNull( anomaly.sheet ), orNull( anomaly.row ),
                orNull( anomaly.column ), JSON.stringify( anomaly.details || {} ) ] ) )
        ]
    };
};

const stored = ( row ) => ( { id: row.id, spec: row.spec_id, kind: row.kind, number: row.number, stage: row.stage, frozen: row.frozen === 1, release: row.release_id,
    base: row.base_id, contentHash: row.content_hash } );

/**
 * Makes sure a spec exists with the given kind.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} id The spec's key: `e-prescription`, `rules`, `CL009`, `nomenclatures`.
 * @param {string} kind One of `SPEC_KIND`.
 * @returns {Promise<void>}
 * @throws {TypeError} When the spec exists with another kind.
 * @public
 */
module.exports.ensureSpec = async ( db, id, kind ) => {
    await db.run( "INSERT INTO specs ( id, kind ) VALUES ( ?, ? ) ON CONFLICT ( id ) DO NOTHING", [ id, kind ] );
    const row = await db.get( "SELECT kind FROM specs WHERE id = ?", [ id ] );
    if ( row.kind !== kind ) {
        throw new TypeError( `The spec ${ id } is a ${ row.kind }, not a ${ kind }.` );
    }
};

/**
 * Stores a new version in one batch: its row, the stages it has been through, its items and its anomalies. A version
 * stored without content — a retired one kept for its changelog — has neither items nor hash.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{spec: string, kind: string, number: string|null, stage: string, content?: import( "#definitions" ).VersionContent,
 *     anomalies?: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[], release?: string, base?: string,
 *     stages?: Array<{stage: string, enteredOn: string|null}>}} input The current stage is recorded even when `stages` leaves
 *     it out.
 * @returns {Promise<string>} The new version's ID.
 * @public
 */
module.exports.storeVersion = async ( db, input ) => {
    const id = crypto.randomUUID();
    const stages = [ ...( input.stages || [] ) ];
    if ( !stages.some( ( entry ) => entry.stage === input.stage ) ) {
        stages.push( { stage: input.stage, enteredOn: null } );
    }
    const { hash, statements } = contentStatements( id, input.kind, input.content || null, input.anomalies || [] );
    await db.batch( [
        { sql: "INSERT INTO versions ( id, spec_id, number, stage, frozen, base_id, release_id, content_hash, created_at ) VALUES ( ?, ?, ?, ?, 0, ?, ?, ?, ? )",
            params: [ id, input.spec, orNull( input.number ), input.stage, orNull( input.base ), orNull( input.release ), hash, new Date().toISOString() ] },
        ...insertStatements( "version_stages", STAGE_COLUMNS, stages.map( ( entry ) => [ id, entry.stage, orNull( entry.enteredOn ) ] ) ),
        ...statements
    ] );
    return id;
};

/**
 * Replaces an unfrozen version's items, anomalies and hash, in one batch that starts with the frozen-version guard.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @param {import( "#definitions" ).VersionContent} content
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]} anomalies
 * @returns {Promise<void>}
 * @throws {FrozenVersionError} When the version is frozen; nothing is written.
 * @throws {RangeError} When there is no such version.
 * @public
 */
module.exports.storeContent = async ( db, versionId, content, anomalies ) => {
    const row = await db.get( "SELECT s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?", [ versionId ] );
    if ( !row ) {
        throw new RangeError( `There is no version ${ versionId }.` );
    }
    const { hash, statements } = contentStatements( versionId, row.kind, content, anomalies );
    try {
        await db.batch( [
            { sql: GUARD_SQL, params: [ versionId ] },
            { sql: "DELETE FROM anomalies WHERE version_id = ?", params: [ versionId ] },
            { sql: "DELETE FROM items WHERE version_id = ?", params: [ versionId ] },
            ...statements,
            { sql: "UPDATE versions SET content_hash = ? WHERE id = ?", params: [ hash, versionId ] }
        ] );
    } catch ( error ) {
        if ( error instanceof ConstraintError && error.constraint === "write_guard" ) {
            throw new FrozenVersionError( versionId );
        }
        throw error;
    }
};

/**
 * Freezes a version: from now on its content and what it resolved against never change (design record §7.7).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<void>}
 * @public
 */
module.exports.freezeVersion = async ( db, versionId ) => {
    await db.run( "UPDATE versions SET frozen = 1 WHERE id = ?", [ versionId ] );
};

/**
 * Finds a spec's version by stage or by number, without its content.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} spec
 * @param {{stage?: string, number?: string}} by A stage other than retired, which may hold many, or a number.
 * @returns {Promise<import( "#definitions" ).StoredVersion|null>}
 * @throws {TypeError} For neither, or for the retired stage.
 * @public
 */
module.exports.findVersion = async ( db, spec, by ) => {
    let row;
    if ( by.stage !== undefined ) {
        if ( by.stage === STAGE.RETIRED ) {
            throw new TypeError( "A spec may have many retired versions: find one by its number." );
        }
        row = await db.get( `${ SELECT } WHERE v.spec_id = ? AND v.stage = ?`, [ spec, by.stage ] );
    } else if ( by.number !== undefined ) {
        row = await db.get( `${ SELECT } WHERE v.spec_id = ? AND v.number = ?`, [ spec, by.number ] );
    } else {
        throw new TypeError( "Find a version by its stage or by its number." );
    }
    return row ? stored( row ) : null;
};

/**
 * Loads a version with its content, exactly as stored; `content` is `null` for a version kept only for its changelog.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<import( "#definitions" ).StoredVersion|null>}
 * @public
 */
module.exports.loadVersion = async ( db, versionId ) => {
    const row = await db.get( `${ SELECT } WHERE v.id = ?`, [ versionId ] );
    if ( !row ) {
        return null;
    }
    const version = stored( row );
    if ( row.content_hash === null ) {
        return { ...version, content: null };
    }
    const items = await db.all( "SELECT item_no, kind, identity, parent_no, position_no, data, hash FROM items WHERE version_id = ? ORDER BY item_no", [ versionId ] );
    return { ...version, content: decodeContent( row.kind, row.spec_id, row.number, items ) };
};

/**
 * A version's anomalies in stored order, each with the item it was found on, or `null`.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<Array<import( "@health-dev-portal/spec-model/definitions" ).Anomaly & {item: number|null}>>}
 * @public
 */
module.exports.loadAnomalies = async ( db, versionId ) => {
    const rows = await db.all( "SELECT item_no, type, level, message, sheet, row_number, column_number, details FROM anomalies WHERE version_id = ? ORDER BY anomaly_no",
        [ versionId ] );
    return rows.map( ( row ) => ( { type: row.type, level: row.level, message: row.message, sheet: row.sheet, row: row.row_number, column: row.column_number,
        details: JSON.parse( row.details ), item: row.item_no } ) );
};
