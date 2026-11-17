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
 * The Schemas section (design record §8.1; plan 8b, decision 8): the notice that /api/v1/ is obsolete, every module's
 * set by stage, and one set's files.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, rowOf, startPortal } = require( "./support/server" );

const BRIEF = "public, max-age=60";
const GONE = "public, max-age=86400";

describe( "The Schemas section", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    before( async () => {
        portal = await startPortal();
    } );
    after( async () => {
        if ( portal ) {
            await portal.stop();
        }
    } );

    it( "puts the /api/v1/ notice first, then each stage's module versions", async () => {
        const page = await get( "/bg/schemas" );
        assert.equal( page.status, 200 );
        assertPublic( page, BRIEF );
        assert.ok( page.text.includes( "www.his.bg/api/v1/" ) );
        assert.ok( page.text.indexOf( "www.his.bg/api/v1/" ) < page.text.indexOf( "<table" ) );
        assert.match( page.text, new RegExp( `href="/bg/schemas/e-prescription/${ SEED.ePrescription.testing.replaceAll( ".", "\\." ) }"` ) );
        assert.match( page.text, new RegExp( `href="/downloads/specs/e-prescription/${ SEED.ePrescription.production.replaceAll( ".", "\\." ) }\\.zip"` ) );
        assert.match( ( await get( "/en/schemas" ) ).text, /<h1>[^<]*Schemas|<h1>XSD/ );
    } );

    it( "lists Schemas in the top bar after Errors, marked on its own pages", async () => {
        const page = await get( "/en/schemas" );
        const nav = /<nav class="sections"[\s\S]*?<\/nav>/.exec( page.text )[ 0 ];
        assert.deepEqual( [ ...nav.matchAll( /href="([^"]+)"/g ) ].map( ( found ) => found[ 1 ] ),
            [ "/en/specs", "/en/nomenclatures", "/en/errors", "/en/schemas", "/en/changes", "/en/guides", "/en/faq" ] );
        assert.match( nav, /<a href="\/en\/schemas" aria-current="true">/ );
        assert.doesNotMatch( /<nav class="sections"[\s\S]*?<\/nav>/.exec( ( await get( "/en/specs" ) ).text )[ 0 ], /href="\/en\/schemas" aria-current/ );
    } );

    it( "lists a set's messages with their XSD and sample, and a withdrawn one without", async () => {
        const page = await get( "/en/schemas/e-prescription/1.5.1" );
        assert.equal( page.status, 200 );
        assertPublic( page, BRIEF );
        assert.match( rowOf( page.text, "P001" ), /href="\/schemas\/e-prescription\/1\.5\.1\/NHIS-P001\.xsd"/ );
        assert.match( rowOf( page.text, "P001" ), /href="\/downloads\/specs\/e-prescription\/1\.5\.1\/P001\.xml"/ );
        assert.doesNotMatch( rowOf( page.text, "P011" ), /href=/ );
        assert.match( rowOf( page.text, "P011" ), /withdrawn/ );
        for ( const link of [ "/downloads/specs/e-prescription/1.5.1.zip", "/downloads/specs/e-prescription/1.5.1.json", "/schemas/e-prescription/1.5.1/xmldsig-core-schema.xsd" ] ) {
            assert.ok( page.text.includes( `href="${ link }"` ), link );
        }
    } );

    it( "gives a stage set page its fixed address as canonical, and switches stages", async () => {
        const page = await get( "/bg/schemas/e-prescription/production" );
        assert.equal( page.status, 200 );
        assert.match( page.text, /<link rel="canonical" href="[^"]*\/bg\/schemas\/e-prescription\/1\.5\.1">/ );
        assert.match( page.text, /<nav class="stages"[\s\S]*?href="\/bg\/schemas\/e-prescription\/testing"/ );
    } );

    it( "answers a code list's, the rules', an unknown and a retired set as plan 8a's pages do", async () => {
        for ( const address of [ "/bg/schemas/CL007/production", "/bg/schemas/rules/production", "/bg/schemas/e-prescription/9.9.9",
            `/bg/schemas/CL008/${ SEED.cl008Abandoned }`, "/bg/schemas/e-prescription/production/extra" ] ) {
            assert.equal( ( await get( address ) ).status, 404, address );
        }
        const retired = await get( `/bg/schemas/e-prescription/${ SEED.history }` );
        assert.equal( retired.status, 410 );
        assertPublic( retired, GONE );
    } );
} );
