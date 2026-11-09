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
 * The seed holds what decision 13 says, read through the public view the pages will read it through, so that a page
 * test that fails points at the page and not at its data. `SEED`'s numbers and patterns are checked against the data
 * here once, for every later test that relies on them.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { compareNumbers } = require( "@health-dev-portal/spec-model/numbers" );
const { compareContents } = require( "@health-dev-portal/spec-model/differences" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { findPublished, listPublished, publishedChangelog, upcoming } = require( "@health-dev-portal/data/published" );
const { resolveVersion } = require( "@health-dev-portal/data/resolution" );
const { findVersion } = require( "@health-dev-portal/data/versions" );
const { SEEDED, SEED, seedContent } = require( "./support/server" );
const { SEED_DATABASE, inCi } = require( "./support/seed" );

describe( "The seed's reading of CI", () => {

    it( "is CI only when CI is set and is not false", () => {
        assert.equal( inCi( { CI: "true" } ), true );
        assert.equal( inCi( { CI: "1" } ), true );
        // The seed's build took any value for CI, so CI=false failed a local run that every test would have skipped
        // (final review M1); the build, the test server and the accessibility test now share this one rule.
        assert.equal( inCi( { CI: "false" } ), false );
        assert.equal( inCi( { CI: "" } ), false );
        assert.equal( inCi( {} ), false );
    } );
} );

describe( "The seed", { skip: !SEEDED && "build the seed first: npm run fixtures:fetch, then npm test --workspace packages/portal" }, () => {

    let db;
    before( async () => {
        db = await openDatabase( `sqlite:${ SEED_DATABASE }` );
    } );
    after( async () => {
        if ( db ) {
            await db.close();
        }
    } );

    const published = async ( spec ) => ( await listPublished( db ) ).find( ( one ) => one.spec === spec );

    it( "has e-Prescription 1.5.1 in production and 1.5.2 in testing, due in production on 05.12.2026", async () => {
        const ePrescription = await published( SEED.ePrescription.spec );
        assert.deepEqual( [ ePrescription.production.number, ePrescription.testing.number, ePrescription.previousProduction ],
            [ SEED.ePrescription.production, SEED.ePrescription.testing, null ] );
        assert.equal( ePrescription.testing.enteredOn, "2026-11-05" );
        const due = await upcoming( db );
        assert.deepEqual( due.map( ( one ) => [ one.plannedOn, one.versions ] ), [ [ SEED.ePrescription.plannedOn,
            [ { spec: SEED.ePrescription.spec, kind: "module", number: SEED.ePrescription.testing, production: SEED.ePrescription.production } ] ] ] );
        // An optional element made required is a breaking change.
        assert.ok( due[ 0 ].breaking >= 1, `${ due[ 0 ].breaking } breaking changes` );
    } );

    it( "shows each change e-Prescription 1.5.2 makes, by SEED's patterns, in the comparison and in the changelog", async () => {
        const differences = compareContents( "module", await seedContent( SEED.ePrescription.spec, SEED.ePrescription.production ),
            await seedContent( SEED.ePrescription.spec, SEED.ePrescription.testing ) );
        assert.deepEqual( differences.map( ( one ) => `${ one.key } ${ one.category }` ), [
            "element:P001:contents/prescription/lrn@value#1|description non-breaking",
            "element:P001:contents/prescription/supplements@value#1|requirement breaking",
            "element:P001:contents/prescription/supplements@value#1|cardinality breaking",
            "element:P001:contents/prescription/exampleNote@value#1|added non-breaking"
        ] );
        const changelog = JSON.stringify( ( await publishedChangelog( db, SEED.ePrescription.spec ) )[ 0 ] );
        for ( const change of SEED.ePrescriptionChanges ) {
            assert.match( JSON.stringify( differences ), change.pattern, change.path );
            assert.match( changelog, change.pattern, change.path );
        }
    } );

    it( "has CL007 1.5.34 in production, T10 added and T4 expiring, with 1.5.33 backward compatible until 30.04.2027", async () => {
        const cl007 = await published( SEED.cl007.spec );
        assert.deepEqual( [ cl007.production.number, cl007.previousProduction.number, cl007.previousProduction.expiresOn, cl007.testing ],
            [ SEED.cl007.production, SEED.cl007.previous, SEED.cl007.expiresOn, null ] );
        const entries = ( await seedContent( SEED.cl007.spec, SEED.cl007.production ) ).list.entries;
        assert.equal( entries.find( ( entry ) => entry.key === SEED.cl007.expired ).validUntil, SEED.cl007.production );
        assert.equal( entries.find( ( entry ) => entry.key === SEED.cl007.added ).since, SEED.cl007.production );
        assert.equal( ( await seedContent( SEED.cl007.spec, SEED.cl007.previous ) ).list.entries.some( ( entry ) => entry.key === SEED.cl007.added ), false );
    } );

    it( "has e-Prescription 1.5.1's frozen record name CL007 1.5.33, and 1.5.2's name 1.5.34 (ruling P2)", async () => {
        // What the pages no longer follow (ruling F2, design record §4.8): a production page links CL007 as it is in
        // production, 1.5.34, though 1.5.1 froze with 1.5.33. The page tests rely on the record disagreeing.
        const recorded = async ( number ) => ( await resolveVersion( db, ( await findPublished( db, SEED.ePrescription.spec, { number: number } ) ).id ) )
            .find( ( one ) => one.spec === SEED.cl007.spec ).number;
        assert.equal( await recorded( SEED.ePrescription.production ), SEED.cl007.previous );
        assert.equal( await recorded( SEED.ePrescription.testing ), SEED.cl007.production );
    } );

    it( "keeps CL008's abandoned version and the rules' development version out of every public view", async () => {
        assert.equal( await findPublished( db, "CL008", { number: SEED.cl008Abandoned } ), null );
        assert.ok( await findVersion( db, "CL008", { number: SEED.cl008Abandoned } ), "the abandoned version is in the database" );
        assert.deepEqual( ( await publishedChangelog( db, "CL008" ) ).map( ( one ) => one.number ).includes( SEED.cl008Abandoned ), false );
        const cl008 = await published( "CL008" );
        assert.deepEqual( [ cl008.production.number, cl008.testing ], [ SEED.nomenclatures, null ] );
        assert.ok( await findVersion( db, SEED.rules.spec, { stage: "development" } ), "the rules have a development version" );
        const rules = await published( SEED.rules.spec );
        assert.deepEqual( [ rules.production.number, rules.testing ], [ SEED.rules.production, null ] );
    } );

    it( "keeps e-Prescription's history, SEED.history the newest retired number, with no content", async () => {
        const retired = ( await publishedChangelog( db, SEED.ePrescription.spec ) ).filter( ( one ) => one.stage === "retired" ).map( ( one ) => one.number );
        assert.equal( retired.sort( compareNumbers ).at( -1 ), SEED.history );
        const history = await findPublished( db, SEED.ePrescription.spec, { number: SEED.history } );
        assert.deepEqual( [ history.retired, history.content ], [ true, null ] );
    } );
} );
