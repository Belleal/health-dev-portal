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
 * The approver approves or returns a release (design record §7.2, §7.4, §7.8): approval numbers the versions and moves
 * them into implementation, or approves their pending changes and carries them to development; a return carries
 * comments and makes the versions editable again.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, loadApprovedContent, loadItems, loadVersion, storeVersion } = require( "#versions" );
const { memoryStore, writeSetting } = require( "#files" );
const { applyEdits, recheckVersion } = require( "#editing" );
const { startDevelopment } = require( "#development" );
const { listConflicts } = require( "#carry" );
const { loadEntries } = require( "#changelog" );
const { loadRelease, submitRelease, submitRound } = require( "#releases" );
const { approveRelease, returnRelease } = require( "#review" );
const { eachDatabase, followedBy } = require( "./support/databases" );
const { ACTOR, APPROVER, BY_EDITOR, NOW, cleanModule } = require( "./support/lifecycle" );

const SUMMARY = Object.freeze( { bg: "Версия", en: null } );
const BY_APPROVER = Object.freeze( { actor: APPROVER, now: NOW } );
const lrnOf = ( content ) => content.messages[ 0 ].elements[ 0 ].children[ 0 ];

eachDatabase( "Review", ( db ) => {

    const store = memoryStore();
    const versions = {};
    const developing = async ( spec ) => {
        await ensureSpec( db(), spec, "module" );
        const id = await storeVersion( db(), { spec: spec, kind: "module", number: null, stage: "development", content: cleanModule( spec, null ) } );
        await recheckVersion( db(), store, id );
        return id;
    };
    const editLrn = async ( version, change ) => {
        const row = ( await loadItems( db(), version ) ).find( ( candidate ) => candidate.identity === "contents/lrn" );
        await applyEdits( db(), store, version, [ { op: "update", item: row.item_no, revision: row.revision, data: change( JSON.parse( row.data ) ) } ], BY_EDITOR );
    };

    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "e-prescription", "module" );
        await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: cleanModule( "e-prescription", "1.5.1" ) } );
        versions.development = await startDevelopment( db(), store, "e-prescription" );
        versions.release = await submitRelease( db(), { versions: [ versions.development ], summary: SUMMARY, actor: ACTOR, now: NOW } );
    } );

    it( "approves a first round into implementation with the numbers proposed", async () => {
        await approveRelease( db(), store, versions.release, BY_APPROVER );
        const version = await loadVersion( db(), versions.development );
        assert.deepEqual( [ version.stage, version.number ], [ "implementation", "1.5.2" ] );
        assert.deepEqual( await loadApprovedContent( db(), versions.development ), version.content );
        const release = await loadRelease( db(), versions.release );
        assert.deepEqual( [ release.status, release.rounds[ 0 ].decision, release.rounds[ 0 ].decidedBy ], [ "accepted", "approved", APPROVER ] );
        assert.deepEqual( release.events.map( ( event ) => event.event ), [ "submitted", "approved" ] );
        assert.deepEqual( await db().get( "SELECT entered_on FROM version_stages WHERE version_id = ? AND stage = 'implementation'", [ versions.development ] ),
            { entered_on: "2026-11-05" } );
    } );

    it( "waits for a clear line, and keeps the release under review", async () => {
        await ensureSpec( db(), "e-busy", "module" );
        await storeVersion( db(), { spec: "e-busy", kind: "module", number: "2.0.0", stage: "testing", content: cleanModule( "e-busy", "2.0.0" ) } );
        const busy = await developing( "e-busy" );
        const release = await submitRelease( db(), { versions: [ busy ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await assert.rejects( approveRelease( db(), store, release, { ...BY_APPROVER, numbers: { [ busy ]: "1.0.0" } } ),
            ( error ) => error.name === "PromotionRefusedError" && assert.deepEqual( error.refusals.map( ( refusal ) => refusal.rule ).sort(), [ "number", "one-line" ] ) === undefined );
        assert.equal( ( await loadRelease( db(), release ) ).status, "review" );
    } );

    it( "approves pending changes, carries them to development, and returns a release they conflict with", async () => {
        // The next development version, under review, has changed lrn too.
        const next = await startDevelopment( db(), store, "e-prescription" );
        await editLrn( next, ( data ) => ( { ...data, description: { bg: "развитие", en: null } } ) );
        const nextRelease = await submitRelease( db(), { versions: [ next ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        // A change in implementation, submitted as the release's second round and approved.
        await editLrn( versions.development, ( data ) => ( { ...data, cardinality: { min: 0, max: 1 }, requirement: "O" } ) );
        assert.equal( await submitRound( db(), versions.release, BY_EDITOR ), 2 );
        const { carried } = await approveRelease( db(), store, versions.release, BY_APPROVER );
        assert.deepEqual( carried.map( ( one ) => [ one.version, one.applied, one.conflicts ] ), [ [ versions.development, 0, 1 ] ] );
        assert.equal( lrnOf( await loadApprovedContent( db(), versions.development ) ).cardinality.min, 0 );
        assert.equal( ( await listConflicts( db(), next ) ).length, 1 );
        const returned = await loadRelease( db(), nextRelease );
        assert.equal( returned.status, "returned" );
        assert.match( returned.rounds[ 0 ].comments[ 0 ].text, /e-prescription 1\.5\.2/ );
    } );

    it( "returns a release with comments on the whole and on one element, and makes it editable again", async () => {
        const version = await developing( "e-returned" );
        const release = await submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await assert.rejects( returnRelease( db(), release, { ...BY_APPROVER, comments: [ { version: version, target: "element:P001:contents/none#1", text: "?" } ] } ),
            { name: "TypeError" } );
        await returnRelease( db(), release, { ...BY_APPROVER, comments: [ { text: "Като цяло добре." },
            { version: version, target: "element:P001:contents/lrn#1", text: "Описанието е неясно." } ] } );
        const loaded = await loadRelease( db(), release );
        assert.deepEqual( [ loaded.status, loaded.rounds[ 0 ].decision ], [ "returned", "returned" ] );
        assert.deepEqual( loaded.rounds[ 0 ].comments.map( ( comment ) => [ comment.number, comment.version, comment.target, comment.author ] ),
            [ [ 1, null, null, APPROVER ], [ 2, version, "element:P001:contents/lrn#1", APPROVER ] ] );
        await editLrn( version, ( data ) => ( { ...data, description: { bg: "Ясно", en: null } } ) );
    } );

    // Pending changes in implementation stay apart from the approved content until approved (§7.4, §7.8): a development
    // version starts from, compares against and is carried only the approved content (final review of plan 6b, I2).
    const approvedInImplementation = async ( spec ) => {
        await ensureSpec( db(), spec, "module" );
        await storeVersion( db(), { spec: spec, kind: "module", number: "1.0.0", stage: "production", content: cleanModule( spec, "1.0.0" ) } );
        const version = await startDevelopment( db(), store, spec );
        const release = await submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, release, BY_APPROVER );
        return { version: version, release: release };
    };
    const UNAPPROVED = Object.freeze( { bg: "НЕОДОБРЕНО", en: null } );

    it( "starts the next development version from the approved content, not the pending changes", async () => {
        const { version } = await approvedInImplementation( "e-start" );
        const approved = lrnOf( await loadApprovedContent( db(), version ) ).description;
        await editLrn( version, ( data ) => ( { ...data, description: UNAPPROVED } ) );
        const next = await startDevelopment( db(), store, "e-start" );
        assert.deepEqual( lrnOf( ( await loadVersion( db(), next ) ).content ).description, approved );
    } );

    it( "writes a development version's changelog against its base's approved content", async () => {
        const { version } = await approvedInImplementation( "e-base" );
        const next = await startDevelopment( db(), store, "e-base" );
        await editLrn( version, ( data ) => ( { ...data, description: UNAPPROVED } ) );
        const contents = ( await loadItems( db(), next ) ).find( ( row ) => row.identity === "contents" );
        await applyEdits( db(), store, next, [ { op: "update", item: contents.item_no, revision: contents.revision,
            data: { ...JSON.parse( contents.data ), description: { bg: "развитие", en: null } } } ], BY_EDITOR );
        assert.deepEqual( ( await loadEntries( db(), next ) ).map( ( entry ) => entry.target_identity ), [ "contents" ] );
    } );

    it( "carries the approved content to development, not an edit made after the approval", async () => {
        const { version, release } = await approvedInImplementation( "e-carry" );
        const next = await startDevelopment( db(), store, "e-carry" );
        const approved = Object.freeze( { bg: "одобрено", en: null } );
        await editLrn( version, ( data ) => ( { ...data, description: approved } ) );
        await submitRound( db(), release, BY_EDITOR );
        // The editor's next edit lands after the approval's batch and before its carry.
        const deciding = ( statements ) => statements.some( ( statement ) => statement.sql.startsWith( "UPDATE rounds SET decision" ) );
        await approveRelease( followedBy( db(), deciding, () => editLrn( version, ( data ) => ( { ...data, description: UNAPPROVED } ) ) ), store, release, BY_APPROVER );
        assert.deepEqual( lrnOf( await loadApprovedContent( db(), version ) ).description, approved );
        assert.deepEqual( lrnOf( ( await loadVersion( db(), next ) ).content ).description, approved );
    } );

    it( "refuses self-approval only when two people are required", async () => {
        const version = await developing( "e-self" );
        const release = await submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: APPROVER, now: NOW } );
        await writeSetting( db(), "review.two-people", "on" );
        await assert.rejects( approveRelease( db(), store, release, BY_APPROVER ), { name: "SelfApprovalError" } );
        await writeSetting( db(), "review.two-people", "off" );
        await approveRelease( db(), store, release, BY_APPROVER );
        assert.equal( ( await loadVersion( db(), version ) ).number, "1.0.0" );
    } );
} );
