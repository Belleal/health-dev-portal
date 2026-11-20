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
 * The staff's people, their role grants and the log of changes to them (plan 9a), on both databases.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { isDeepStrictEqual } = require( "node:util" );
const { eachDatabase, holding } = require( "./support/databases" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, listSpecs } = require( "#versions" );
const { EVERY_SPEC, ROLE, ROLES, grantChanges, listPeople, loadGrants, recordSignIn, setGrants } = require( "#staff" );

const at = ( iso ) => new Date( iso );
const pause = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) );
const settled = ( promise ) => promise.then( ( value ) => ( { ok: true, value: value } ), ( error ) => ( { ok: false, error: error } ) );

eachDatabase( "Staff", ( db ) => {

    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "CL009", "code-list" );
        await ensureSpec( db(), "e-prescription", "module" );
    } );

    it( "names the roles and the spec that stands for every spec", () => {
        assert.deepEqual( ROLES, [ "reader", "editor", "approver", "admin" ] );
        assert.equal( ROLE.EDITOR, "editor" );
        assert.equal( EVERY_SPEC, "*" );
    } );

    it( "records a first sign-in, and the next one refreshes the name and last seen but keeps the first", async () => {
        await recordSignIn( db(), { key: "oid-1", name: "Ана", configuredAdmin: false, at: at( "2026-11-19T08:00:00Z" ) } );
        await recordSignIn( db(), { key: "oid-1", name: "Ана Петрова", configuredAdmin: true, at: at( "2026-11-19T09:30:00Z" ) } );
        const [ person ] = ( await listPeople( db() ) ).filter( ( one ) => one.key === "oid-1" );
        assert.equal( person.name, "Ана Петрова" );
        assert.equal( person.configuredAdmin, true );
        assert.equal( person.firstSeenAt.toISOString(), "2026-11-19T08:00:00.000Z" );
        assert.equal( person.lastSeenAt.toISOString(), "2026-11-19T09:30:00.000Z" );
    } );

    it( "starts a person with no grant", async () => {
        await recordSignIn( db(), { key: "oid-2", name: "Борис", configuredAdmin: false } );
        assert.deepEqual( await loadGrants( db(), "oid-2" ), [] );
    } );

    it( "replaces a person's grants and records who changed them", async () => {
        await recordSignIn( db(), { key: "oid-3", name: "Васил", configuredAdmin: false } );
        await recordSignIn( db(), { key: "oid-admin", name: "Админ", configuredAdmin: true } );
        await setGrants( db(), "oid-3", [ { role: "reader", spec: "*" }, { role: "editor", spec: "CL009" } ], { by: "oid-admin", at: at( "2026-11-19T10:00:00Z" ) } );
        assert.deepEqual( await loadGrants( db(), "oid-3" ), [ { role: "editor", spec: "CL009" }, { role: "reader", spec: "*" } ] );
        await setGrants( db(), "oid-3", [ { role: "approver", spec: "*" } ], { by: "oid-admin", at: at( "2026-11-19T11:00:00Z" ) } );
        assert.deepEqual( await loadGrants( db(), "oid-3" ), [ { role: "approver", spec: "*" } ] );
        const changes = await grantChanges( db(), { key: "oid-3" } );
        assert.equal( changes.length, 2 );
        assert.equal( changes[ 0 ].by, "oid-admin" );
        assert.equal( changes[ 0 ].key, "oid-3" );
        assert.equal( changes[ 0 ].at.toISOString(), "2026-11-19T11:00:00.000Z" );
        assert.deepEqual( changes[ 0 ].grants, [ { role: "approver", spec: "*" } ] );
        assert.deepEqual( changes[ 1 ].grants, [ { role: "reader", spec: "*" }, { role: "editor", spec: "CL009" } ] );
        assert.equal( ( await grantChanges( db(), { limit: 1 } ) ).length, 1 );
    } );

    for ( const [ name, key, grants ] of [
        [ "an unknown role", "oid-4", [ { role: "owner", spec: "*" } ] ],
        [ "a named spec on a role that takes only every spec", "oid-4", [ { role: "approver", spec: "CL009" } ] ],
        [ "an editor of every spec and of a named one", "oid-4", [ { role: "editor", spec: "*" }, { role: "editor", spec: "CL009" } ] ],
        [ "a spec nobody knows", "oid-4", [ { role: "editor", spec: "NOPE" } ] ],
        [ "an unknown person", "oid-nobody", [ { role: "reader", spec: "*" } ] ]
    ] ) {
        it( `refuses a role, a limit or a spec it does not accept, and writes nothing: ${ name }`, async () => {
            await recordSignIn( db(), { key: "oid-4", name: "Георги", configuredAdmin: false } );
            await recordSignIn( db(), { key: "oid-admin", name: "Админ", configuredAdmin: true } );
            const before = await grantChanges( db() );
            await assert.rejects( setGrants( db(), key, grants, { by: "oid-admin" } ), RangeError );
            assert.deepEqual( await loadGrants( db(), "oid-4" ), [] );
            assert.deepEqual( await grantChanges( db() ), before );
        } );
    }

    it( "lists people by name, with their grants and whether configuration made them admin", async () => {
        const people = await listPeople( db() );
        const names = people.map( ( one ) => one.name );
        assert.deepEqual( names, [ ...names ].sort( new Intl.Collator( "bg" ).compare ) );
        const vasil = people.find( ( one ) => one.key === "oid-3" );
        assert.deepEqual( vasil.grants, [ { role: "approver", spec: "*" } ] );
        assert.equal( vasil.configuredAdmin, false );
        assert.equal( people.find( ( one ) => one.key === "oid-admin" ).configuredAdmin, true );
    } );

    it( "lists every spec", async () => {
        assert.deepEqual( await listSpecs( db() ), [ "CL009", "e-prescription" ] );
    } );

    // On PostgreSQL, under READ COMMITTED, each of two replacements made at once deleted only the grants its own snapshot
    // saw, so both new sets stayed and the stored set was their union: here an editor of every spec and of a named one,
    // which the store refuses for any one request, and which no change in the log shows (CodeRabbit on #10). A second
    // connection holds the person's one grant until both are in flight, so both reach their DELETE before either commits.
    // SQLite serialises writers, so there the two simply run one after the other.
    it( "lets one of two replacements made at once for one person stand whole, never their union", async () => {
        await recordSignIn( db(), { key: "oid-5", name: "Даниела", configuredAdmin: false } );
        await setGrants( db(), "oid-5", [ { role: "reader", spec: "*" } ], { by: "oid-admin" } );
        const requests = [ [ { role: "editor", spec: "*" } ], [ { role: "editor", spec: "CL009" } ] ];
        const free = await holding( db(), "UPDATE staff_grants SET role = role WHERE person_key = $1", [ "oid-5" ] );
        const first = settled( setGrants( db(), "oid-5", requests[ 0 ], { by: "oid-admin" } ) );
        await pause( free ? 500 : 0 );
        const second = settled( setGrants( db(), "oid-5", requests[ 1 ], { by: "oid-second-admin" } ) );
        if ( free ) {
            await pause( 500 );
            await free();
        }
        const results = [ await first, await second ];
        const stored = await loadGrants( db(), "oid-5" );
        const outcome = JSON.stringify( { stored: stored, results: results.map( ( result ) => result.ok || result.error.message ) } );
        assert.equal( requests.filter( ( request, index ) => results[ index ].ok && isDeepStrictEqual( request, stored ) ).length, 1, outcome );
        assert.deepEqual( ( await grantChanges( db(), { key: "oid-5", limit: 1 } ) )[ 0 ].grants, stored, outcome );
    } );
} );
