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

// A tag or attribute holding one of these would let two different elements print the same identity.
const RESERVED = /[/@#\s]/;

/**
 * Tells whether a string can be one tag or attribute of an identity.
 *
 * @method
 * @param {*} value
 * @returns {boolean}
 * @public
 */
module.exports.isValidPart = ( value ) => typeof value === "string" && value !== "" && !RESERVED.test( value );

const requirePart = ( value, what ) => {
    if ( !module.exports.isValidPart( value ) ) {
        throw new TypeError( `${ what } must be a non-empty string without "/", "@", "#" or whitespace; got ${ JSON.stringify( value ) }.` );
    }
};

/**
 * Appends a tag to a tag path.
 *
 * @method
 * @param {string} parentPath The parent's path, or an empty string at the root.
 * @param {string} tag
 * @returns {string}
 * @throws {TypeError} When the tag is not a valid part.
 * @public
 */
module.exports.joinPath = ( parentPath, tag ) => {
    requirePart( tag, "A tag" );
    return parentPath ? `${ parentPath }/${ tag }` : tag;
};

/**
 * Makes the identity of a field or attribute from its path and XML attribute.
 *
 * @method
 * @param {string} path
 * @param {string} attribute
 * @returns {string}
 * @throws {TypeError} When the path is empty or the attribute is not a valid part.
 * @public
 */
module.exports.withAttribute = ( path, attribute ) => {
    if ( typeof path !== "string" || path === "" ) {
        throw new TypeError( `A path must be a non-empty string; got ${ JSON.stringify( path ) }.` );
    }
    requirePart( attribute, "An attribute" );
    return `${ path }@${ attribute }`;
};

/**
 * Makes the identity of a polymorphic element's variant: its variants share a tag and attribute, so their order tells
 * them apart.
 *
 * @method
 * @param {string} identity The variant's identity before numbering.
 * @param {number} ordinal 1-based position among the variants.
 * @returns {string}
 * @throws {TypeError} When the ordinal is not a positive integer.
 * @public
 */
module.exports.withVariant = ( identity, ordinal ) => {
    if ( !Number.isInteger( ordinal ) || ordinal < 1 ) {
        throw new TypeError( `A variant ordinal must be a positive integer; got ${ JSON.stringify( ordinal ) }.` );
    }
    return `${ identity }#${ ordinal }`;
};
