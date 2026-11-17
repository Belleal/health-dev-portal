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
 * The environments' status (plan 8c, decision 6; design record §8.7), against a real server on a copy of the seed: first
 * as nobody has set it, then as staff set it through the data layer, as hdp-status does. No page or feed names who.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { addMaintenance, cancelMaintenance, setStatus } = require( "@health-dev-portal/data/status" );
const { SEEDED, assertPublic, get, startPortal } = require( "./support/server" );

const BRIEF = "public, max-age=60";
const ATOM = "application/atom+xml; charset=utf-8";

describe( "The environments' status", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    let db;
    before( async () => {
        portal = await startPortal();
        db = await openDatabase( `sqlite:${ portal.database }` );
    } );
    after( async () => {
        if ( db ) {
            await db.close();
        }
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "says Not reported before any status is set", async () => {
        const response = await get( "/en/status" );
        assert.equal( response.status, 200 );
        assertPublic( response, BRIEF );
        assert.match( response.text, /Production environment[\s\S]*?Not reported[\s\S]*?Test environment[\s\S]*?Not reported/ );
        assert.doesNotMatch( response.text, /Operational/ );
        const feed = await get( "/en/status/feed.atom" );
        assertPublic( feed, BRIEF, ATOM );
        assert.match( feed.text, /<updated>1970-01-01T00:00:00Z<\/updated>/ );
        assert.doesNotMatch( feed.text, /<entry>/ );
    } );

    it( "shows each environment's state, message and time, and the windows to come, never who", async () => {
        await setStatus( db, { environment: "production", state: "degraded", message: { bg: "Бавни отговори", en: "Slow answers" }, by: "staff-person-a",
            at: new Date( "2026-11-17T08:00:00Z" ) } );
        await setStatus( db, { environment: "test", state: "operational", by: "staff-person-b", at: new Date( "2026-11-17T09:00:00Z" ) } );
        const ended = await addMaintenance( db, { environment: "test", startsAt: new Date( "2026-11-01T20:00:00Z" ), endsAt: new Date( "2026-11-01T22:00:00Z" ),
            by: "staff-person-a" } );
        await addMaintenance( db, { environment: "production", startsAt: new Date( "2099-11-20T20:00:00Z" ), endsAt: new Date( "2099-11-20T21:30:00Z" ),
            message: { bg: "Обновяване", en: "Upgrade" }, by: "staff-person-a" } );
        const cancelled = await addMaintenance( db, { environment: "production", startsAt: new Date( "2099-12-01T20:00:00Z" ), endsAt: new Date( "2099-12-01T21:00:00Z" ),
            by: "staff-person-a" } );
        await cancelMaintenance( db, cancelled, { by: "staff-person-b" } );
        const bg = ( await get( "/bg/status" ) ).text;
        assert.match( bg, /Продукционна среда[\s\S]*?<span class="state state-degraded">Работи със затруднения<\/span>[\s\S]*?Бавни отговори[\s\S]*?17\.11\.2026 10:00/ );
        assert.match( bg, /Тестова среда[\s\S]*?<span class="state state-operational">Работи нормално<\/span>/ );
        assert.match( bg, /20\.11\.2099 22:00 – 20\.11\.2099 23:30[\s\S]*?Обновяване/ );
        // An ended window and a cancelled one are not shown.
        assert.doesNotMatch( bg, /01\.11\.2026 22:00/ );
        assert.doesNotMatch( bg, /01\.12\.2099/ );
        assert.match( ( await get( "/en/status" ) ).text, /Slow answers[\s\S]*?17 Nov 2026, 10:00/ );
        assert.doesNotMatch( bg, /staff-person/ );
        assert.ok( ended );
    } );

    it( "serves the status feed, newest first, naming no one", async () => {
        const response = await get( "/bg/status/feed.atom" );
        assertPublic( response, BRIEF, ATOM );
        const feed = response.text;
        assert.match( feed, /^<\?xml version="1\.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/ );
        assert.match( feed, /<link href="https:\/\/developers\.example\.test\/bg\/status\/feed\.atom" rel="self"\/>/ );
        assert.equal( [ ...feed.matchAll( /<entry>/g ) ].length, 5 );
        const updated = [ ...feed.matchAll( /<entry>[\s\S]*?<updated>([^<]+)<\/updated>/g ) ].map( ( found ) => found[ 1 ] );
        assert.deepEqual( updated, [ ...updated ].sort().reverse() );
        assert.match( feed, /Отменена/ );
        assert.doesNotMatch( feed, /staff-person/ );
    } );

    it( "links the feed from the page and names it in the head", async () => {
        const page = ( await get( "/bg/status" ) ).text;
        assert.match( page, /<link rel="alternate" type="application\/atom\+xml"[^>]*href="https:\/\/developers\.example\.test\/bg\/status\/feed\.atom">/ );
        assert.match( page, /<a href="\/bg\/status\/feed\.atom">/ );
    } );
} );
