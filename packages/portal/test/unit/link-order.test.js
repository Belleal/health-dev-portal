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
 * Where a page looks for the lists and the rules it links (design record §4.8, ruling F2). Previous production is on no
 * stage's resolution line, and `resolutionOrder` throws for it, so its order is stated by hand and pinned here.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { linkOrder } = require( "#pages/version" );

describe( "The stages a page links from", () => {

    it( "are its own then the ones further on, and previous production's own then production", () => {
        assert.deepEqual( linkOrder( STAGE.TESTING ), [ STAGE.TESTING, STAGE.PRODUCTION ] );
        assert.deepEqual( linkOrder( STAGE.PRODUCTION ), [ STAGE.PRODUCTION ] );
        assert.deepEqual( linkOrder( STAGE.PREVIOUS_PRODUCTION ), [ STAGE.PREVIOUS_PRODUCTION, STAGE.PRODUCTION ] );
    } );
} );
