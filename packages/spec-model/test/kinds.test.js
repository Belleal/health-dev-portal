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
 * The model's enumerations. Every stored value is one of these strings, so their exact spelling is pinned here.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const kinds = require( "@health-dev-portal/spec-model/kinds" );

describe( "kinds", () => {

    it( "names spec kinds, code-list statuses and one lifecycle for messages and rules", () => {
        assert.deepEqual( Object.values( kinds.SPEC_KIND ), [ "module", "rules", "nomenclatures", "common-schema" ] );
        assert.deepEqual( Object.values( kinds.CODE_LIST_STATUS ), [ "in-use", "removed", "under-revision", "reserved", "in-development", "incomplete" ] );
        assert.deepEqual( Object.values( kinds.LIFECYCLE ), [ "active", "in-development", "withdrawn" ] );
        assert.equal( kinds.MESSAGE_LIFECYCLE, undefined );
    } );
} );
