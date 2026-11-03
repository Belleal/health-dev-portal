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

describe( "bindCondition, through blueprints (design record §6.2)", () => {

    // An R010-like message: a requester and a performer, both practitioners, and a diagnostic report whose result is a
    // polymorphic element with variants of their own tags.
    const node = ( identity, kind, children = [] ) => {
        const path = identity.replace( /[@#].*$/, "" );
        return { identity: identity, path: path, kind: kind, tag: path.split( "/" ).pop(),
            attribute: identity.includes( "@" ) ? identity.split( "@" )[ 1 ].replace( /#.*$/, "" ) : null, children: children };
    };
    const MESSAGE = { code: "R010", elements: [ node( "contents", "group", [
        node( "contents/referral", "group", [ node( "contents/referral/note@value", "field" ) ] ),
        node( "contents/requester", "group", [ node( "contents/requester/qualification@value", "field" ) ] ),
        node( "contents/performer", "group", [ node( "contents/performer/qualification@value", "field" ), node( "contents/performer/note@value", "field" ) ] ),
        node( "contents/report", "group", [ node( "contents/report/result", "group", [ node( "contents/report/result/value@value", "polymorphic", [
            node( "contents/report/result/valueQuantity@value#1", "field" ), node( "contents/report/result/valueString@value#2", "field" ) ] ) ] ) ] ),
        node( "contents/practice", "group", [ node( "contents/practice/practitioner", "group", [ node( "contents/practice/practitioner/code@value", "field" ) ] ) ] )
    ] ) ] };
    const BLUEPRINTS = [ { key: "medicalPractitionerSimple", types: [ "medicalPractitionerSimple" ] }, { key: "diagnosticReport", types: [ "diagnosticReport" ] } ];
    const bound = ( element, blueprint ) => ( { message: "R010", element: element, blueprint: blueprint, by: "type" } );
    const at = ( identity ) => {
        const visit = ( elements ) => elements.reduce( ( found, element ) => found || ( element.identity === identity ? element : visit( element.children ) ), null );
        return visit( MESSAGE.elements );
    };
    const paths = ( text, naming, bindings ) => bindCondition( parseCondition( text ).condition, MESSAGE, at( naming ),
        bindings ? { blueprints: BLUEPRINTS, bindings: bindings } : undefined ).paths;
    const QUALIFICATION = "IF 'practitioner.qualification'.value = 'x'\nTHEN THIS.required = 'R'";

    it( "resolves an entity path through the one element bound to its blueprint", () => {
        assert.equal( paths( QUALIFICATION, "contents/referral/note@value", [ bound( "contents/requester", "medicalPractitionerSimple" ) ] )[ "practitioner.qualification" ],
            "contents/requester/qualification@value" );
    } );

    it( "lets the carrier enclosing the naming element decide between two", () => {
        const both = [ bound( "contents/requester", "medicalPractitionerSimple" ), bound( "contents/performer", "medicalPractitionerSimple" ) ];
        assert.equal( paths( QUALIFICATION, "contents/performer/note@value", both )[ "practitioner.qualification" ], "contents/performer/qualification@value" );
    } );

    it( "leaves an entity path unresolved when no carrier encloses the naming element (Review Focus 4)", () => {
        const both = [ bound( "contents/requester", "medicalPractitionerSimple" ), bound( "contents/performer", "medicalPractitionerSimple" ) ];
        assert.equal( paths( QUALIFICATION, "contents/referral/note@value", both )[ "practitioner.qualification" ], null );
    } );

    it( "never binds a numbered variant through an entity path (HEL-23)", () => {
        assert.equal( paths( "IF 'diagnosticReport.result.valueQuantity'.value > '1'\nTHEN THIS.required = 'R'", "contents/referral/note@value",
            [ bound( "contents/report", "diagnosticReport" ) ] )[ "diagnosticReport.result.valueQuantity" ], null );
    } );

    it( "tries the entity route only after the absolute and partial ones", () => {
        // 'practitioner.code' is the partial path of contents/practice/practitioner/code, whatever the blueprints say.
        assert.equal( paths( "IF 'practitioner.code'.value = 'x'\nTHEN THIS.required = 'R'", "contents/referral/note@value",
            [ bound( "contents/requester", "medicalPractitionerSimple" ) ] )[ "practitioner.code" ], "contents/practice/practitioner/code@value" );
    } );

    it( "binds exactly as before without a context", () => {
        assert.equal( paths( QUALIFICATION, "contents/performer/note@value" )[ "practitioner.qualification" ], null );
    } );
} );
