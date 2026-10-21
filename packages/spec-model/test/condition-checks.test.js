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
 * Conditions checked against the model's data types (design record §6.5).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { checkConditionTypes } = require( "@health-dev-portal/spec-model/condition-checks" );
const { parseCondition } = require( "@health-dev-portal/spec-model/condition-parser" );


describe( "checkConditionTypes", () => {

    it( "reports IS true on a non-boolean and an ordering on a boolean or a non-number", () => {
        const elements = new Map( [ [ "contents/a@value", { identity: "contents/a@value", dataType: "String" } ], [ "contents/b@value", { identity: "contents/b@value", dataType: "Boolean" } ],
            [ "contents/c@value", { identity: "contents/c@value", dataType: "Codeable Concept" } ] ] );
        const binding = { condition: "CD1", message: "P001", element: "contents/a@value", paths: { a: "contents/a@value", b: "contents/b@value", c: "contents/c@value" } };
        const check = ( text ) => checkConditionTypes( parseCondition( text ).condition, binding, elements );
        assert.deepEqual( check( "IF 'a'.value IS true\nTHEN 'b'.value > '1'" ).map( ( problem ) => problem.operator ), [ "is-true", ">" ] );
        assert.deepEqual( check( "IF 'c'.value > '1'\nTHEN 'a'.value >= 'x'" ).map( ( problem ) => [ problem.operator, problem.identity ] ), [ [ ">=", "contents/a@value" ] ] );
        assert.deepEqual( check( "IF 'b'.value IS false\nTHEN 'c'.value > '1'" ), [] );
    } );
} );
