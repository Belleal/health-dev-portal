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
 * History (design record §2, §4.1, §4.7): every version a workbook's notes name is kept, a version the portal does not
 * hold as a retired one with only its changelog.
 */

const { before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, findVersion, storeContent, storeVersion } = require( "#versions" );
const { compareNumbers, loadChangelog, storeHistory } = require( "#changelog" );
const { eachDatabase } = require( "./support/databases" );
const { rulesVersion } = require( "./support/models" );

const note = ( text, category, row ) => ( { category: category, text: text, source: { sheet: "Change Notes", row: row } } );
const change = ( version, stagingDate, productionDate, notes ) => ( { version: version, stagingDate: stagingDate, productionDate: productionDate, notes: notes,
    source: { sheet: "Change Notes", row: notes[ 0 ].source.row - 1 } } );

describe( "compareNumbers", () => {

    it( "compares dotted numbers part by part, as numbers", () => {
        assert.ok( compareNumbers( "1.5.10", "1.5.9" ) > 0 );
        assert.ok( compareNumbers( "1.10.0", "1.9.9" ) > 0 );
        assert.equal( compareNumbers( "1.5.1", "1.5.1" ), 0 );
        assert.ok( compareNumbers( "1.5", "1.5.1" ) < 0 );
    } );
} );

eachDatabase( "Changelog", ( db ) => {

    let production;
    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "rules", "rules" );
        production = await storeVersion( db(), { spec: "rules", kind: "rules", number: "1.1.1", stage: "production", content: rulesVersion( [ "RL001" ] ) } );
    } );
    const history = [
        change( "1.0.9", "2025-01-10", "2025-02-01", [ note( "Добавено бизнес правило RL001", "non-breaking", 3 ) ] ),
        change( "1.0.10", null, null, [ note( "Коригирано RL001", "breaking", 5 ) ] ),
        change( "1.1.1", null, null, [ note( "Добавено RL095", "non-breaking", 7 ), note( "Отпаднал план", "dropped-plan", 8 ) ] )
    ];

    it( "keeps every version's notes, retiring the versions it does not have", async () => {
        assert.deepEqual( await storeHistory( db(), "rules", "rules", history ), { retired: 2, entries: 4 } );
        const log = await loadChangelog( db(), "rules" );
        assert.deepEqual( log.map( ( version ) => [ version.number, version.stage ] ), [ [ "1.1.1", "production" ], [ "1.0.10", "retired" ], [ "1.0.9", "retired" ] ] );
        assert.equal( log[ 0 ].version, production );
        assert.deepEqual( log[ 0 ].entries.map( ( entry ) => [ entry.category, entry.origin, entry.text_bg, entry.text_en ] ),
            [ [ "non-breaking", "imported", "Добавено RL095", null ], [ "dropped-plan", "imported", "Отпаднал план", null ] ] );
        assert.deepEqual( log[ 0 ].entries[ 0 ].source, { sheet: "Change Notes", row: 7 } );
    } );

    it( "changes nothing the second time", async () => {
        assert.deepEqual( await storeHistory( db(), "rules", "rules", history ), { retired: 0, entries: 0 } );
    } );

    // A retired version keeps only its changelog (design record §4.1); stored unfrozen, it took content (final review).
    it( "freezes a retired version it creates, so it never takes content", async () => {
        const retired = await findVersion( db(), "rules", { number: "1.0.9" } );
        assert.equal( retired.frozen, true );
        await assert.rejects( storeContent( db(), retired.id, rulesVersion( [ "RL001" ], "1.0.9" ), [] ), { name: "FrozenVersionError" } );
    } );

    it( "records a retired version's dates", async () => {
        const retired = await findVersion( db(), "rules", { number: "1.0.9" } );
        const rows = await db().all( "SELECT stage, entered_on FROM version_stages WHERE version_id = ?", [ retired.id ] );
        assert.deepEqual( Object.fromEntries( rows.map( ( row ) => [ row.stage, row.entered_on ] ) ),
            { retired: null, testing: "2025-01-10", production: "2025-02-01" } );
    } );

    it( "attaches the newest notes of a development workbook to its unnumbered version", async () => {
        const development = await storeVersion( db(), { spec: "rules", kind: "rules", number: null, stage: "development", content: rulesVersion( [ "RL001", "RL096" ], null ) } );
        await storeHistory( db(), "rules", "rules", [ change( "1.2.0", null, null, [ note( "Добавено RL096", "non-breaking", 9 ) ] ) ], { number: "1.2.0", version: development } );
        const log = await loadChangelog( db(), "rules" );
        assert.deepEqual( [ log[ 0 ].number, log[ 0 ].stage ], [ null, "development" ] );
        assert.deepEqual( log[ 0 ].entries.map( ( entry ) => entry.text_bg ), [ "Добавено RL096" ] );
        assert.equal( await findVersion( db(), "rules", { number: "1.2.0" } ), null );
    } );

    it( "keeps both blocks of a version the notes head twice", async () => {
        // Nomenclatures 1.5.33 heads 1.3.12 twice (its "versions-out-of-order" anomaly).
        await ensureSpec( db(), "nomenclatures", "nomenclatures" );
        const twice = [ change( "1.3.12", null, null, [ note( "Първи блок", "non-breaking", 20 ) ] ), change( "1.3.12", null, null, [ note( "Втори блок", "non-breaking", 30 ) ] ) ];
        assert.deepEqual( await storeHistory( db(), "nomenclatures", "nomenclatures", twice ), { retired: 1, entries: 2 } );
        assert.deepEqual( ( await loadChangelog( db(), "nomenclatures" ) )[ 0 ].entries.map( ( entry ) => entry.text_bg ), [ "Първи блок", "Втори блок" ] );
    } );
} );
