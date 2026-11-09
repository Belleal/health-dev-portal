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
 * How the portal answers (plan 8a, decision 4): every response states its caching, and the 410 and 500 pages say what
 * they must and nothing more. The 404 is tested against a real server in shell.test.js.
 */

const { afterEach, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const logger = require( "@ti-engine/core/logger" );
const { CACHE, failed, gone, send } = require( "#responses" );

// What a page sends through: Express's response, as far as responses.js uses it.
const response = () => {
    const answer = { locals: { nonce: "nonce" }, headersSent: false, headers: {}, status: null, body: null, ended: false };
    answer.status = ( code ) => Object.assign( answer, { code: code } );
    answer.set = ( name, value ) => {
        answer.headers[ name.toLowerCase() ] = value;
        return answer;
    };
    answer.send = ( body ) => Object.assign( answer, { body: body } );
    answer.end = () => Object.assign( answer, { ended: true } );
    return answer;
};

describe( "Responses", () => {

    const log = logger.log;
    afterEach( () => {
        logger.log = log;
    } );

    it( "sends a response with its status, caching and type, and refuses one that does not state its caching", () => {
        assert.throws( () => send( response(), { body: "x" } ), TypeError );
        const answer = response();
        send( answer, { status: 201, cache: CACHE.BRIEF, body: "{}", type: "application/json; charset=utf-8" } );
        assert.deepEqual( [ answer.code, answer.headers[ "cache-control" ], answer.headers[ "content-type" ], answer.body ],
            [ 201, "public, max-age=60", "application/json; charset=utf-8", "{}" ] );
        // Any other header a response needs, such as a download's file name; it cannot stand in for the caching.
        const download = response();
        send( download, { cache: CACHE.FOREVER, body: "x", type: "text/csv; charset=utf-8",
            headers: { "Content-Disposition": "attachment; filename=\"CL007-1.5.34.csv\"", "Cache-Control": "no-cache" } } );
        assert.deepEqual( [ download.headers[ "content-disposition" ], download.headers[ "cache-control" ] ],
            [ "attachment; filename=\"CL007-1.5.34.csv\"", "public, max-age=31536000, immutable" ] );
    } );

    it( "answers a retired fixed address with 410, cached a day, linking its changes in the address's language", () => {
        const answer = response();
        gone( { path: "/en/specs/e-prescription/1.5.0" }, answer, "/en/changes/e-prescription" );
        assert.deepEqual( [ answer.code, answer.headers[ "cache-control" ], answer.headers[ "content-type" ] ],
            [ 410, "public, max-age=86400", "text/html; charset=utf-8" ] );
        assert.match( answer.body, /<html lang="en">[\s\S]*<h1>This version is no longer kept<\/h1>[\s\S]*<a href="\/en\/changes\/e-prescription">/ );
    } );

    it( "logs a failure with its stack, and shows nothing of it, uncached", () => {
        const logged = [];
        logger.log = ( message, severity, data ) => logged.push( { message: message, severity: severity, data: data } );
        const answer = response();
        const error = new Error( "SELECT secret FROM somewhere" );
        failed( { method: "GET", path: "/bg/specs" }, answer, error );
        assert.deepEqual( [ answer.code, answer.headers[ "cache-control" ] ], [ 500, "no-store" ] );
        assert.match( answer.body, /<h1>Възникна грешка<\/h1>/ );
        assert.equal( answer.body.includes( "secret" ), false );
        assert.deepEqual( logged.map( ( one ) => [ one.message, one.severity ] ), [ [ "The portal failed to answer GET /bg/specs.", logger.logSeverity.ERROR ] ] );
        assert.equal( logged[ 0 ].data.stack, error.stack );
    } );

    it( "ends a response that had begun when it failed, rather than sending a second", () => {
        logger.log = () => {};
        const answer = response();
        answer.headersSent = true;
        failed( { method: "GET", path: "/bg/" }, answer, new Error( "late" ) );
        assert.deepEqual( [ answer.ended, answer.body ], [ true, null ] );
    } );
} );
