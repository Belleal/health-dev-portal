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
 * The canonical form of a condition (design record §6): every condition is printed from its parsed form, so all read alike.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { printCondition, printEffect } = require( "@health-dev-portal/spec-model/condition-printer" )


describe( "printCondition", () => {

    const path = ( text ) => ( { text, self: false } );
    const THIS = { text: null, self: true };
    const value = ( text, extra = {} ) => ( { path: path( text ), attribute: null, property: "value", column: null, ...extra } );
    const compare = ( operand, operator, values = [], set = null ) => ( { kind: "comparison", operand, operator, values, set } );
    const require_ = ( text, requirement ) => ( { kind: "require", operand: value( text, { property: "required" } ), requirement } );
    const absent = ( operand ) => ( { kind: "absent", operand } );

    it( "prints CDP01 in the canonical form", () => {
        assert.equal( printCondition( {
            scope: null,
            predicate: compare( value( "prescription.category" ), "in", [ "T2", "T3" ] ),
            then: { alternatives: [ [ require_( "prescription.isProtocolBased", "R" ) ] ] },
            otherwise: { alternatives: [ [ require_( "prescription.isProtocolBased", "O" ) ] ] }
        } ), "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'" );
    } );

    it( "prints alternatives, THIS and an absent element", () => {
        const printed = printCondition( {
            scope: null,
            predicate: compare( value( "nrnReferral" ), "is-null" ),
            then: { alternatives: [ [ require_( "lrn", "R" ), require_( "pmi", "R" ) ], [ require_( "identifier", "R" ) ] ] },
            otherwise: { alternatives: [ [ absent( { path: THIS, attribute: null, property: "value", column: null } ) ] ] }
        } );
        assert.equal( printed, "IF 'nrnReferral'.value IS null\nTHEN ('lrn'.required = 'R' AND 'pmi'.required = 'R') OR 'identifier'.required = 'R'\nELSE THIS.value IS null" );
        assert.equal( printEffect( absent( { path: path( "referral.laboratory" ), attribute: null, property: "element", column: null } ) ), "'referral.laboratory' IS null" );
    } );

    it( "prints entry columns, list columns, attributes, globs, open cardinalities and notes", () => {
        const contagious = compare( { path: path( "..diagnosis.code" ), attribute: null, property: "entry", column: "Contagious" }, "is-not-null" );
        assert.equal( printCondition( { scope: path( "prescription.group" ), predicate: { kind: "and", terms: [ contagious, { kind: "or", terms: [
            compare( value( "a" ), "=", [ "1" ] ), compare( value( "b" ), ">", [ "2" ] ) ] } ] },
        then: { alternatives: [ [
            { kind: "restrict", operand: value( "qualification", { attribute: "nhifCode" } ), operator: "in", values: [], set: { list: "CL006", column: "NHIF Code" } },
            { kind: "restrict", operand: value( "medication.mkb" ), operator: "not-matches", values: [ "E89.4?", "N80.??" ], set: null },
            { kind: "cardinality", operand: value( "consultation", { property: "cardinality" } ), cardinality: { min: 5, max: null } } ] ] },
        otherwise: { alternatives: [ [ { kind: "note", text: "to be populated with person's identifier" } ] ] } } ),
        [ "FOR EACH 'prescription.group'",
            "IF '..diagnosis.code'.entry['Contagious'] IS NOT null AND ('a'.value = '1' OR 'b'.value > '2')",
            "THEN 'qualification'.@nhifCode IN CL006['NHIF Code'] AND 'medication.mkb'.value NOT MATCHES ['E89.4?', 'N80.??'] AND 'consultation'.cardinality = '5..*'",
            "ELSE NOTE 'to be populated with person''s identifier'" ].join( "\n" ) );
    } );
} );
