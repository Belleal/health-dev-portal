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
 * The pages once a list moves on past the seed (plan 8a, final review ruling F2), against a real server on a copy of
 * the seed that these tests move further through the data layer's own lifecycle, as staff would. A production page
 * links each list as it is in production today, never at the version its own record froze with (design record §4.8,
 * "Membership stays live"); a comparison leaves out a version that was abandoned in testing (final review M11).
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SEED, SEEDED, assertPublic, get, rowOf, startPortal } = require( "./support/server" );
const { implemented, productionContent } = require( "./support/seed" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { directoryStore } = require( "@health-dev-portal/data/files" );
const { promoteReleases } = require( "@health-dev-portal/data/promotion" );
const { abandonRelease } = require( "@health-dev-portal/data/releases" );
const { resolveVersion } = require( "@health-dev-portal/data/resolution" );
const { findVersion } = require( "@health-dev-portal/data/versions" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );

const BY_APPROVER = Object.freeze( { actor: "approver@example.test", now: new Date( SEED.now ) } );
const LIST = SEED.cl007.spec;

describe( "The pages after a list moves on", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let portal;
    let db;
    let store;
    before( async () => {
        portal = await startPortal();
        db = await openDatabase( `sqlite:${ portal.database }` );
        store = directoryStore( portal.files );
    } );
    after( async () => {
        if ( db ) {
            await db.close();
        }
        if ( portal ) {
            await portal.stop();
        }
    } );

    // A new version of CL007 with one synthetic entry more, through review into implementation, then to testing.
    const toTesting = async ( number ) => {
        const content = await productionContent( db, LIST );
        const last = content.list.entries.at( -1 );
        content.list.entries.push( { ...structuredClone( last ), key: `T${ number.split( "." ).at( -1 ) }`,
            description: { bg: "Синтетичен запис за тестовете на портала", en: "A synthetic entry for the portal's tests" }, since: number, validUntil: null,
            source: { ...last.source, row: last.source.row + 1 } } );
        const release = await implemented( db, store, LIST, content, number );
        await promoteReleases( db, store, [ release ], { to: STAGE.TESTING, noticeDays: 0, ...BY_APPROVER } );
        return release;
    };

    it( "keeps a production page linking the list as it is in production, after the version its record names is retired", async () => {
        const recorded = ( await resolveVersion( db, ( await findVersion( db, SEED.ePrescription.spec, { number: SEED.ePrescription.production } ) ).id ) )
            .find( ( one ) => one.spec === LIST ).number;
        assert.equal( recorded, SEED.cl007.previous );
        // CL007 1.5.35 reaches production: 1.5.34 becomes previous production, and 1.5.33, which e-Prescription 1.5.1
        // froze with, is retired.
        const previous = await findVersion( db, LIST, { stage: STAGE.PRODUCTION } );
        await promoteReleases( db, store, [ await toTesting( "1.5.35" ) ], { to: STAGE.PRODUCTION, previous: { [ previous.id ]: "2027-05-31" }, ...BY_APPROVER } );
        assert.equal( ( await get( `/bg/nomenclatures/${ LIST }/${ recorded }` ) ).status, 410, "the recorded version is retired" );

        for ( const at of [ "production", SEED.ePrescription.production ] ) {
            const page = await get( `/bg/specs/${ SEED.ePrescription.spec }/${ at }/P001` );
            assert.equal( page.status, 200, at );
            const link = /href="(\/bg\/nomenclatures\/CL007\/[^"]+)"/.exec( rowOf( page.text, "contents/prescription/category" ) );
            assert.equal( link[ 1 ], `/bg/nomenclatures/${ LIST }/1.5.35`, at );
            assertPublic( await get( link[ 1 ] ), "public, max-age=86400" );
        }
        // The list's production page names the module in production as its reader, though no record names 1.5.35.
        const list = ( await get( `/bg/nomenclatures/${ LIST }/production` ) ).text;
        assert.match( /<h2>Използва се в<\/h2>\s*<ul>([\s\S]*?)<\/ul>/.exec( list )[ 1 ], /href="\/bg\/specs\/e-prescription\/1\.5\.1\/P001\/elements\/[^"]*category"/ );
    } );

    it( "leaves a version abandoned in testing out of a comparison across it, and keeps it, marked, in the changelog", async () => {
        // 1.5.36 reaches testing and its release is abandoned; 1.5.37 follows it there. 1.5.36 never went live, so what a
        // reader changes to go from production to 1.5.37 is not its: the comparison listed its entries all the same
        // (final review M11).
        const production = ( await findVersion( db, LIST, { stage: STAGE.PRODUCTION } ) ).number;
        await abandonRelease( db, store, await toTesting( "1.5.36" ), BY_APPROVER );
        await toTesting( "1.5.37" );
        const compare = await get( `/bg/changes/${ LIST }/compare?from=${ production }&to=1.5.37` );
        assert.equal( compare.status, 200 );
        assertPublic( compare, "public, max-age=60" );
        assert.match( compare.text, /<h3>Версия 1\.5\.37 / );
        assert.doesNotMatch( compare.text, /Версия 1\.5\.36/ );
        // The changelog still has it, marked abandoned.
        const changelog = ( await get( `/bg/changes/${ LIST }` ) ).text;
        const start = changelog.indexOf( "id=\"v1.5.36\"" );
        assert.ok( start > 0 );
        assert.match( changelog.slice( start, changelog.indexOf( "</h2>", start ) ), /изоставена/ );
    } );
} );
