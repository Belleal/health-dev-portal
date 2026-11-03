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
 * Blueprints in the model (design record §4.4): matching a name, binding a module's groups, and checking that one field
 * of one object is shaped the same in every message.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { bindBlueprints, checkBlueprintFields, matchBlueprint } = require( "@health-dev-portal/spec-model/blueprints" );

const BLUEPRINTS = Object.freeze( [
    { key: "medicalPractitionerSimple", types: [ "medicalPractitionerSimple", "medicalPractitioner" ] },
    { key: "diagnosisBasic", types: [ "diagnosisBasic", "diagnosisFull" ] },
    { key: "diagnosticReport", types: [ "diagnosticReport" ] },
    { key: "addressBase", types: [ "addressBase" ] },
    { key: "medicationDispense", types: [ "medicationDispense" ] },
    { key: "patient", types: [ "patient", "patientExtended" ] }
] );

// Only the properties binding and checking read.
const node = ( path, kind, extra = {} ) => ( { identity: kind === "group" ? path : `${ path }@value`, path: path, kind: kind, dataType: null,
    constraint: null, source: { sheet: path.split( "/" )[ 0 ], row: 1 }, children: [], ...extra } );
const group = ( path, dataType, children = [] ) => node( path, "group", { dataType: dataType, children: children } );
const field = ( path, dataType, raw ) => node( path, "field", { dataType: dataType, constraint: raw ? { raw: raw } : null } );
const message = ( code, elements ) => ( { code: code, elements: elements } );
const catalogueOf = ( published = {} ) => ( { blueprints: BLUEPRINTS, published: published } );

describe( "matchBlueprint", () => {

    it( "matches a name by a run of words", () => {
        assert.deepEqual( [ "Practitioner", "practitioner", "Diagnosis", "Diagnostic Report", "diagnosticReport", "Address", "dispense", "Referral", "Report" ]
            .map( ( name ) => matchBlueprint( name, BLUEPRINTS ) ),
        [ "medicalPractitionerSimple", "medicalPractitionerSimple", "diagnosisBasic", "diagnosticReport", "diagnosticReport", "addressBase", "medicationDispense", null, "diagnosticReport" ] );
    } );

    it( "matches nothing when two blueprints would match", () => {
        assert.equal( matchBlueprint( "Practitioner", [ ...BLUEPRINTS, { key: "practitionerNote", types: [ "practitionerNote" ] } ] ), null );
    } );

    it( "matches nothing for an empty name, or one whose words are not a run", () => {
        assert.deepEqual( [ "", "  ", "Practitioner Medical", "Simple Medical" ].map( ( name ) => matchBlueprint( name, BLUEPRINTS ) ), [ null, null, null, null ] );
    } );
} );

describe( "bindBlueprints", () => {

    it( "binds by name, then by published type, then by a sibling message", () => {
        const messages = [
            message( "R001", [ group( "contents", null, [ group( "contents/requester", "Practitioner" ), group( "contents/subject", "↸" ) ] ) ] ),
            message( "R002", [ group( "contents", null, [ group( "contents/requester", null ), group( "contents/subject", "---" ) ] ) ] )
        ];
        const { bindings, anomalies } = bindBlueprints( messages, catalogueOf( { R001: { "contents/subject": "patient" } } ) );
        assert.deepEqual( bindings, [
            { message: "R001", element: "contents/requester", blueprint: "medicalPractitionerSimple", by: "name" },
            { message: "R001", element: "contents/subject", blueprint: "patient", by: "type" },
            { message: "R002", element: "contents/requester", blueprint: "medicalPractitionerSimple", by: "sibling" },
            { message: "R002", element: "contents/subject", blueprint: "patient", by: "sibling" }
        ] );
        assert.deepEqual( anomalies, [] );
    } );

    it( "prepares a name before matching it", () => {
        const messages = [ message( "H001", [ group( "contents", null, [ group( "contents/address", "Аddress" ) ] ) ] ) ];
        assert.equal( bindBlueprints( messages, catalogueOf() ).bindings.length, 0 );
        assert.deepEqual( bindBlueprints( messages, catalogueOf(), { name: ( text ) => text.replace( "А", "A" ) } ).bindings,
            [ { message: "H001", element: "contents/address", blueprint: "addressBase", by: "name" } ] );
    } );

    it( "binds by a sibling only when the siblings agree", () => {
        const messages = [ "R001", "R002", "R003" ].map( ( code ) => message( code, [ group( "contents", null, [ group( "contents/x", null ) ] ) ] ) );
        const { bindings } = bindBlueprints( messages, catalogueOf( { R001: { "contents/x": "patient" }, R002: { "contents/x": "addressBase" } } ) );
        assert.deepEqual( bindings.map( ( binding ) => [ binding.message, binding.by ] ), [ [ "R001", "type" ], [ "R002", "type" ] ] );
    } );

    it( "reports a name that contradicts the published type, and keeps the name's binding", () => {
        const messages = [ message( "R001", [ group( "contents", null, [ group( "contents/subject", "Practitioner" ) ] ) ] ) ];
        const { bindings, anomalies } = bindBlueprints( messages, catalogueOf( { R001: { "contents/subject": "patient" } } ) );
        assert.deepEqual( bindings, [ { message: "R001", element: "contents/subject", blueprint: "medicalPractitionerSimple", by: "name" } ] );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.message ] ), [ [ "blueprint-name-differs", "warning",
            "contents/subject in R001 is named \"Practitioner\", which is medicalPractitionerSimple, but its published type makes it patient." ] ] );
    } );

    it( "reports a name that contradicts the sibling messages", () => {
        const messages = [
            message( "R001", [ group( "contents", null, [ group( "contents/subject", null ) ] ) ] ),
            message( "R002", [ group( "contents", null, [ group( "contents/subject", "Address" ) ] ) ] )
        ];
        const { anomalies } = bindBlueprints( messages, catalogueOf( { R001: { "contents/subject": "patient" } } ) );
        assert.deepEqual( anomalies.map( ( anomaly ) => anomaly.details.by ), [ "sibling message" ] );
    } );

    it( "does not report a name no blueprint matches", () => {
        const messages = [ message( "R001", [ group( "contents", null, [ group( "contents/referral", "Referral" ) ] ) ] ) ];
        assert.deepEqual( bindBlueprints( messages, catalogueOf() ), { bindings: [], anomalies: [] } );
    } );
} );

describe( "checkBlueprintFields", () => {

    const address = ( code, raw ) => message( code, [ group( "contents", null, [ group( "contents/address", null, [ field( "contents/address/line", "String", raw ) ] ) ] ) ] );
    const bound = ( code, path, blueprint ) => ( { message: code, element: path, blueprint: blueprint, by: "type" } );

    it( "reports one field of one blueprint shaped differently in two messages", () => {
        const messages = [ address( "C005", "max=2000" ), address( "C007", "max=255" ), address( "C009", "max=255" ) ];
        const anomalies = checkBlueprintFields( messages, messages.map( ( candidate ) => bound( candidate.code, "contents/address", "addressBase" ) ) );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.details ] ), [ [ "blueprint-field-differs", "warning",
            { blueprint: "addressBase", field: "line@value", variants: "String max=2000 in C005; String max=255 in C007, C009" } ] ] );
        assert.equal( anomalies[ 0 ].message, "line@value of addressBase differs between messages: String max=2000 in C005; String max=255 in C007, C009." );
    } );

    it( "reports nothing when every message agrees", () => {
        const messages = [ address( "C005", "max=255" ), address( "C007", "max=255" ) ];
        assert.deepEqual( checkBlueprintFields( messages, messages.map( ( candidate ) => bound( candidate.code, "contents/address", "addressBase" ) ) ), [] );
    } );

    it( "gives a nested object's field to the nested object", () => {
        const patient = ( code, raw ) => message( code, [ group( "contents", null, [ group( "contents/subject", null, [
            field( "contents/subject/name", "String", "max=255" ),
            group( "contents/subject/address", null, [ field( "contents/subject/address/line", "String", raw ) ] ) ] ) ] ) ] );
        const messages = [ patient( "R001", "max=2000" ), patient( "R002", "max=255" ) ];
        const bindings = messages.flatMap( ( candidate ) => [ bound( candidate.code, "contents/subject", "patient" ),
            bound( candidate.code, "contents/subject/address", "addressBase" ) ] );
        assert.deepEqual( checkBlueprintFields( messages, bindings ).map( ( anomaly ) => [ anomaly.details.blueprint, anomaly.details.field ] ),
            [ [ "addressBase", "line@value" ] ] );
    } );
} );
