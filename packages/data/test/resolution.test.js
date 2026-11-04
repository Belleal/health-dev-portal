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
 * What a module version reads (design record §4.8): each list and the rules in its own stage, else the nearest further
 * on; recorded, and frozen with the version.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, freezeVersion, storeVersion } = require( "#versions" );
const { recordResolution, resolveVersion } = require( "#resolution" );
const { eachDatabase } = require( "./support/databases" );
const { codeListVersion, moduleVersion, rulesVersion } = require( "./support/models" );

// The model names CL009, CL035 and RL001; here its second variant names CL011 instead of CL035.
const naming = ( version ) => {
    const content = moduleVersion( version );
    content.messages[ 0 ].elements[ 0 ].children[ 1 ].children[ 1 ].codeList = "CL011";
    return content;
};

eachDatabase( "Resolution", ( db ) => {

    let developmentModule;
    let productionModule;
    before( async () => {
        await migrateSchema( db() );
        for ( const [ id, kind ] of [ [ "CL009", "code-list" ], [ "CL011", "code-list" ], [ "rules", "rules" ], [ "e-prescription", "module" ] ] ) {
            await ensureSpec( db(), id, kind );
        }
        await storeVersion( db(), { spec: "CL009", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL009", [ "1", "2" ] ) } );
        await storeVersion( db(), { spec: "CL009", kind: "code-list", number: null, stage: "development", content: codeListVersion( "CL009", [ "1", "2", "3" ], null ) } );
        await storeVersion( db(), { spec: "CL011", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL011", [ "A00.1" ] ) } );
        await storeVersion( db(), { spec: "rules", kind: "rules", number: "1.1.1", stage: "production", content: rulesVersion( [ "RL001" ] ) } );
        developmentModule = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: null, stage: "development", content: naming( null ) } );
        productionModule = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: naming( "1.5.1" ) } );
    } );

    it( "reads each list in the module's stage, else further on", async () => {
        assert.deepEqual( ( await resolveVersion( db(), developmentModule ) ).map( ( r ) => [ r.spec, r.number, r.keyType ] ),
            [ [ "CL009", null, "integer" ], [ "CL011", "1.5.33", "string" ], [ "rules", "1.1.1", null ] ] );
        assert.deepEqual( ( await resolveVersion( db(), productionModule ) ).map( ( r ) => [ r.spec, r.number ] ),
            [ [ "CL009", "1.5.33" ], [ "CL011", "1.5.33" ], [ "rules", "1.1.1" ] ] );
    } );

    it( "records what it read", async () => {
        const recorded = await recordResolution( db(), developmentModule );
        const rows = await db().all( "SELECT spec_id, resolved_id, number, key_type FROM resolutions WHERE version_id = ?", [ developmentModule ] );
        assert.deepEqual( rows.map( ( row ) => [ row.spec_id, row.resolved_id, row.number, row.key_type ] ).sort(),
            recorded.map( ( r ) => [ r.spec, r.version, r.number, r.keyType ] ).sort() );
        await recordResolution( db(), developmentModule );
        assert.equal( ( await db().get( "SELECT COUNT(*) AS n FROM resolutions WHERE version_id = ?", [ developmentModule ] ) ).n, 3 );
    } );

    it( "keeps a frozen version's record when what it read moves on", async () => {
        await recordResolution( db(), productionModule );
        await freezeVersion( db(), productionModule );
        await db().run( "UPDATE versions SET stage = 'retired' WHERE spec_id = 'CL009' AND number = '1.5.33'" );
        await storeVersion( db(), { spec: "CL009", kind: "code-list", number: "1.5.34", stage: "production", content: codeListVersion( "CL009", [ "1", "2", "4" ], "1.5.34" ) } );
        assert.deepEqual( ( await resolveVersion( db(), productionModule ) ).map( ( r ) => [ r.spec, r.number ] ),
            [ [ "CL009", "1.5.33" ], [ "CL011", "1.5.33" ], [ "rules", "1.1.1" ] ] );
        await assert.rejects( recordResolution( db(), productionModule ), { name: "FrozenVersionError" } );
    } );

    it( "leaves out a spec no stage has", async () => {
        // contents/lrn names CL404 in place of CL009; no stage has it.
        const content = naming( null );
        content.messages[ 0 ].elements[ 0 ].children[ 0 ].codeList = "CL404";
        await ensureSpec( db(), "e-referral", "module" );
        const id = await storeVersion( db(), { spec: "e-referral", kind: "module", number: null, stage: "development", content: { ...content, spec: "e-referral" } } );
        assert.deepEqual( ( await resolveVersion( db(), id ) ).map( ( r ) => r.spec ), [ "CL011", "rules" ] );
    } );
} );
