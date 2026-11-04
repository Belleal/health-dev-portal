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
 * The migration (design record §7.11) from synthetic stage imports: each workbook at its stage, published ones frozen,
 * defects loaded as published, and a second run changing nothing.
 */

const { before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { findVersion, loadAnomalies, loadVersion } = require( "#versions" );
const { loadChangelog } = require( "#changelog" );
const { memoryStore } = require( "#files" );
const { formatMigrationReport, migrateImported } = require( "#migration" );
const { eachDatabase } = require( "./support/databases" );
const { stageImports } = require( "./support/models" );

const ORDER = [ "production", "testing", "development" ];

eachDatabase( "Migration", ( db ) => {

    const store = memoryStore();
    let report;
    before( async () => {
        await migrateSchema( db() );
        report = await migrateImported( db(), store, stageImports() );
    } );

    const stagesOf = async ( spec ) => ( await db().all( "SELECT number, stage, frozen FROM versions WHERE spec_id = ? AND stage <> 'retired'", [ spec ] ) )
        .map( ( row ) => [ row.number, row.stage, row.frozen === 1 ] )
        .sort( ( a, b ) => ORDER.indexOf( a[ 1 ] ) - ORDER.indexOf( b[ 1 ] ) );

    it( "stores each workbook at its stage, frozen when published", async () => {
        assert.deepEqual( await stagesOf( "e-prescription" ), [ [ "1.5.1", "production", true ], [ "1.6.0", "testing", true ], [ null, "development", false ] ] );
        assert.deepEqual( await stagesOf( "rules" ), [ [ "1.1.1", "production", true ] ] );
    } );

    it( "stores a testing list only where it differs from production", async () => {
        assert.deepEqual( await stagesOf( "CL009" ), [ [ "1.5.33", "production", true ], [ "1.5.34", "testing", true ] ] );
        assert.deepEqual( await stagesOf( "CL011" ), [ [ "1.5.33", "production", true ] ] );
    } );

    it( "starts a development version from the spec's most advanced one", async () => {
        const development = await findVersion( db(), "e-prescription", { stage: "development" } );
        assert.equal( development.base, ( await findVersion( db(), "e-prescription", { stage: "testing" } ) ).id );
        assert.equal( ( await loadVersion( db(), development.id ) ).content.messages.length, 1 );
    } );

    it( "gives each testing version a release of its own, with no dates yet", async () => {
        const releases = await db().all( "SELECT r.id, r.notice_days, r.planned_on FROM versions v JOIN releases r ON r.id = v.release_id WHERE v.stage = 'testing'" );
        assert.equal( new Set( releases.map( ( release ) => release.id ) ).size, 2 );
        assert.deepEqual( releases.map( ( release ) => [ release.notice_days, release.planned_on ] ), [ [ null, null ], [ null, null ] ] );
    } );

    it( "loads published defects as published, and records them", async () => {
        const list = await loadAnomalies( db(), ( await findVersion( db(), "CL011", { stage: "production" } ) ).id );
        assert.deepEqual( list.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.item ] ), [ [ "duplicate-key", "blocking", 4 ] ] );
        const combined = await loadAnomalies( db(), ( await findVersion( db(), "nomenclatures", { number: "1.5.33" } ) ).id );
        assert.deepEqual( combined.map( ( anomaly ) => anomaly.type ), [ "sheet-not-listed" ] );
        assert.deepEqual( report.anomalies, { blocking: 1, warning: 2 } );
    } );

    it( "keeps each spec's history, from its most advanced published workbook", async () => {
        const log = async ( spec ) => ( await loadChangelog( db(), spec ) ).map( ( version ) => [ version.number, version.stage, version.entries.map( ( entry ) => entry.text_bg ) ] );
        assert.deepEqual( await log( "CL009" ), [
            [ "1.5.34", "testing", [ "Номенклатура CL009 - добавен код 3" ] ],
            [ "1.5.33", "production", [ "Номенклатура CL009 - нов запис" ] ]
        ] );
        assert.deepEqual( await log( "nomenclatures" ), [ [ "1.5.33", "retired", [] ], [ "1.5.32", "retired", [ "Отключени съобщенията" ] ] ] );
        assert.deepEqual( ( await log( "e-prescription" ) ).map( ( version ) => version.slice( 0, 2 ) ),
            [ [ null, "development" ], [ "1.6.0", "testing" ], [ "1.5.1", "production" ], [ "1.5.0", "retired" ] ] );
        assert.deepEqual( ( await log( "e-prescription" ) )[ 0 ][ 2 ], [ "Премахнато P002" ] );
    } );

    it( "records what each module version reads", async () => {
        const testing = await findVersion( db(), "e-prescription", { stage: "testing" } );
        const rows = await db().all( "SELECT spec_id, number FROM resolutions WHERE version_id = ?", [ testing.id ] );
        // It names CL009, CL035 and RL001; no stage has CL035, which linking reports.
        assert.deepEqual( rows.map( ( row ) => [ row.spec_id, row.number ] ).sort(), [ [ "CL009", "1.5.34" ], [ "rules", "1.1.1" ] ] );
    } );

    it( "reports what it did", () => {
        assert.deepEqual( report.stored.map( ( entry ) => [ entry.spec, entry.number, entry.stage ] ), [
            [ "CL009", "1.5.33", "production" ], [ "CL011", "1.5.33", "production" ], [ "rules", "1.1.1", "production" ], [ "e-prescription", "1.5.1", "production" ],
            [ "CL009", "1.5.34", "testing" ], [ "e-prescription", "1.6.0", "testing" ], [ "e-prescription", null, "development" ]
        ] );
        // Retired: CL011 1.5.32, nomenclatures 1.5.32 and 1.5.33 (which carries the CLS01 anomaly), rules 1.1.0, e-Prescription 1.5.0.
        assert.deepEqual( [ report.specs, report.retired, report.entries ], [ 5, 5, 10 ] );
        assert.equal( formatMigrationReport( report ),
            "Stored 7 versions of 5 specs (0 skipped); 5 retired versions of history with 10 entries; anomalies: 1 blocking, 2 warnings." );
    } );

    it( "changes nothing when run again", async () => {
        const again = await migrateImported( db(), store, stageImports() );
        assert.deepEqual( [ again.stored.length, again.skipped.length, again.retired, again.entries ], [ 0, 7, 0, 0 ] );
    } );

    it( "refuses a published number whose content changed", async () => {
        const changed = stageImports();
        changed.production.rules.version.rules[ 0 ].definition.bg = "друго";
        await assert.rejects( migrateImported( db(), store, changed ), { name: "MigrationConflictError", spec: "rules", number: "1.1.1" } );
        const rules = await loadVersion( db(), ( await findVersion( db(), "rules", { number: "1.1.1" } ) ).id );
        assert.notEqual( rules.content.rules[ 0 ].definition.bg, "друго" );
    } );
} );

describe( "formatMigrationReport", () => {

    it( "groups thousands with a comma", () => {
        assert.equal( formatMigrationReport( { stored: new Array( 1234 ), skipped: [], specs: 185, retired: 525, entries: 1289, anomalies: { blocking: 17, warning: 1182 } } ),
            "Stored 1,234 versions of 185 specs (0 skipped); 525 retired versions of history with 1,289 entries; anomalies: 17 blocking, 1,182 warnings." );
    } );
} );
