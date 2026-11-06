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
 * A defect found in testing goes back to implementation as a new version of the same release, and a release may be
 * abandoned (design record §7.1, §7.3, §7.6.2).
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { acceptsNumber } = require( "@health-dev-portal/spec-model/numbers" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, findVersion, loadApprovedContent, loadVersion, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { recheckVersion } = require( "#editing" );
const { startDevelopment } = require( "#development" );
const { abandonRelease, loadRelease, submitRelease } = require( "#releases" );
const { approveRelease } = require( "#review" );
const { promoteReleases } = require( "#promotion" );
const { createFix } = require( "#fixes" );
const { eachDatabase } = require( "./support/databases" );
const { ACTOR, APPROVER, NOW, cleanModule } = require( "./support/lifecycle" );
const { codeListVersion } = require( "./support/models" );

const SUMMARY = Object.freeze( { bg: "Версия", en: null } );
const BY_APPROVER = Object.freeze( { actor: APPROVER, now: NOW } );
const rules = ( error ) => error.refusals.map( ( refusal ) => refusal.rule );

eachDatabase( "Fixes", ( db ) => {

    const store = memoryStore();
    const versions = {};
    const numbersOf = async ( spec ) => ( await db().all( "SELECT number FROM versions WHERE spec_id = ? AND number IS NOT NULL", [ spec ] ) ).map( ( row ) => row.number );

    before( async () => {
        await migrateSchema( db() );
        // e-Prescription 1.6.0 and CL080's next version in testing, one release.
        await ensureSpec( db(), "e-prescription", "module" );
        await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: cleanModule( "e-prescription", "1.5.1" ) } );
        await ensureSpec( db(), "CL080", "code-list" );
        await storeVersion( db(), { spec: "CL080", kind: "code-list", number: "1.0.0", stage: "production", content: codeListVersion( "CL080", [ "1" ], "1.0.0" ) } );
        versions.module = await startDevelopment( db(), store, "e-prescription" );
        versions.list = await storeVersion( db(), { spec: "CL080", kind: "code-list", number: null, stage: "development", content: codeListVersion( "CL080", [ "1", "2" ], null ) } );
        await recheckVersion( db(), store, versions.list );
        versions.release = await submitRelease( db(), { versions: [ versions.module, versions.list ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, versions.release, { ...BY_APPROVER, numbers: { [ versions.module ]: "1.6.0" } } );
        await promoteReleases( db(), store, [ versions.release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
    } );

    it( "creates a fix of a testing version in implementation, numbered next, in the same release", async () => {
        versions.fix = await createFix( db(), store, versions.module, BY_APPROVER );
        const fix = await loadVersion( db(), versions.fix );
        assert.deepEqual( [ fix.stage, fix.number, fix.release, fix.base ], [ "implementation", "1.6.1", versions.release, versions.module ] );
        assert.deepEqual( await loadApprovedContent( db(), versions.fix ), fix.content );
        assert.equal( ( await loadVersion( db(), versions.module ) ).stage, "testing" );
        assert.ok( ( await loadRelease( db(), versions.release ) ).events.some( ( event ) => event.event === "fix-created" && event.version === versions.fix ) );
        await assert.rejects( createFix( db(), store, versions.module, BY_APPROVER ), ( error ) => error.name === "PromotionRefusedError" && rules( error )[ 0 ] === "one-line" );
    } );

    it( "holds the rest of the release in testing until its fix is there", async () => {
        await assert.rejects( promoteReleases( db(), store, [ versions.release ], { to: "production", previous: {}, ...BY_APPROVER, now: new Date( "2026-12-06T10:00:00Z" ) } ),
            ( error ) => error.name === "PromotionRefusedError" && rules( error ).includes( "waiting" ) );
    } );

    it( "promotes a fix to testing in place of the version it fixes, keeping the date", async () => {
        await promoteReleases( db(), store, [ versions.release ], { to: "testing", ...BY_APPROVER } );
        assert.deepEqual( [ ( await loadVersion( db(), versions.fix ) ).stage, ( await loadVersion( db(), versions.module ) ).stage,
            ( await loadVersion( db(), versions.list ) ).stage ], [ "testing", "retired", "testing" ] );
        assert.equal( ( await findVersion( db(), "e-prescription", { stage: "testing" } ) ).id, versions.fix );
        assert.equal( ( await loadRelease( db(), versions.release ) ).plannedOn, "2026-12-05" );
    } );

    it( "abandons a release: its versions retire, their numbers stay taken, and development's base moves back", async () => {
        await ensureSpec( db(), "e-abandon", "module" );
        const first = await storeVersion( db(), { spec: "e-abandon", kind: "module", number: "1.0.0", stage: "production", content: cleanModule( "e-abandon", "1.0.0" ) } );
        const building = await startDevelopment( db(), store, "e-abandon" );
        const release = await submitRelease( db(), { versions: [ building ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, release, BY_APPROVER );
        const next = await startDevelopment( db(), store, "e-abandon" );
        assert.equal( ( await loadVersion( db(), next ) ).base, building );
        await abandonRelease( db(), store, release, BY_APPROVER );
        assert.deepEqual( [ ( await loadVersion( db(), building ) ).stage, ( await loadVersion( db(), building ) ).frozen ], [ "retired", true ] );
        assert.equal( ( await loadRelease( db(), release ) ).status, "abandoned" );
        assert.equal( ( await loadVersion( db(), next ) ).base, first );
        assert.equal( acceptsNumber( "1.0.1", await numbersOf( "e-abandon" ) ), false );
        await assert.rejects( abandonRelease( db(), store, versions.release, { ...BY_APPROVER } ).then( () => abandonRelease( db(), store, versions.release, BY_APPROVER ) ),
            { name: "TypeError" } );
    } );
} );
