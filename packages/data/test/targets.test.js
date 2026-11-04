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
 * What an edit is checked against (design record §4.8, §5.4): the lists and rules its version reads, and the blueprint
 * catalogue; a frozen one is read once.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, freezeVersion, storeVersion } = require( "#versions" );
const { memoryStore, storeCatalogue } = require( "#files" );
const { loadTargets } = require( "#targets" );
const { eachDatabase } = require( "./support/databases" );
const { codeListVersion, moduleVersion, rulesVersion } = require( "./support/models" );

// The model names CL009, CL035 and RL001; this one names CL011 instead of CL035.
const naming = ( version ) => {
    const content = moduleVersion( version );
    content.messages[ 0 ].elements[ 0 ].children[ 1 ].children[ 1 ].codeList = "CL011";
    return content;
};

const catalogue = { blueprints: [ { key: "patient", name: "Patient", types: [ "patient" ] } ], published: { patient: "patient" } };

eachDatabase( "Targets", ( db ) => {

    const store = memoryStore();
    let developmentModule;
    let developmentRules;
    let frozenList;
    before( async () => {
        await migrateSchema( db() );
        for ( const [ id, kind ] of [ [ "CL009", "code-list" ], [ "CL011", "code-list" ], [ "CL999", "code-list" ], [ "rules", "rules" ], [ "e-prescription", "module" ] ] ) {
            await ensureSpec( db(), id, kind );
        }
        await storeVersion( db(), { spec: "CL009", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL009", [ "1", "2" ] ) } );
        await storeVersion( db(), { spec: "CL009", kind: "code-list", number: null, stage: "development", content: codeListVersion( "CL009", [ "1", "2", "3" ], null ) } );
        frozenList = await storeVersion( db(), { spec: "CL011", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL011", [ "A00.1" ] ) } );
        await storeVersion( db(), { spec: "CL999", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL999", [ "E001", "E002" ] ) } );
        await storeVersion( db(), { spec: "rules", kind: "rules", number: "1.1.1", stage: "production", content: rulesVersion( [ "RL001" ] ) } );
        developmentRules = await storeVersion( db(), { spec: "rules", kind: "rules", number: null, stage: "development", content: rulesVersion( [ "RL001", "RL002" ], null ) } );
        developmentModule = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: null, stage: "development", content: naming( null ) } );
        await storeCatalogue( db(), store, catalogue );
    } );

    it( "gives a development module the lists in development or further on, and the catalogue", async () => {
        const targets = await loadTargets( db(), store, developmentModule );
        assert.deepEqual( targets.codeLists.map( ( list ) => [ list.id, list.entries.length ] ), [ [ "CL009", 3 ], [ "CL011", 1 ] ] );
        assert.equal( targets.rules.rules[ 0 ].id, "RL001" );
        assert.deepEqual( targets.catalogue, catalogue );
    } );

    it( "gives a rules version CL999 as resolved for it", async () => {
        const targets = await loadTargets( db(), store, developmentRules );
        assert.deepEqual( targets.codeLists.map( ( list ) => [ list.id, list.entries.length ] ), [ [ "CL999", 2 ] ] );
        assert.equal( targets.rules, null );
    } );

    // Frozen only now: the first test read it unfrozen, which is not kept.
    it( "reads a frozen list once, however many edits ask", async () => {
        await freezeVersion( db(), frozenList );
        let reads = 0;
        const counting = {
            get: ( sql, params ) => db().get( sql, params ),
            run: ( sql, params ) => db().run( sql, params ),
            batch: ( statements ) => db().batch( statements ),
            all: ( sql, params ) => {
                reads += /FROM items/.test( sql ) && params[ 0 ] === frozenList ? 1 : 0;
                return db().all( sql, params );
            }
        };
        await loadTargets( counting, store, developmentModule );
        await loadTargets( counting, store, developmentModule );
        assert.equal( reads, 1 );
    } );
} );
