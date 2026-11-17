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
 * A start on content the portal cannot load (plan 8c, decision 3): refused, naming the file, and the front matter that
 * is code never run. A file of its own, since core refuses a second service instance in a process even after the first
 * has stopped (measured: TiException 1006, "Multiple ServiceInstance initializations per process are not supported").
 */

const { after, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { CODE_FRONT_MATTER, SMALL_CONTENT, contentFolder, removeContentFolders } = require( "./support/content" );
const { SEEDED, startPortal } = require( "./support/server" );

describe( "A start on content that cannot be loaded", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    after( removeContentFolders );

    it( "refuses to start on content it cannot load, naming the file", async () => {
        globalThis.__contentRan = false;
        // A portal that starts anyway is stopped, so the failure is reported rather than left listening.
        const attempt = startPortal( { contentDirectory: contentFolder( { ...SMALL_CONTENT, "faq/one.bg.md": CODE_FRONT_MATTER } ) } ).then( async ( started ) => {
            await started.stop();
            assert.fail( "the portal started on content it should have refused" );
        } );
        // Core raises what a start rejects with as its own exception, keeping the original in its data (start.test.js).
        await assert.rejects( attempt, ( error ) => /faq\/one\.bg\.md/.test( [ error?.data?.message, error?.data?.stack, error?.message ].join( "\n" ) ) );
        assert.equal( globalThis.__contentRan, false );
    } );
} );
