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

const BOM = "﻿";
const FORMAT = "nhis-code-list/1";

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
