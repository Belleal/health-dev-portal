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
 * A guide with no English (plan 8c, decision 4; design record §8.4): the English page shows the Bulgarian, in its own
 * language and marked "not yet translated", never an empty page or a 404. The repository's two guides both have English,
 * so this runs on a content folder built here.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SMALL_CONTENT, contentFolder, removeContentFolders } = require( "./support/content" );
const { SEEDED, get, startPortal } = require( "./support/server" );

describe( "A guide with no English", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal( { contentDirectory: contentFolder( SMALL_CONTENT ) } );
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
        removeContentFolders();
    } );

    it( "shows a guide's Bulgarian on the English page when it has no English, marked", async () => {
        const response = await get( "/en/guides/only-bulgarian" );
        assert.equal( response.status, 200 );
        assert.match( response.text, /<html lang="en">/ );
        assert.match( response.text, /<div class="prose" lang="bg">[\s\S]*<h2 id="part">Раздел<\/h2>/ );
        assert.match( response.text, /<h1><span lang="bg">Само на български<\/span> <span class="untranslated">not yet translated<\/span><\/h1>/ );
        // The index lists it the same way.
        assert.match( ( await get( "/en/guides" ) ).text, /<span lang="bg">Само на български<\/span>/ );
    } );
} );
