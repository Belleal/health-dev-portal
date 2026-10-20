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
const { linkModule, linkRules } = require( "@health-dev-portal/spec-model/links" );

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
