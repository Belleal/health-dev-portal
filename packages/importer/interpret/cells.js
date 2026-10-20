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

const NONE = /^-+$/;

const NUMERIC_TYPES = new Set( [ "Unsigned Int", "Positive Int", "Decimal", "Integer" ] );

const FORMATS = Object.freeze( {
    "YYYY-MM-DD": "date",
    "ISO 8601": "date-time",
    "YYMMDD": "yymmdd",
    "true/false": "boolean"
} );

const REFERENCE_PATTERNS = Object.freeze( {
    rule: /^RL\d+$/,
    // CDP… in e-Prescription, CDR… in e-Referral: the module letter varies.
    condition: /^CD[A-Z]+\d+$/,
    codeList: /^CL[A-Z0-9]+$/
} );

/**
 * Tells whether a cell holds no value: empty, or the template's "---".
 *
 * @method
 * @param {string} text
 * @returns {boolean}
 * @public
 */
module.exports.isNone = ( text ) => text === "" || NONE.test( text );

/**
 * Returns the text, or `null` when it holds no value.
 *
 * @method
 * @param {string} text
 * @returns {string|null}
 * @public
 */
module.exports.noneToNull = ( text ) => ( module.exports.isNone( text ) ? null : text );

/**
 * Parses an R/C/O cell.
 *
 * @method
 * @param {string} text Already folded to Latin by the caller.
 * @returns {"R"|"C"|"O"|null}
 * @public
 */
module.exports.parseRequirement = ( text ) => ( [ "R", "C", "O" ].includes( text ) ? text : null );

/**
 * Parses a cardinality such as `0..1` or `1..*`.
 *
 * @method
 * @param {string} text
 * @returns {{min: number, max: number|null}|null}
 * @public
 */
module.exports.parseCardinality = ( text ) => {
    const match = /^(\d+)\.\.(\d+|\*)$/.exec( text );
    if ( !match ) {
        return null;
    }
    return { min: Number( match[ 1 ] ), max: match[ 2 ] === "*" ? null : Number( match[ 2 ] ) };
};

/**
 * Splits a constraint cell into its parts.
 *
 * @method
 * @param {string} text e.g. `min=1, max=255, chars=an`.
 * @param {string|null} dataType On a numeric type, `min`/`max` bound the value rather than the length.
 * @returns {{constraint: import( "@health-dev-portal/spec-model/definitions" ).Constraint|null, unparsed: string[]}}
 * @public
 */
module.exports.parseConstraint = ( text, dataType ) => {
    if ( module.exports.isNone( text ) ) {
        return { constraint: null, unparsed: [] };
    }
    const numeric = NUMERIC_TYPES.has( dataType );
    const constraint = { raw: text };
    const unparsed = [];
    for ( const token of text.split( "," ).map( ( part ) => part.trim() ).filter( Boolean ) ) {
        const bound = /^(min|max)=(\d+)$/.exec( token );
        const charset = /^chars=(\w+)$/.exec( token );
        if ( bound ) {
            constraint[ bound[ 1 ] + ( numeric ? "Value" : "Length" ) ] = Number( bound[ 2 ] );
        } else if ( charset ) {
            constraint.charset = charset[ 1 ];
        } else if ( Object.hasOwn( FORMATS, token ) ) {
            constraint.format = FORMATS[ token ];
        } else {
            unparsed.push( token );
        }
    }
    return { constraint: Object.freeze( constraint ), unparsed: unparsed };
};

/**
 * Splits a list of references (rules, conditions or code lists) on commas, semicolons and whitespace.
 *
 * @method
 * @param {string} text Already folded to Latin by the caller.
 * @param {"rule"|"condition"|"codeList"} kind
 * @returns {{values: string[], invalid: string[]}}
 * @throws {TypeError} When the kind is unknown.
 * @public
 */
module.exports.parseReferenceList = ( text, kind ) => {
    const pattern = REFERENCE_PATTERNS[ kind ];
    if ( !pattern ) {
        throw new TypeError( `Unknown reference kind "${ kind }".` );
    }
    const values = [];
    const invalid = [];
    if ( module.exports.isNone( text ) ) {
        return { values: values, invalid: invalid };
    }
    for ( const token of text.split( /[\s,;]+/ ).filter( ( part ) => part && !NONE.test( part ) ) ) {
        ( pattern.test( token ) ? values : invalid ).push( token );
    }
    return { values: values, invalid: invalid };
};

// Tried in this order: a date such as 10.10.2023 also matches the lenient version form, and 124 cells of nomenclatures
// 1.5.33 hold one where a version belongs (design record §4.6).
const VERSION_FORMS = Object.freeze( [
    [ "canonical", /^v(\d+)\.(\d+)\.(\d+)$/ ],
    [ "date", /^\d{1,2}\.\d{1,2}\.\d{4}$/ ],
    [ "lenient", /^v?\.?\s*(\d+)\.(\d+)\.(\d+)$/ ]
] );

/**
 * Reads a `Since` / `Valid Until` cell, which holds a spec version (`v1.5.28`), and says in which form it was written:
 * the template's, another form that is still a version (`v.1.5.21`, `1.5.16`), a date, or neither.
 *
 * @method
 * @param {string} text
 * @returns {{version: string|null, form: string}} `version` without the `v`; `form` is `empty`, `canonical`,
 *     `lenient`, `date` or `invalid`.
 * @public
 */
module.exports.parseVersionCell = ( text ) => {
    const trimmed = text.trim();
    if ( module.exports.isNone( trimmed ) ) {
        return { version: null, form: "empty" };
    }
    for ( const [ form, pattern ] of VERSION_FORMS ) {
        const match = pattern.exec( trimmed );
        if ( match ) {
            return { version: form === "date" ? null : match.slice( 1, 4 ).join( "." ), form: form };
        }
    }
    return { version: null, form: "invalid" };
};

/**
 * Compares two `x.y.z` versions part by part, as numbers.
 *
 * @method
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative when `a` is lower, positive when higher, 0 when equal.
 * @public
 */
module.exports.compareVersions = ( a, b ) => {
    const left = a.split( "." ).map( Number );
    const right = b.split( "." ).map( Number );
    for ( let index = 0; index < 3; index++ ) {
        if ( left[ index ] !== right[ index ] ) {
            return left[ index ] - right[ index ];
        }
    }
    return 0;
};
