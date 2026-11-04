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
 * The production set migrated as published (design record §7.11): nomenclatures 1.5.33, rules 1.1.1 and e-Prescription
 * 1.5.1, with the /api/v1/ set for the blueprints. Every expected count was measured on 2026-11-04 with probes
 * independent of this code; a failure means the migration and the measurement disagree.
 */

const { before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { importSet } = require( "@health-dev-portal/importer/set" );
const { importXsdSet } = require( "@health-dev-portal/importer/xsd" );
const { migrateSchema } = require( "#schema" );
const { findVersion, loadAnomalies, loadVersion } = require( "#versions" );
const { memoryStore, readSetting } = require( "#files" );
const { readManifest } = require( "#manifest" );
const { migrate } = require( "#migration" );
const { eachDatabase } = require( "./support/databases" );
const { PRESENT, fixture, productionManifest } = require( "./support/public" );

const withoutNotes = ( version ) => Object.fromEntries( Object.entries( version ).filter( ( [ field ] ) => field !== "changeNotes" ) );

if ( !PRESENT ) {
    describe( "Migrating the production set", { skip: "run `npm run fixtures:fetch` first" }, () => {} );
} else {
    let imported;
    before( async () => {
        // The importer's own reading of the same set, to hold the stored result against.
        imported = await importSet( {
            nomenclatures: { source: fixture( "nomenclatures" ) },
            rules: { source: fixture( "rules" ) },
            modules: [ { spec: "e-prescription", source: fixture( "module" ) } ],
            catalogue: ( await importXsdSet( fixture( "xsd" ) ) ).catalogue
        } );
    } );

    eachDatabase( "Migrating the production set", ( db ) => {

        let report;
        before( async () => {
            await migrateSchema( db() );
            report = await migrate( db(), memoryStore(), readManifest( productionManifest() ) );
        } );

        const versionOf = async ( spec, stage ) => loadVersion( db(), ( await findVersion( db(), spec, { stage: stage } ) ).id );
        const blocking = async ( spec ) => ( await loadAnomalies( db(), ( await findVersion( db(), spec, { stage: "production" } ) ).id ) )
            .filter( ( anomaly ) => anomaly.level === "blocking" ).length;

        it( "stores 185 specs and their measured history", async () => {
            assert.equal( ( await db().get( "SELECT COUNT(*) AS n FROM specs" ) ).n, 185 );
            const rows = await db().all( "SELECT s.kind, v.stage, COUNT(*) AS n FROM versions v JOIN specs s ON s.id = v.spec_id GROUP BY s.kind, v.stage" );
            assert.deepEqual( Object.fromEntries( rows.map( ( row ) => [ `${ row.kind } ${ row.stage }`, row.n ] ) ), {
                "code-list production": 182, "code-list retired": 473, "nomenclatures retired": 9,
                "rules production": 1, "rules retired": 16, "module production": 1, "module retired": 27
            } );
            assert.deepEqual( [ report.stored.length, report.specs, report.retired, report.entries ], [ 184, 185, 525, 1289 ] );
            const total = [ imported.nomenclatures, imported.rules, ...imported.modules ].reduce( ( sum, result ) => sum + result.anomalies.length, 0 );
            assert.equal( report.anomalies.blocking + report.anomalies.warning, total );
            assert.equal( report.anomalies.blocking, 17 );
        } );

        it( "loads e-Prescription 1.5.1 exactly as the importer reads it", async () => {
            const loaded = await versionOf( "e-prescription", "production" );
            assert.deepEqual( loaded.content, withoutNotes( imported.modules[ 0 ].version ) );
            assert.deepEqual( [ loaded.content.messages.length, loaded.content.conditions.length, loaded.frozen ], [ 23, 38, true ] );
        } );

        it( "keeps CL011 whole, and the duplicate keys of CL096 and CL127 as blocking anomalies", async () => {
            assert.equal( ( await versionOf( "CL011", "production" ) ).content.list.entries.length, 39005 );
            assert.deepEqual( [ await blocking( "CL096" ), await blocking( "CL127" ) ], [ 1, 16 ] );
        } );

        it( "stores the catalogue it bound the module with", async () => {
            assert.match( await readSetting( db(), "blueprint-catalogue" ), /^[0-9a-f]{64}$/ );
            assert.ok( ( await versionOf( "e-prescription", "production" ) ).content.blueprintBindings.length > 0 );
        } );
    } );
}
