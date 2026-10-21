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
 * Evaluating a condition against a message (design record §6.6, §6.7), once per occurrence of its scope.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { evaluateCondition } = require( "@health-dev-portal/spec-model/evaluator" );
const { bindCondition } = require( "@health-dev-portal/spec-model/condition-binding" );
const { parseCondition } = require( "@health-dev-portal/spec-model/condition-parser" );
const { elementAt, prescriptionMessage } = require( "./support/messages" );

const node = ( tag, attributes = {}, ...children ) => ( { tag, attributes, children } );
const prescription = ( ...children ) => node( "message", {}, node( "header" ), node( "contents", {}, node( "prescription", {}, ...children ) ) );
const group = ( ...medications ) => node( "group", {}, ...medications );
const medication = ( ...children ) => node( "medication", {}, ...children );
const message = prescriptionMessage();
const flatten = ( elements ) => elements.flatMap( ( element ) => [ element, ...flatten( element.children ) ] );
const model = new Map( flatten( message.elements ).map( ( element ) => [ element.identity, element ] ) );
const evaluate = ( text, naming, instance, options ) => {
    const condition = parseCondition( text ).condition;
    return evaluateCondition( condition, { ...bindCondition( condition, message, elementAt( message, naming ) ), condition: "CD" }, instance, model, options );
};
const CDP02 = "IF 'prescription.isProtocolBased'.value IS true\nTHEN 'prescription.protocolNumber'.required = 'R'\nELSE 'prescription.protocolNumber'.value IS null";

describe( "evaluateCondition", () => {

    it( "applies THEN when the predicate holds and ELSE when it does not", () => {
        const naming = "contents/prescription/protocolNumber@value";
        assert.deepEqual( evaluate( CDP02, naming, prescription( node( "isProtocolBased", { value: "true" } ) ) ), { violations: [
            { scope: "(message)", branch: "then", effect: "'prescription.protocolNumber'.required = 'R'", reason: "must be present" } ], unchecked: [] } );
        assert.deepEqual( evaluate( CDP02, naming, prescription( node( "isProtocolBased", { value: "false" } ), node( "protocolNumber", { value: "P-1" } ) ) ), { violations: [
            { scope: "(message)", branch: "else", effect: "'prescription.protocolNumber'.value IS null", reason: "must be absent" } ], unchecked: [] } );
        assert.deepEqual( evaluate( CDP02, naming, prescription( node( "isProtocolBased", { value: "true" } ), node( "protocolNumber", { value: "P-1" } ) ) ), { violations: [], unchecked: [] } );
    } );

    it( "evaluates once per occurrence of the innermost repeating element (Review Focus 5)", () => {
        const text = "IF 'medication.mkb'.value IS NOT null\nTHEN 'medication.medicationCode'.required = 'R'";
        const naming = "contents/prescription/group/medication/mkb@value";
        const instance = prescription(
            group( medication( node( "mkb", { value: "A01" } ), node( "medicationCode", { value: "1" } ) ) ),
            group( medication( node( "mkb", { value: "A02" } ) ) ) );
        assert.deepEqual( evaluate( text, naming, instance ).violations.map( ( violation ) => violation.scope ), [ "contents/prescription/group[2]/medication[1]" ] );
        assert.deepEqual( evaluate( text, naming, prescription() ), { violations: [], unchecked: [] } );
    } );

    it( "holds a branch when one alternative holds in full", () => {
        const text = "IF 'prescription.lrn'.value IS NOT null\nTHEN ('prescription.category'.required = 'R' AND 'prescription.isProtocolBased'.required = 'R') OR 'prescription.allowedRepeatsNumber'.required = 'R'";
        const naming = "contents/prescription/lrn@value";
        const lrn = node( "lrn", { value: "L-1" } );
        assert.deepEqual( evaluate( text, naming, prescription( lrn, node( "category", { value: "T1" } ), node( "isProtocolBased", { value: "false" } ) ) ).violations, [] );
        assert.deepEqual( evaluate( text, naming, prescription( lrn, node( "allowedRepeatsNumber", { value: "2" } ) ) ).violations, [] );
        assert.deepEqual( evaluate( text, naming, prescription( lrn, node( "category", { value: "T1" } ) ) ).violations, [ { scope: "(message)", branch: "then",
            effect: "('prescription.category'.required = 'R' AND 'prescription.isProtocolBased'.required = 'R') OR 'prescription.allowedRepeatsNumber'.required = 'R'",
            reason: "no alternative holds" } ] );
    } );

    it( "shares a path above the scope with every occurrence, and lets FOR EACH choose the scope", () => {
        const text = "IF 'prescription.category'.value = 'T2'\nTHEN 'medication.mkb'.required = 'R'";
        const naming = "contents/prescription/group/medication/mkb@value";
        const instance = prescription( node( "category", { value: "T2" } ), group( medication( node( "mkb", { value: "A01" } ) ), medication() ) );
        // The category lies above the medications, so by default the condition is judged once, over the whole message.
        assert.deepEqual( evaluate( text, naming, instance ).violations, [] );
        assert.deepEqual( evaluate( `FOR EACH 'prescription.group.medication'\n${ text }`, naming, instance ).violations, [ { scope: "contents/prescription/group[1]/medication[2]",
            branch: "then", effect: "'medication.mkb'.required = 'R'", reason: "must be present" } ] );
    } );

    it( "holds a comparison over a repeated path when one occurrence holds (§6.6, provisional)", () => {
        const text = "IF 'medication.mkb'.value = 'A02'\nTHEN 'prescription.allowedRepeatsNumber'.required = 'R'";
        const naming = "contents/prescription/allowedRepeatsNumber@value";
        const instance = prescription( group( medication( node( "mkb", { value: "A01" } ) ), medication( node( "mkb", { value: "A02" } ) ) ) );
        assert.deepEqual( evaluate( text, naming, instance ).violations, [ { scope: "(message)", branch: "then",
            effect: "'prescription.allowedRepeatsNumber'.required = 'R'", reason: "must be present" } ] );
    } );

    it( "checks values, globs and cardinalities", () => {
        const text = "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.lrn'.value MATCHES 'N80.??'\nELSE 'prescription.group'.cardinality = '1..3'";
        const naming = "contents/prescription/lrn@value";
        assert.deepEqual( evaluate( text, naming, prescription( node( "category", { value: "T2" } ), node( "lrn", { value: "N80.12" } ) ) ).violations, [] );
        assert.deepEqual( evaluate( text, naming, prescription( node( "category", { value: "T3" } ), node( "lrn", { value: "X" } ) ) ).violations, [ { scope: "(message)",
            branch: "then", effect: "'prescription.lrn'.value MATCHES 'N80.??'", reason: "value 'X' is not allowed" } ] );
        assert.deepEqual( evaluate( text, naming, prescription( node( "category", { value: "T1" } ), group(), group(), group(), group() ) ).violations, [ { scope: "(message)",
            branch: "else", effect: "'prescription.group'.cardinality = '1..3'", reason: "4 occurrence(s), not 1..3" } ] );
    } );

    // CodeRabbit on #9: with every other path inside the medication, the medication itself became the scope, so its
    // count was always 1 and its presence always true inside the one occurrence being judged.
    it( "judges an element's count and presence from its parent, never from inside it", () => {
        const naming = "contents/prescription/group/medication/mkb@value";
        const mkb = ( value ) => medication( node( "mkb", { value } ) );
        const inGroup = ( effect, reason ) => [ { scope: "contents/prescription/group[1]", branch: "then", effect: effect, reason: reason } ];
        assert.deepEqual( evaluate( "IF 'medication.mkb'.value IS NOT null\nTHEN 'group.medication'.cardinality = '1..3'", naming,
            prescription( group( mkb( "A01" ), mkb( "A02" ), mkb( "A03" ), mkb( "A04" ) ) ) ).violations, inGroup( "'group.medication'.cardinality = '1..3'", "4 occurrence(s), not 1..3" ) );
        assert.deepEqual( evaluate( "IF 'medication.mkb'.value IS null\nTHEN 'group.medication'.required = 'R'", naming, prescription( group() ) ).violations,
            inGroup( "'group.medication'.required = 'R'", "must be present" ) );
        assert.deepEqual( evaluate( "IF 'group.medication' IS null\nTHEN 'medication.mkb'.required = 'R'", naming, prescription( group() ) ).violations,
            inGroup( "'medication.mkb'.required = 'R'", "must be present" ) );
    } );

    // An overridden cardinality replaces the model's own, which counts within each parent: CDP29's medications are
    // 1..3 per group, so two groups of two are not four.
    it( "counts an element's occurrences within each of its parents", () => {
        const text = "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.group.medication'.cardinality = '1..3'";
        const naming = "contents/prescription/group/medication";
        const category = node( "category", { value: "T2" } );
        assert.deepEqual( evaluate( text, naming, prescription( category, group( medication(), medication() ), group( medication(), medication() ) ) ).violations, [] );
        assert.deepEqual( evaluate( text, naming, prescription( category, group( medication() ), group( medication(), medication(), medication(), medication() ) ) ).violations,
            [ { scope: "(message)", branch: "then", effect: "'prescription.group.medication'.cardinality = '1..3'", reason: "4 occurrence(s), not 1..3" } ] );
    } );

    it( "reads an entry column with the code lists, and reports it unchecked without them", () => {
        const text = "IF 'medication.mkb'.entry['Contagious'] IS NOT null\nTHEN 'medication.medicationCode'.required = 'R'";
        const naming = "contents/prescription/group/medication/mkb@value";
        const instance = prescription( group( medication( node( "mkb", { value: "A01" } ) ), medication( node( "mkb", { value: "A02" } ) ) ) );
        const codeLists = new Map( [ [ "CL011", { id: "CL011", columns: [ { title: "Contagious (CL148)", column: 6 } ],
            entries: [ { key: "A01", values: [ "1" ] }, { key: "A02", values: [ null ] } ] } ] ] );
        assert.deepEqual( evaluate( text, naming, instance, { codeLists } ), { violations: [ { scope: "contents/prescription/group[1]/medication[1]", branch: "then",
            effect: "'medication.medicationCode'.required = 'R'", reason: "must be present" } ], unchecked: [] } );
        assert.deepEqual( evaluate( text, naming, instance ), { violations: [], unchecked: [ "'medication.mkb'.entry['Contagious'] IS NOT null" ] } );
    } );

    // Final review: an effect on an entry column was judged against the element's own value, so A01, whose Contagious is
    // 1, failed "= '1'" as "value 'A01' is not allowed", with or without the code lists.
    it( "judges an effect on an entry column by that column, and reports it unchecked without the code lists", () => {
        const naming = "contents/prescription/group/medication/mkb@value";
        const codeLists = new Map( [ [ "CL011", { id: "CL011", columns: [ { title: "Contagious (CL148)", column: 6 } ],
            entries: [ { key: "A01", values: [ "1" ] }, { key: "A02", values: [ null ] } ] } ] ] );
        const instance = ( key ) => prescription( group( medication( node( "mkb", { value: key } ) ) ) );
        const restrict = "IF 'medication.mkb'.value IS NOT null\nTHEN 'medication.mkb'.entry['Contagious'] = '1'";
        assert.deepEqual( evaluate( restrict, naming, instance( "A01" ), { codeLists } ), { violations: [], unchecked: [] } );
        assert.deepEqual( evaluate( restrict, naming, instance( "A01" ) ), { violations: [], unchecked: [ "'medication.mkb'.entry['Contagious'] = '1'" ] } );
        const absent = "IF 'medication.mkb'.value IS NOT null\nTHEN 'medication.mkb'.entry['Contagious'] IS null";
        assert.deepEqual( evaluate( absent, naming, instance( "A02" ), { codeLists } ).violations, [] );
        assert.deepEqual( evaluate( absent, naming, instance( "A01" ), { codeLists } ).violations.map( ( violation ) => violation.reason ), [ "must be absent" ] );
    } );

    it( "evaluates nothing for a binding with an unresolved path, and says so", () => {
        const text = "IF 'patient.identifierType'.value = '2'\nTHEN 'prescription.lrn'.required = 'R'";
        assert.deepEqual( evaluate( text, "contents/prescription/lrn@value", prescription() ), { violations: [], unchecked: [ text ] } );
    } );

    it( "keeps a note unchecked, and lets the rest of its branch be judged", () => {
        const text = "IF 'prescription.lrn'.value IS NOT null\nTHEN NOTE 'to be populated with the sender''s identifier' AND 'prescription.category'.required = 'R'";
        assert.deepEqual( evaluate( text, "contents/prescription/lrn@value", prescription( node( "lrn", { value: "L-1" } ) ) ), { violations: [ { scope: "(message)",
            branch: "then", effect: "'prescription.category'.required = 'R'", reason: "must be present" } ], unchecked: [ "NOTE 'to be populated with the sender''s identifier'" ] } );
    } );
} );
