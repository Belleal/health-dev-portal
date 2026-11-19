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
