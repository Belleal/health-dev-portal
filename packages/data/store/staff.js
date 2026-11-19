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
 * The staff area's people, what each may do, and the log of how that changed (plan 9a). A person is known by the
 * identity provider's stable key; a grant is a role on a spec, `*` standing for every spec.
 *
 * A grant never takes the place of configuration: `configured_admin` is only what the last sign-in found, and whoever
 * reads it decides what it is worth. Times are UTC ISO strings, and every sort is in JavaScript, never by the database's
 * collation (design record §3.2).
 */

const crypto = require( "node:crypto" );
const { insertStatements } = require( "#database" );

/**
 * What a person may be granted.
 *
 * @type {{READER: string, EDITOR: string, APPROVER: string, ADMIN: string}}
 * @public
 */
module.exports.ROLE = Object.freeze( { READER: "reader", EDITOR: "editor", APPROVER: "approver", ADMIN: "admin" } );

/**
 * @type {string[]}
 * @public
 */
module.exports.ROLES = Object.freeze( Object.values( module.exports.ROLE ) );

/**
 * The spec of a grant that holds for every spec, present and future.
 *
 * @type {string}
 * @public
 */
module.exports.EVERY_SPEC = "*";

const plain = ( a, b ) => a < b ? -1 : a > b ? 1 : 0;
const byRoleThenSpec = ( a, b ) => plain( a.role, b.role ) || plain( a.spec, b.spec );
const collator = new Intl.Collator( "bg" );

const moment = ( value, what ) => {
    const date = value instanceof Date ? value : new Date( value );
    if ( Number.isNaN( date.getTime() ) ) {
        throw new RangeError( `${ what } is not a time.` );
    }
    return date.toISOString();
};

/**
 * Records that a person signed in: a new person starts with no grant, a known one has the name, the admin flag and the
 * time of the last sign-in refreshed, and keeps when first seen.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {Object} person
 * @param {string} person.key The identity provider's stable key for them.
 * @param {string} person.name
 * @param {boolean} person.configuredAdmin Whether configuration names them an admin.
 * @param {Date} [person.at] When; now without it.
 * @returns {Promise<void>}
 * @throws {RangeError} For a missing key or name, or a time that is none.
 * @public
 */
module.exports.recordSignIn = async ( db, { key, name, configuredAdmin, at = new Date() } ) => {
    if ( typeof key !== "string" || key === "" || typeof name !== "string" || name.trim() === "" ) {
        throw new RangeError( "A sign-in records a person's key and name." );
    }
    const when = moment( at, "The sign-in's time" );
    // One statement, so two sign-ins of one person at once cannot both insert, and neither can lose the first one's time.
    await db.run( `INSERT INTO staff_people ( key, name, configured_admin, first_seen_at, last_seen_at ) VALUES ( ?, ?, ?, ?, ? )
        ON CONFLICT ( key ) DO UPDATE SET name = excluded.name, configured_admin = excluded.configured_admin, last_seen_at = excluded.last_seen_at`,
    [ key, name.trim(), configuredAdmin ? 1 : 0, when, when ] );
};

/**
 * What a person holds, by role and then spec.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} key
 * @returns {Promise<Array<{role: string, spec: string}>>} Empty for a person with none, or none known.
 * @public
 */
module.exports.loadGrants = async ( db, key ) => ( await db.all( "SELECT role, spec FROM staff_grants WHERE person_key = ?", [ key ] ) )
    .map( ( row ) => ( { role: row.role, spec: row.spec } ) ).sort( byRoleThenSpec );

/**
 * Everyone who has signed in, by name in Bulgarian collation, with what each holds.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @returns {Promise<Array<{key: string, name: string, configuredAdmin: boolean, firstSeenAt: Date, lastSeenAt: Date,
 *     grants: Array<{role: string, spec: string}>}>>}
 * @public
 */
module.exports.listPeople = async ( db ) => {
    const grants = new Map();
    for ( const row of await db.all( "SELECT person_key, role, spec FROM staff_grants" ) ) {
        grants.set( row.person_key, [ ...( grants.get( row.person_key ) || [] ), { role: row.role, spec: row.spec } ] );
    }
    return ( await db.all( "SELECT key, name, configured_admin, first_seen_at, last_seen_at FROM staff_people" ) )
        .map( ( row ) => ( { key: row.key, name: row.name, configuredAdmin: Number( row.configured_admin ) === 1, firstSeenAt: new Date( row.first_seen_at ),
            lastSeenAt: new Date( row.last_seen_at ), grants: ( grants.get( row.key ) || [] ).sort( byRoleThenSpec ) } ) )
        // The key breaks a tie of two people of one name, so the order is the same on every read and both databases.
        .sort( ( a, b ) => collator.compare( a.name, b.name ) || plain( a.key, b.key ) );
};

// Everything a set can get wrong, checked before the first write so that a refused set changes nothing. The known
// specs are read here and not through `listSpecs`: `versions` needs `schema`, which needs `ROLE` from this file, so
// requiring it here would be a cycle.
const checked = async ( db, grants ) => {
    if ( !Array.isArray( grants ) ) {
        throw new RangeError( "A set of grants is a list." );
    }
    const known = new Set( ( await db.all( "SELECT id FROM specs" ) ).map( ( row ) => row.id ) );
    const seen = new Map();
    for ( const grant of grants ) {
        const { role, spec } = grant || {};
        if ( !module.exports.ROLES.includes( role ) ) {
            throw new RangeError( `${ JSON.stringify( role ) } is not a role: ${ module.exports.ROLES.join( ", " ) }.` );
        }
        if ( spec !== module.exports.EVERY_SPEC && role !== module.exports.ROLE.EDITOR ) {
            throw new RangeError( `The ${ role } role holds for every spec, "${ module.exports.EVERY_SPEC }", and not for one.` );
        }
        if ( spec !== module.exports.EVERY_SPEC && !known.has( spec ) ) {
            throw new RangeError( `${ JSON.stringify( spec ) } is not a spec.` );
        }
        // A repeated grant is one grant: its primary key would refuse the second, and the whole set with it.
        seen.set( `${ role }\n${ spec }`, { role: role, spec: spec } );
    }
    const set = [ ...seen.values() ];
    const editor = set.filter( ( one ) => one.role === module.exports.ROLE.EDITOR );
    if ( editor.some( ( one ) => one.spec === module.exports.EVERY_SPEC ) && editor.some( ( one ) => one.spec !== module.exports.EVERY_SPEC ) ) {
        throw new RangeError( "An editor holds every spec or named ones, not both." );
    }
    return set;
};

/**
 * Replaces everything a person holds, and records the change, in one batch.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} key The person.
 * @param {Array<{role: string, spec: string}>} grants The whole new set; empty withdraws everything.
 * @param {Object} change
 * @param {string} change.by Who made the change, kept for the log.
 * @param {Date} [change.at] When; now without it.
 * @returns {Promise<void>}
 * @throws {RangeError} For an unknown person, an unknown role, a named spec on a role other than editor, an editor of
 *     both every spec and named ones, a named spec that is none, or no author. Nothing is written.
 * @public
 */
module.exports.setGrants = async ( db, key, grants, { by, at = new Date() } ) => {
    if ( typeof by !== "string" || by.trim() === "" ) {
        throw new RangeError( "Every change of grants records who made it." );
    }
    const when = moment( at, "The change's time" );
    const set = await checked( db, grants );
    if ( !await db.get( "SELECT key FROM staff_people WHERE key = ?", [ key ] ) ) {
        throw new RangeError( `${ JSON.stringify( key ) } is not a person who has signed in.` );
    }
    await db.batch( [
        { sql: "DELETE FROM staff_grants WHERE person_key = ?", params: [ key ] },
        ...insertStatements( "staff_grants", [ "person_key", "role", "spec" ], set.map( ( one ) => [ key, one.role, one.spec ] ) ),
        { sql: "INSERT INTO staff_grant_changes ( id, person_key, changed_by, changed_at, grants ) VALUES ( ?, ?, ?, ?, ? )",
            params: [ crypto.randomUUID(), key, by.trim(), when, JSON.stringify( set ) ] }
    ] );
};

/**
 * The changes of grants, newest first.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{key?: string|null, limit?: number}} [options] One person's, or everyone's without a key; 50 without a limit.
 * @returns {Promise<Array<{id: string, key: string, by: string, at: Date, grants: Array<{role: string, spec: string}>}>>}
 * @public
 */
module.exports.grantChanges = async ( db, { key = null, limit = 50 } = {} ) => {
    const rows = key === null ? await db.all( "SELECT id, person_key, changed_by, changed_at, grants FROM staff_grant_changes" )
        : await db.all( "SELECT id, person_key, changed_by, changed_at, grants FROM staff_grant_changes WHERE person_key = ?", [ key ] );
    return rows.map( ( row ) => ( { id: row.id, key: row.person_key, by: row.changed_by, at: new Date( row.changed_at ), grants: JSON.parse( row.grants ) } ) )
        // The ID breaks a tie of two changes at one moment, so the newest is the same on every read and both databases.
        .sort( ( a, b ) => plain( b.at.getTime(), a.at.getTime() ) || plain( b.id, a.id ) ).slice( 0, limit );
};
