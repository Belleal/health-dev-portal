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
 * The studio's staff, for a test (plan 9a): synthetic people who sign in by the framework's local method, the file that
 * holds them, the sign-in itself as a browser makes it, and a grant made as an admin would make one. Nothing here is a
 * real person: every address is at example.test, and every password a fixed test value.
 */

const { execFileSync } = require( "node:child_process" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { setGrants } = require( "@health-dev-portal/data/staff" );

const person = ( username, name ) => Object.freeze( { username: username, email: `${ username }@example.test`, name: name, password: `test-password-${ username }` } );

/**
 * The synthetic staff, by username. `config-admin` is the one the test configuration names in `TI_WEB_AUTH_ADMINS`; the
 * others hold what their names say once a test grants it, and `nobody` holds nothing.
 *
 * @type {Readonly<Object<string, Readonly<{username: string, email: string, name: string, password: string}>>>}
 * @public
 */
module.exports.USERS = Object.freeze( Object.fromEntries( [
    person( "config-admin", "Test Configuration Admin" ),
    person( "admin", "Test Admin" ),
    person( "editor", "Test Editor" ),
    person( "editor-cl009", "Test Editor of CL009" ),
    person( "approver", "Test Approver" ),
    person( "reader", "Test Reader" ),
    person( "nobody", "Test Nobody" )
].map( ( one ) => [ one.username, one ] ) ) );

/**
 * The name of the users file in the directory it is written to.
 *
 * @type {string}
 * @public
 */
module.exports.USERS_FILE = "users.json";

// The framework's own script, beside the server it ships: its hashing (`#local-user-directory`) is not exported, and the
// script is the documented way to make a hash. Found through the server's exported path, never a path past the map.
const HASH_PASSWORD = path.join( path.dirname( require.resolve( "@ti-engine/web-framework/web-server" ) ), "build", "hash-password.js" );

/**
 * Writes the local users file the framework signs the staff in from, each password hashed by the framework's own script
 * with the password on its standard input, as it asks. Each hash takes the script half a second (measured), so the
 * portal's `pretest` writes the file once per run, beside the seed, rather than each test file.
 *
 * @method
 * @param {string} directory Where to write it; it must exist.
 * @returns {string} The file's path.
 * @public
 */
module.exports.writeUsersFile = ( directory ) => {
    const records = Object.values( module.exports.USERS ).map( ( one ) => ( {
        username: one.username,
        email: one.email,
        name: one.name,
        passwordHash: execFileSync( process.execPath, [ HASH_PASSWORD ], { input: `${ one.password }\n`, encoding: "utf8" } ).trim()
    } ) );
    const file = path.join( directory, module.exports.USERS_FILE );
    fs.writeFileSync( file, `${ JSON.stringify( records, null, 4 ) }\n` );
    return file;
};

// A browser's cookies, by name, kept across the requests of one sign-in.
const keep = ( cookies, response ) => {
    for ( const line of response.headers.getSetCookie() ) {
        const pair = line.split( ";" )[ 0 ];
        const index = pair.indexOf( "=" );
        cookies.set( pair.slice( 0, index ).trim(), pair.slice( index + 1 ).trim() );
    }
    return response;
};
const header = ( cookies ) => [ ...cookies ].map( ( [ name, value ] ) => `${ name }=${ value }` ).join( "; " );

/**
 * Signs one of the staff in through the framework's sign-in form, as a browser does: a token, the form posted with it,
 * then a token again, since the sign-in starts a new session and the old token is not that session's.
 *
 * @method
 * @param {string} url The started portal's address.
 * @param {string} username One of `USERS`.
 * @returns {Promise<{cookie: string, token: string}>} The `Cookie` header to send, and the token a POST sends in
 *     `x-xsrf-token`.
 * @throws {Error} When the sign-in is refused: the framework sends the browser to the home with an `error` instead.
 * @public
 */
module.exports.signIn = async ( url, username ) => {
    const user = module.exports.USERS[ username ];
    if ( !user ) {
        throw new Error( `${ JSON.stringify( username ) } is none of the test staff: ${ Object.keys( module.exports.USERS ).join( ", " ) }.` );
    }
    const cookies = new Map();
    const token = () => decodeURIComponent( cookies.get( "ti-xsrf-token" ) || "" );
    keep( cookies, await fetch( `${ url }/csrf-token`, { redirect: "manual" } ) );
    const response = keep( cookies, await fetch( `${ url }/login/local`, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: header( cookies ), "x-xsrf-token": token(), Origin: url },
        body: new URLSearchParams( { username: user.username, password: user.password } )
    } ) );
    if ( response.status !== 303 || response.headers.get( "location" ) !== "/studio/" ) {
        throw new Error( `The sign-in of ${ username } was refused: ${ response.status } to ${ response.headers.get( "location" ) }.` );
    }
    keep( cookies, await fetch( `${ url }/csrf-token`, { redirect: "manual", headers: { Cookie: header( cookies ) } } ) );
    return { cookie: header( cookies ), token: token() };
};

/**
 * Replaces what one of the staff holds, as an admin's change would, in the started portal's database. They must have
 * signed in once: a grant is for a person the studio knows.
 *
 * @method
 * @param {string} database The started portal's SQLite file (`startPortal`'s `database`).
 * @param {string} username One of `USERS`.
 * @param {Array<{role: string, spec: string}>} grants The whole new set; empty withdraws everything.
 * @returns {Promise<void>}
 * @public
 */
module.exports.grant = async ( database, username, grants ) => {
    const db = await openDatabase( `sqlite:${ database }` );
    try {
        // The key the studio gives a local sign-in: the framework's user ID, `local:<username>` for a file with none.
        await setGrants( db, `local:${ username }`, grants, { by: "test" } );
    } finally {
        await db.close();
    }
};
