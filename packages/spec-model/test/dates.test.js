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
 * Dates are Sofia's (design record §7.12): a planned production date is a day in Sofia, whatever the server's clock.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { addDays, sofiaDate } = require( "@health-dev-portal/spec-model/dates" );

describe( "dates", () => {

    it( "gives the date in Sofia, across midnight and the clock change", () => {
        assert.equal( sofiaDate( new Date( "2026-12-10T22:30:00Z" ) ), "2026-12-11" );
        assert.equal( sofiaDate( new Date( "2026-12-10T21:30:00Z" ) ), "2026-12-10" );
        assert.equal( sofiaDate( new Date( "2026-03-29T00:30:00Z" ) ), "2026-03-29" );
        assert.equal( sofiaDate( new Date( "2026-07-01T21:30:00Z" ) ), "2026-07-02" );
    } );

    it( "adds calendar days across a month and a year", () => {
        assert.equal( addDays( "2026-12-30", 3 ), "2027-01-02" );
        assert.equal( addDays( "2026-11-05", 30 ), "2026-12-05" );
        assert.equal( addDays( "2028-02-28", 1 ), "2028-02-29" );
        assert.equal( addDays( "2026-03-28", 1 ), "2026-03-29" );
    } );
} );
