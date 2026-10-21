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
 * Links between specs (design record §4.8, §5.3): a module's code-list and rule references, and each rule's error
 * code, resolved against the other specs of the same import set.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { linkConditions, linkModule, linkRules } = require( "@health-dev-portal/spec-model/links" );
const { parseCondition } = require( "@health-dev-portal/spec-model/condition-parser" );

// Only the properties linking reads.
const element = ( overrides = {} ) => ( { identity: "contents/x@value", name: { bg: null, en: "X" }, rules: [], conditions: [],
    codeList: null, children: [], source: { sheet: "P001", row: 5 }, ...overrides } );
const moduleOf = ( ...elements ) => ( { kind: "module", spec: "e-prescription", version: "1.5.1", messages: [ { code: "P001", elements } ] } );
const nomenclaturesOf = ( ...lists ) => ( { kind: "nomenclatures", codeLists: lists.map( ( [ id, status, keys = [] ] ) =>
    ( { id, status, entries: keys.map( ( key ) => ( { key } ) ) } ) ) } );
const rulesOf = ( ...rules ) => ( { kind: "rules", rules: rules.map( ( [ id, lifecycle, errorCode = "E002" ] ) =>
    ( { id, lifecycle, errorCode, source: { sheet: "Rules", row: 4 } } ) ) } );
const types = ( anomalies ) => anomalies.map( ( anomaly ) => anomaly.type );

describe( "linkModule", () => {

    it( "accepts references that resolve", () => {
        assert.deepEqual( linkModule( moduleOf( element( { codeList: "CL001", rules: [ "RL001" ] } ) ),
            { nomenclatures: nomenclaturesOf( [ "CL001", "in-use" ] ), rules: rulesOf( [ "RL001", "active" ] ) } ), [] );
    } );

    it( "blocks a code list and a rule that do not exist, at the element's row", () => {
        const anomalies = linkModule( moduleOf( element( { codeList: "CL404", rules: [ "RL404" ] } ) ),
            { nomenclatures: nomenclaturesOf( [ "CL001", "in-use" ] ), rules: rulesOf( [ "RL001", "active" ] ) } );
        assert.deepEqual( types( anomalies ), [ "unknown-code-list", "unknown-rule" ] );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.level, anomaly.sheet, anomaly.row, anomaly.details.id ] ),
            [ [ "blocking", "P001", 5, "CL404" ], [ "blocking", "P001", 5, "RL404" ] ] );
        assert.equal( anomalies[ 0 ].details.identity, "contents/x@value" );
    } );

    it( "warns about a removed code list and a withdrawn rule", () => {
        assert.deepEqual( types( linkModule( moduleOf( element( { codeList: "CL068", rules: [ "RL019" ] } ) ),
            { nomenclatures: nomenclaturesOf( [ "CL068", "removed" ] ), rules: rulesOf( [ "RL019", "withdrawn" ] ) } ) ),
        [ "removed-code-list", "withdrawn-rule" ] );
    } );

    it( "checks nested elements, each reference once, and names an element without identity by its name", () => {
        const child = element( { identity: null, rules: [ "RL404", "RL405" ], source: { sheet: "P001", row: 6 } } );
        const anomalies = linkModule( moduleOf( element( { children: [ child ] } ) ), { rules: rulesOf( [ "RL001", "active" ] ) } );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.row, anomaly.details.id, anomaly.details.identity ] ),
            [ [ 6, "RL404", "X" ], [ 6, "RL405", "X" ] ] );
    } );

    it( "checks nothing of a kind whose spec is not in the set", () => {
        const module = moduleOf( element( { codeList: "CL404", rules: [ "RL404" ] } ) );
        assert.deepEqual( linkModule( module, {} ), [] );
        assert.deepEqual( types( linkModule( module, { rules: rulesOf() } ) ), [ "unknown-rule" ] );
    } );
} );

describe( "linkRules", () => {

    it( "warns about a rule whose error code CL999 does not define, and skips the check without CL999", () => {
        const rules = rulesOf( [ "RL001", "active", "E002" ], [ "RL002", "withdrawn", "E404" ], [ "RL003", "active", null ] );
        const anomalies = linkRules( rules, nomenclaturesOf( [ "CL999", "incomplete", [ "E001", "E002" ] ] ) );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.details.id, anomaly.details.code ] ),
            [ [ "unknown-error-code", "warning", "RL002", "E404" ] ] );
        assert.deepEqual( linkRules( rules, nomenclaturesOf( [ "CL001", "in-use" ] ) ), [] );
    } );
} );

describe( "linkConditions", () => {

    // A module with one condition, named by one element, and its binding; only the properties linking reads.
    const moduleNaming = ( text, paths, named = { identity: "contents/x@value", codeList: "CL028" } ) => ( {
        kind: "module", spec: "s", version: "1.0.0",
        messages: [ { code: "P001", elements: [ { identity: named.identity, codeList: named.codeList, children: [] } ] } ],
        conditions: [ { id: "CD1", text: text, parsed: parseCondition( text ).condition, printed: null, source: { sheet: "Conditions", row: 3 } } ],
        conditionBindings: [ { condition: "CD1", message: "P001", element: named.identity, paths: paths } ]
    } );
    const nomenclatures = ( ...lists ) => ( { kind: "nomenclatures", codeLists: lists.map( ( [ id, keys, columns = [] ] ) =>
        ( { id, status: "in-use", columns: columns.map( ( title, index ) => ( { title, column: 6 + index } ) ), entries: keys.map( ( key ) => ( { key } ) ) } ) ) } );

    it( "blocks a compared value that is not a key of the element's code list, once per value", () => {
        const anomalies = linkConditions( moduleNaming( "IF 'x'.value = 'QN'\nTHEN 'x'.required = 'R'\nELSE 'x'.value IN ['QN', '1']", { x: "contents/x@value" } ),
            nomenclatures( [ "CL028", [ "1", "2" ] ] ) );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.sheet, anomaly.row, anomaly.details ] ),
            [ [ "unknown-condition-value", "blocking", "Conditions", 3, { id: "CD1", value: "QN", list: "CL028", identity: "contents/x@value" } ] ] );
    } );

    // Common medical services 1.2.2: CDC04 and CDC12 both compare one valueScale with 'QN', and only CDC04 was reported.
    // e-Referral 1.4.4: CDR17 is bound in two messages to two elements, and its '10.64' was reported twice.
    it( "blocks a value once per condition, value and list, whichever element it is bound to", () => {
        const text = "IF 'x'.value = 'QN'\nTHEN 'x'.required = 'R'";
        const condition = ( id, row ) => ( { id: id, text: text, parsed: parseCondition( text ).condition, printed: null, source: { sheet: "Conditions", row: row } } );
        const element = ( identity ) => ( { identity: identity, codeList: "CL028", children: [] } );
        const module = {
            kind: "module", spec: "s", version: "1.0.0",
            messages: [ { code: "P001", elements: [ element( "contents/x@value" ) ] }, { code: "P002", elements: [ element( "contents/y/x@value" ) ] } ],
            conditions: [ condition( "CD1", 3 ), condition( "CD2", 6 ) ],
            conditionBindings: [
                { condition: "CD1", message: "P001", element: "contents/x@value", paths: { x: "contents/x@value" } },
                { condition: "CD1", message: "P002", element: "contents/y/x@value", paths: { x: "contents/y/x@value" } },
                { condition: "CD2", message: "P001", element: "contents/x@value", paths: { x: "contents/x@value" } }
            ]
        };
        assert.deepEqual( linkConditions( module, nomenclatures( [ "CL028", [ "1" ] ] ) ).map( ( anomaly ) => [ anomaly.row, anomaly.details.id, anomaly.details.value ] ),
            [ [ 3, "CD1", "QN" ], [ 6, "CD2", "QN" ] ] );
    } );

    // Final review: elements were looked up across the whole module, the last message winning, and e-Immunization's
    // contents/status@value is CL039 in I002 but CL043 in I009.
    it( "checks a value against the code list of the element in the binding's own message", () => {
        const text = "IF 'status'.value = 'A'\nTHEN 'status'.required = 'R'";
        const module = {
            kind: "module", spec: "s", version: "1.0.0",
            messages: [
                { code: "P001", elements: [ { identity: "contents/status@value", codeList: "CL039", children: [] } ] },
                { code: "P002", elements: [ { identity: "contents/status@value", codeList: "CL043", children: [] } ] }
            ],
            conditions: [ { id: "CD1", text: text, parsed: parseCondition( text ).condition, printed: null, source: { sheet: "Conditions", row: 3 } } ],
            conditionBindings: [ { condition: "CD1", message: "P001", element: "contents/status@value", paths: { status: "contents/status@value" } } ]
        };
        assert.deepEqual( linkConditions( module, nomenclatures( [ "CL039", [ "X" ] ], [ "CL043", [ "A" ] ] ) ).map( ( anomaly ) => [ anomaly.details.value, anomaly.details.list ] ),
            [ [ "A", "CL039" ] ] );
    } );

    // Final review: a requirement or a cardinality compared in an IF is not a value of the element, and 'R' blocked as
    // "not a key of CL028".
    it( "checks keys only where a value is compared", () => {
        const text = "IF 'x'.required = 'R' AND 'x'.cardinality = '1..1'\nTHEN 'x'.value = '1'";
        assert.deepEqual( linkConditions( moduleNaming( text, { x: "contents/x@value" } ), nomenclatures( [ "CL028", [ "1" ] ] ) ), [] );
    } );

    it( "accepts keys and globs, and checks nothing against a list the nomenclatures lack", () => {
        assert.deepEqual( linkConditions( moduleNaming( "IF 'x'.value = '1'\nTHEN 'x'.value MATCHES 'N80.??'", { x: "contents/x@value" } ),
            nomenclatures( [ "CL028", [ "1", "2" ] ] ) ), [] );
        assert.deepEqual( linkConditions( moduleNaming( "IF 'x'.value = 'Z'\nTHEN 'x'.required = 'R'", { x: "contents/x@value" }, { identity: "contents/x@value", codeList: "CL404" } ),
            nomenclatures( [ "CL028", [ "1" ] ] ) ), [] );
    } );

    it( "warns about an entry or list column the list does not have, matching titles loosely", () => {
        const onCl011 = { identity: "contents/x@value", codeList: "CL011" };
        const lists = nomenclatures( [ "CL011", [ "A01" ], [ "Contagious (CL148)" ] ], [ "CL006", [ "1001" ], [ "NHIF Code" ] ] );
        assert.deepEqual( linkConditions( moduleNaming( "IF 'x'.entry['Contagious'] IS NOT null\nTHEN 'x'.required = 'R'", { x: "contents/x@value" }, onCl011 ), lists ), [] );
        assert.deepEqual( linkConditions( moduleNaming( "IF 'x'.entry['Rare'] IS NOT null\nTHEN 'x'.required = 'R'", { x: "contents/x@value" }, onCl011 ), lists )
            .map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.details ] ), [ [ "unknown-list-column", "warning", { id: "CD1", list: "CL011", column: "Rare" } ] ] );
        assert.deepEqual( linkConditions( moduleNaming( "IF 'x'.value = 'A01'\nTHEN 'y'.@nhifCode IN CL006['nhifCode']", { x: "contents/x@value", "y@nhifCode": null }, onCl011 ), lists ), [] );
    } );
} );
