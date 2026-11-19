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
 * The Settings and Environment status screens, against a real server on a copy of the seed (plan 9a): an admin switches
 * self-approval, sets an environment's state and announces a window in Sofia time; the public page shows none of who did
 * it; and everyone else is refused, the screens and the services alike.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
// First: it sets the environment ti-engine reads as it loads.
const { SEEDED, get, startPortal } = require( "./support/server" );
const { grant, signIn } = require( "./support/staff" );
const { formatSofia } = require( "#studio/sofia-time" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { readSetting } = require( "@health-dev-portal/data/files" );
const { TWO_PEOPLE } = require( "@health-dev-portal/data/review" );
const { EVERY_SPEC, ROLE } = require( "@health-dev-portal/data/staff" );

describe( "Settings and Environment status", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
        for ( const username of [ "admin", "editor", "approver", "reader", "nobody" ] ) {
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
    const view = ( name, session ) => fetch( `${ portal.url }/app/${ name }`, { redirect: "manual", headers: json( session ) } );
    const dataOf = async ( name, session ) => {
        const response = await view( name, session );
        assert.equal( response.status, 200, name );
        return ( await response.json() ).data;
    };
    const call = ( service, session, body ) => fetch( `${ portal.url }/app/${ service }`, { method: "POST", redirect: "manual",
        headers: { ...json( session ), "content-type": "application/json", "x-xsrf-token": session.token, origin: portal.url }, body: JSON.stringify( body ) } );
    const html = ( name, session ) => fetch( `${ portal.url }/app/${ name }`, { redirect: "manual", headers: { accept: "text/html", "hx-request": "true", cookie: session.cookie } } );
    const updatesOf = () => withDatabase( ( db ) => db.all( "SELECT id, environment, state, message_bg, message_en, updated_by FROM status_updates ORDER BY updated_at DESC, id DESC" ) );
    const snapshot = () => withDatabase( async ( db ) => JSON.stringify( [ await readSetting( db, TWO_PEOPLE ), await db.all( "SELECT id FROM status_updates ORDER BY id" ),
        await db.all( "SELECT id, cancelled_at FROM maintenance_windows ORDER BY id" ) ] ) );

    it( "an admin switches self-approval off and on", async () => {
        const session = await signIn( portal.url, "admin" );
        assert.deepEqual( await dataOf( "settings", session ), { selfApproval: true }, "the default, while the team is small" );
        assert.equal( ( await call( "settings-save", session, { selfApproval: false } ) ).status, 200 );
        assert.equal( await withDatabase( ( db ) => readSetting( db, TWO_PEOPLE ) ), "on" );
        assert.deepEqual( await dataOf( "settings", session ), { selfApproval: false } );
        assert.equal( ( await call( "settings-save", session, { selfApproval: true } ) ).status, 200 );
        assert.equal( await withDatabase( ( db ) => readSetting( db, TWO_PEOPLE ) ), "off" );
        assert.deepEqual( await dataOf( "settings", session ), { selfApproval: true } );
    } );

    it( "refuses a setting that is not a yes or a no, and changes nothing", async () => {
        const session = await signIn( portal.url, "admin" );
        for ( const selfApproval of [ "false", 0, null, undefined ] ) {
            assert.equal( ( await call( "settings-save", session, { selfApproval } ) ).status, 422, String( selfApproval ) );
        }
        assert.equal( await withDatabase( ( db ) => readSetting( db, TWO_PEOPLE ) ), "off" );
    } );

    it( "an admin is served both screens, which name their components and show nothing as markup", async () => {
        const session = await signIn( portal.url, "admin" );
        for ( const [ name, component ] of [ [ "settings", "tiStudioSettings" ], [ "environment-status", "tiStudioEnvironment" ] ] ) {
            const response = await html( name, session );
            assert.equal( response.status, 200, name );
            const text = await response.text();
            assert.match( text, new RegExp( `x-data="${ component }"` ), name );
            assert.doesNotMatch( text, /x-html/, name );
        }
    } );

    it( "an admin sets an environment's status, and the update names them", async () => {
        const session = await signIn( portal.url, "admin" );
        const response = await call( "status-set", session, { environment: "production", state: "degraded", messageBg: "Бавни отговори", messageEn: "Slow answers" } );
        assert.equal( response.status, 200 );
        const [ update ] = await updatesOf();
        assert.equal( update.updated_by, "local:admin" );
        assert.equal( update.environment, "production" );
        assert.equal( update.state, "degraded" );
        assert.equal( update.message_bg, "Бавни отговори" );
        assert.equal( update.message_en, "Slow answers" );
        const shown = await dataOf( "environment-status", session );
        const production = shown.current.find( ( one ) => one.environment === "production" );
        assert.equal( production.state, "degraded" );
        assert.equal( production.messageText, "Бавни отговори", "in the screen's language, which starts as Bulgarian" );
        assert.equal( production.updatedAtText, formatSofia( production.updatedAt, "bg", { time: true } ) );
        assert.equal( shown.current.find( ( one ) => one.environment === "test" ).state, null );
        assert.equal( shown.events[ 0 ].kind, "status" );
        assert.equal( shown.events[ 0 ].atText, production.updatedAtText );
    } );

    it( "writes the times and the message in the language the person chose", async () => {
        const session = await signIn( portal.url, "admin" );
        const chosen = await fetch( `${ portal.url }/language/en`, { redirect: "manual", headers: { cookie: session.cookie } } );
        const cookie = [ session.cookie, ...chosen.headers.getSetCookie().map( ( line ) => line.split( ";" )[ 0 ] ) ].join( "; " );
        const english = { ...session, cookie: cookie };
        const production = ( await dataOf( "environment-status", english ) ).current.find( ( one ) => one.environment === "production" );
        assert.equal( production.messageText, "Slow answers" );
        assert.equal( production.updatedAtText, formatSofia( production.updatedAt, "en", { time: true } ) );
        assert.match( production.updatedAtText, /^\d\d [A-Z][a-z]{2} \d{4} \d\d:\d\d$/ );
    } );

    it( "takes a status with no message, and refuses one in a single language", async () => {
        const session = await signIn( portal.url, "admin" );
        assert.equal( ( await call( "status-set", session, { environment: "test", state: "operational", messageBg: " ", messageEn: "" } ) ).status, 200 );
        const test = ( await dataOf( "environment-status", session ) ).current.find( ( one ) => one.environment === "test" );
        assert.equal( test.state, "operational" );
        assert.equal( test.message, null );
        assert.equal( test.messageText, "" );
        const one = await call( "status-set", session, { environment: "test", state: "outage", messageBg: "Авария", messageEn: "" } );
        assert.equal( one.status, 422 );
        assert.match( JSON.stringify( await one.json() ), /both languages/ );
        assert.equal( ( await call( "status-set", session, { environment: "staging", state: "outage" } ) ).status, 422 );
        assert.equal( ( await call( "status-set", session, { environment: "test", state: "on fire" } ) ).status, 422 );
    } );

    it( "a public page never shows who set a status", async () => {
        const admin = await signIn( portal.url, "admin" );
        await call( "status-set", admin, { environment: "production", state: "maintenance", messageBg: "Профилактика", messageEn: "Servicing" } );
        for ( const language of [ "bg", "en" ] ) {
            const page = ( await get( `/${ language }/status` ) ).text;
            assert.match( page, language === "bg" ? /Профилактика/ : /Servicing/, `${ language }: the update itself is shown` );
            assert.doesNotMatch( page, /local:admin/, `${ language }: the key` );
            assert.doesNotMatch( page, /Test Admin/, `${ language }: the name` );
            const feed = ( await get( `/${ language }/status/feed.atom` ) ).text;
            assert.doesNotMatch( feed, /local:admin|Test Admin/, `${ language }: the feed` );
        }
    } );

    it( "an admin adds a maintenance window in Sofia time and cancels it", async () => {
        const session = await signIn( portal.url, "admin" );
        const added = await call( "maintenance-add", session, { environment: "test", startsAt: "2099-11-20T10:00", endsAt: "2099-11-20T11:30",
            messageBg: "Обновяване", messageEn: "Upgrade" } );
        assert.equal( added.status, 200 );
        const [ window ] = ( await dataOf( "environment-status", session ) ).windows;
        // Sofia in November is UTC+2, so ten o'clock there is eight in UTC.
        assert.equal( window.startsAt, "2099-11-20T08:00:00.000Z" );
        assert.equal( window.endsAt, "2099-11-20T09:30:00.000Z" );
        assert.equal( window.startsAtText, "20.11.2099 10:00" );
        assert.equal( window.endsAtText, "20.11.2099 11:30" );
        assert.equal( window.messageText, "Обновяване" );
        const publicPage = ( await get( "/bg/status" ) ).text;
        assert.match( publicPage, /20\.11\.2099 10:00 – 20\.11\.2099 11:30/ );
        assert.doesNotMatch( publicPage, /local:admin|Test Admin/ );

        assert.equal( ( await call( "maintenance-cancel", session, { id: window.id } ) ).status, 200 );
        assert.deepEqual( ( await dataOf( "environment-status", session ) ).windows, [] );
        const row = await withDatabase( ( db ) => db.get( "SELECT created_by, cancelled_by FROM maintenance_windows WHERE id = ?", [ window.id ] ) );
        assert.equal( row.created_by, "local:admin" );
        assert.equal( row.cancelled_by, "local:admin" );
        assert.ok( ( await dataOf( "environment-status", session ) ).events.some( ( one ) => one.kind === "maintenance" && one.cancelled ) );
        assert.doesNotMatch( ( await get( "/bg/status" ) ).text, /20\.11\.2099/ );
        // Cancelling it again is a refusal that says so, not a silent success.
        assert.equal( ( await call( "maintenance-cancel", session, { id: window.id } ) ).status, 422 );
    } );

    it( "refuses a window at a time the clock skips or repeats, or ending before it starts", async () => {
        const session = await signIn( portal.url, "admin" );
        const window = ( startsAt, endsAt ) => call( "maintenance-add", session, { environment: "test", startsAt, endsAt } );
        assert.equal( ( await window( "2026-03-29T03:30", "2026-03-29T05:00" ) ).status, 422, "skipped" );
        assert.equal( ( await window( "2026-10-25T03:30", "2026-10-25T05:00" ) ).status, 422, "repeated" );
        assert.equal( ( await window( "2099-11-20T12:00", "2099-11-20T11:00" ) ).status, 422, "ends first" );
        assert.equal( ( await window( "tomorrow", "2099-11-20T11:00" ) ).status, 422, "no time" );
        assert.equal( ( await window( "2099-11-20T10:00+02:00", "2099-11-20T11:00" ) ).status, 422, "an offset is not what the form takes" );
        assert.equal( ( await window( undefined, undefined ) ).status, 422, "none given" );
    } );

    it( "everyone but an admin is refused, the screens and the services alike", async () => {
        const roles = { editor: ROLE.EDITOR, approver: ROLE.APPROVER, reader: ROLE.READER };
        for ( const [ username, role ] of Object.entries( roles ) ) {
            await grant( portal.database, username, [ { role: role, spec: EVERY_SPEC } ] );
        }
        const admin = await signIn( portal.url, "admin" );
        await call( "maintenance-add", admin, { environment: "test", startsAt: "2099-12-01T10:00", endsAt: "2099-12-01T11:00" } );
        const [ window ] = ( await dataOf( "environment-status", admin ) ).windows;
        const before = await snapshot();
        for ( const username of [ "editor", "approver", "reader", "nobody" ] ) {
            const session = await signIn( portal.url, username );
            for ( const name of [ "settings", "environment-status" ] ) {
                assert.equal( ( await view( name, session ) ).status, 403, `${ username }: ${ name } as JSON` );
                assert.equal( ( await html( name, session ) ).status, 403, `${ username }: ${ name } as HTML` );
            }
            const attempts = {
                "settings-save": { selfApproval: false },
                "status-set": { environment: "production", state: "outage" },
                "maintenance-add": { environment: "test", startsAt: "2099-12-02T10:00", endsAt: "2099-12-02T11:00" },
                "maintenance-cancel": { id: window.id }
            };
            for ( const [ service, body ] of Object.entries( attempts ) ) {
                assert.equal( ( await call( service, session, body ) ).status, 403, `${ username }: ${ service }` );
            }
        }
        assert.equal( await snapshot(), before, "nothing changed" );
    } );

    it( "a role taken away while the screen is open refuses the next save", async () => {
        const session = await signIn( portal.url, "admin" );
        await dataOf( "settings", session );
        await grant( portal.database, "admin", [] );
        assert.equal( ( await call( "settings-save", session, { selfApproval: false } ) ).status, 403 );
        assert.equal( ( await call( "status-set", session, { environment: "test", state: "outage" } ) ).status, 403 );
        await grant( portal.database, "admin", [ { role: ROLE.ADMIN, spec: EVERY_SPEC } ] );
    } );
} );
