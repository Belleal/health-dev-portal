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
 * Synthetic message trees shaped like e-Prescription P001 and P002 (values from the public 1.5.1 workbook), small
 * enough to reason about: every element kind, an attribute row, a polymorphic element and an END row.
 */

const { element, endRow } = require( "./raw-builders" );

const prescriptionRows = () => [
    element( 3, 0, "group", { name: "Header", req: "R", card: "1..1", tag: "header" } ),
    element( 4, 1, "field", { name: "Type of sender", req: "R", card: "1..1", type: "Codeable Concept", codeList: "CL018", tag: "sender", attribute: "value", description: "Тип изпращач на съобщението" } ),
    endRow( 5, 0, "Header" ),
    element( 6, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
    element( 7, 1, "group", { name: "*Prescription", req: "R", card: "1..1", tag: "prescription" } ),
    element( 8, 2, "field", { name: "Prescription LRN", req: "R", card: "1..1", type: "String", constraint: "max=36, chars=an", tag: "lrn", attribute: "value", description: "Уникален номер" } ),
    element( 9, 2, "field", { name: "Is Prescription Protocol Based", req: "C", card: "0..1", type: "Boolean", constraint: "true/false", default: "false", conditions: "CDP01", tag: "isProtocolBased", attribute: "value" } ),
    element( 10, 2, "group", { name: "**Medication Group", req: "R", card: "1..*", conditions: "CDP19", tag: "group" } ),
    element( 11, 3, "group", { name: "***Medication", req: "R", card: "1..*", rules: "RL083", conditions: "CDP29", tag: "medication" } ),
    element( 12, 4, "field", { name: "Medication Identifier", req: "R", card: "1..1", type: "Codeable Concept", rules: "RL026,RL059", codeList: "CL009", tag: "medicationCode", attribute: "value" } ),
    element( 13, 5, "attribute", { name: "Medication Name and Details", req: "O", card: "0..1", type: "Codeable Concept", rules: "RL023", codeList: "CL009", tag: "medicationCode", attribute: "name" } ),
    element( 14, 4, "polymorphic", { name: "Dose Quantity Unit", req: "R", card: "1..1", type: "---", tag: "---" } ),
    element( 15, 5, "field", { name: "Dose Quantity Unit - as UCUM Entry", req: "R", card: "1..1", type: "String", rules: "RL027", tag: "doseQuantityCode", attribute: "value" } ),
    element( 16, 5, "field", { name: "Dose Quantity Unit - as Medication Form", req: "R", card: "1..1", type: "Codeable Concept", codeList: "CL035", tag: "doseQuantityCode", attribute: "value" } ),
    element( 17, 2, "field", { name: "Number of Repeats Allowed", req: "C", card: "0..1", type: "Unsigned Int", constraint: "max=1", conditions: "CDP21", tag: "allowedRepeatsNumber", attribute: "value" } )
];

const confirmationRows = () => [
    element( 3, 0, "group", { name: "Header", req: "R", card: "1..1", tag: "header" } ),
    element( 4, 1, "field", { name: "Message ID", req: "R", card: "1..1", type: "String", constraint: "min=36, max=36", tag: "messageId", attribute: "value" } ),
    element( 5, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
    element( 6, 1, "field", { name: "Prescription NRN", req: "R", card: "1..1", type: "String", constraint: "min=12, max=12, chars=an", tag: "nrnPrescription", attribute: "value" } )
];

module.exports = { prescriptionRows, confirmationRows };
