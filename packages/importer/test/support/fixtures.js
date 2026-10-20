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

const { element, endRow, messageSheet, row, sheet } = require( "./raw-builders" );

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

const MESSAGES_HEADER = [ "Съобщение", "Име*", "Класификация", "Адрес", "Тип", "Налично в Release**", "Изпращач", "Получател" ];

// A whole module workbook shaped like e-Prescription's: index, three messages, change notes, conditions, dictionary.
// It imports with no anomaly at all, so any test that adds one defect sees exactly that defect.
const moduleSheets = () => [
    sheet( "Съобщения", [
        row( 1, [ "Услуги, предоставяни от НЗИС за външни софтуерни системи" ] ),
        row( 3, MESSAGES_HEADER ),
        row( 4, [ "Заявка за създаване на Е-рецепта", "P001", "ePrescription Issue Request", "/v4/eprescription/doctor/issue", "Request", "1.2", "външна система", "НЗИС" ] ),
        row( 5, [ "Потвърждение за създаване на Е-рецепта", "P002", "ePrescription Issue Confirmation", "---", "Response", "1.2", "НЗИС", "външна система" ] ),
        row( 6, [ "Съобщение за грешка", "P099", "ePrescription Error", "---", "Response", "1.0", "НЗИС", "външна система" ] ),
        // The real sheet ends with a footnote merged across every column, so its text appears in the code column too.
        row( 8, Array( 8 ).fill( "** \"Налично в Release\" специфицира версията на API софтуера." ) )
    ] ),
    messageSheet( "P001", prescriptionRows() ),
    messageSheet( "P002", confirmationRows() ),
    messageSheet( "P099", confirmationRows() ),
    sheet( "Change Notes", [
        row( 1, [ "Версия 1.0.0" ] ),
        row( 2, [ "Създадени съобщения P001, P002 и P099" ] ),
        row( 3, [ "Версия 1.1.0" ] ),
        row( 4, [ "Добавено поле \"allowedRepeatsNumber\" в P001" ], { fontColour: "C65911" } ),
        row( 5, [ "Отпаднало поле \"note\"" ], { fontColour: "C00000" } )
    ] ),
    sheet( "Conditions", [
        row( 1, [ "Condition ID", "Condition Logic" ] ),
        row( 3, [ "CDP01", "IF 'prescription.category'.value = 'T2' OR 'T3'" ] ),
        row( 4, [ null, "THEN 'prescription.isProtocolBased'.required = 'R'" ] ),
        row( 5, [ null, "ELSE 'prescription.isProtocolBased'.required = 'O'" ] ),
        row( 7, [ "CDP19", "IF 'prescription.category'.value = 'T3'" ] ),
        row( 8, [ null, "THEN 'prescription.group'.cardinality = '1..3'" ] ),
        row( 10, [ "CDP21", "IF 'prescription.dispensationType'.value = '2'" ] ),
        row( 11, [ null, "THEN 'prescription.allowedRepeatsNumber'.required = 'R'" ] ),
        row( 13, [ "CDP29", "IF 'prescription.category'.value = 'T2' OR 'T3'" ] ),
        row( 14, [ null, "THEN 'prescription.group.medication'.cardinality = '1..3'" ] )
    ] ),
    sheet( "Dictionary", [
        row( 1, [ "Abbreviation", "Name", "Описание" ] ),
        row( 2, [ "PMI", "Personal Medical Identifier", "УИН на лекар" ] )
    ] )
];

// A code list's header as nomenclatures 1.5.33 writes it for most lists; test files keep their own copy, as constants in
// a test file cannot be imported.
const CODE_LIST_HEADER = Object.freeze( [ "Key", "Description BG", "Description EN", "Display value BG", "Display value EN", "NHIF Code", "Since", "Valid Until" ] );

const LIST_NAMES = Object.freeze( { CL001: "Пол" } );
const listName = ( id ) => LIST_NAMES[ id ] || `Номенклатура ${ id }`;

// A whole nomenclatures workbook: the index, one sheet per list and dated change notes. It imports with no anomaly at
// all, so any test that adds one defect sees exactly that defect. CL068 is listed as removed and has no sheet, as in
// 1.5.33.
const nomenclatureSheets = ( ids = [ "CL001" ] ) => [
    sheet( "Номенклатури", [
        row( 1, [ "Номенклатури използвани от НЗИС" ] ),
        row( 5, [ "Номенклатура", "ID", "Статус", "Динамична", "Видимост", "Забележка" ] ),
        ...ids.map( ( id, index ) => row( 6 + index, [ listName( id ), id, "В УПОТРЕБА", "false" ] ) ),
        row( 6 + ids.length, [ "", "CL068", "ПРЕМАХНАТА" ] )
    ] ),
    ...ids.map( ( id ) => sheet( id, [
        row( 1, [ `${ id } - ${ listName( id ) }` ] ),
        row( 3, [ "Entity", "", "", "", "", "Meta Data", "System Data" ] ),
        row( 4, CODE_LIST_HEADER ),
        row( 5, [ "1", "Първи", "First", "Първи", "First", "---", "v1.5.33" ] ),
        row( 6, [ "2", "Втори", "Second", "Втори", "Second", "---", "v1.5.33" ] )
    ] ) ),
    sheet( "Change Notes", [
        row( 1, [ "Версия / промени", "Дата на тестова", "Дата на прод" ] ),
        row( 2, [ "Версия 1.5.33", "07.10.2026" ] ),
        row( 3, [ "Добавена номенклатура" ] )
    ] )
];

// A whole rules workbook: one active (green) rule per ID returning E002, and the change notes. It imports with no
// anomaly at all.
const rulesSheets = ( ids = [ "RL001" ] ) => [
    sheet( "Change Notes", [
        row( 1, [ "Версия 1.1.1" ] ),
        ...ids.map( ( id, index ) => row( 2 + index, [ `Добавено правило ${ id }` ] ) )
    ] ),
    sheet( "Rules", [
        row( 1, [ "ЗАБЕЛЕЖКА: Ако валидацията на което и да е правило в дадено съобщение е неуспешна, НЗИС ще върне съобщение за грешка." ] ),
        row( 3, [ "Rule ID", "Definition", "Source", "Error Code", "Since" ] ),
        ...ids.map( ( id, index ) => row( 4 + index, [ id, `Определение на ${ id }`, "---", "E002", "v1.1.1" ], { fill: "70AD47" } ) )
    ] )
];

module.exports = { prescriptionRows, confirmationRows, moduleSheets, nomenclatureSheets, rulesSheets };
