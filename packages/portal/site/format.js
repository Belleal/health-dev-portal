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
 * Values written the way each language reads them (plan 8a, decisions 5 and 7; design record §7.12): dates, counts and
 * an element's constraints.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { sofiaDate } = require( "@health-dev-portal/spec-model/dates" );
const { label, otherLanguage } = require( "#labels" );

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// The character classes NHIS-Commons 1.13.1 defines (design record §4.10), each with its meaning. `ans` is used in the
// workbooks and defined nowhere, so it has no meaning here either: one made up would read as the specification's.
const CHARSETS = Object.freeze( {
    n: ( lang ) => label( lang, "charsetDigits" ),
    an: ( lang ) => label( lang, "charsetLatin" ),
    a: ( lang ) => label( lang, "charsetLetters" )
} );

// A format as the workbooks write it; the model keeps a key for each (spec-model's Constraint).
const FORMATS = Object.freeze( { "date": "YYYY-MM-DD", "date-time": "ISO 8601", "yymmdd": "YYMMDD", "boolean": "true/false", "base64": "base64" } );

const bound = ( value ) => typeof value === "number" && Number.isFinite( value );
const formatName = ( format ) => Object.hasOwn( FORMATS, format ) ? FORMATS[ format ] : format;

// The workbook's own text of a constraint the importer split into no part — `YYYY-MM-DDThh:mm`, `Base64Encoded`,
// `max-length=2` — else `null`. Such a constraint showed as none at all: 203 elements of the eight published workbooks
// carry one (final review I1, measured). Where any part was split, the parts say it, and the raw text is not repeated.
const unsplit = ( constraint ) => {
    const split = [ constraint.minLength, constraint.maxLength, constraint.minValue, constraint.maxValue ].some( bound ) || Boolean( constraint.charset ) || Boolean( constraint.format );
    return !split && typeof constraint.raw === "string" && constraint.raw.trim() !== "" ? constraint.raw.trim() : null;
};
const characters = ( lang, count ) => count === 1 ? label( lang, "lengthOne" ) : label( lang, "lengthCount", { count: count } );
const digits = ( lang, count ) => count === 1 ? label( lang, "digitsOne" ) : label( lang, "digitsCount", { count: count } );

// A bound in words: "до 36 знака", "от 2 до 5 цифри", "точно 36 знака".
const spelled = ( lang, min, max, amount ) => {
    if ( bound( min ) && bound( max ) ) {
        return min === max ? label( lang, "boundExactly", { amount: amount( lang, max ) } ) : label( lang, "boundBetween", { min: min, amount: amount( lang, max ) } );
    }
    return bound( max ) ? label( lang, "boundUpTo", { amount: amount( lang, max ) } ) : label( lang, "boundAtLeast", { amount: amount( lang, min ) } );
};

/**
 * What a character class means, as NHIS-Commons defines it.
 *
 * @method
 * @param {string|null|undefined} charset e.g. `an`.
 * @param {string} lang
 * @returns {string|null} `null` for a class with no published definition, such as `ans`.
 * @public
 */
module.exports.charsetMeaning = ( charset, lang ) => typeof charset === "string" && Object.hasOwn( CHARSETS, charset ) ? CHARSETS[ charset ]( lang ) : null;

/**
 * An element's constraints as the tree table shows them (decision 7): a string's length (`≤ 36`, `≥ 2`, `2–36`, `= 36`),
 * its character class with its meaning in a `title`, and its format (`YYMMDD`, `base64`). On a number, `max=` counts
 * digits, as HEL-26 settled (Boris, 2026-11-06), so it reads "до 2 цифри": the model still keeps it as `maxValue`, which
 * HEL-34 renames, and a reader shown "≤ 2" would take it for a value. A constraint the importer split into no part is
 * shown as the workbook writes it, in `<code>`.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} element
 * @param {string} lang
 * @returns {import( "@ti-engine/web-content/html" ).SafeString} Escaped; empty for an element with no constraint.
 * @public
 */
module.exports.describeConstraint = ( element, lang ) => {
    const constraint = element && element.constraint;
    if ( !constraint ) {
        return html``;
    }
    const raw = unsplit( constraint );
    if ( raw !== null ) {
        return html`<code>${ raw }</code>`;
    }
    const parts = [];
    const { minLength, maxLength, minValue, maxValue } = constraint;
    if ( bound( minLength ) && bound( maxLength ) ) {
        parts.push( minLength === maxLength ? `= ${ maxLength }` : `${ minLength }–${ maxLength }` );
    } else if ( bound( maxLength ) || bound( minLength ) ) {
        parts.push( bound( maxLength ) ? `≤ ${ maxLength }` : `≥ ${ minLength }` );
    }
    if ( bound( minValue ) && bound( maxValue ) ) {
        parts.push( minValue === maxValue ? digits( lang, maxValue ) : `${ minValue }–${ digits( lang, maxValue ) }` );
    } else if ( bound( maxValue ) || bound( minValue ) ) {
        parts.push( spelled( lang, minValue, maxValue, digits ) );
    }
    if ( constraint.charset ) {
        const meaning = module.exports.charsetMeaning( constraint.charset, lang );
        parts.push( meaning === null ? html`${ constraint.charset }` : html`<abbr title="${ meaning }">${ constraint.charset }</abbr>` );
    }
    if ( constraint.format ) {
        parts.push( formatName( constraint.format ) );
    }
    return html`${ parts.map( ( part, index ) => index === 0 ? html`${ part }` : html`, ${ part }` ) }`;
};

/**
 * An element's constraints in words, for the detail panel (decision 7): "до 36 знака", "знаци an: латински букви…",
 * "формат YYMMDD". A constraint the importer split into no part is given as the workbook writes it, and says so, since
 * the portal cannot put it in words of its own.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ElementNode} element
 * @param {string} lang
 * @returns {string[]} Plain text, one constraint each; none for an element with no constraint.
 * @public
 */
module.exports.spellConstraint = ( element, lang ) => {
    const constraint = element && element.constraint;
    if ( !constraint ) {
        return [];
    }
    const raw = unsplit( constraint );
    if ( raw !== null ) {
        return [ label( lang, "constraintAsWritten", { raw: raw } ) ];
    }
    const words = [];
    if ( bound( constraint.minLength ) || bound( constraint.maxLength ) ) {
        words.push( spelled( lang, constraint.minLength, constraint.maxLength, characters ) );
    }
    if ( bound( constraint.minValue ) || bound( constraint.maxValue ) ) {
        words.push( spelled( lang, constraint.minValue, constraint.maxValue, digits ) );
    }
    if ( constraint.charset ) {
        const meaning = module.exports.charsetMeaning( constraint.charset, lang );
        words.push( meaning === null ? label( lang, "characterClassUndefined", { charset: constraint.charset } )
            : label( lang, "characterClass", { charset: constraint.charset, meaning: meaning } ) );
    }
    if ( constraint.format ) {
        words.push( label( lang, "formatIs", { format: formatName( constraint.format ) } ) );
    }
    return words;
};

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
