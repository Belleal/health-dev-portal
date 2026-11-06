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
const { createPortal } = require( "./support/server" );

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
