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
 * The files a published code list is downloaded as (design record §7.9, plan 8a decision 8). Both are text, returned
 * as strings: the caller encodes them. Only what the decision names goes in; the list's sources, notes and remark stay
 * out.
 */

const { compareNumbers } = require( "#numbers" );
const { synthesizeMessage } = require( "#synthetic-message" );
const { messageShape } = require( "#xsd-shape" );

const BOM = "﻿";
const FORMAT = "nhis-code-list/1";
const MODULE_FORMAT = "nhis-module/1";
const CHANGELOG_FORMAT = "nhis-changelog/1";
const SIGNATURE_NOTE = "<!-- Тук е XML подписът (xmldsig). / The XML signature goes here (xmldsig). -->";

// What a spreadsheet reads as the start of a formula. A cell that begins with one runs as a formula when the file is
// opened, so an entry such as `=HYPERLINK(...)` would run on a reader's machine (OWASP, CSV injection).
const FORMULA = /^[=+\-@\t\r]/;

const quoted = ( value ) => {
    let text = value === null || value === undefined ? "" : String( value );
    if ( FORMULA.test( text ) ) {
        text = `'${ text }`;
    }
    return `"${ text.replaceAll( "\"", "\"\"" ) }"`;
};

/**
 * A code list as JSON, the exact download: every entry with its texts, values and the versions it was added and valid
 * until. Pretty-printed, and ends with a line break.
 *
 * @method
 * @param {import( "#definitions" ).CodeListVersion} content
 * @returns {string}
 * @public
 */
module.exports.codeListJson = ( content ) => {
    const list = content.list;
    return `${ JSON.stringify( {
        format: FORMAT,
        id: list.id,
        version: content.version,
        name: list.name,
        keyType: list.keyType,
        columns: list.columns.map( ( column ) => column.title ),
        entries: list.entries.map( ( entry ) => ( { key: entry.key, description: entry.description, display: entry.display, values: entry.values,
            since: entry.since, validUntil: entry.validUntil } ) )
    }, null, 2 ) }\n`;
};

/**
 * A code list as CSV for spreadsheets: UTF-8 with a byte order mark (the character is returned; the caller encodes it),
 * CRLF line ends, every field quoted. A field that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is
 * prefixed with `'`, so that no spreadsheet runs it as a formula; the JSON is the exact download.
 *
 * @method
 * @param {import( "#definitions" ).CodeListVersion} content
 * @returns {string}
 * @public
 */
module.exports.codeListCsv = ( content ) => {
    const list = content.list;
    const header = [ "key", "description_bg", "description_en", "display_bg", "display_en", ...list.columns.map( ( column ) => column.title ), "since", "valid_until" ];
    const lines = [ header, ...list.entries.map( ( entry ) => [ entry.key, entry.description.bg, entry.description.en, entry.display.bg, entry.display.en,
        ...list.columns.map( ( column, index ) => entry.values[ index ] ), entry.since, entry.validUntil ] ) ];
    return `${ BOM }${ lines.map( ( fields ) => fields.map( quoted ).join( "," ) ).join( "\r\n" ) }\r\n`;
};

// An XML comment cannot hold "--"; a spec key or number with one would end the comment early.
const commentText = ( text ) => String( text ).replace( /-{2,}/g, ( dashes ) => dashes.split( "" ).join( " " ) );

/**
 * A message's sample (design record §8.3; plan 8b, decision 3): synthetic, from the message's own schema shape, so
 * every element is there once and every value is one its XSD accepts. A coded value is its fixed value where it has
 * one, otherwise the list's key from `keys`. It opens with a comment in both languages saying it is no real message,
 * and a note before the empty signature.
 *
 * @method
 * @param {import( "#definitions" ).Message} message
 * @param {{spec: string, number: string}} version
 * @param {Array<{id: string, keyType: string}>} codeLists The lists the version resolved against (§4.8).
 * @param {Map<string, string>} keys A key of each list by its ID: the first that has not expired.
 * @returns {string} The file's text, with an XML declaration, ending with a line break.
 * @throws {RangeError} From `messageShape`, for this message alone, so that the version's other files are still made.
 * @public
 */
module.exports.sampleMessage = ( message, version, codeLists, keys ) => {
    const shape = messageShape( message, new Map( codeLists.map( ( list ) => [ list.id, list ] ) ) );
    const body = synthesizeMessage( shape, { keys: keys, indent: "  " } ).replace( /^( *)<ds:Signature\/>$/gm, `$1${ SIGNATURE_NOTE }\n$1<ds:Signature/>` );
    const from = commentText( `${ version.spec } ${ version.number }` );
    return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!--",
        `  Синтетичен пример от ${ from }: всеки елемент по веднъж, стойности според XSD. Не е реално съобщение.`,
        `  Synthetic example from ${ from }: every element once, values the XSD accepts. Not a real message.`,
        "-->",
        body,
        ""
    ].join( "\n" );
};

// The model without what records workbook rows rather than the specification: every `source`, at any depth.
const withoutSources = ( value ) => {
    if ( Array.isArray( value ) ) {
        return value.map( withoutSources );
    }
    if ( value && typeof value === "object" ) {
        return Object.fromEntries( Object.entries( value ).filter( ( [ key ] ) => key !== "source" ).map( ( [ key, inner ] ) => [ key, withoutSources( inner ) ] ) );
    }
    return value;
};

/**
 * A module version's model as JSON (plan 8b, decision 4): its messages, conditions and dictionary in the stored
 * content's own shapes (§4.3), without the workbook rows they came from and without the bindings the studio derives.
 * Pretty-printed, and ends with a line break.
 *
 * @method
 * @param {import( "#definitions" ).ModuleVersion} content
 * @returns {string}
 * @public
 */
module.exports.moduleModelJson = ( content ) => `${ JSON.stringify( {
    format: MODULE_FORMAT,
    spec: content.spec,
    version: content.version,
    messages: withoutSources( content.messages ),
    conditions: withoutSources( content.conditions ),
    dictionary: withoutSources( content.dictionary )
}, null, 2 ) }\n`;

/**
 * A version's changelog as JSON (plan 8b, decision 4): this version and every earlier one given, newest first, each
 * with its entries. No dates, stages or expiry: they change after the file is fixed, and the changelog page has them.
 *
 * @method
 * @param {string} spec
 * @param {string} number The version's number.
 * @param {Array<{number: string, entries: Object}>} versions The spec's public versions, in any order.
 * @returns {string}
 * @public
 */
module.exports.changelogJson = ( spec, number, versions ) => `${ JSON.stringify( {
    format: CHANGELOG_FORMAT,
    spec: spec,
    version: number,
    versions: versions.filter( ( one ) => compareNumbers( one.number, number ) <= 0 ).sort( ( a, b ) => compareNumbers( b.number, a.number ) )
        .map( ( one ) => ( { number: one.number, entries: one.entries } ) )
}, null, 2 ) }\n`;
