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
 * The People screen, against a real server on a copy of the seed (plan 9a): an admin lists the staff and gives roles, the
 * change records who made it, and everyone else is refused by the server, the screen and the service alike, on every
 * request and not at sign-in.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
// First: it sets the environment ti-engine reads as it loads.
const { SEED, SEEDED, startPortal } = require( "./support/server" );
const { grant, signIn } = require( "./support/staff" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { EVERY_SPEC, ROLE, grantChanges, recordSignIn } = require( "@health-dev-portal/data/staff" );

const SPEC = SEED.ePrescription.spec;

describe( "The People screen", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
        for ( const username of [ "admin", "editor", "editor-cl009", "approver", "reader", "nobody", "config-admin" ] ) {
            await signIn( portal.url, username );
        }
        await grant( portal.database, "admin", [ { role: ROLE.ADMIN, spec: EVERY_SPEC } ] );
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    const withDatabase = async ( work ) => {
        const db = await openDatabase( `sqlite:${ portal.database }` );
        try {
            return await work( db );
        } finally {
            await db.close();
        }
    };
    const json = ( session ) => ( { accept: "application/json", cookie: session.cookie } );
    const screen = ( path, session ) => fetch( `${ portal.url }${ path }`, { redirect: "manual", headers: json( session ) } );
    const people = async ( session ) => {
        const response = await screen( "/app/people", session );
        assert.equal( response.status, 200 );
        return ( await response.json() ).data;
    };
    // The service as the framework's client calls it: JSON, with the session's cookie and its CSRF token.
    const save = ( session, body ) => fetch( `${ portal.url }/app/people-grants`, { method: "POST", redirect: "manual",
        headers: { ...json( session ), "content-type": "application/json", "x-xsrf-token": session.token, origin: portal.url }, body: JSON.stringify( body ) } );
    const grantsOf = async ( key ) => ( await withDatabase( async ( db ) => ( await require( "@health-dev-portal/data/staff" ).listPeople( db ) ) ) ).find( ( one ) => one.key === key ).grants;

    it( "an admin lists people with their roles, specs and whether configuration made them admin", async () => {
        await grant( portal.database, "editor", [ { role: ROLE.EDITOR, spec: EVERY_SPEC } ] );
        const data = await people( await signIn( portal.url, "admin" ) );
        const byKey = new Map( data.people.map( ( one ) => [ one.key, one ] ) );
        assert.deepEqual( byKey.get( "local:editor" ).grants, [ { role: ROLE.EDITOR, spec: EVERY_SPEC } ] );
        assert.equal( byKey.get( "local:editor" ).configuredAdmin, false );
        assert.equal( byKey.get( "local:config-admin" ).configuredAdmin, true );
        assert.equal( byKey.get( "local:admin" ).name, "Test Admin" );
        assert.ok( data.specs.includes( SPEC ), "the specs a grant may name" );
        assert.ok( Array.isArray( data.changes ) );
    } );

    it( "an admin is served the screen, which names its component and shows nothing as markup", async () => {
        const session = await signIn( portal.url, "admin" );
        const html = await fetch( `${ portal.url }/app/people`, { redirect: "manual", headers: { accept: "text/html", "hx-request": "true", cookie: session.cookie } } );
        assert.equal( html.status, 200 );
        const text = await html.text();
        assert.match( text, /x-data="tiStudioPeople"/ );
        assert.doesNotMatch( text, /x-html/ );
    } );

    it( "an admin limits an editor to CL009, and the change records who made it", async () => {
        const session = await signIn( portal.url, "admin" );
        const response = await save( session, { key: "local:editor-cl009", grants: [ { role: ROLE.EDITOR, spec: "CL009" } ] } );
        assert.equal( response.status, 200 );
        assert.deepEqual( await grantsOf( "local:editor-cl009" ), [ { role: ROLE.EDITOR, spec: "CL009" } ] );
        const [ change ] = await withDatabase( ( db ) => grantChanges( db, { key: "local:editor-cl009", limit: 1 } ) );
        assert.equal( change.by, "local:admin" );
        assert.deepEqual( change.grants, [ { role: ROLE.EDITOR, spec: "CL009" } ] );
        assert.equal( ( await people( session ) ).changes[ 0 ].by, "local:admin" );
    } );

    it( "everyone but an admin is refused, the screen and the service alike", async () => {
        const roles = { editor: ROLE.EDITOR, approver: ROLE.APPROVER, reader: ROLE.READER };
        for ( const [ username, role ] of Object.entries( roles ) ) {
            await grant( portal.database, username, [ { role: role, spec: EVERY_SPEC } ] );
        }
        for ( const username of [ "editor", "approver", "reader", "nobody" ] ) {
            const session = await signIn( portal.url, username );
            assert.equal( ( await screen( "/app/people", session ) ).status, 403, `${ username }: JSON` );
            const html = await fetch( `${ portal.url }/app/people`, { redirect: "manual", headers: { accept: "text/html", "hx-request": "true", cookie: session.cookie } } );
            assert.equal( html.status, 403, `${ username }: HTML` );
            const before = JSON.stringify( await grantsOf( `local:${ username }` ) );
            assert.equal( ( await save( session, { key: `local:${ username }`, grants: [ { role: ROLE.ADMIN, spec: EVERY_SPEC } ] } ) ).status, 403, `${ username }: service` );
            assert.equal( JSON.stringify( await grantsOf( `local:${ username }` ) ), before, `${ username } changed nothing` );
        }
    } );

    it( "a role taken away while the screen is open refuses the next save", async () => {
        const session = await signIn( portal.url, "admin" );
        await people( session );
        await grant( portal.database, "admin", [] );
        assert.equal( ( await save( session, { key: "local:reader", grants: [] } ) ).status, 403 );
        assert.equal( ( await screen( "/app/people", session ) ).status, 403 );
        await grant( portal.database, "admin", [ { role: ROLE.ADMIN, spec: EVERY_SPEC } ] );
    } );

    it( "with every studio admin grant gone, the configuration's admin still gives the role back", async () => {
        await grant( portal.database, "admin", [] );
        const session = await signIn( portal.url, "config-admin" );
        const response = await save( session, { key: "local:admin", grants: [ { role: ROLE.ADMIN, spec: EVERY_SPEC } ] } );
        assert.equal( response.status, 200 );
        assert.deepEqual( await grantsOf( "local:admin" ), [ { role: ROLE.ADMIN, spec: EVERY_SPEC } ] );
    } );

    it( "a display name with markup comes back as text", async () => {
        const name = "<img src=x onerror=alert(1)>";
        await withDatabase( ( db ) => recordSignIn( db, { key: "local:markup", name: name, configuredAdmin: false } ) );
        const data = await people( await signIn( portal.url, "admin" ) );
        assert.equal( data.people.find( ( one ) => one.key === "local:markup" ).name, name );
    } );

    it( "refuses a grant the store refuses, and says why", async () => {
        const session = await signIn( portal.url, "admin" );
        const response = await save( session, { key: "local:reader", grants: [ { role: ROLE.READER, spec: "CL009" } ] } );
        assert.equal( response.status, 422 );
        const body = await response.json();
        assert.match( JSON.stringify( body ), /holds for every spec/ );
        const unknown = await save( session, { key: "local:no-such-person", grants: [] } );
        assert.equal( unknown.status, 422 );
    } );
} );
