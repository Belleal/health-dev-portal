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
 * A fault in the importer itself must surface as what it is, never as a file that "cannot be read" (final review of
 * plan 2): the streamed nomenclatures import was wrapped whole, so a TypeError in a pure stage blamed the workbook.
 *
 * The fault is planted before the set importer loads, which is why this test has a file — a process — of its own.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const FAULT = "planted fault in readCodeListSheet";
require( "#code-list-sheet" ).readCodeListSheet = () => {
    throw new TypeError( FAULT );
};

const { importSet } = require( "#set-importer" );
const { writeWorkbook } = require( "./support/xlsx-builder" );
const { nomenclatureSheets } = require( "./support/fixtures" );

describe( "importSet, when the importer itself fails", () => {

    it( "reports the fault as itself, not as a file that cannot be read", async () => {
        const source = await writeWorkbook( nomenclatureSheets() );
        await assert.rejects( importSet( { nomenclatures: { source: source } } ), ( error ) => {
            assert.equal( error.message, FAULT );
            assert.ok( error instanceof TypeError );
            return true;
        } );
    } );
} );
