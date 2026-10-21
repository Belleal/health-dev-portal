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
 * Every condition of a module parsed, printed in the canonical form, bound per naming element and checked, with each
 * finding at the condition's row on the Conditions sheet (design record §6).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { importConditions } = require( "#condition-import" );
const { importModuleWorkbook } = require( "#module-importer" );
const { buildMessageTree } = require( "#message-tree" );
const { element, messageSheet } = require( "./support/raw-builders" );
const { confirmationRows, moduleSheets, prescriptionRows } = require( "./support/fixtures" );

const messageOf = ( code, rows ) => ( { code: code, elements: buildMessageTree( messageSheet( code, rows ) ).elements } );
const conditionOf = ( id, row, text ) => ( { id: id, text: text, source: { sheet: "Conditions", row: row } } );
const summary = ( anomaly ) => [ anomaly.type, anomaly.sheet, anomaly.row ];

describe( "importConditions", () => {

    it( "parses, prints and binds the fixture's conditions with no anomaly", () => {
        const result = importModuleWorkbook( { sheets: moduleSheets(), themeColours: {} }, { spec: "e-prescription" } );
        assert.deepEqual( result.anomalies, [] );
        assert.equal( result.version.conditions[ 0 ].printed, "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'" );
        assert.equal( result.version.conditionBindings.length, 4 );
        assert.ok( result.version.conditionBindings.every( ( binding ) => Object.values( binding.paths ).every( ( identity ) => identity !== null ) ) );
    } );

    it( "binds per naming element, and reports a path only where it fails (Review Focus 1)", () => {
        // CDP29 is named by P001's medication, under which a medication code lies, and by P002's NRN, which has none.
        const confirmation = [ ...confirmationRows().slice( 0, 3 ), element( 6, 1, "field", { name: "Prescription NRN", req: "R", card: "1..1", type: "String",
            conditions: "CDP29", tag: "nrnPrescription", attribute: "value" } ) ];
        const result = importConditions( [ conditionOf( "CDP29", 13, "IF '..medication.medicationCode'.value IS NOT null\nTHEN THIS.required = 'R'" ) ],
            [ messageOf( "P001", prescriptionRows() ), messageOf( "P002", confirmation ) ] );
        assert.deepEqual( result.bindings.map( ( binding ) => [ binding.condition, binding.message, binding.element, binding.paths[ "..medication.medicationCode" ] ] ), [
            [ "CDP29", "P001", "contents/prescription/group/medication", "contents/prescription/group/medication/medicationCode@value" ],
            [ "CDP29", "P002", "contents/nrnPrescription@value", null ]
        ] );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => [ ...summary( anomaly ), anomaly.details.message, anomaly.details.path ] ),
            [ [ "unresolved-condition-path", "Conditions", 13, "P002", "..medication.medicationCode" ] ] );
    } );

    it( "reports the dialect, a note, an unread condition and a folded value at the condition's row", () => {
        const result = importConditions( [
            // The second Т is Cyrillic.
            conditionOf( "CDP01", 3, "IF 'prescription.category'.value = 'T2' OR 'Т3'\nTHEN 'prescription.isProtocolBased'.required = 'R'" ),
            conditionOf( "CDP02", 6, "IF 'prescription.lrn'.value IS NOT null\nTHEN the sender's identifier is to be populated" ),
            conditionOf( "CDP03", 9, "IF CL006.nhifCode = '1'\nTHEN 'prescription.lrn'.required = 'R'" ),
            conditionOf( "CDP04", 12, "" )
        ], [] );
        assert.deepEqual( result.anomalies.map( summary ), [
            [ "look-alike-letter", "Conditions", 3 ],
            [ "non-canonical-condition", "Conditions", 3 ],
            [ "free-text-effect", "Conditions", 6 ],
            [ "unparsed-condition", "Conditions", 9 ]
        ] );
        assert.deepEqual( result.anomalies[ 0 ].details, { value: "Т3", letters: "Т U+0422", folded: "T3" } );
        assert.deepEqual( result.anomalies[ 1 ].details, { id: "CDP01", forms: "shorthand OR",
            printed: "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.isProtocolBased'.required = 'R'" } );
        assert.equal( result.anomalies[ 2 ].details.text, "the sender's identifier is to be populated" );
        assert.deepEqual( result.conditions.map( ( condition ) => condition.printed === null ), [ false, false, true, true ] );
        // The empty condition was reported when the sheet was read; it is not reported again as unread.
        assert.equal( result.conditions[ 3 ].parsed, null );
    } );

    it( "reports a type mismatch once per message", () => {
        // Two elements of each message name the condition; the mismatch is the condition's, so each message reports it once.
        const rows = [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", type: "String", conditions: "CDT01", tag: "lrn", attribute: "value" } ),
            element( 5, 1, "field", { name: "Note", req: "C", card: "0..1", type: "String", conditions: "CDT01", tag: "note", attribute: "value" } )
        ];
        const result = importConditions( [ conditionOf( "CDT01", 3, "IF 'lrn'.value IS true\nTHEN THIS.required = 'R'" ) ], [ messageOf( "P001", rows ), messageOf( "P003", rows ) ] );
        assert.equal( result.bindings.length, 4 );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.message, anomaly.details.identity, anomaly.details.dataType ] ), [
            [ "condition-type-mismatch", "P001", "contents/lrn@value", "String" ],
            [ "condition-type-mismatch", "P003", "contents/lrn@value", "String" ]
        ] );
    } );
} );
