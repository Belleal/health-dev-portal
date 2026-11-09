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
 * A start the portal refuses (plan 8a, decision 1): without its database, or without the public URL every absolute
 * link is written from, it never listens. Its own process, since core allows one service instance per process.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const support = require( "./support/server" );

const { createPortal } = support;

// Core raises what a start rejects with as its own exception, which keeps the original message in its data.
const naming = ( setting ) => ( error ) => new RegExp( setting ).test( error.data.message );

describe( "A refused start", () => {

    it( "stops the start without HDP_DATABASE_URL, or without TI_WEB_PUBLIC_URL, before it listens", async () => {
        const server = createPortal( { HDP_DATABASE_URL: undefined, TI_WEB_PUBLIC_URL: "https://developers.example.test" } );
        await assert.rejects( server.start(), naming( "HDP_DATABASE_URL" ) );
        assert.equal( server.serverUrl, "" );
        process.env.HDP_DATABASE_URL = "sqlite::memory:";
        server.serviceConfig.publicUrl = "";
        await assert.rejects( server.start(), naming( "TI_WEB_PUBLIC_URL" ) );
        server.serviceConfig.publicUrl = "developers.example.test/";
        await assert.rejects( server.start(), naming( "TI_WEB_PUBLIC_URL" ) );
        assert.equal( server.serverUrl, "" );
        assert.equal( server.startup.state, "failed" );
    } );
} );

const UNSEEDED = !support.SEEDED && "the portal's seed is not built (npm run fixtures:fetch, then npm test)";

describe( "A test portal whose start is refused", { skip: UNSEEDED }, () => {

    // Without this a refused start left its copy of the seed in the temporary directory on every run, and the server
    // unstopped, since the caller never received `stop` (CodeRabbit on #20).
    it( "stops the server and removes its copy of the seed, and rejects with the start's own error", async () => {
        const refusal = new Error( "refused" );
        const seen = { files: null, stopped: false };
        const real = support.createPortal;
        support.createPortal = ( environment ) => {
            seen.files = environment.HDP_FILES_DIR;
            return {
                start: async () => {
                    throw refusal;
                },
                stop: async () => {
                    seen.stopped = true;
                    throw new Error( "a stop after a refused start may fail too" );
                }
            };
        };
        try {
            await assert.rejects( support.startPortal(), ( error ) => error === refusal );
        } finally {
            support.createPortal = real;
        }
        assert.ok( seen.files, "the copy was made before the start" );
        assert.equal( fs.existsSync( path.dirname( seen.files ) ), false );
        assert.equal( seen.stopped, true );
    } );
} );
