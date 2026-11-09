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
 * The fixed files of a published version (plan 8a, decision 8): made once, kept, and never changed.
 */

const { before, it, mock } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { codeListCsv, codeListJson } = require( "@health-dev-portal/spec-model/downloads" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, storeVersion } = require( "#versions" );
const { memoryStore, storeFile } = require( "#files" );
const { startDevelopment } = require( "#development" );
const { submitRelease } = require( "#releases" );
const { approveRelease } = require( "#review" );
const { promoteReleases } = require( "#promotion" );
const { FIXED_FILES, fixedFile, makeFixedFiles } = require( "#fixed-files" );
const { eachDatabase, interleaved } = require( "./support/databases" );
const { ACTOR, APPROVER, NOW } = require( "./support/lifecycle" );
const { codeListVersion } = require( "./support/models" );

const BY_APPROVER = Object.freeze( { actor: APPROVER, now: NOW } );

eachDatabase( "Fixed files", ( db ) => {

    const store = memoryStore();
    const content = codeListVersion( "CL090", [ "1", "2" ], "1.0.0" );
    const names = async ( versionId ) => ( await db().all( "SELECT name FROM fixed_files WHERE version_id = ?", [ versionId ] ) ).map( ( row ) => row.name ).sort();
    // A frozen public list as a migration leaves it: in production, with no file made.
    const frozenList = async ( spec, stage = "production" ) => {
        await ensureSpec( db(), spec, "code-list" );
        return storeVersion( db(), { spec: spec, kind: "code-list", number: "1.0.0", stage: stage, frozen: true, content: codeListVersion( spec, [ "1", "2" ], "1.0.0" ) } );
    };

    before( async () => {
        await migrateSchema( db() );
    } );

    it( "has a JSON and a CSV file for a code list, and none for the other kinds yet", () => {
        assert.deepEqual( FIXED_FILES[ "code-list" ].map( ( file ) => [ file.name, file.type ] ),
            [ [ "list.json", "application/json; charset=utf-8" ], [ "list.csv", "text/csv; charset=utf-8" ] ] );
        assert.equal( FIXED_FILES.module, undefined );
    } );

    it( "makes a frozen version's files on first request and keeps them", async () => {
        const id = await frozenList( "CL090" );
        const first = await fixedFile( db(), store, id, "list.json" );
        const again = await fixedFile( db(), store, id, "list.json" );
        assert.equal( first.hash, again.hash );
        assert.equal( first.type, "application/json; charset=utf-8" );
        assert.equal( first.bytes.toString( "utf8" ), codeListJson( { ...content, spec: "CL090" } ) );
        assert.deepEqual( await names( id ), [ "list.json" ] );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM files WHERE hash = ?", [ first.hash ] ), { n: 1 } );
        const csv = await fixedFile( db(), store, id, "list.csv" );
        assert.equal( csv.bytes.toString( "utf8" ), codeListCsv( content ) );
        assert.deepEqual( [ ...csv.bytes.subarray( 0, 3 ) ], [ 0xEF, 0xBB, 0xBF ] );
        assert.deepEqual( await names( id ), [ "list.csv", "list.json" ] );
    } );

    it( "has no file the kind does not make", async () => {
        const id = await frozenList( "CL091" );
        assert.equal( await fixedFile( db(), store, id, "list.xml" ), null );
        assert.equal( await fixedFile( db(), store, id, "../list.json" ), null );
        assert.deepEqual( await names( id ), [] );
    } );

    it( "reports a file whose row is kept but whose bytes are missing, naming only the version and the file", async () => {
        const id = await frozenList( "CL096" );
        const made = await fixedFile( db(), store, id, "list.json" );
        // The row stays, so the file is never made again: without a report, the download answers 404 for good and no one
        // learns why (final review, ledger line 51).
        const emptied = { ...store, get: async () => null };
        const error = mock.method( console, "error", () => {} );
        try {
            assert.equal( await fixedFile( db(), emptied, id, "list.json" ), null );
            assert.equal( error.mock.callCount(), 1 );
            const message = String( error.mock.calls[ 0 ].arguments[ 0 ] );
            assert.ok( message.includes( id ) && message.includes( "list.json" ), message );
            assert.equal( message.includes( made.hash ), false, "nothing of the data but the version and the name" );
            assert.equal( error.mock.calls[ 0 ].arguments.length, 1 );
        } finally {
            error.mock.restore();
        }
        assert.deepEqual( await names( id ), [ "list.json" ] );
    } );

    it( "refuses a version that is not public and frozen", async () => {
        await ensureSpec( db(), "CL092", "code-list" );
        const development = await storeVersion( db(), { spec: "CL092", kind: "code-list", number: null, stage: "development", content: codeListVersion( "CL092", [ "1" ], null ) } );
        const implementation = await storeVersion( db(), { spec: "CL092", kind: "code-list", number: "1.0.0", stage: "implementation", content: codeListVersion( "CL092", [ "1" ], "1.0.0" ) } );
        // Public and in production, but not frozen: its content could still change.
        const unfrozen = await storeVersion( db(), { spec: "CL092", kind: "code-list", number: "1.0.1", stage: "production", content: codeListVersion( "CL092", [ "1" ], "1.0.1" ) } );
        for ( const id of [ development, implementation, unfrozen, "no-such-version" ] ) {
            assert.equal( await fixedFile( db(), store, id, "list.json" ), null, id );
            await makeFixedFiles( db(), store, id );
            assert.deepEqual( await names( id ), [], id );
        }
    } );

    it( "makes the files of each version promoted to testing", async () => {
        await ensureSpec( db(), "CL093", "code-list" );
        await storeVersion( db(), { spec: "CL093", kind: "code-list", number: "1.0.0", stage: "production", frozen: true, content: codeListVersion( "CL093", [ "1", "2" ], "1.0.0" ) } );
        const version = await startDevelopment( db(), store, "CL093" );
        const release = await submitRelease( db(), { versions: [ version ], summary: { bg: "Версия", en: null }, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, release, BY_APPROVER );
        assert.deepEqual( await names( version ), [] );
        await promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
        assert.deepEqual( await names( version ), [ "list.csv", "list.json" ] );
    } );

    it( "does not undo a promotion when its files cannot be made, and says so", async () => {
        await ensureSpec( db(), "CL094", "code-list" );
        await storeVersion( db(), { spec: "CL094", kind: "code-list", number: "1.0.0", stage: "production", frozen: true, content: codeListVersion( "CL094", [ "1", "2" ], "1.0.0" ) } );
        const version = await startDevelopment( db(), store, "CL094" );
        const release = await submitRelease( db(), { versions: [ version ], summary: { bg: "Версия", en: null }, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, release, BY_APPROVER );
        const failing = { ...store, put: async () => {
            throw new Error( "disk full" );
        } };
        const warning = mock.method( process, "emitWarning", () => {} );
        try {
            await promoteReleases( db(), failing, [ release ], { to: "testing", noticeDays: 30, ...BY_APPROVER } );
            assert.equal( ( await db().get( "SELECT stage FROM versions WHERE id = ?", [ version ] ) ).stage, "testing" );
            assert.deepEqual( await names( version ), [] );
            assert.equal( warning.mock.callCount(), 1 );
            assert.match( String( warning.mock.calls[ 0 ].arguments[ 0 ] ), /disk full/ );
        } finally {
            warning.mock.restore();
        }
        // The site makes what is missing the first time it serves the version.
        assert.ok( await fixedFile( db(), store, version, "list.json" ) );
    } );

    it( "keeps one file when two first requests come at once", async () => {
        const id = await frozenList( "CL095" );
        // The winner's file is written between the loser's read and its batch: a different file under the same name,
        // so that the answer shows which of the two the loser read back.
        const winner = await storeFile( db(), store, Buffer.from( "winner" ), "application/json; charset=utf-8" );
        const racing = interleaved( db(), async () => {
            await db().run( "INSERT INTO fixed_files ( version_id, name, hash, created_at ) VALUES ( ?, ?, ?, ? )", [ id, "list.json", winner, NOW.toISOString() ] );
        } );
        const loser = await fixedFile( racing, store, id, "list.json" );
        assert.equal( loser.hash, winner );
        assert.equal( loser.bytes.toString( "utf8" ), "winner" );
        assert.equal( ( await fixedFile( db(), store, id, "list.json" ) ).hash, winner );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM fixed_files WHERE version_id = ? AND name = 'list.json'", [ id ] ), { n: 1 } );
    } );
} );
