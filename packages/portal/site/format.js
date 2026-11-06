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
 * Values written the way each language reads them (plan 8a, decision 5; design record §7.12): dates and counts.
 */

const { sofiaDate } = require( "@health-dev-portal/spec-model/dates" );
const { otherLanguage } = require( "#labels" );

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// The calendar date is formatted at UTC midnight, so the server's own zone can never move it to the day before.
// Measured with Node 26 (ICU 78.3): "11 Dec 2026", "30 Apr 2027", and "5 Sept 2026", which is en-GB's own abbreviation.
const ENGLISH = new Intl.DateTimeFormat( "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } );

/**
 * A date as a reader expects it: `dd.mm.yyyy` in Bulgarian, en-GB's day, short month and year in English
 * (`11 Dec 2026`). A moment is first taken as the date in Sofia, as every date of the lifecycle is (§7.12).
 *
 * @method
 * @param {string|Date} date `yyyy-mm-dd`, or a moment.
 * @param {string} lang
 * @returns {string}
 * @throws {RangeError} For anything that is not a real date, or a language the site does not have.
 * @public
 */
module.exports.formatDate = ( date, lang ) => {
    otherLanguage( lang );
    const day = date instanceof Date ? sofiaDate( date ) : date;
    const parts = typeof day === "string" ? DATE.exec( day ) : null;
    const moment = parts ? new Date( `${ day }T00:00:00Z` ) : null;
    // A day past the month's end parses, rolled into the next month; a real date reads back as itself.
    if ( !moment || Number.isNaN( moment.getTime() ) || moment.toISOString().slice( 0, 10 ) !== day ) {
        throw new RangeError( `${ JSON.stringify( date ) } is not a date such as 2026-12-11.` );
    }
    return lang === "bg" ? `${ parts[ 3 ] }.${ parts[ 2 ] }.${ parts[ 1 ] }` : ENGLISH.format( moment );
};

/**
 * How many times an element may appear, as the workbooks write it: `1..1`, `0..*`. Empty for an element with none.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Cardinality|null} cardinality
 * @returns {string}
 * @public
 */
module.exports.formatCount = ( cardinality ) => cardinality ? `${ cardinality.min }..${ cardinality.max === null ? "*" : cardinality.max }` : "";
