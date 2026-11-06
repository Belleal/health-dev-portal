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
 * Submitting a release and its rounds (design record §7.3–§7.4): a release under review is read-only, a blocking anomaly
 * or an open conflict keeps a version out, and each round keeps the changelog as submitted.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, loadItems, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { addChangelogEntry } = require( "#changelog" );
const { applyEdits, recheckVersion } = require( "#editing" );
const { listReleases, loadRelease, submitRelease, submitRound } = require( "#releases" );
const { eachDatabase, interleaved } = require( "./support/databases" );
const { ACTOR, APPROVER, BY_EDITOR, NOW, cleanModule } = require( "./support/lifecycle" );
const { codeListVersion, moduleVersion } = require( "./support/models" );

const SUMMARY = Object.freeze( { bg: "Нова версия", en: null } );
const reasons = ( error ) => error.reasons.map( ( reason ) => [ reason.version, reason.rule ] );

eachDatabase( "Releases", ( db ) => {

    const store = memoryStore();
    const versions = {};
    const developing = async ( spec, kind, content ) => {
        await ensureSpec( db(), spec, kind );
        const id = await storeVersion( db(), { spec: spec, kind: kind, number: null, stage: "development", content: content } );
        await recheckVersion( db(), store, id );
        return id;
    };
    const anEdit = async ( version ) => {
        const row = ( await loadItems( db(), version ) ).find( ( candidate ) => candidate.identity === "contents/lrn" );
        return { op: "update", item: row.item_no, revision: row.revision, data: { ...JSON.parse( row.data ), description: { bg: "ново", en: null } } };
    };

    before( async () => {
        await migrateSchema( db() );
        versions.module = await developing( "e-prescription", "module", cleanModule( "e-prescription", null ) );
        versions.list = await developing( "CL009", "code-list", codeListVersion( "CL009", [ "1", "2" ], null ) );
        // The model repeats contents/note@value, a blocking anomaly (HEL-19).
        versions.defective = await developing( "e-defective", "module", { ...moduleVersion( null ), spec: "e-defective" } );
        versions.conflicted = await developing( "e-conflicted", "module", cleanModule( "e-conflicted", null ) );
        await db().run( "INSERT INTO conflicts ( id, version_id, item_key, created_at ) VALUES ( 'c', ?, 'element:P001:contents/lrn#1', ? )",
            [ versions.conflicted, NOW.toISOString() ] );
        versions.other = await developing( "e-referral", "module", cleanModule( "e-referral", null ) );
        await addChangelogEntry( db(), versions.module, { category: "breaking", textBg: "Ново съобщение", textEn: null } );
    } );

    it( "submits development versions as one release, under review and read-only", async () => {
        versions.release = await submitRelease( db(), { versions: [ versions.module, versions.list ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        const loaded = await loadRelease( db(), versions.release );
        assert.deepEqual( [ loaded.status, loaded.summary, loaded.rounds.length, loaded.rounds[ 0 ].number, loaded.rounds[ 0 ].submittedBy, loaded.rounds[ 0 ].submittedAt ],
            [ "review", SUMMARY, 1, 1, ACTOR, NOW.toISOString() ] );
        assert.deepEqual( loaded.versions.map( ( version ) => version.id ).sort(), [ versions.module, versions.list ].sort() );
        const snapshot = loaded.rounds[ 0 ].versions.find( ( version ) => version.version === versions.module );
        assert.ok( snapshot.changelog.some( ( entry ) => entry.text_bg === "Ново съобщение" ) );
        assert.deepEqual( loaded.events.map( ( event ) => [ event.event, event.actor ] ), [ [ "submitted", ACTOR ] ] );
        await assert.rejects( applyEdits( db(), store, versions.module, [ await anEdit( versions.module ) ], BY_EDITOR ), { name: "UnderReviewError" } );
    } );

    it( "refuses a version with a blocking anomaly or an open conflict, one already released, and two of one spec, saying which", async () => {
        await assert.rejects( submitRelease( db(), { versions: [ versions.defective, versions.conflicted, versions.module ], summary: SUMMARY, actor: ACTOR, now: NOW } ),
            ( error ) => error.name === "SubmissionRefusedError" && assert.deepEqual( reasons( error ),
                [ [ versions.defective, "blocking" ], [ versions.conflicted, "conflict" ], [ versions.module, "released" ] ] ) === undefined );
        const second = await storeVersion( db(), { spec: "e-referral", kind: "module", number: "1.0.0", stage: "production", content: cleanModule( "e-referral", "1.0.0" ) } );
        await assert.rejects( submitRelease( db(), { versions: [ versions.other, second ], summary: SUMMARY, actor: ACTOR, now: NOW } ),
            ( error ) => assert.deepEqual( reasons( error ), [ [ second, "stage" ], [ second, "spec" ] ] ) === undefined );
    } );

    // Two submissions at once both find the version free; under its lock only one may take it.
    it( "gives a version to one of two submissions made at once, and refuses the other", async () => {
        const free = await developing( "e-contested", "module", cleanModule( "e-contested", null ) );
        let first;
        await assert.rejects( submitRelease( interleaved( db(), async () => {
            first = await submitRelease( db(), { versions: [ free ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        } ), { versions: [ free ], summary: SUMMARY, actor: ACTOR, now: NOW } ),
        ( error ) => error.name === "SubmissionRefusedError" && assert.deepEqual( reasons( error ), [ [ free, "released" ] ] ) === undefined );
        assert.equal( ( await db().get( "SELECT release_id FROM versions WHERE id = ?", [ free ] ) ).release_id, first );
        await db().run( "UPDATE releases SET status = 'abandoned' WHERE id = ?", [ first ] );
    } );

    it( "lists the approver's queue and the releases returned to an editor", async () => {
        assert.deepEqual( ( await listReleases( db(), { status: "review" } ) ).map( ( release ) => release.id ), [ versions.release ] );
        // Returned by the approver, as Task 5's returnRelease does.
        await db().run( "UPDATE releases SET status = 'returned' WHERE id = ?", [ versions.release ] );
        await db().run( "UPDATE rounds SET decision = 'returned', decided_by = ?, decided_at = ? WHERE release_id = ?", [ APPROVER, NOW.toISOString(), versions.release ] );
        assert.deepEqual( ( await listReleases( db(), { status: "returned", submittedBy: ACTOR } ) ).map( ( release ) => release.id ), [ versions.release ] );
        assert.deepEqual( await listReleases( db(), { status: "returned", submittedBy: "someone@example.test" } ), [] );
        assert.deepEqual( await listReleases( db(), { status: "review" } ), [] );
    } );

    it( "submits another round of a returned release, and refuses one with nothing new for an accepted release", async () => {
        await applyEdits( db(), store, versions.module, [ await anEdit( versions.module ) ], BY_EDITOR );
        assert.equal( await submitRound( db(), versions.release, { actor: ACTOR, now: NOW } ), 2 );
        const loaded = await loadRelease( db(), versions.release );
        assert.deepEqual( [ loaded.status, loaded.rounds.map( ( round ) => round.number ) ], [ "review", [ 1, 2 ] ] );
        await assert.rejects( submitRound( db(), versions.release, { actor: ACTOR, now: NOW } ),
            ( error ) => error.name === "SubmissionRefusedError" && error.reasons[ 0 ].rule === "open" );
        // Accepted, with nothing pending in implementation and nothing added: there is nothing to review.
        await db().run( "UPDATE releases SET status = 'accepted' WHERE id = ?", [ versions.release ] );
        await db().run( "UPDATE versions SET stage = 'implementation', number = '1.0.0', approved_hash = content_hash WHERE id = ?", [ versions.list ] );
        await db().run( "UPDATE versions SET stage = 'implementation', number = '1.0.0', approved_hash = content_hash WHERE id = ?", [ versions.module ] );
        await assert.rejects( submitRound( db(), versions.release, { actor: ACTOR, now: NOW } ),
            ( error ) => error.name === "SubmissionRefusedError" && error.reasons[ 0 ].rule === "nothing" );
    } );
} );
