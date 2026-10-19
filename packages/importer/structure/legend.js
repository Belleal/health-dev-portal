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

const { CHANGE_CATEGORY, ELEMENT_KIND, MESSAGE_LIFECYCLE } = require( "@health-dev-portal/spec-model/kinds" );

/**
 * Row fills of the specification template's legend sheet ("Легенда"), measured on e-Prescription 1.5.1.
 *
 * @type {Readonly<Object<string, string>>}
 * @public
 */
module.exports.ROW_FILLS = Object.freeze( {
    "BDD7EE": ELEMENT_KIND.GROUP,
    "FCE4D6": ELEMENT_KIND.POLYMORPHIC,
    "FFF2CC": ELEMENT_KIND.ATTRIBUTE
} );

/**
 * Fills that mean "no fill": 40 field rows of e-Prescription 1.5.1 are filled white.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
module.exports.NEUTRAL_FILLS = Object.freeze( [ "FFFFFF" ] );

/**
 * The grey of "END of …" rows.
 *
 * @type {string}
 * @public
 */
module.exports.END_FILL = "F2F2F2";

/**
 * Tab colours of the legend: the message's lifecycle and whether the tab claims it changed in this version.
 *
 * @type {Readonly<Object<string, {lifecycle: string, changed: boolean}>>}
 * @public
 */
module.exports.TAB_STATUS = Object.freeze( {
    "70AD47": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.ACTIVE, changed: false } ),
    "FFC000": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.ACTIVE, changed: true } ),
    "ED7D31": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.IN_DEVELOPMENT, changed: true } ),
    "C00000": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.WITHDRAWN, changed: true } )
} );

/**
 * Font colours of change notes; any other colour is a non-breaking change.
 *
 * @type {Readonly<Object<string, string>>}
 * @public
 */
module.exports.NOTE_FONTS = Object.freeze( {
    "C65911": CHANGE_CATEGORY.BREAKING,
    "C00000": CHANGE_CATEGORY.DROPPED_PLAN
} );
