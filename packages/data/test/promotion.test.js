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
 * Promoting releases (design record §7.1, §7.3, §7.6, §7.7): to testing, which freezes and sets the planned date; to
 * production, on or after that date in Sofia, the replaced version going to previous production or retiring.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { checkContent } = require( "@health-dev-portal/importer/check" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, findVersion, loadItems, loadVersion, storeContent, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { applyEdits, recheckVersion } = require( "#editing" );
const { startDevelopment } = require( "#development" );
const { loadRelease, submitRelease, submitRound, withdrawVersion } = require( "#releases" );
const { approveRelease, returnRelease } = require( "#review" );
const { promoteReleases, retirePreviousProduction, setPlannedDate } = require( "#promotion" );
const { eachDatabase } = require( "./support/databases" );
const { ACTOR, APPROVER, BY_EDITOR, NOW, cleanModule } = require( "./support/lifecycle" );
const { codeListVersion } = require( "./support/models" );

const SUMMARY = Object.freeze( { bg: "Версия", en: null } );
const BY_APPROVER = Object.freeze( { actor: APPROVER, now: NOW } );
const rules = ( error ) => error.refusals.map( ( refusal ) => refusal.rule ).sort();
const refused = ( expected ) => ( error ) => error.name === "PromotionRefusedError" && assert.deepEqual( rules( error ), expected ) === undefined;

// A clean module whose lrn value is coded by `list` and compared with `value` in its condition.
const needing = ( spec, number, list, value ) => {
    const content = cleanModule( spec, number );
    content.messages[ 0 ].elements[ 0 ].children[ 0 ].children[ 0 ].codeList = list;
    content.conditions[ 0 ].text = `IF 'contents.lrn'.value = '${ value }'\nTHEN 'contents.note'.required = 'R'`;
    return checkContent( "module", content, { codeLists: null, rules: null, catalogue: null } ).content;
};

eachDatabase( "Promotion", ( db ) => {

    const store = memoryStore();
    const versions = {};
    // A spec's next version taken through review into implementation: started, submitted and approved.
    const approved = async ( spec ) => {
        const version = await startDevelopment( db(), store, spec );
        const release = await submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, release, BY_APPROVER );
        return { version: version, release: release };
    };
    const production = async ( spec, number, content ) => {
        await ensureSpec( db(), spec, "module" );
        return storeVersion( db(), { spec: spec, kind: "module", number: number, stage: "production", content: content || cleanModule( spec, number ) } );
    };

    before( async () => {
        await migrateSchema( db() );
        versions.first = await production( "e-prescription", "1.5.1" );
        Object.assign( versions, await approved( "e-prescription" ) );
    } );

    it( "promotes to testing, freezing each version with what it resolves to, and sets the planned date", async () => {
        await promoteReleases( db(), store, [ versions.release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
        const version = await loadVersion( db(), versions.version );
        assert.deepEqual( [ version.stage, version.frozen ], [ "testing", true ] );
        const release = await loadRelease( db(), versions.release );
        assert.deepEqual( [ release.noticeDays, release.plannedOn ], [ 30, "2026-12-05" ] );
        assert.ok( release.events.some( ( event ) => event.event === "promoted" && event.details.to === "testing" && event.actor === APPROVER ) );
        const row = ( await loadItems( db(), versions.version ) )[ 0 ];
        await assert.rejects( applyEdits( db(), store, versions.version, [ { op: "update", item: row.item_no, revision: row.revision, data: JSON.parse( row.data ) } ], BY_EDITOR ),
            { name: "TypeError" } );
    } );

    it( "refuses testing while changes are pending or a round is open", async () => {
        await production( "e-pending", "1.0.0" );
        const { version, release } = await approved( "e-pending" );
        const lrn = ( await loadItems( db(), version ) ).find( ( row ) => row.identity === "contents/lrn" );
        await applyEdits( db(), store, version, [ { op: "update", item: lrn.item_no, revision: lrn.revision,
            data: { ...JSON.parse( lrn.data ), description: { bg: "чака", en: null } } } ], BY_EDITOR );
        await assert.rejects( promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } ), refused( [ "pending" ] ) );
    } );

    it( "promotes two releases that need each other together, and refuses the module alone", async () => {
        // CL070 adds key 3 in its next version; e-Needs' next version compares with 3. Each goes through review on its own.
        await ensureSpec( db(), "CL070", "code-list" );
        await storeVersion( db(), { spec: "CL070", kind: "code-list", number: "1.0.0", stage: "production", content: codeListVersion( "CL070", [ "1", "2" ], "1.0.0" ) } );
        await production( "e-needs", "1.0.0", needing( "e-needs", "1.0.0", "CL070", "1" ) );
        const list = await storeVersion( db(), { spec: "CL070", kind: "code-list", number: null, stage: "development", content: codeListVersion( "CL070", [ "1", "2", "3" ], null ) } );
        await recheckVersion( db(), store, list );
        const module = await storeVersion( db(), { spec: "e-needs", kind: "module", number: null, stage: "development", content: needing( "e-needs", null, "CL070", "3" ) } );
        await recheckVersion( db(), store, module );
        const listRelease = await submitRelease( db(), { versions: [ list ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        const moduleRelease = await submitRelease( db(), { versions: [ module ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, listRelease, BY_APPROVER );
        await approveRelease( db(), store, moduleRelease, BY_APPROVER );
        await assert.rejects( promoteReleases( db(), store, [ moduleRelease ], { to: "testing", noticeDays: 30, ...BY_APPROVER } ), refused( [ "link" ] ) );
        await promoteReleases( db(), store, [ moduleRelease, listRelease ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
        assert.deepEqual( [ ( await loadVersion( db(), module ) ).stage, ( await loadVersion( db(), list ) ).stage ], [ "testing", "testing" ] );
    } );

    it( "takes a change across a list and a module of one release in one round, and promotes them together", async () => {
        // CL071 and e-Cochange are in implementation in one release; one minor change gives CL071 key 3 and has e-Cochange
        // compare with it. Read as approved, the list had no key 3, and the module's own change was blocking (final
        // review of plan 6b, I6): the list's pending change goes to review in the same round, so the module reads it.
        await ensureSpec( db(), "CL071", "code-list" );
        await storeVersion( db(), { spec: "CL071", kind: "code-list", number: "1.0.0", stage: "production", content: codeListVersion( "CL071", [ "1", "2" ], "1.0.0" ) } );
        await production( "e-cochange", "1.0.0", needing( "e-cochange", "1.0.0", "CL071", "1" ) );
        const list = await startDevelopment( db(), store, "CL071" );
        const module = await startDevelopment( db(), store, "e-cochange" );
        const release = await submitRelease( db(), { versions: [ list, module ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, release, BY_APPROVER );
        await storeContent( db(), list, codeListVersion( "CL071", [ "1", "2", "3" ], ( await loadVersion( db(), list ) ).number ), [], BY_EDITOR );
        await recheckVersion( db(), store, list );
        await storeContent( db(), module, needing( "e-cochange", ( await loadVersion( db(), module ) ).number, "CL071", "3" ), [], BY_EDITOR );
        const anomalies = await recheckVersion( db(), store, module );
        assert.deepEqual( anomalies.filter( ( anomaly ) => anomaly.level === "blocking" ).map( ( anomaly ) => anomaly.type ), [] );
        assert.equal( await submitRound( db(), release, BY_EDITOR ), 2 );
        await approveRelease( db(), store, release, BY_APPROVER );
        await promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
        assert.deepEqual( [ ( await loadVersion( db(), list ) ).stage, ( await loadVersion( db(), module ) ).stage ], [ "testing", "testing" ] );
    } );

    it( "checks a module against a list of another release as approved, not its pending changes", async () => {
        await ensureSpec( db(), "CL072", "code-list" );
        await storeVersion( db(), { spec: "CL072", kind: "code-list", number: "1.0.0", stage: "production", content: codeListVersion( "CL072", [ "1", "2" ], "1.0.0" ) } );
        await production( "e-apart", "1.0.0", needing( "e-apart", "1.0.0", "CL072", "1" ) );
        const list = await startDevelopment( db(), store, "CL072" );
        const module = await startDevelopment( db(), store, "e-apart" );
        for ( const version of [ list, module ] ) {
            await approveRelease( db(), store, await submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: ACTOR, now: NOW } ), BY_APPROVER );
        }
        await storeContent( db(), list, codeListVersion( "CL072", [ "1", "2", "3" ], ( await loadVersion( db(), list ) ).number ), [], BY_EDITOR );
        await storeContent( db(), module, needing( "e-apart", ( await loadVersion( db(), module ) ).number, "CL072", "3" ), [], BY_EDITOR );
        const anomalies = await recheckVersion( db(), store, module );
        assert.ok( anomalies.some( ( anomaly ) => anomaly.level === "blocking" ), JSON.stringify( anomalies.map( ( anomaly ) => anomaly.type ) ) );
    } );

    it( "refuses production before the planned date, and after a moved date allows it, keeping the replaced version as previous production", async () => {
        const previous = { [ versions.first ]: "2027-06-30" };
        await assert.rejects( promoteReleases( db(), store, [ versions.release ], { to: "production", previous: previous, ...BY_APPROVER } ), refused( [ "date" ] ) );
        await assert.rejects( promoteReleases( db(), store, [ versions.release ], { to: "production", ...BY_APPROVER, now: new Date( "2026-12-05T10:00:00Z" ) } ),
            refused( [ "previous" ] ) );
        await setPlannedDate( db(), versions.release, { plannedOn: "2026-11-05", ...BY_APPROVER } );
        await promoteReleases( db(), store, [ versions.release ], { to: "production", previous: previous, ...BY_APPROVER } );
        assert.equal( ( await findVersion( db(), "e-prescription", { stage: "production" } ) ).id, versions.version );
        const kept = await db().get( "SELECT stage, expires_on FROM versions WHERE id = ?", [ versions.first ] );
        assert.deepEqual( kept, { stage: "previous-production", expires_on: "2027-06-30" } );
    } );

    it( "retires the version in previous production when a newer one takes its place, or when staff retire it", async () => {
        const next = await approved( "e-prescription" );
        await promoteReleases( db(), store, [ next.release ], { to: "testing", noticeDays: 0, ...BY_APPROVER } );
        await promoteReleases( db(), store, [ next.release ], { to: "production", previous: { [ versions.version ]: "2027-12-31" }, ...BY_APPROVER } );
        assert.equal( ( await loadVersion( db(), versions.first ) ).stage, "retired" );
        assert.equal( ( await loadVersion( db(), versions.version ) ).stage, "previous-production" );
        await retirePreviousProduction( db(), versions.version, BY_APPROVER );
        assert.equal( ( await loadVersion( db(), versions.version ) ).stage, "retired" );
        await assert.rejects( retirePreviousProduction( db(), next.version, BY_APPROVER ), { name: "TypeError" } );
    } );

    // Joining a release in testing, a version went to production under the release's date, with no notice period of its
    // own (final review of plan 6b, I3).
    it( "refuses a version joining a release that has gone past implementation", async () => {
        await production( "e-host", "1.0.0" );
        const host = await approved( "e-host" );
        await promoteReleases( db(), store, [ host.release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
        await production( "e-late", "1.0.0" );
        const late = await startDevelopment( db(), store, "e-late" );
        await assert.rejects( submitRound( db(), host.release, { add: [ late ], ...BY_EDITOR } ),
            ( error ) => error.name === "SubmissionRefusedError" && assert.deepEqual( error.reasons.map( ( reason ) => [ reason.version, reason.rule ] ), [ [ late, "past" ] ] ) === undefined );
    } );

    // A version added by a round that was returned held its release for good: nothing took it out (final review, I4).
    it( "holds a release whose added version is not approved, until the version is withdrawn", async () => {
        await production( "e-held", "1.0.0" );
        await production( "e-added", "1.0.0" );
        const { release } = await approved( "e-held" );
        const added = await startDevelopment( db(), store, "e-added" );
        await submitRound( db(), release, { add: [ added ], ...BY_EDITOR } );
        await returnRelease( db(), release, { comments: [ { text: "Не сега." } ], ...BY_APPROVER } );
        await assert.rejects( promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } ), refused( [ "waiting" ] ) );
        await withdrawVersion( db(), added, BY_EDITOR );
        assert.equal( ( await loadVersion( db(), added ) ).release, null );
        await promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
        // Free again, the version goes into a release of its own.
        await submitRelease( db(), { versions: [ added ], summary: SUMMARY, actor: ACTOR, now: NOW } );
    } );

    it( "abandons a release whose only versions were withdrawn", async () => {
        await production( "e-alone", "1.0.0" );
        const alone = await startDevelopment( db(), store, "e-alone" );
        const release = await submitRelease( db(), { versions: [ alone ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await assert.rejects( withdrawVersion( db(), alone, BY_EDITOR ), { name: "UnderReviewError" } );
        await returnRelease( db(), release, { comments: [ { text: "Не." } ], ...BY_APPROVER } );
        await withdrawVersion( db(), alone, BY_EDITOR );
        assert.equal( ( await loadRelease( db(), release ) ).status, "abandoned" );
    } );

    it( "promotes on the planned date in Sofia, whatever the UTC date", async () => {
        await production( "e-sofia", "1.0.0" );
        const { release } = await approved( "e-sofia" );
        await promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: 0, ...BY_APPROVER } );
        await setPlannedDate( db(), release, { plannedOn: "2026-12-11", ...BY_APPROVER } );
        const first = ( await findVersion( db(), "e-sofia", { stage: "production" } ) ).id;
        const options = { to: "production", previous: { [ first ]: null } };
        // 23:30 on 10.12 in Sofia: still the day before.
        await assert.rejects( promoteReleases( db(), store, [ release ], { ...options, actor: APPROVER, now: new Date( "2026-12-10T21:30:00Z" ) } ), refused( [ "date" ] ) );
        // 00:30 on 11.12 in Sofia, while UTC is still on 10.12.
        await promoteReleases( db(), store, [ release ], { ...options, actor: APPROVER, now: new Date( "2026-12-10T22:30:00Z" ) } );
        assert.equal( ( await loadVersion( db(), first ) ).stage, "retired" );
    } );
} );
