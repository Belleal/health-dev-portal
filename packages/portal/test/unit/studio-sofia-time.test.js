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
const { formatSofia, sofiaInstant } = require( "#studio/sofia-time" );

describe( "The studio's times", () => {

    it( "writes a July instant at UTC+3 and a November one at UTC+2", () => {
        assert.equal( formatSofia( "2026-07-15T12:00:00Z", "bg", { time: true } ), "15.07.2026 15:00" );
        assert.equal( formatSofia( "2026-11-19T15:15:00Z", "bg", { time: true } ), "19.11.2026 17:15" );
        assert.equal( formatSofia( "2026-11-19T15:15:00Z", "en", { time: true } ), "19 Nov 2026 17:15" );
    } );

    it( "writes a September instant in both languages, whatever the ICU data calls the month", () => {
        // Node 26.3.1 with ICU 78.3 writes September as "Sept" in English (measured: "15 Sept 2026 13:00"), where every other month
        // has three letters; a test that pinned three failed one month a year. The month's abbreviation is the data's, so only
        // its first three letters, the day, the year and the Sofia time are pinned.
        const instant = new Date( "2026-09-15T10:00:00Z" );
        assert.match( formatSofia( instant, "en", { time: true } ), /^15 Sep[a-z]* 2026 13:00$/ );
        assert.equal( formatSofia( instant, "bg", { time: true } ), "15.09.2026 13:00" );
        assert.match( formatSofia( instant, "en" ), /^15 Sep[a-z]* 2026$/ );
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
        const source = `const { formatSofia, sofiaInstant } = require( "#studio/sofia-time" );process.stdout.write( formatSofia( "2026-11-19T15:15:00Z", "bg", { time: true } ) );`;
        for ( const zone of [ "America/New_York", "Pacific/Auckland" ] ) {
            const out = execFileSync( process.execPath, [ "-e", source ], { cwd: path.resolve( __dirname, "../.." ), env: { ...process.env, TZ: zone }, encoding: "utf8" } );
            assert.equal( out, "19.11.2026 17:15", zone );
        }
    } );
} );

describe( "The instant a Sofia time names", () => {

    it( "reads winter time at UTC+2 and summer time at UTC+3", () => {
        assert.equal( sofiaInstant( "2026-11-20T10:00" ).toISOString(), "2026-11-20T08:00:00.000Z" );
        assert.equal( sofiaInstant( "2026-07-01T10:00" ).toISOString(), "2026-07-01T07:00:00.000Z" );
    } );

    it( "refuses a time the clock skips in March", () => {
        assert.throws( () => sofiaInstant( "2026-03-29T03:30" ), { name: "RangeError", message: /does not exist/, reason: "studio.refused.time-skipped" } );
        assert.equal( sofiaInstant( "2026-03-29T02:59" ).toISOString(), "2026-03-29T00:59:00.000Z" );
        assert.equal( sofiaInstant( "2026-03-29T04:00" ).toISOString(), "2026-03-29T01:00:00.000Z" );
    } );

    it( "refuses a time the clock repeats in October", () => {
        assert.throws( () => sofiaInstant( "2026-10-25T03:30" ), { name: "RangeError", message: /twice/, reason: "studio.refused.time-repeated" } );
        assert.equal( sofiaInstant( "2026-10-25T02:59" ).toISOString(), "2026-10-24T23:59:00.000Z" );
        assert.equal( sofiaInstant( "2026-10-25T04:00" ).toISOString(), "2026-10-25T02:00:00.000Z" );
    } );

    it( "refuses text that is no time, and a date that is no date", () => {
        for ( const text of [ "", "2026-11-20", "2026-11-20 10:00", "2026-11-20T10:00:00", "2026-02-30T10:00", "2026-11-20T24:00", undefined ] ) {
            assert.throws( () => sofiaInstant( text ), RangeError, String( text ) );
        }
    } );

    it( "does not depend on the process's own zone", () => {
        const source = `const { sofiaInstant } = require( "#studio/sofia-time" );process.stdout.write( sofiaInstant( "2026-07-01T10:00" ).toISOString() );`;
        const out = execFileSync( process.execPath, [ "-e", source ], { cwd: path.resolve( __dirname, "../.." ), env: { ...process.env, TZ: "Pacific/Auckland" }, encoding: "utf8" } );
        assert.equal( out, "2026-07-01T07:00:00.000Z" );
    } );
} );
