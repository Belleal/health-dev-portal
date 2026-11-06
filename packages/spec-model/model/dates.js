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

// en-CA formats a date as yyyy-mm-dd; the zone, not the server's clock, decides the day (design record §7.12).
const SOFIA = new Intl.DateTimeFormat( "en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" } );

/**
 * The date in Sofia at a moment, as `yyyy-mm-dd` (design record §7.12): a release planned for 11.12 may go to
 * production at 00:30 Sofia time, while UTC is still on 10.12.
 *
 * @method
 * @param {Date} now
 * @returns {string}
 * @public
 */
module.exports.sofiaDate = ( now ) => SOFIA.format( now );

/**
 * A date some calendar days later. Days are counted on the calendar, in UTC, so a clock change never moves a date.
 *
 * @method
 * @param {string} date `yyyy-mm-dd`.
 * @param {number} days
 * @returns {string} `yyyy-mm-dd`.
 * @throws {RangeError} For a date that is none.
 * @public
 */
module.exports.addDays = ( date, days ) => {
    const day = new Date( `${ date }T00:00:00Z` );
    if ( !/^\d{4}-\d{2}-\d{2}$/.test( date ) || Number.isNaN( day.getTime() ) ) {
        throw new RangeError( `"${ date }" is not a date such as 2026-12-11.` );
    }
    day.setUTCDate( day.getUTCDate() + days );
    return day.toISOString().slice( 0, 10 );
};
