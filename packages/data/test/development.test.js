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
 * Starting the next development version from the most advanced one, and the workbook route into it (design record §7.1,
 * §7.11). The tests run in order on one spec.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { checkContent } = require( "@health-dev-portal/importer/check" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, findVersion, loadAnomalies, loadItems, loadVersion, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { loadChangelog } = require( "#changelog" );
const { loadIntoDevelopment, startDevelopment } = require( "#development" );
const { eachDatabase } = require( "./support/databases" );
const { codeListVersion, moduleVersion } = require( "./support/models" );

// Stored as the importer stores it: the derived parts as checkContent makes them, against nothing, since none of the lists
// the model names is stored here either.
const imported = ( number ) => checkContent( "module", moduleVersion( number ), { codeLists: [], rules: null, catalogue: null } ).content;

eachDatabase( "Development", ( db ) => {

    const store = memoryStore();
    let testing;
    let development;
    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "e-prescription", "module" );
        await ensureSpec( db(), "CL011", "code-list" );
        await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: imported( "1.5.1" ) } );
        testing = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.6.0", stage: "testing", content: imported( "1.6.0" ) } );
        await storeVersion( db(), { spec: "CL011", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL011", [ "A00.1" ] ) } );
    } );

    it( "starts from the most advanced version, its defects included", async () => {
        // e-Prescription: 1.5.1 in production, 1.6.0 in testing; 1.6.0 repeats contents/note@value.
        development = await startDevelopment( db(), store, "e-prescription" );
        const started = await findVersion( db(), "e-prescription", { stage: "development" } );
        assert.deepEqual( [ started.id, started.number, started.base ], [ development, null, testing ] );
        assert.deepEqual( ( await loadVersion( db(), development ) ).content, { ...( await loadVersion( db(), testing ) ).content, version: null } );
        assert.ok( ( await loadAnomalies( db(), development ) ).some( ( a ) => a.type === "duplicate-identity" && a.level === "blocking" ) );
    } );

    it( "refuses a second development version", async () => {
        await assert.rejects( startDevelopment( db(), store, "e-prescription" ), { name: "TypeError" } );
    } );

    it( "lets one of two starts at once through, and refuses the other plainly", async () => {
        await ensureSpec( db(), "e-referral", "module" );
        await storeVersion( db(), { spec: "e-referral", kind: "module", number: "1.0.0", stage: "production", content: { ...imported( "1.0.0" ), spec: "e-referral" } } );
        const results = await Promise.allSettled( [ startDevelopment( db(), store, "e-referral" ), startDevelopment( db(), store, "e-referral" ) ] );
        assert.deepEqual( results.map( ( result ) => result.status ).sort(), [ "fulfilled", "rejected" ] );
        assert.equal( results.find( ( result ) => result.status === "rejected" ).reason.name, "TypeError" );
    } );

    it( "loads a workbook into development, changing only what differs", async () => {
        const before = await loadItems( db(), development );
        const workbook = { ...( await loadVersion( db(), development ) ).content, changeNotes: [] };
        workbook.messages[ 0 ].elements[ 0 ].children[ 0 ].description = { bg: "от работната книга", en: null };
        await loadIntoDevelopment( db(), store, "e-prescription", workbook );
        const raised = ( await loadItems( db(), development ) ).filter( ( row ) => row.revision > ( before.find( ( r ) => r.item_no === row.item_no ) || { revision: 0 } ).revision );
        assert.deepEqual( raised.map( ( row ) => row.identity ), [ "contents/lrn" ] );
        assert.ok( ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries.some( ( e ) => e.difference_key === "element:P001:contents/lrn#1|description" ) );
    } );

    it( "starts a development version for a workbook when there is none, and for a spec that has nothing yet", async () => {
        await loadIntoDevelopment( db(), store, "CL011", { ...codeListVersion( "CL011", [ "A00.1", "A00.2" ], null ), changeNotes: [] } );
        const list = await findVersion( db(), "CL011", { stage: "development" } );
        assert.equal( list.base, ( await findVersion( db(), "CL011", { stage: "production" } ) ).id );
        assert.deepEqual( ( await loadChangelog( db(), "CL011" ) )[ 0 ].entries.map( ( e ) => e.difference_key ), [ "entry:A00.2#1|added" ] );
        const { anomalies } = await loadIntoDevelopment( db(), store, "CL777", { ...codeListVersion( "CL777", [ "1", "1" ], null ), changeNotes: [] } );
        assert.equal( ( await findVersion( db(), "CL777", { stage: "development" } ) ).base, null );
        assert.ok( anomalies.some( ( a ) => a.type === "duplicate-key" ) );
    } );
} );
