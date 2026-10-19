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

const { ANOMALY_LEVEL } = require( "#kinds" );

const BLOCKING = ANOMALY_LEVEL.BLOCKING;
const WARNING = ANOMALY_LEVEL.WARNING;

/**
 * Every anomaly the importer can report, with its level and an English message template. `{name}` placeholders are
 * filled from the anomaly's details.
 *
 * @readonly
 * @type {Readonly<Object<string, {level: string, text: string}>>}
 * @public
 */
module.exports.ANOMALY_TYPES = Object.freeze( {
    // The workbook as a whole
    "missing-sheet": { level: BLOCKING, text: "The workbook has no sheet named \"{sheet}\"." },
    "missing-header-row": { level: BLOCKING, text: "No header row was found in the first rows of the sheet." },
    "missing-column": { level: BLOCKING, text: "No column is headed \"{column}\"." },
    "missing-version": { level: BLOCKING, text: "The change notes name no version, so the workbook's version is unknown." },
    "version-mismatch": { level: WARNING, text: "The file name says {fileVersion}, the change notes say {version}." },
    "notes-before-version": { level: WARNING, text: "A change note appears before any \"Версия\" heading." },
    // Messages
    "message-without-sheet": { level: BLOCKING, text: "Message {code} is listed but has no sheet." },
    "sheet-without-message": { level: WARNING, text: "Sheet {sheet} is not listed among the messages." },
    "unknown-tab-colour": { level: WARNING, text: "Tab colour {colour} is not in the legend, so the message's status is unknown." },
    "unknown-direction": { level: WARNING, text: "\"{value}\" is neither Request nor Response." },
    "unpaired-message": { level: WARNING, text: "Message {code} has no request/response partner." },
    // Rows of a message sheet
    "depth-jump": { level: BLOCKING, text: "Indentation {depth} under a parent at {parentDepth}: the row cannot be placed in the tree." },
    "invalid-requirement": { level: BLOCKING, text: "\"{value}\" is not R, C or O." },
    "invalid-cardinality": { level: BLOCKING, text: "\"{value}\" is not a cardinality such as 1..1, 0..1 or 1..*." },
    "missing-tag": { level: BLOCKING, text: "The element has no XML tag." },
    "invalid-tag": { level: BLOCKING, text: "\"{tag}\" cannot be part of an element's identity." },
    "attribute-without-field": { level: BLOCKING, text: "An attribute row must sit directly under the field it belongs to." },
    "note-row": { level: WARNING, text: "\"{text}\" has a name and nothing else; it is read as a note, not an element." },
    "look-alike-letter": { level: WARNING, text: "\"{value}\" contains Cyrillic letters that look Latin ({letters}); read as \"{folded}\"." },
    "mixed-script-word": { level: WARNING, text: "\"{word}\" mixes Latin and Cyrillic letters." },
    "unknown-fill": { level: WARNING, text: "Fill colour {colour} is not in the legend; the row is read as a field." },
    "end-fill-on-data-row": { level: WARNING, text: "A data row has the grey fill reserved for END rows; the row is read as a field." },
    "asterisks-disagree": { level: WARNING, text: "{stars} leading asterisk(s) on a row indented {depth}." },
    "unexpected-end-row": { level: WARNING, text: "\"END of {name}\" closes no open group." },
    "unparsed-constraint": { level: WARNING, text: "Constraint \"{token}\" is not understood and is kept as text." },
    "invalid-reference": { level: WARNING, text: "\"{value}\" is not a valid {kind} reference." },
    "multiple-code-lists": { level: WARNING, text: "One element names several code lists ({values}); the first is used." },
    "attribute-tag-mismatch": { level: WARNING, text: "The attribute row's tag \"{tag}\" differs from its field's tag \"{fieldTag}\"." },
    // The tree as a whole
    "duplicate-identity": { level: BLOCKING, text: "Two elements share the identity {identity} (rows {firstRow} and {row})." },
    "invalid-cardinality-range": { level: BLOCKING, text: "Cardinality {value} has a minimum above its maximum." },
    "conditional-without-condition": { level: WARNING, text: "Conditional element {identity} names no condition." },
    "required-with-zero-minimum": { level: WARNING, text: "Required element {identity} has cardinality {value}." },
    "empty-group": { level: WARNING, text: "Group {identity} has no elements." },
    "single-variant": { level: WARNING, text: "Polymorphic element {identity} has {count} variant(s); it needs at least two." },
    // Side sheets
    "empty-condition": { level: WARNING, text: "Condition {id} has no text." }
} );

/**
 * Creates a frozen anomaly of a catalogued type.
 *
 * @method
 * @param {string} type A key of `ANOMALY_TYPES`.
 * @param {{sheet?: string, row?: number, column?: number}} [source] Where in the workbook it was found.
 * @param {Object} [details] Values for the message template, kept on the anomaly.
 * @returns {import( "#definitions" ).Anomaly}
 * @throws {TypeError} When the type is not catalogued.
 * @public
 */
module.exports.createAnomaly = ( type, source = {}, details = {} ) => {
    const definition = module.exports.ANOMALY_TYPES[ type ];
    if ( !definition ) {
        // An uncatalogued type would surface with no level, and no report would ever count it as blocking.
        throw new TypeError( `Unknown anomaly type "${ type }".` );
    }
    return Object.freeze( {
        type: type,
        level: definition.level,
        message: definition.text.replace( /\{(\w+)\}/g, ( placeholder, key ) => ( key in details ? String( details[ key ] ) : placeholder ) ),
        sheet: source.sheet ?? null,
        row: source.row ?? null,
        column: source.column ?? null,
        details: Object.freeze( { ...details } )
    } );
};

/**
 * Tells whether any of the anomalies blocks an import.
 *
 * @method
 * @param {import( "#definitions" ).Anomaly[]} anomalies
 * @returns {boolean}
 * @public
 */
module.exports.hasBlocking = ( anomalies ) => anomalies.some( ( anomaly ) => anomaly.level === BLOCKING );
