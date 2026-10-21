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
    "non-canonical-version-heading": { level: WARNING, text: "\"{text}\" is read as version {version}; the template writes \"Версия x.y.z\"." },
    "versions-out-of-order": { level: WARNING, text: "Version {version} follows {previous}; the highest version, {latest}, is taken as the workbook's." },
    "unknown-note-colour": { level: WARNING, text: "Font colour {colour} is not in the legend; the note is read as non-breaking." },
    "ambiguous-sheet": { level: BLOCKING, text: "Sheets {sheets} have the same name once spaces are trimmed." },
    "invalid-date": { level: WARNING, text: "\"{value}\" is not a date such as 24.08.2026." },
    // Messages
    "message-without-sheet": { level: BLOCKING, text: "Message {code} is listed but has no sheet." },
    "duplicate-message": { level: BLOCKING, text: "Message {code} is listed twice (rows {firstRow} and {row})." },
    "malformed-message-code": { level: BLOCKING, text: "\"{value}\" is not a message code such as P001, on a row that has a direction." },
    "unknown-condition": { level: BLOCKING, text: "{identity} names condition {id}, which the Conditions sheet does not define." },
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
    "non-latin-tag": { level: BLOCKING, text: "\"{tag}\" contains letters outside Latin; XML tags and attributes are Latin only." },
    "missing-name": { level: BLOCKING, text: "The row has values but no name." },
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
    "field-with-elements": { level: BLOCKING, text: "\"{name}\" sits under the field \"{field}\", which can hold only attribute rows: is it indented one level too deep?" },
    "attribute-with-children": { level: BLOCKING, text: "\"{name}\" sits under the attribute row \"{attribute}\", which cannot hold elements." },
    "conditional-without-condition": { level: WARNING, text: "Conditional element {identity} names no condition." },
    "required-with-zero-minimum": { level: WARNING, text: "Required element {identity} has cardinality {value}." },
    "empty-group": { level: WARNING, text: "Group {identity} has no elements." },
    "single-variant": { level: WARNING, text: "Polymorphic element {identity} has {count} variant(s); it needs at least two." },
    // Side sheets
    "empty-condition": { level: WARNING, text: "Condition {id} has no text." },
    "duplicate-condition": { level: BLOCKING, text: "Condition {id} is defined twice (rows {firstRow} and {row}); the first is kept." },
    // Code lists and the index
    "duplicate-key": { level: BLOCKING, text: "Key {key} appears twice (rows {firstRow} and {row})." },
    "skipped-rows": { level: WARNING, text: "{count} row(s) have no usable key — blank, a placeholder such as \"...\", or text with spaces — and are not imported: rows {rows}." },
    "non-canonical-version": { level: WARNING, text: "\"{value}\" is read as version {version}; the template writes \"v1.2.3\"." },
    "date-instead-of-version": { level: WARNING, text: "\"{value}\" is a date; this column holds a version such as v1.5.28." },
    "invalid-version": { level: WARNING, text: "\"{value}\" is not a version such as v1.5.28." },
    "valid-until-before-since": { level: WARNING, text: "Valid until {validUntil} is earlier than since {since}." },
    "unknown-list-status": { level: WARNING, text: "\"{value}\" is not a known code-list status." },
    "invalid-flag": { level: WARNING, text: "\"{value}\" is neither true nor false." },
    "duplicate-list": { level: BLOCKING, text: "Code list {id} is listed twice (rows {firstRow} and {row})." },
    "list-without-sheet": { level: BLOCKING, text: "Code list {id} is listed as {status} but has no sheet." },
    "sheet-not-listed": { level: WARNING, text: "Sheet {sheet} is not listed in \"Номенклатури\" and is not imported." },
    // Rules
    "malformed-rule-id": { level: BLOCKING, text: "\"{value}\" is not a rule ID such as RL001." },
    "duplicate-rule": { level: BLOCKING, text: "Rule {id} is defined twice (rows {firstRow} and {row})." },
    "unknown-rule-colour": { level: WARNING, text: "Fill {colour} of rule {id} is not in the legend, so the rule's status is unknown." },
    "rule-without-definition": { level: WARNING, text: "Active rule {id} has no definition." },
    // Links between specs
    "unknown-code-list": { level: BLOCKING, text: "{identity} names code list {id}, which the nomenclatures do not define." },
    "removed-code-list": { level: WARNING, text: "{identity} names code list {id}, which the nomenclatures mark as removed." },
    "unknown-rule": { level: BLOCKING, text: "{identity} names rule {id}, which the rules do not define." },
    "withdrawn-rule": { level: WARNING, text: "{identity} names rule {id}, which is withdrawn." },
    "unknown-error-code": { level: WARNING, text: "Rule {id} returns error code {code}, which CL999 does not define." },
    // Conditions (design record §6)
    "non-canonical-condition": { level: WARNING, text: "Condition {id} uses forms the language writes differently ({forms}); it reads as: {printed}" },
    "free-text-effect": { level: WARNING, text: "Condition {id}: \"{text}\" cannot be read as an effect; it is kept as a note and not checked." },
    "unparsed-condition": { level: WARNING, text: "Condition {id} cannot be read ({error}); it is kept as text and not checked." },
    "unresolved-condition-path": { level: WARNING, text: "Condition {id} in {message}: '{path}' names no single element there, so the condition is not checked in that message." },
    "condition-type-mismatch": { level: WARNING, text: "Condition {id} in {message}: {operator} does not apply to {identity}, which is {dataType}." },
    "unknown-condition-value": { level: BLOCKING, text: "Condition {id}: '{value}' is not a key of {list}, the code list of {identity}." },
    "unknown-list-column": { level: WARNING, text: "Condition {id}: {list} has no column \"{column}\"." }
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
