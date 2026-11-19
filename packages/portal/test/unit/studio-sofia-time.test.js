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
 * The studio's times (plan 9a): Sofia time, summer and winter, whatever zone the process runs in.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { execFileSync } = require( "node:child_process" );
const path = require( "node:path" );
const { formatSofia } = require( "#studio/sofia-time" );

describe( "The studio's times", () => {

    it( "writes a July instant at UTC+3 and a November one at UTC+2", () => {
        assert.equal( formatSofia( "2026-07-15T12:00:00Z", "bg", { time: true } ), "15.07.2026 15:00" );
        assert.equal( formatSofia( "2026-11-19T15:15:00Z", "bg", { time: true } ), "19.11.2026 17:15" );
        assert.equal( formatSofia( "2026-11-19T15:15:00Z", "en", { time: true } ), "19 Nov 2026 17:15" );
    } );

    it( "carries a late instant over to the next day in Sofia", () => {
        assert.equal( formatSofia( "2026-11-18T22:30:00Z", "bg" ), "19.11.2026" );
        assert.equal( formatSofia( new Date( "2026-07-15T21:30:00Z" ), "en" ), "16 Jul 2026" );
    } );

    it( "gives nothing for what is no time", () => {
        assert.equal( formatSofia( "not a time", "bg" ), "" );
    } );

    it( "uses Sofia and not the process's own zone", () => {
        // A process whose zone is neither UTC nor Sofia, so a formatter that fell back to the local zone cannot pass.
        const source = `const { formatSofia } = require( "#studio/sofia-time" );process.stdout.write( formatSofia( "2026-11-19T15:15:00Z", "bg", { time: true } ) );`;
        for ( const zone of [ "America/New_York", "Pacific/Auckland" ] ) {
            const out = execFileSync( process.execPath, [ "-e", source ], { cwd: path.resolve( __dirname, "../.." ), env: { ...process.env, TZ: zone }, encoding: "utf8" } );
            assert.equal( out, "19.11.2026 17:15", zone );
        }
    } );
} );
