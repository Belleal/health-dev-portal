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
 * The studio's roles (plan 9a): how a person's grants become the roles of their session, and who counts as an admin.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { ADMIN_ROLES, SESSION_ROLE, STAFF_ROLES, isStudioAdmin, sessionRolesOf } = require( "#studio/roles" );

describe( "The studio's roles", () => {

    it( "turns grants into session roles and an editor's specs", () => {
        const table = [
            { grants: [], expected: { roles: [], editorSpecs: [] } },
            { grants: [ { role: "editor", spec: "*" } ], expected: { roles: [ "studio:editor" ], editorSpecs: null } },
            { grants: [ { role: "editor", spec: "CL009" }, { role: "editor", spec: "CL011" } ],
                expected: { roles: [ "studio:editor" ], editorSpecs: [ "CL009", "CL011" ] } },
            { grants: [ { role: "approver", spec: "*" }, { role: "reader", spec: "*" } ],
                expected: { roles: [ "studio:reader", "studio:approver" ], editorSpecs: [] } }
        ];
        for ( const { grants, expected } of table ) {
            assert.deepEqual( sessionRolesOf( grants ), expected, JSON.stringify( grants ) );
        }
    } );

    it( "names the session roles and keeps them frozen", () => {
        assert.deepEqual( { ...SESSION_ROLE }, { reader: "studio:reader", editor: "studio:editor", approver: "studio:approver", admin: "studio:admin" } );
        assert.ok( Object.isFrozen( SESSION_ROLE ) );
        assert.deepEqual( ADMIN_ROLES, [ "studio:admin", "admin" ] );
        assert.ok( STAFF_ROLES.includes( "admin" ) && STAFF_ROLES.includes( "studio:reader" ) );
    } );

    it( "counts the configuration's admin as a studio admin", () => {
        assert.equal( isStudioAdmin( [ "admin" ] ), true );
        assert.equal( isStudioAdmin( [ "studio:admin" ] ), true );
        assert.equal( isStudioAdmin( [ "studio:editor" ] ), false );
        assert.equal( isStudioAdmin( [] ), false );
    } );
} );
