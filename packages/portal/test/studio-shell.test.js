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
 * The studio's shell, against a real server on a copy of the seed (plan 9a): its page loads the studio's script before
 * Alpine's, the landing screen's data says what a person may do, the configuration marks an admin and only an admin,
 * and no fragment renders markup from data.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
// First: it sets the environment ti-engine reads as it loads.
const { SEEDED, get, startPortal } = require( "./support/server" );
const { grant, signIn } = require( "./support/staff" );

const FRAGMENTS = path.join( __dirname, "..", "public", "fragments" );

// Every file under a directory, as paths.
const filesUnder = ( directory ) => fs.readdirSync( directory, { withFileTypes: true } )
    .flatMap( ( entry ) => ( entry.isDirectory() ? filesUnder( path.join( directory, entry.name ) ) : [ path.join( directory, entry.name ) ] ) );

describe( "The studio's shell", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
        // The framework's own roles for the configuration's admin; the others hold what the database grants.
        for ( const username of [ "admin", "editor", "nobody" ] ) {
            await signIn( portal.url, username );
        }
        await grant( portal.database, "admin", [ { role: "admin", spec: "*" } ] );
        await grant( portal.database, "editor", [ { role: "editor", spec: "*" } ] );
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    // A data view as a signed-in browser asks for it.
    const view = async ( name, username ) => {
        const session = await signIn( portal.url, username );
        const response = await fetch( `${ portal.url }/app/${ name }`, { redirect: "manual", headers: { accept: "application/json", cookie: session.cookie } } );
        assert.equal( response.status, 200, `${ name } as ${ username }` );
        return ( await response.json() ).data;
    };

    it( "the shell page loads the studio's script before Alpine's", async () => {
        const html = ( await get( "/studio/" ) ).text;
        const studio = html.indexOf( "/static/scripts/studio.js" );
        const alpine = html.indexOf( "alpinejs-csp.min.js" );
        assert.ok( studio > 0, "the page names the studio's script" );
        assert.ok( alpine > 0, "the page names Alpine's script" );
        assert.ok( studio < alpine, "components are registered on alpine:init, so the script runs first" );
        assert.equal( ( await get( "/static/scripts/studio.js" ) ).status, 200 );
    } );

    it( "the landing tells a person with no role that they have no access yet", async () => {
        const home = await view( "studio-home", "nobody" );
        assert.deepEqual( home.roles, [] );
        assert.equal( home.admin, false );
    } );

    it( "the landing names a person and their roles", async () => {
        const home = await view( "studio-home", "editor" );
        assert.equal( home.name, "Test Editor" );
        assert.deepEqual( home.roles, [ "studio:editor" ] );
        assert.equal( home.admin, false );
        assert.equal( ( await view( "studio-home", "admin" ) ).admin, true );
    } );

    it( "the config marks an admin, and only an admin", async () => {
        assert.equal( ( await view( "config", "admin" ) ).studio.admin, true );
        assert.equal( ( await view( "config", "config-admin" ) ).studio.admin, true );
        assert.equal( ( await view( "config", "editor" ) ).studio.admin, false );
        // Before sign-in it is the framework's own answer, with no person to mark.
        const anonymous = await fetch( `${ portal.url }/app/config`, { headers: { accept: "application/json" } } );
        assert.equal( anonymous.status, 200 );
        assert.equal( ( await anonymous.json() ).data.studio.admin, false );
    } );

    it( "still refuses a view it does not own", async () => {
        const session = await signIn( portal.url, "admin" );
        const response = await fetch( `${ portal.url }/app/no-such-view`, { redirect: "manual", headers: { accept: "application/json", cookie: session.cookie } } );
        assert.ok( response.status >= 400, `answered ${ response.status }` );
    } );

    it( "no studio fragment renders markup from data", () => {
        const files = filesUnder( FRAGMENTS );
        assert.ok( files.length >= 3, "the studio ships its fragments" );
        for ( const file of files ) {
            assert.doesNotMatch( fs.readFileSync( file, "utf8" ), /x-html/, path.relative( FRAGMENTS, file ) );
        }
    } );
} );
