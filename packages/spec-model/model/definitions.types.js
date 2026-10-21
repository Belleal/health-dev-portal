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
 * @property {string|null} lifecycle One of `LIFECYCLE`, from the tab colour.
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
 * @property {string|null} stagingDate ISO `YYYY-MM-DD`; `null` where the sheet has no date columns or the cell is empty.
 * @property {string|null} productionDate ISO `YYYY-MM-DD`, as above.
 * @property {ChangeNote[]} notes
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ConditionText A condition as written in the workbook, and as the language reads it.
 * @property {string} id e.g. `CDP01`.
 * @property {string} text The lines joined with newlines.
 * @property {Condition|null} [parsed] `null` when the condition is empty or could not be read.
 * @property {string|null} [printed] The canonical form of `parsed`.
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ConditionPath A path as written (design record §6.2).
 * @property {string|null} text The dotted path — absolute, relative (`..medication.mkb`) or partial — or `null` for
 *     `THIS`.
 * @property {boolean} self `true` for `THIS`, the element naming the condition.
 */

/**
 * @typedef {Object} Operand What a comparison or an effect reads.
 * @property {ConditionPath} path
 * @property {string|null} attribute An XML attribute (`.@nhifCode`), or `null` for the element's own value.
 * @property {string} property One of `PROPERTY`.
 * @property {string|null} column The code-list column of `.entry['…']`, else `null`.
 */

/**
 * @typedef {Object} ListColumn A code-list column used as the set of allowed values: `CL006['NHIF Code']`.
 * @property {string} list
 * @property {string} column
 */

/**
 * @typedef {Object} Comparison
 * @property {string} kind `comparison`.
 * @property {Operand} operand
 * @property {string} operator One of `OPERATOR`.
 * @property {string[]} values As stored: globs use `?` and `*`.
 * @property {ListColumn|null} set The allowed set of `IN CLxxx['…']`, else `null`.
 */

/**
 * @typedef {Comparison|{kind: string, terms: Predicate[]}|{kind: string, term: Predicate}} Predicate A comparison,
 *     an `and` / `or` of terms, or a `not` of one term.
 */

/**
 * @typedef {Object} Effect One effect of a THEN or ELSE branch; `kind` is one of `EFFECT`.
 * @property {string} kind
 * @property {Operand} [operand] Every kind but `note`.
 * @property {string} [requirement] `require`: `R` or `O`.
 * @property {string} [operator] `restrict`: one of `OPERATOR`.
 * @property {string[]} [values] `restrict`.
 * @property {ListColumn|null} [set] `restrict`.
 * @property {Cardinality} [cardinality] `cardinality`.
 * @property {string} [text] `note`: prose that cannot be checked.
 */

/**
 * @typedef {Object} Branch A THEN or ELSE branch: it holds when one of its alternatives holds in full.
 * @property {Effect[][]} alternatives One or more, each a list of effects joined by AND.
 */

/**
 * @typedef {Object} Condition A condition in the formal language (design record §6).
 * @property {ConditionPath|null} scope The `FOR EACH` path, or `null` for the default repetition (§6.6).
 * @property {Predicate} predicate
 * @property {Branch} then
 * @property {Branch|null} otherwise The ELSE branch, if any.
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
 * @property {string} kind `module`, one of `SPEC_KIND`.
 * @property {string} spec The spec's key, e.g. `e-prescription`.
 * @property {string|null} version
 * @property {Message[]} messages
 * @property {ConditionText[]} conditions
 * @property {DictionaryEntry[]} dictionary
 * @property {ChangeVersion[]} changeNotes Oldest first.
 */

/**
 * @typedef {Object} CodeListColumn A list-specific column, e.g. `NHIF Code` on CL006.
 * @property {string} title
 * @property {number} column 1-based.
 */

/**
 * @typedef {Object} CodeListEntry One entry of a code list (design record §4.6).
 * @property {string} key
 * @property {LocalText} description
 * @property {LocalText} display
 * @property {Array<string|null>} values The list-specific values, in the order of the list's `columns`.
 * @property {string|null} since The nomenclature version the entry was added in, e.g. `1.5.28`.
 * @property {string|null} validUntil The nomenclature version it is valid until.
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} CodeList
 * @property {string} id e.g. `CL001`.
 * @property {LocalText} name The workbook names lists in Bulgarian only.
 * @property {string|null} status One of `CODE_LIST_STATUS`, from the index sheet.
 * @property {boolean|null} dynamic
 * @property {string|null} visibility
 * @property {string|null} remark The index sheet's note on the list.
 * @property {string[]} notes The note rows above the list's header, e.g. `Източник: НСЦРЛП`.
 * @property {CodeListColumn[]} columns
 * @property {CodeListEntry[]} entries
 * @property {SourceRef} source The header row, or the index row of a removed list without a sheet.
 */

/**
 * @typedef {Object} NomenclaturesVersion One version of the nomenclatures spec, as imported.
 * @property {string} kind `nomenclatures`.
 * @property {string} spec `nomenclatures`.
 * @property {string|null} version
 * @property {CodeList[]} codeLists Ordered by ID.
 * @property {ChangeVersion[]} changeNotes Oldest first.
 */

/**
 * @typedef {Object} Rule A business rule (design record §4.6.1).
 * @property {string} id e.g. `RL001`.
 * @property {LocalText} definition Bulgarian only in the workbook; lines are kept.
 * @property {string|null} sourceText The "Source" column.
 * @property {string|null} errorCode A CL999 key, e.g. `E002`.
 * @property {string|null} since The rules version the rule was added in.
 * @property {string|null} lifecycle One of `LIFECYCLE`, from the ID cell's fill.
 * @property {boolean|null} changedInVersion The fill's claim, as a message tab's.
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} RulesVersion One version of the rules spec, as imported.
 * @property {string} kind `rules`.
 * @property {string} spec `rules`.
 * @property {string|null} version
 * @property {Rule[]} rules
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
