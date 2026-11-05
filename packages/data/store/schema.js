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

const { CHANGE_ORIGIN, SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );

// The SQL subset of design record §3.2: TEXT and INTEGER only, booleans as 0/1, no word either database reserves.
const oneOf = ( column, values ) => `CHECK ( ${ column } IN ( ${ Object.values( values ).map( ( value ) => `'${ value }'` ).join( ", " ) } ) )`;

const INITIAL = [
    // Always empty. Each named check refuses one reason, so the error says which guard failed.
    `CREATE TABLE write_guards ( reason TEXT,
        CONSTRAINT write_guard CHECK ( reason IS NULL OR reason <> 'frozen' ),
        CONSTRAINT stale_guard CHECK ( reason IS NULL OR reason <> 'stale' ) )`,
    `CREATE TABLE specs ( id TEXT PRIMARY KEY, kind TEXT NOT NULL ${ oneOf( "kind", SPEC_KIND ) } )`,
    "CREATE TABLE releases ( id TEXT PRIMARY KEY, summary_bg TEXT, summary_en TEXT, notice_days INTEGER, planned_on TEXT, created_at TEXT NOT NULL )",
    `CREATE TABLE versions (
        id TEXT PRIMARY KEY,
        spec_id TEXT NOT NULL REFERENCES specs ( id ),
        number TEXT,
        stage TEXT NOT NULL ${ oneOf( "stage", STAGE ) },
        frozen INTEGER NOT NULL DEFAULT 0 CHECK ( frozen IN ( 0, 1 ) ),
        base_id TEXT REFERENCES versions ( id ),
        release_id TEXT REFERENCES releases ( id ),
        content_hash TEXT,
        expires_on TEXT,
        created_at TEXT NOT NULL,
        CONSTRAINT numbered CHECK ( ( stage = 'development' ) = ( number IS NULL ) )
    )`,
    // A spec has at most one version in each stage but retired (design record §4.1), and a number is never reused (§7.2).
    "CREATE UNIQUE INDEX versions_one_per_stage ON versions ( spec_id, stage ) WHERE stage <> 'retired'",
    "CREATE UNIQUE INDEX versions_number ON versions ( spec_id, number ) WHERE number IS NOT NULL",
    `CREATE TABLE version_stages (
        version_id TEXT NOT NULL REFERENCES versions ( id ),
        stage TEXT NOT NULL ${ oneOf( "stage", STAGE ) },
        entered_on TEXT,
        PRIMARY KEY ( version_id, stage )
    )`,
    // Identity is indexed, not unique: e-Examination 1.3.10 repeats identities and is loaded as published (HEL-19).
    `CREATE TABLE items (
        version_id TEXT NOT NULL REFERENCES versions ( id ),
        item_no INTEGER NOT NULL,
        kind TEXT NOT NULL,
        identity TEXT,
        parent_no INTEGER,
        position_no INTEGER NOT NULL,
        data TEXT NOT NULL,
        hash TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY ( version_id, item_no )
    )`,
    "CREATE INDEX items_identity ON items ( version_id, kind, identity )",
    `CREATE TABLE anomalies (
        version_id TEXT NOT NULL REFERENCES versions ( id ),
        anomaly_no INTEGER NOT NULL,
        item_no INTEGER,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        sheet TEXT,
        row_number INTEGER,
        column_number INTEGER,
        details TEXT NOT NULL,
        PRIMARY KEY ( version_id, anomaly_no )
    )`,
    `CREATE TABLE changelog_entries (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES versions ( id ),
        position_no INTEGER NOT NULL,
        category TEXT NOT NULL,
        origin TEXT NOT NULL ${ oneOf( "origin", CHANGE_ORIGIN ) },
        target_kind TEXT,
        target_identity TEXT,
        before_value TEXT,
        after_value TEXT,
        text_bg TEXT,
        text_en TEXT,
        dropped INTEGER NOT NULL DEFAULT 0 CHECK ( dropped IN ( 0, 1 ) ),
        source TEXT
    )`,
    "CREATE INDEX changelog_version ON changelog_entries ( version_id, position_no )",
    // number is NULL when the version read is in development, which has none yet (design record §7.2).
    `CREATE TABLE resolutions (
        version_id TEXT NOT NULL REFERENCES versions ( id ),
        spec_id TEXT NOT NULL REFERENCES specs ( id ),
        resolved_id TEXT NOT NULL REFERENCES versions ( id ),
        number TEXT,
        key_type TEXT,
        PRIMARY KEY ( version_id, spec_id )
    )`,
    "CREATE TABLE files ( hash TEXT PRIMARY KEY, size INTEGER NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL )",
    "CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL )"
];

// Plan 6a: the changelog written while editing (design record §7.5), conflicts from approved changes (§7.8), and a guard
// for a single item's revision (§7.4).
const EDITING = [
    // The number the version's next item takes. Taken from the highest left, a number a removal freed went to the next
    // insert at revision 1, and an edit made against the removed item landed on the new one (final review, C1).
    "ALTER TABLE versions ADD COLUMN next_item_no INTEGER NOT NULL DEFAULT 1",
    "UPDATE versions SET next_item_no = COALESCE( ( SELECT MAX( item_no ) FROM items WHERE items.version_id = versions.id ), 0 ) + 1",
    "ALTER TABLE changelog_entries ADD COLUMN difference_key TEXT",
    "ALTER TABLE changelog_entries ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0 CHECK ( flagged IN ( 0, 1 ) )",
    "CREATE INDEX changelog_difference ON changelog_entries ( version_id, difference_key )",
    `CREATE TABLE conflicts (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES versions ( id ),
        item_key TEXT NOT NULL,
        base_data TEXT,
        upstream_data TEXT,
        current_data TEXT,
        created_at TEXT NOT NULL
    )`,
    // SQLite cannot add a constraint to a table; this one is always empty, so it is made again with the third check.
    "DROP TABLE write_guards",
    `CREATE TABLE write_guards ( reason TEXT,
        CONSTRAINT write_guard CHECK ( reason IS NULL OR reason <> 'frozen' ),
        CONSTRAINT stale_guard CHECK ( reason IS NULL OR reason <> 'stale' ),
        CONSTRAINT edit_guard CHECK ( reason IS NULL OR reason <> 'edit' ) )`
];

const MIGRATIONS = Object.freeze( [
    Object.freeze( { id: "0001-initial", statements: Object.freeze( INITIAL ) } ),
    Object.freeze( { id: "0002-editing", statements: Object.freeze( EDITING ) } )
] );

/**
 * The tables a copy of the database carries, in an order in which each row's references already exist (design record
 * §7.11). `schema_migrations` is the target's own, and `write_guards` is always empty.
 *
 * @type {string[]}
 * @public
 */
module.exports.TABLES = Object.freeze( [ "specs", "releases", "versions", "version_stages", "items", "anomalies", "changelog_entries", "resolutions", "conflicts",
    "files", "settings" ] );

/**
 * The statement that makes a batch fail when its version is frozen (design record §7.7). It inserts into
 * `write_guards`, whose `write_guard` check refuses any row, only when the version is frozen; so a content write that
 * starts its batch with it is refused whole, with a `ConstraintError` naming `write_guard`. Its one parameter is the
 * version's ID.
 *
 * @type {string}
 * @public
 */
module.exports.GUARD_SQL = "INSERT INTO write_guards ( reason ) SELECT 'frozen' FROM versions WHERE id = ? AND frozen = 1";

// Locks the version's row until the batch ends. On PostgreSQL, under READ COMMITTED, the guard alone reads `frozen`
// without a lock, so a freeze committed after the guard passed let the rest of the batch land on a frozen version (final
// review of plan 5). SQLite and D1 serialise writers, and there it changes nothing.
const LOCK_SQL = "UPDATE versions SET frozen = frozen WHERE id = ?";

/**
 * The statements a content write starts its batch with: a lock on the version's row, then the guard (`GUARD_SQL`). A
 * freeze waits for the batch; a batch started after a freeze is refused with a `ConstraintError` naming `write_guard`.
 *
 * @method
 * @param {string} versionId
 * @returns {import( "#definitions" ).Statement[]}
 * @public
 */
module.exports.guardStatements = ( versionId ) => [
    { sql: LOCK_SQL, params: [ versionId ] },
    { sql: module.exports.GUARD_SQL, params: [ versionId ] }
];

/**
 * The statement that makes a batch fail when its version's content is no longer the content the batch was computed
 * from: it inserts into `write_guards`, whose `stale_guard` check refuses the row, when the content hash differs. It goes
 * after `guardStatements`, under their lock, so the content cannot change between the check and the write.
 *
 * A write that numbers items also passes the next item number it read. Content removed and put back hashes as it did, so
 * the hash alone would let a batch number its inserts from a mark another write has since passed.
 *
 * @method
 * @param {string} versionId
 * @param {string|null} contentHash The hash the batch's input was read under; `null` for a version without content.
 * @param {number} [nextItem] The next item number it was read under.
 * @returns {import( "#definitions" ).Statement}
 * @public
 */
module.exports.staleStatement = ( versionId, contentHash, nextItem ) => {
    const hash = contentHash === null ? "content_hash IS NOT NULL" : "content_hash IS NULL OR content_hash <> ?";
    const number = nextItem === undefined ? "" : " OR next_item_no <> ?";
    return {
        sql: `INSERT INTO write_guards ( reason ) SELECT 'stale' FROM versions WHERE id = ? AND ( ${ hash }${ number } )`,
        params: [ versionId, ...( contentHash === null ? [] : [ contentHash ] ), ...( nextItem === undefined ? [] : [ nextItem ] ) ]
    };
};

/**
 * The statement that makes a batch fail when an item is no longer at the revision an edit was made against (design
 * record §7.4: nothing is overwritten unseen). It inserts into `write_guards`, whose `edit_guard` check refuses the row,
 * so a stale item is told apart from a stale version (plan 6a, decision 11). It goes after `guardStatements`, under their
 * lock.
 *
 * @method
 * @param {string} versionId
 * @param {number} item The item's number.
 * @param {number} revision The revision the edit was made against.
 * @returns {import( "#definitions" ).Statement}
 * @public
 */
module.exports.editStatement = ( versionId, item, revision ) => ( {
    sql: "INSERT INTO write_guards ( reason ) SELECT 'edit' FROM items WHERE version_id = ? AND item_no = ? AND revision <> ?",
    params: [ versionId, item, revision ]
} );

/**
 * Applies the migrations a database has not yet recorded, each in one batch with its record, and returns their IDs.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @returns {Promise<string[]>} The IDs applied now; none when the schema is current.
 * @public
 */
module.exports.migrateSchema = async ( db ) => {
    await db.run( "CREATE TABLE IF NOT EXISTS schema_migrations ( id TEXT PRIMARY KEY, applied_at TEXT NOT NULL )" );
    const applied = new Set( ( await db.all( "SELECT id FROM schema_migrations" ) ).map( ( row ) => row.id ) );
    const now = [];
    for ( const migration of MIGRATIONS.filter( ( candidate ) => !applied.has( candidate.id ) ) ) {
        await db.batch( [
            ...migration.statements.map( ( sql ) => ( { sql: sql, params: [] } ) ),
            { sql: "INSERT INTO schema_migrations ( id, applied_at ) VALUES ( ?, ? )", params: [ migration.id, new Date().toISOString() ] }
        ] );
        now.push( migration.id );
    }
    return now;
};
