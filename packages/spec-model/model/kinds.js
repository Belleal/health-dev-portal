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
 * The kinds of element a message tree is built from (design record §4.3).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.ELEMENT_KIND = Object.freeze( {
    GROUP: "group",
    FIELD: "field",
    POLYMORPHIC: "polymorphic",
    ATTRIBUTE: "attribute"
} );

/**
 * Whether an element must, may under conditions, or may appear.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.REQUIREMENT = Object.freeze( {
    REQUIRED: "R",
    CONDITIONAL: "C",
    OPTIONAL: "O"
} );

/**
 * Where a message or a rule stands in its life (design record §4.2, §4.6.1). Both are read from the same status
 * colours: a message's tab, a rule's ID cell.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.LIFECYCLE = Object.freeze( {
    ACTIVE: "active",
    IN_DEVELOPMENT: "in-development",
    WITHDRAWN: "withdrawn"
} );

/**
 * Whether a message is sent to NHIS or returned by it.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.MESSAGE_DIRECTION = Object.freeze( {
    REQUEST: "request",
    RESPONSE: "response"
} );

/**
 * The category of a change note (design record §4.7).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.CHANGE_CATEGORY = Object.freeze( {
    BREAKING: "breaking",
    DROPPED_PLAN: "dropped-plan",
    NON_BREAKING: "non-breaking"
} );

/**
 * How serious an import anomaly is (design record §5.3): a blocking one stops the import.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.ANOMALY_LEVEL = Object.freeze( {
    BLOCKING: "blocking",
    WARNING: "warning"
} );

/**
 * The kinds of spec, each with its own version line (design record §4.1). The shared type library behind today's XSDs
 * is none: its business objects are internal blueprints without a version line (§4.4).
 *
 * Each code list is a spec of its own (§4.6). `NOMENCLATURES` is the combined workbook the lists are still written in,
 * and the spec that keeps the combined version line's history; it has no version of its own any more.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.SPEC_KIND = Object.freeze( {
    MODULE: "module",
    RULES: "rules",
    CODE_LIST: "code-list",
    NOMENCLATURES: "nomenclatures"
} );

/**
 * Where a version stands in its life (design record §4.1, §7.1), in the order a version moves through them. No stage
 * is skipped; a spec has at most one version in each but `RETIRED`.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.STAGE = Object.freeze( {
    DEVELOPMENT: "development",
    IMPLEMENTATION: "implementation",
    TESTING: "testing",
    PRODUCTION: "production",
    PREVIOUS_PRODUCTION: "previous-production",
    RETIRED: "retired"
} );

/**
 * Where a changelog entry came from (design record §4.7): detected by comparing versions, written by an editor, detected
 * and then edited, or imported from a workbook's change notes.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.CHANGE_ORIGIN = Object.freeze( {
    DETECTED: "detected",
    EDITOR: "editor",
    EDITED: "edited",
    IMPORTED: "imported"
} );

/**
 * The type of a code list's keys (design record §4.6), by which the XSDs type a coded value (§4.10).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.KEY_TYPE = Object.freeze( {
    INTEGER: "integer",
    STRING: "string"
} );

/**
 * A code list's status in the nomenclatures workbook's index sheet "Номенклатури" (design record §4.6).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.CODE_LIST_STATUS = Object.freeze( {
    IN_USE: "in-use",
    REMOVED: "removed",
    UNDER_REVISION: "under-revision",
    RESERVED: "reserved",
    IN_DEVELOPMENT: "in-development",
    INCOMPLETE: "incomplete"
} );

/**
 * Where a release is in its review (design record §7.3–§7.4): submitted and awaiting a decision, returned to its
 * editors, accepted — from its first approval on, when its stage is its versions' — or abandoned (§7.1).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.RELEASE_STATUS = Object.freeze( {
    REVIEW: "review",
    RETURNED: "returned",
    ACCEPTED: "accepted",
    ABANDONED: "abandoned"
} );

/**
 * What the approver decided on a review round (design record §7.4).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.ROUND_DECISION = Object.freeze( {
    APPROVED: "approved",
    RETURNED: "returned"
} );

/**
 * What happened to a release, recorded with who and when (design record §7.3, §10.1).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.RELEASE_EVENT = Object.freeze( {
    SUBMITTED: "submitted",
    APPROVED: "approved",
    RETURNED: "returned",
    PROMOTED: "promoted",
    DATE_SET: "date-set",
    FIX_CREATED: "fix-created",
    ABANDONED: "abandoned",
    PREVIOUS_RETIRED: "previous-retired",
    WITHDRAWN: "withdrawn"
} );
