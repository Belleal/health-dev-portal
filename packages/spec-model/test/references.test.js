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
 * The specs a module refers to (design record §4.8): what its version resolves against.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { referencedSpecs } = require( "@health-dev-portal/spec-model/references" );
const { OPERATOR, PROPERTY } = require( "@health-dev-portal/spec-model/conditions" );

const element = ( identity, codeList, rules, children = [] ) => ( { identity: identity, kind: "field", codeList: codeList, rules: rules, children: children } );

// A module whose elements name `elementLists` and `rules`, and whose one condition tests `IN <list>['NHIF Code']` for
// each of `setLists`.
const moduleNaming = ( { elementLists, setLists, rules } ) => ( {
    kind: "module",
    spec: "e-prescription",
    version: "1.5.1",
    messages: [ { code: "P001", elements: [ element( "contents", null, [], [
        ...elementLists.map( ( id, index ) => element( `contents/f${ index }@value`, id, [] ) ),
        element( "contents/r@value", null, rules )
    ] ) ] } ],
    conditions: [ { id: "CDP01", text: "…", source: { sheet: "Conditions", row: 2 }, printed: null, parsed: {
        scope: null,
        predicate: { kind: "and", terms: setLists.map( ( id ) => ( {
            kind: "comparison",
            operand: { path: { text: "contents.f0", self: false }, attribute: null, property: PROPERTY.VALUE, column: null },
            operator: OPERATOR.IN,
            values: [],
            set: { list: id, column: "NHIF Code" }
        } ) ) },
        then: { alternatives: [ [] ] },
        otherwise: null
    } } ],
    conditionBindings: [],
    blueprintBindings: [],
    dictionary: [],
    changeNotes: []
} );

describe( "referencedSpecs", () => {

    it( "lists the code lists a module names, by elements and by condition sets, once each and sorted", () => {
        assert.deepEqual( referencedSpecs( moduleNaming( { elementLists: [ "CL035", "CL009", "CL009" ], setLists: [ "CL006" ], rules: [] } ) ),
            { codeLists: [ "CL006", "CL009", "CL035" ], rules: false } );
        assert.equal( referencedSpecs( moduleNaming( { elementLists: [], setLists: [], rules: [ "RL023" ] } ) ).rules, true );
    } );

    it( "skips a condition that could not be read", () => {
        const module = moduleNaming( { elementLists: [ "CL009" ], setLists: [ "CL006" ], rules: [] } );
        module.conditions[ 0 ].parsed = null;
        assert.deepEqual( referencedSpecs( module ), { codeLists: [ "CL009" ], rules: false } );
    } );
} );
