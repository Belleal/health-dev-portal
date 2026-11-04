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
 * Where a version reads the specs it refers to (design record §4.8): its own stage, then the stages further on.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { resolutionOrder } = require( "@health-dev-portal/spec-model/stages" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );

describe( "resolutionOrder", () => {

    it( "reads a stage, then the stages further on (design record §4.8)", () => {
        assert.deepEqual( resolutionOrder( STAGE.DEVELOPMENT ), [ "development", "implementation", "testing", "production" ] );
        assert.deepEqual( resolutionOrder( STAGE.IMPLEMENTATION ), [ "implementation", "testing", "production" ] );
        assert.deepEqual( resolutionOrder( STAGE.TESTING ), [ "testing", "production" ] );
        assert.deepEqual( resolutionOrder( STAGE.PRODUCTION ), [ "production" ] );
    } );

    it( "never resolves a frozen-for-good stage", () => {
        for ( const stage of [ STAGE.PREVIOUS_PRODUCTION, STAGE.RETIRED, "staging" ] ) {
            assert.throws( () => resolutionOrder( stage ), { name: "RangeError" }, stage );
        }
    } );
} );
