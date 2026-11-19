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
 * The studio's times (plan 9a): the staff read Sofia time, whatever zone the server's process runs in. The zone is set
 * on the formatter itself and never through a deployment-wide setting, which would move every other time the framework
 * writes.
 */

const ZONE = "Europe/Sofia";

// One formatter per language and shape: building one is far dearer than using it.
const formatters = new Map();
const formatterFor = ( language, withTime ) => {
    const id = `${ language }:${ withTime }`;
    if ( !formatters.has( id ) ) {
        formatters.set( id, new Intl.DateTimeFormat( language === "bg" ? "bg-BG" : "en-GB", {
            timeZone: ZONE, day: "2-digit", month: language === "bg" ? "2-digit" : "short", year: "numeric",
            ...( withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {} )
        } ) );
    }
    return formatters.get( id );
};

/**
 * Writes an instant in Sofia time, in a language: `19.11.2026` in Bulgarian and `19 Nov 2026` in English, with ` 17:15`
 * after it when asked for the time.
 *
 * @method
 * @param {Date|string|number} value The instant.
 * @param {string} language `bg` or `en`; anything else is written as English.
 * @param {{time?: boolean}} [options] `time` adds the hour and minute.
 * @returns {string} Empty for a value that is no time.
 * @public
 */
module.exports.formatSofia = ( value, language, { time = false } = {} ) => {
    const date = value instanceof Date ? value : new Date( value );
    if ( Number.isNaN( date.getTime() ) ) {
        return "";
    }
    const parts = Object.fromEntries( formatterFor( language, time ).formatToParts( date ).map( ( part ) => [ part.type, part.value ] ) );
    // Assembled from the parts: the locales' own joiners differ (`г.`, `,`) and a screen wants one shape.
    const day = language === "bg" ? `${ parts.day }.${ parts.month }.${ parts.year }` : `${ parts.day } ${ parts.month } ${ parts.year }`;
    return time ? `${ day } ${ parts.hour }:${ parts.minute }` : day;
};

const wallClock = new Intl.DateTimeFormat( "en-GB", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } );
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const HOUR = 3600000;

// The wall-clock reading of an instant in Sofia, as the same shape `LOCAL` takes.
const wallOf = ( instant ) => {
    const parts = Object.fromEntries( wallClock.formatToParts( instant ).map( ( part ) => [ part.type, part.value ] ) );
    return `${ parts.year }-${ parts.month }-${ parts.day }T${ parts.hour }:${ parts.minute }`;
};

/**
 * The instant a Sofia wall-clock time names: `2026-11-20T10:00` is `08:00Z`, and `2026-07-01T10:00` is `07:00Z`. It tries
 * each of Sofia's two offsets and keeps the one whose reading comes back as the input, so the answer is checked against
 * the zone's own rules and no offset table is kept here.
 *
 * @method
 * @param {string} localDateTime `yyyy-mm-ddThh:mm`, in Europe/Sofia.
 * @returns {Date}
 * @throws {RangeError} For text that is no such time, for a time the clock skips (the hour after 03:00 in March), and for
 *     one it repeats (the hour before 04:00 in October), which names two instants. `hdp-status` refuses a bare local time
 *     for the same reason.
 * @public
 */
module.exports.sofiaInstant = ( localDateTime ) => {
    const found = LOCAL.exec( typeof localDateTime === "string" ? localDateTime : "" );
    if ( !found ) {
        throw new RangeError( `${ JSON.stringify( localDateTime ) } is not a time like 2026-11-20T10:00.` );
    }
    const [ year, month, day, hour, minute ] = found.slice( 1 ).map( Number );
    const asUTC = new Date( Date.UTC( year, month - 1, day, hour, minute ) );
    // `Date.UTC` rolls 30 February over to March; a reading that is not the input means the input was no date.
    if ( asUTC.toISOString().slice( 0, 16 ) !== localDateTime ) {
        throw new RangeError( `${ localDateTime } is not a date and time.` );
    }
    const candidates = [ 2, 3 ].map( ( offset ) => new Date( asUTC.getTime() - offset * HOUR ) ).filter( ( instant ) => wallOf( instant ) === localDateTime );
    if ( candidates.length === 0 ) {
        throw new RangeError( `${ localDateTime } does not exist in Sofia: the clock skips it when it goes forward.` );
    }
    if ( candidates.length > 1 ) {
        throw new RangeError( `${ localDateTime } happens twice in Sofia, when the clock goes back; choose a time outside that hour.` );
    }
    return candidates[ 0 ];
};
