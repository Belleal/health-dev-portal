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
 * Who reaches the studio, against a real server on a copy of the seed (plan 9a): its sign-in screen at /studio/, its
 * addresses refused to anyone not signed in in whatever case they are written, every public page as anonymous and as
 * cacheable as it was with sign-in on, a person recorded at first sign-in, and the roles a session carries following the
 * person's grants from one request to the next; then the table of every view and service against every role.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
// First: it sets the environment ti-engine reads as it loads.
const { SEED, SEEDED, assertPublic, get, rawStatus, startPortal } = require( "./support/server" );
const { elementOf, pagesToCheck } = require( "./support/pages" );
const { grant, signIn } = require( "./support/staff" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { readSetting } = require( "@health-dev-portal/data/files" );
const { TWO_PEOPLE } = require( "@health-dev-portal/data/review" );
const { addMaintenance } = require( "@health-dev-portal/data/status" );
const { EVERY_SPEC, ROLE, listPeople } = require( "@health-dev-portal/data/staff" );
const paths = require( "#paths" );

const BRIEF = "public, max-age=60";
const GONE = "public, max-age=86400";
const FOREVER = "public, max-age=31536000, immutable";
const HTML = "text/html; charset=utf-8";
const ATOM = "application/atom+xml; charset=utf-8";
const SPEC = SEED.ePrescription.spec;

describe( "The studio's access", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    // A request as a browser or a script makes it, with a signed-in session's cookie when one is given.
    const ask = ( path, accept, session = null ) => fetch( `${ portal.url }${ path }`, { redirect: "manual",
        headers: { accept: accept, ...( session === null ? {} : { cookie: session.cookie } ) } } );
    const me = async ( session ) => {
        const response = await ask( "/me", "application/json", session );
        assert.equal( response.status, 200 );
        return ( await response.json() ).data.user;
    };
    const personOf = async ( username ) => {
        const db = await openDatabase( `sqlite:${ portal.database }` );
        try {
            return ( await listPeople( db ) ).find( ( one ) => one.key === `local:${ username }` );
        } finally {
            await db.close();
        }
    };
    // Every kind of page, with the status it answers: the accessibility test's list.
    const listedPages = async () => {
        const element = elementOf( ( await get( paths.message( "bg", SPEC, SEED.ePrescription.production, "P001" ) ) ).text );
        assert.ok( element, "P001's tree links to its elements" );
        return pagesToCheck( element );
    };

    it( "serves the sign-in screen at /studio/ and /studio, to an anonymous visitor", async () => {
        for ( const path of [ "/studio/", "/studio" ] ) {
            const response = await get( path );
            assert.equal( response.status, 200, path );
            assert.equal( response.headers.get( "content-type" ), HTML, path );
            assert.match( response.text, /<meta name="ti-home" content="\/studio\/"\/>/, path );
            // The shell holds no screen of its own: it asks for the first as soon as it loads (measured), and an
            // anonymous visitor's first is the sign-in, with its form.
            assert.match( response.text, /<ti-nested-frame-placeholder hx-get="\/app\/enter" hx-trigger="load"/, path );
        }
        const screen = await fetch( `${ portal.url }/app/enter`, { redirect: "manual", headers: { accept: "text/html", "hx-request": "true" } } );
        assert.equal( screen.status, 200 );
        assert.match( await screen.text(), /<form id="ti-login-form" action="\/login\/local" method="post"/ );
    } );

    it( "refuses a staff address to an anonymous visitor, in any case", async () => {
        for ( const path of [ "/app/profile", "/APP/profile", "/app/about", "/me", "/ME", "/Studio/not-found/x" ] ) {
            const page = await ask( path, "text/html" );
            assert.deepEqual( [ page.status, page.headers.get( "location" ), page.headers.get( "set-cookie" ) ], [ 303, "/studio/", null ], path );
            const data = await ask( path, "application/json" );
            assert.deepEqual( [ data.status, data.headers.get( "set-cookie" ) ], [ 401, null ], path );
        }
    } );

    it( "answers an address that only looks like a staff one as no studio route would", async () => {
        // The exemption's comment (bin/portal-server.js) says the first three reach no studio route, and the trailing slash is the
        // staff address itself, refused. Sent as written (`rawStatus`), as `fetch` resolves the dot-segment and the doubled slash
        // before sending. Measured: the pages' 404 for the three, 401 for the fourth; never a 2xx, which would be a studio answer
        // to a visitor who has not signed in.
        const expected = { "//app/profile": 404, "/%61pp/profile": 404, "/./app/profile": 404, "/app/profile/": 401 };
        for ( const [ address, status ] of Object.entries( expected ) ) {
            assert.equal( await rawStatus( address ), status, address );
        }
    } );

    it( "keeps every public page anonymous and cacheable with sign-in enabled", async () => {
        const pages = [
            ...( await listedPages() ).map( ( [ address, status ] ) => [ address, status, status === 410 ? GONE : BRIEF, HTML ] ),
            [ paths.specDownload( SPEC, SEED.ePrescription.production, "zip" ), 200, FOREVER, "application/zip" ],
            [ paths.feed( "bg", SPEC ), 200, BRIEF, ATOM ]
        ];
        for ( const [ address, status, cache, type ] of pages ) {
            const response = await get( address );
            assert.equal( response.status, status, address );
            assertPublic( response, cache, type );
        }
        // Signed in, the same pages answer as they did, with the session's cookie, and so kept out of shared caches.
        const session = await signIn( portal.url, "editor" );
        for ( const [ address, status ] of pages ) {
            const response = await ask( address, "text/html", session );
            assert.equal( response.status, status, address );
            assert.notEqual( response.headers.get( "set-cookie" ), null, address );
            assert.doesNotMatch( response.headers.get( "cache-control" ), /\bpublic\b/, address );
        }
    } );

    it( "records a person at first sign-in, with no role", async () => {
        const session = await signIn( portal.url, "nobody" );
        const person = await personOf( "nobody" );
        assert.ok( person, "the sign-in recorded them" );
        assert.deepEqual( [ person.name, person.configuredAdmin, person.grants ], [ "Test Nobody", false, [] ] );
        assert.deepEqual( ( await me( session ) ).roles, [] );
    } );

    it( "gives a role on the next request, and takes it away on the next", async () => {
        const session = await signIn( portal.url, "reader" );
        assert.deepEqual( ( await me( session ) ).roles, [] );
        await grant( portal.database, "reader", [ { role: ROLE.READER, spec: EVERY_SPEC } ] );
        assert.deepEqual( ( await me( session ) ).roles, [ "studio:reader" ] );
        await grant( portal.database, "reader", [] );
        assert.deepEqual( ( await me( session ) ).roles, [] );
    } );

    it( "gives the configuration's admin the framework's admin role, and records them as from configuration", async () => {
        const session = await signIn( portal.url, "config-admin" );
        assert.deepEqual( ( await me( session ) ).roles, [ "admin" ] );
        const person = await personOf( "config-admin" );
        assert.deepEqual( [ person.configuredAdmin, person.grants ], [ true, [] ] );
    } );

    it( "no public page names the studio", async () => {
        for ( const [ address ] of await listedPages() ) {
            const { text } = await get( address );
            assert.equal( text.includes( "/studio" ), false, address );
            assert.equal( text.includes( "/app/" ), false, address );
        }
    } );

    // The table (plan 9a, Task 7): every view and service the studio adds, against everyone who might ask. A cell is the
    // status the server answers over HTTP, never one a screen would hide; a refused cell must also have changed nothing,
    // and an allowed one must leave the data as it found it, so that no cell depends on another.
    describe( "the table of views and services against roles", () => {
        const ADMINS = [ "admin", "config-admin" ];
        const REFUSED = [ "nobody", "reader", "editor", "approver" ];
        const SERVICE_NAMES = [ "people-grants", "settings-save", "status-set", "maintenance-add", "maintenance-cancel" ];
        const TABLES = [ "staff_grant_changes", "status_updates", "maintenance_windows" ];
        const sessions = new Map();
        let atStart = null;

        const withDatabase = async ( work ) => {
            const db = await openDatabase( `sqlite:${ portal.database }` );
            try {
                return await work( db );
            } finally {
                await db.close();
            }
        };
        const idsOf = async ( db ) => {
            const ids = {};
            for ( const table of TABLES ) {
                ids[ table ] = ( await db.all( `SELECT id FROM ${ table } ORDER BY id` ) ).map( ( row ) => row.id );
            }
            return ids;
        };
        // Everything a studio service writes, so that "nothing changed" is one comparison.
        const snapshot = () => withDatabase( async ( db ) => JSON.stringify( [ await readSetting( db, TWO_PEOPLE ), await idsOf( db ),
            await db.all( "SELECT person_key, role, spec FROM staff_grants ORDER BY person_key, role, spec" ),
            await db.all( "SELECT id, cancelled_at FROM maintenance_windows ORDER BY id" ) ] ) );
        // What an allowed call added is taken away again. A setting and a person's grants are put back by the body the
        // cell sends, which is the value they already hold.
        const restore = ( baseline ) => withDatabase( async ( db ) => {
            const now = await idsOf( db );
            for ( const table of TABLES ) {
                for ( const id of now[ table ].filter( ( one ) => !baseline[ table ].includes( one ) ) ) {
                    await db.run( `DELETE FROM ${ table } WHERE id = ?`, [ id ] );
                }
            }
        } );
        const json = ( session ) => ( { accept: "application/json", ...( session === null ? {} : { cookie: session.cookie } ) } );
        const view = ( name, session ) => fetch( `${ portal.url }/app/${ name }`, { redirect: "manual", headers: json( session ) } );
        const screen = ( name, session ) => fetch( `${ portal.url }/app/${ name }`, { redirect: "manual",
            headers: { accept: "text/html", "hx-request": "true", ...( session === null ? {} : { cookie: session.cookie } ) } } );
        const service = ( name, session, body ) => fetch( `${ portal.url }/app/${ name }`, { method: "POST", redirect: "manual",
            headers: { ...json( session ), "content-type": "application/json", ...( session === null ? {} : { "x-xsrf-token": session.token, origin: portal.url } ) },
            body: JSON.stringify( body ) } );
        // An answer that refuses must carry no one's data: not a name, a key, an address, a setting or a screen.
        const assertBare = async ( response, message ) => {
            const text = await response.text();
            for ( const leaked of [ "Test ", "local:", "example.test", "selfApproval", "x-data" ] ) {
                assert.equal( text.includes( leaked ), false, `${ message }: the answer holds ${ leaked }` );
            }
        };
        // What each service is sent to be let through: a body it accepts that leaves the data as it was.
        const BODIES = {
            "people-grants": async () => ( { key: "local:nobody", grants: [] } ),
            // The value it holds now, read as an admin, since a refused role cannot read it.
            "settings-save": async () => ( { selfApproval: ( await ( await view( "settings", sessions.get( "admin" ) ) ).json() ).data.selfApproval } ),
            "status-set": async () => ( { environment: "test", state: "operational", messageBg: "Съобщение", messageEn: "Message" } ),
            "maintenance-add": async () => ( { environment: "test", startsAt: "2099-11-20T10:00", endsAt: "2099-11-20T11:30" } ),
            // A window to cancel, put in the database directly: the cell is about who may cancel, not who may add.
            "maintenance-cancel": async () => ( { id: await withDatabase( ( db ) => addMaintenance( db, { environment: "test", startsAt: new Date( "2099-11-20T08:00:00Z" ),
                endsAt: new Date( "2099-11-20T09:30:00Z" ), by: "access-table" } ) ) } )
        };

        before( async () => {
            for ( const username of [ ...REFUSED, ...ADMINS ] ) {
                sessions.set( username, await signIn( portal.url, username ) );
            }
            for ( const [ username, role ] of [ [ "reader", ROLE.READER ], [ "editor", ROLE.EDITOR ], [ "approver", ROLE.APPROVER ], [ "admin", ROLE.ADMIN ] ] ) {
                await grant( portal.database, username, [ { role: role, spec: EVERY_SPEC } ] );
            }
            atStart = await withDatabase( idsOf );
        } );

        // Measured, not assumed: a script's anonymous GET is a 401, a browser's is a 303 to the sign-in, htmx is told to go
        // there in a header on a 204, and a POST is refused by the CSRF check (403) before the protection runs, or by the
        // protection (401) once it has a token.
        it( "refuses every view and service to an anonymous caller, in the status the framework uses", async () => {
            const before = await snapshot();
            for ( const name of [ "studio-home", "people", "settings", "environment-status" ] ) {
                const data = await view( name, null );
                assert.equal( data.status, 401, `${ name }: JSON` );
                await assertBare( data, `${ name }: JSON` );
                const page = await fetch( `${ portal.url }/app/${ name }`, { redirect: "manual", headers: { accept: "text/html" } } );
                assert.deepEqual( [ page.status, page.headers.get( "location" ), page.headers.get( "set-cookie" ) ], [ 303, "/studio/", null ], `${ name }: page` );
                const fragment = await screen( name, null );
                assert.deepEqual( [ fragment.status, fragment.headers.get( "hx-redirect" ), await fragment.text() ], [ 204, "/studio/", "" ], `${ name }: htmx` );
            }
            for ( const name of SERVICE_NAMES ) {
                const bare = await service( name, null, {} );
                assert.equal( bare.status, 403, `${ name }: no token` );
                await assertBare( bare, `${ name }: no token` );
                // A token with no session: what a script that fetched /csrf-token would have.
                const first = await fetch( `${ portal.url }/csrf-token`, { redirect: "manual" } );
                const cookie = first.headers.getSetCookie().map( ( line ) => line.split( ";" )[ 0 ] ).join( "; " );
                const token = decodeURIComponent( /ti-xsrf-token=([^;]+)/.exec( cookie )[ 1 ] );
                const tokened = await service( name, { cookie: cookie, token: token }, {} );
                assert.equal( tokened.status, 401, `${ name }: a token, no session` );
                await assertBare( tokened, `${ name }: a token, no session` );
            }
            assert.equal( await snapshot(), before, "nothing changed" );
        } );

        // `config` is the framework's own view, open on purpose: it is how the shell learns whether anyone is signed in.
        it( "answers an anonymous `config` as the framework does, with no person in it", async () => {
            const response = await view( "config", null );
            assert.equal( response.status, 200 );
            const { data } = await response.json();
            assert.deepEqual( [ data.auth, data.studio ], [ { isAuthenticated: false }, { admin: false } ] );
            assert.equal( JSON.stringify( data ).includes( "example.test" ), false );
        } );

        it( "serves `studio-home` and `config` to everyone signed in, and every other view only to an admin", async () => {
            for ( const username of [ ...REFUSED, ...ADMINS ] ) {
                const session = sessions.get( username );
                const admin = ADMINS.includes( username );
                for ( const name of [ "studio-home", "config" ] ) {
                    assert.equal( ( await view( name, session ) ).status, 200, `${ username }: ${ name }` );
                }
                // The landing's fragment is the framework's `dashboard`, which asks for the view `studio-home`.
                assert.equal( ( await screen( "dashboard", session ) ).status, 200, `${ username }: the landing as a screen` );
                for ( const name of [ "people", "settings", "environment-status" ] ) {
                    const data = await view( name, session );
                    const fragment = await screen( name, session );
                    assert.equal( data.status, admin ? 200 : 403, `${ username }: ${ name }` );
                    assert.equal( fragment.status, admin ? 200 : 403, `${ username }: ${ name } as a screen` );
                    if ( !admin ) {
                        await assertBare( data, `${ username }: ${ name }` );
                        await assertBare( fragment, `${ username }: ${ name } as a screen` );
                    }
                }
            }
        } );

        for ( const name of SERVICE_NAMES ) {
            it( `${ name }: every role that is not an admin is refused and changes nothing, and an admin is let through`, async () => {
                for ( const username of REFUSED ) {
                    const session = sessions.get( username );
                    const baseline = await withDatabase( idsOf );
                    const sent = await BODIES[ name ]( session );
                    const before = await snapshot();
                    const response = await service( name, session, sent );
                    assert.equal( response.status, 403, username );
                    await assertBare( response, username );
                    assert.equal( await snapshot(), before, `${ username }: nothing changed` );
                    await restore( baseline );
                }
                for ( const username of ADMINS ) {
                    const session = sessions.get( username );
                    const baseline = await withDatabase( idsOf );
                    const response = await service( name, session, await BODIES[ name ]( session ) );
                    assert.equal( response.status, 200, `${ username }: ${ await response.clone().text() }` );
                    await restore( baseline );
                }
            } );
        }

        it( "leaves the data as it found it, after every cell above", async () => {
            assert.deepEqual( await withDatabase( idsOf ), atStart );
        } );
    } );
} );
