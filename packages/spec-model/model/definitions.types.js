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

/**
 * @typedef {Object} SourceRef Where a value was read from in a workbook.
 * @property {string} sheet
 * @property {number} row
 * @property {number} [column] 1-based.
 */

/**
 * @typedef {Object} LocalText Text in both languages; a missing translation is `null`, never the other language.
 * @property {string|null} bg
 * @property {string|null} en
 */

/**
 * @typedef {Object} Cardinality
 * @property {number} min
 * @property {number|null} max `null` means unbounded (`*`).
 */

/**
 * @typedef {Object} Constraint A workbook constraint split into its parts; `raw` keeps the original text.
 * @property {string} raw
 * @property {number} [minLength]
 * @property {number} [maxLength]
 * @property {number} [minValue] On numeric types the bounds are values, not lengths.
 * @property {number} [maxValue]
 * @property {string} [charset] e.g. `an` (alphanumeric).
 * @property {string} [format] `date`, `date-time`, `yymmdd` or `boolean`.
 */

/**
 * @typedef {Object} ElementNode One element of a message tree (design record §4.3).
 * @property {string|null} identity `null` when it could not be formed (an anomaly says why).
 * @property {string|null} path The tag path, without attribute or variant number.
 * @property {number} depth
 * @property {string} kind One of `ELEMENT_KIND`.
 * @property {LocalText} name
 * @property {string|null} requirement One of `REQUIREMENT`.
 * @property {Cardinality|null} cardinality
 * @property {string|null} dataType
 * @property {Constraint|null} constraint
 * @property {string|null} fixedValue
 * @property {string|null} defaultValue
 * @property {string[]} rules
 * @property {string[]} conditions
 * @property {string|null} codeList
 * @property {string|null} tag
 * @property {string|null} attribute
 * @property {LocalText} description
 * @property {SourceRef} source
 * @property {ElementNode[]} children
 */

/**
 * @typedef {Object} Message
 * @property {string} code e.g. `P001`.
 * @property {LocalText} title Bulgarian title and English classification.
 * @property {string|null} address The endpoint, e.g. `/v4/eprescription/doctor/issue`; `null` for a response.
 * @property {string|null} direction One of `MESSAGE_DIRECTION`.
 * @property {string|null} sender
 * @property {string|null} recipient
 * @property {string|null} pairedWith The code of its request or response.
 * @property {string|null} lifecycle One of `MESSAGE_LIFECYCLE`, from the tab colour.
 * @property {boolean|null} changedInVersion The tab colour's claim, kept as a cross-check.
 * @property {ElementNode[]} elements
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ChangeNote
 * @property {string} category One of `CHANGE_CATEGORY`.
 * @property {string} text
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ChangeVersion
 * @property {string} version e.g. `1.5.1`.
 * @property {ChangeNote[]} notes
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ConditionText A condition as written in the workbook; plan 3 parses it.
 * @property {string} id e.g. `CDP01`.
 * @property {string} text The lines joined with newlines.
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} DictionaryEntry
 * @property {string} abbreviation
 * @property {LocalText} name
 * @property {LocalText} description
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ModuleVersion One version of a module specification, as imported.
 * @property {string} spec The spec's key, e.g. `e-prescription`.
 * @property {string|null} version
 * @property {Message[]} messages
 * @property {ConditionText[]} conditions
 * @property {DictionaryEntry[]} dictionary
 * @property {ChangeVersion[]} changeNotes Oldest first.
 */

/**
 * @typedef {Object} Anomaly
 * @property {string} type A key of `ANOMALY_TYPES`.
 * @property {string} level One of `ANOMALY_LEVEL`.
 * @property {string} message
 * @property {string|null} sheet
 * @property {number|null} row
 * @property {number|null} column
 * @property {Object} details
 */

module.exports = {};
