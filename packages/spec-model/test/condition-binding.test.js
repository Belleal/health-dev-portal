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
 * Binding a condition's paths to element identities, per naming element (design record §6.2).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { bindCondition } = require( "@health-dev-portal/spec-model/condition-binding" );
const { parseCondition } = require( "@health-dev-portal/spec-model/condition-parser" );
const { elementAt, prescriptionMessage } = require( "./support/messages" );


describe( "bindCondition", () => {

    const message = prescriptionMessage();
    const keys = ( text, naming ) => bindCondition( parseCondition( text ).condition, message, elementAt( message, naming ) ).paths;

    it( "binds absolute, header, relative and partial paths, and THIS", () => {
        assert.deepEqual( keys( "IF 'prescription.isProtocolBased'.value IS true\nTHEN 'header.sender'.required = 'R'\nELSE THIS.value IS null", "contents/prescription/lrn@value" ), {
            "prescription.isProtocolBased": "contents/prescription/isProtocolBased@value",
            "header.sender": "header/sender@value",
            "THIS": "contents/prescription/lrn@value"
        } );
        assert.deepEqual( keys( "IF '..medication.medicationCode'.value IS NOT null\nTHEN 'group.medication'.required = 'R'", "contents/prescription/group/medication/medicationCode@value" ), {
            "..medication.medicationCode": "contents/prescription/group/medication/medicationCode@value",
            "group.medication": "contents/prescription/group/medication"
        } );
    } );

    it( "binds an attribute operand to its attribute row, and a polymorphic element to itself, not a variant", () => {
        assert.equal( keys( "IF 'medication.medicationCode'.@name IS NOT null\nTHEN 'medication.doseQuantityCode'.required = 'R'", "contents/prescription/lrn@value" )[ "medication.medicationCode@name" ],
            "contents/prescription/group/medication/medicationCode@name" );
        assert.equal( keys( "IF 'a'.value IS null\nTHEN 'medication.doseQuantityCode'.required = 'R'", "contents/prescription/lrn@value" )[ "medication.doseQuantityCode" ],
            "contents/prescription/group/medication/doseQuantityCode@value" );
    } );

    it( "binds nothing it cannot name exactly", () => {
        const paths = keys( "IF 'patient.identifierType'.value = '2'\nTHEN 'value'.required = 'R'", "contents/prescription/lrn@value" );
        assert.deepEqual( [ paths[ "patient.identifierType" ], paths[ "value" ] ], [ null, null ] );
    } );

    // Final review: an untagged row has no path, and walking up from it threw a TypeError.
    it( "binds no relative path from an element without a path", () => {
        const untagged = { identity: null, path: null, kind: "field", attribute: null, children: [] };
        assert.deepEqual( bindCondition( parseCondition( "IF '..medication.medicationCode'.value IS NOT null\nTHEN 'prescription.lrn'.required = 'R'" ).condition, message, untagged ).paths,
            { "..medication.medicationCode": null, "prescription.lrn": "contents/prescription/lrn@value" } );
    } );
} );
