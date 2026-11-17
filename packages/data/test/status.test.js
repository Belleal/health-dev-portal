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
 * Environment status (plan 8c, decision 6; design record §8.7): each environment's state as staff last set it, the
 * maintenance windows announced, and the events a feed lists, on both databases. Who made a change is stored and never
 * read back by anything public (§10.2).
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { eachDatabase } = require( "./support/databases" );
const { migrateSchema } = require( "#schema" );
const { ENVIRONMENTS, STATES, addMaintenance, cancelMaintenance, currentStatus, maintenanceWindows, setStatus, statusEvents, statusHistory } = require( "#status" );

const at = ( iso ) => new Date( iso );

eachDatabase( "Environment status", ( db ) => {

    before( async () => {
        await migrateSchema( db() );
    } );

    it( "names the environments and the states, in order", () => {
        assert.deepEqual( ENVIRONMENTS, [ "production", "test" ] );
        assert.deepEqual( STATES, [ "operational", "degraded", "maintenance", "outage" ] );
    } );

    it( "reports nothing for an environment no one has set", async () => {
        assert.deepEqual( await currentStatus( db() ), [ { environment: "production", state: null, message: null, updatedAt: null },
            { environment: "test", state: null, message: null, updatedAt: null } ] );
        assert.deepEqual( await maintenanceWindows( db(), { now: at( "2026-11-17T12:00:00Z" ) } ), [] );
        assert.deepEqual( await statusEvents( db() ), [] );
    } );

    it( "keeps the latest update of each environment, and never says who", async () => {
        await setStatus( db(), { environment: "test", state: "degraded", message: { bg: "Бавно", en: "Slow" }, by: "staff-a", at: at( "2026-11-17T08:00:00Z" ) } );
        await setStatus( db(), { environment: "test", state: "operational", by: "staff-b", at: at( "2026-11-17T09:00:00Z" ) } );
        // Written later, dated earlier: the latest is the latest by its time, not by when it was written.
        await setStatus( db(), { environment: "test", state: "outage", by: "staff-c", at: at( "2026-11-17T07:00:00Z" ) } );
        const [ production, test ] = await currentStatus( db() );
        assert.deepEqual( production, { environment: "production", state: null, message: null, updatedAt: null } );
        assert.deepEqual( test, { environment: "test", state: "operational", message: null, updatedAt: "2026-11-17T09:00:00.000Z" } );
        const history = await statusHistory( db() );
        assert.deepEqual( history.map( ( one ) => [ one.state, one.updatedAt ] ), [ [ "operational", "2026-11-17T09:00:00.000Z" ],
            [ "degraded", "2026-11-17T08:00:00.000Z" ], [ "outage", "2026-11-17T07:00:00.000Z" ] ] );
        assert.deepEqual( history[ 1 ].message, { bg: "Бавно", en: "Slow" } );
        assert.equal( ( await statusHistory( db(), { limit: 1 } ) ).length, 1 );
        const everything = JSON.stringify( [ await currentStatus( db() ), history, await statusEvents( db() ) ] );
        assert.equal( everything.includes( "staff-" ), false );
        // Stored all the same, for staff (§10.1).
        assert.deepEqual( ( await db().all( "SELECT updated_by FROM status_updates" ) ).map( ( row ) => row.updated_by ).sort(), [ "staff-a", "staff-b", "staff-c" ] );
    } );

    it( "refuses an unknown environment or state, a one-language message and a blank author", async () => {
        const good = { environment: "production", state: "operational", by: "staff-a" };
        for ( const bad of [ { ...good, environment: "staging" }, { ...good, state: "fine" }, { ...good, message: { bg: "Само български" } },
            { ...good, message: { bg: "Текст", en: "  " } }, { ...good, by: "  " }, { ...good, by: undefined } ] ) {
            await assert.rejects( setStatus( db(), bad ), RangeError, JSON.stringify( bad ) );
        }
        await assert.rejects( setStatus( db(), { ...good, state: "fine" } ), /operational, degraded, maintenance, outage/ );
    } );

    it( "lists the windows that have not ended, without the cancelled", async () => {
        const window = ( startsAt, endsAt, extra = {} ) => addMaintenance( db(), { environment: "production", startsAt: at( startsAt ), endsAt: at( endsAt ),
            by: "staff-a", at: at( "2026-11-10T10:00:00Z" ), ...extra } );
        await window( "2026-11-12T20:00:00Z", "2026-11-12T22:00:00Z" );
        const cancelled = await window( "2026-11-20T20:00:00Z", "2026-11-20T22:00:00Z" );
        const later = await window( "2026-11-25T20:00:00Z", "2026-11-25T23:00:00Z", { message: { bg: "Обновяване", en: "Upgrade" } } );
        const now = await window( "2026-11-17T11:00:00Z", "2026-11-17T13:00:00Z" );
        assert.equal( await cancelMaintenance( db(), cancelled, { by: "staff-b", at: at( "2026-11-15T09:00:00Z" ) } ), true );
        // A second cancellation, and one of no window, change nothing.
        assert.equal( await cancelMaintenance( db(), cancelled, { by: "staff-b" } ), false );
        assert.equal( await cancelMaintenance( db(), "no-such-window", { by: "staff-b" } ), false );
        const open = await maintenanceWindows( db(), { now: at( "2026-11-17T12:00:00Z" ) } );
        assert.deepEqual( open.map( ( one ) => one.id ), [ now, later ] );
        assert.deepEqual( open[ 1 ], { id: later, environment: "production", startsAt: "2026-11-25T20:00:00.000Z", endsAt: "2026-11-25T23:00:00.000Z",
            message: { bg: "Обновяване", en: "Upgrade" } } );
    } );

    it( "refuses a window that ends before it starts, or with a time that is none", async () => {
        const good = { environment: "test", startsAt: at( "2026-11-20T20:00:00Z" ), endsAt: at( "2026-11-20T22:00:00Z" ), by: "staff-a" };
        for ( const bad of [ { ...good, endsAt: good.startsAt }, { ...good, endsAt: at( "2026-11-20T19:00:00Z" ) }, { ...good, startsAt: new Date( "nope" ) },
            { ...good, environment: "staging" }, { ...good, by: "" } ] ) {
            await assert.rejects( addMaintenance( db(), bad ), RangeError );
        }
    } );

    it( "gives the feed's events newest first, a cancelled window at its cancellation", async () => {
        const events = await statusEvents( db() );
        assert.ok( events.every( ( one, index ) => index === 0 || events[ index - 1 ].at >= one.at ), JSON.stringify( events.map( ( one ) => one.at ) ) );
        const cancelled = events.find( ( one ) => one.kind === "maintenance" && one.cancelled );
        assert.equal( cancelled.at, "2026-11-15T09:00:00.000Z" );
        assert.equal( events.filter( ( one ) => one.kind === "status" ).length, 3 );
        assert.equal( events.filter( ( one ) => one.kind === "maintenance" ).length, 4 );
        assert.equal( ( await statusEvents( db(), { limit: 2 } ) ).length, 2 );
    } );
} );
