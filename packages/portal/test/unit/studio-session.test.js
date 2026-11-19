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
 * The studio's session (plan 9a): the person's key, and the roles a session carries from their grants.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { migrateSchema } = require( "@health-dev-portal/data/schema" );
const { ensureSpec } = require( "@health-dev-portal/data/versions" );
const { loadGrants, setGrants } = require( "@health-dev-portal/data/staff" );
const { augment, personKeyOf, refresh } = require( "#studio/session" );
const context = require( "#studio/context" );

const userOf = ( extra = {} ) => ( { userID: "u-1", username: "ana", email: "ana@example.test", name: "Ана Петрова", roles: [], ...extra } );

describe( "The person's key", () => {

    it( "keys an Entra sign-in by its object ID, whatever its subject", () => {
        const first = personKeyOf( userOf( { userID: "sub-a", objectID: "oid-1" } ), "openid-azure" );
        const second = personKeyOf( userOf( { userID: "sub-b", objectID: "oid-1" } ), "openid-azure" );
        assert.equal( first, "entra:oid-1" );
        assert.equal( second, first );
    } );

    it( "refuses an Entra sign-in that carries no object ID", () => {
        assert.throws( () => personKeyOf( userOf(), "openid-azure" ), Error );
    } );

    it( "keys a local sign-in by the framework's user ID", () => {
        assert.equal( personKeyOf( userOf( { userID: "local:ana" } ), "local" ), "local:ana" );
    } );

    it( "refuses a sign-in method the studio does not use", () => {
        assert.throws( () => personKeyOf( userOf( { objectID: "oid-1" } ), "openid-google" ), Error );
    } );
} );

describe( "The studio's context", () => {

    it( "refuses to hand out what nothing has attached, and gives it back once attached", () => {
        context.instance.detach();
        assert.throws( () => context.instance.db, /not attached/i );
        assert.throws( () => context.instance.store, /not attached/i );
        context.instance.attach( { db: "db", store: "store" } );
        assert.equal( context.instance.db, "db" );
        assert.equal( context.instance.store, "store" );
        context.instance.detach();
        assert.ok( Object.isFrozen( context.instance ) );
    } );
} );

describe( "The studio's session", () => {

    let db;
    before( async () => {
        db = await openDatabase( "sqlite::memory:" );
        await migrateSchema( db );
        await ensureSpec( db, "CL009", "code-list" );
    } );

    it( "augment records the person and sets their roles; refresh follows a change of grants", async () => {
        const session = { authMethod: "openid-azure", user: userOf( { userID: "sub-a", objectID: "oid-1" } ) };
        await augment( session, db, { admins: [], now: new Date( "2026-11-19T08:00:00Z" ) } );
        assert.deepEqual( session.studio, { key: "entra:oid-1", editorSpecs: [] } );
        assert.deepEqual( session.user.roles, [] );
        assert.deepEqual( await loadGrants( db, "entra:oid-1" ), [] );

        await setGrants( db, "entra:oid-1", [ { role: "editor", spec: "CL009" }, { role: "reader", spec: "*" } ], { by: "test" } );
        await refresh( session, db );
        assert.deepEqual( session.user.roles, [ "studio:reader", "studio:editor" ] );
        assert.deepEqual( session.studio.editorSpecs, [ "CL009" ] );

        await setGrants( db, "entra:oid-1", [], { by: "test" } );
        await refresh( session, db );
        assert.deepEqual( session.user.roles, [] );
        assert.deepEqual( session.studio.editorSpecs, [] );
    } );

    it( "augment names the person by username without a name, and flags the configuration's admin", async () => {
        const session = { authMethod: "local", user: userOf( { userID: "local:boris", username: "boris", email: "boris@example.test", name: "" } ) };
        await augment( session, db, { admins: [ "boris@example.test" ] } );
        const row = await db.get( "SELECT name, configured_admin FROM staff_people WHERE key = ?", [ "local:boris" ] );
        assert.equal( row.name, "boris" );
        assert.ok( row.configured_admin );
    } );

    it( "keeps the framework's admin role, which the framework itself manages", async () => {
        const session = { authMethod: "local", user: userOf( { userID: "local:root", username: "root", roles: [ "admin" ] } ) };
        await augment( session, db, { admins: [ "root" ] } );
        assert.deepEqual( session.user.roles, [ "admin" ] );
        const roles = session.user.roles;
        await refresh( session, db );
        assert.equal( session.user.roles, roles );
    } );

    it( "refresh gives a session with no studio key no studio role, without throwing", async () => {
        const session = { authMethod: "local", user: userOf( { roles: [ "studio:reader" ] } ) };
        await refresh( session, db );
        assert.deepEqual( session.user.roles, [] );
        assert.deepEqual( session.studio.editorSpecs, [] );
    } );

    it( "refresh leaves an unkeyed session only the framework's admin", async () => {
        const session = { authMethod: "local", user: userOf( { roles: [ "studio:admin", "admin" ] } ), studio: {} };
        await refresh( session, db );
        assert.deepEqual( session.user.roles, [ "admin" ] );
        assert.deepEqual( session.studio.editorSpecs, [] );
    } );

    it( "refresh counts a session with no roles at all as having none", async () => {
        const user = userOf();
        delete user.roles;
        const session = { authMethod: "local", user: user };
        await refresh( session, db );
        assert.deepEqual( session.user.roles, [] );
        assert.deepEqual( session.studio.editorSpecs, [] );
    } );

    it( "refresh leaves the roles untouched when nothing changed", async () => {
        const session = { authMethod: "local", user: userOf( { userID: "local:ana", username: "ana" } ) };
        await augment( session, db, { admins: [] } );
        const roles = session.user.roles;
        const studio = session.studio;
        const specs = studio.editorSpecs;
        await refresh( session, db );
        assert.equal( session.user.roles, roles );
        assert.equal( session.studio.editorSpecs, specs );
    } );
} );
