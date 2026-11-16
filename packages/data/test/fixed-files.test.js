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
const JSZip = require( "jszip" );
const { codeListCsv, codeListJson } = require( "@health-dev-portal/spec-model/downloads" );
const { generateXsds } = require( "@health-dev-portal/spec-model/xsd-writer" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, freezeVersion, storeVersion } = require( "#versions" );
const { memoryStore, storeFile } = require( "#files" );
const { startDevelopment } = require( "#development" );
const { submitRelease } = require( "#releases" );
const { approveRelease } = require( "#review" );
const { promoteReleases } = require( "#promotion" );
const { recordResolution } = require( "#resolution" );
const { fixedFile, fixedFilesOf, makeFixedFiles, xmldsigSchema } = require( "#fixed-files" );
const { eachDatabase, interleaved } = require( "./support/databases" );
const { ACTOR, APPROVER, NOW } = require( "./support/lifecycle" );
const { codeListVersion, moduleVersion } = require( "./support/models" );

// The support model's P001 has two `note` siblings at one path, as e-Examination 1.3.10 has (HEL-19), so messageShape
// refuses it: as P002 here it is the message that cannot be made. With one `note` it is sound.
const soundP001 = () => {
    const message = structuredClone( moduleVersion().messages[ 0 ] );
    message.elements[ 0 ].children = message.elements[ 0 ].children.slice( 0, 3 );
    return message;
};
const brokenP002 = () => ( { ...structuredClone( moduleVersion().messages[ 0 ] ), code: "P002" } );
const withdrawnP011 = () => ( { ...structuredClone( moduleVersion().messages[ 1 ] ), code: "P011", lifecycle: "withdrawn" } );

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

    it( "has a JSON and a CSV file for a code list", () => {
        assert.deepEqual( fixedFilesOf( { kind: "code-list", content: content }, null ).map( ( file ) => [ file.name, file.type ] ),
            [ [ "list.json", "application/json; charset=utf-8" ], [ "list.csv", "text/csv; charset=utf-8" ] ] );
        assert.deepEqual( fixedFilesOf( { kind: "rules", content: {} }, null ), [] );
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

    // A module version's files (plan 8b, decision 2): what it read is recorded before it freezes, as the migration does.
    const frozenModule = async ( spec, number, messages ) => {
        await ensureSpec( db(), spec, "module" );
        const id = await storeVersion( db(), { spec: spec, kind: "module", number: number, stage: "production", content: { ...moduleVersion( number ), spec: spec, messages: messages } } );
        await recordResolution( db(), id );
        await freezeVersion( db(), id );
        return id;
    };
    // Each failure the console's error stream gets while `run` runs.
    const loggedDuring = async ( run ) => {
        const error = mock.method( console, "error", () => {} );
        try {
            await run();
            return error.mock.calls.map( ( call ) => String( call.arguments[ 0 ] ) );
        } finally {
            error.mock.restore();
        }
    };
    let sound = null;
    let broken = null;

    before( async () => {
        // CL009 is an integer list. "1" stopped being valid at the very version the modules read, so it is expired there
        // (plan 8a, decision 9) and "2" is the first valid key.
        const list = codeListVersion( "CL009", [ "1", "2", "3" ], "1.5.33" );
        list.list.entries[ 0 ].validUntil = "1.5.33";
        await ensureSpec( db(), "CL009", "code-list" );
        await storeVersion( db(), { spec: "CL009", kind: "code-list", number: "1.5.33", stage: "production", frozen: true, content: list } );
        sound = await frozenModule( "e-prescription", "1.5.1", [ soundP001(), withdrawnP011() ] );
        broken = await frozenModule( "e-dental", "1.0.0", [ soundP001(), brokenP002() ] );
    } );

    it( "makes a module version's XSDs from the key types it recorded", async () => {
        const file = await fixedFile( db(), store, sound, "NHIS-P001.xsd" );
        const expected = generateXsds( { ...moduleVersion( "1.5.1" ), messages: [ soundP001(), withdrawnP011() ] }, { codeLists: [ { id: "CL009", keyType: "integer" } ] } );
        assert.deepEqual( expected.map( ( one ) => one.code ), [ "P001" ] );
        assert.equal( file.bytes.toString( "utf8" ), expected[ 0 ].text );
        assert.equal( file.type, "application/xml; charset=utf-8" );
        // lrn reads CL009, so its value is CL009's key type, xs:int (§4.10): the recorded resolution was read.
        assert.match( file.bytes.toString( "utf8" ), /type="xs:int"/ );
    } );

    it( "writes a sample's coded value as the first key not expired", async () => {
        const text = ( await fixedFile( db(), store, sound, "P001.xml" ) ).bytes.toString( "utf8" );
        assert.equal( ( await fixedFile( db(), store, sound, "P001.xml" ) ).type, "application/xml; charset=utf-8" );
        assert.match( text, /<lrn value="2"/ );
        assert.match( text, /Synthetic example from e-prescription 1\.5\.1/ );
    } );

    it( "gives a withdrawn message no files", async () => {
        assert.equal( await fixedFile( db(), store, sound, "NHIS-P011.xsd" ), null );
        assert.equal( await fixedFile( db(), store, sound, "P011.xml" ), null );
    } );

    it( "zips every file under the version's folder, with xmldsig beside the XSDs", async () => {
        const file = await fixedFile( db(), store, sound, "all.zip" );
        assert.equal( file.type, "application/zip" );
        const zip = await JSZip.loadAsync( file.bytes );
        assert.deepEqual( Object.keys( zip.files ).filter( ( name ) => !name.endsWith( "/" ) ).sort(), [
            "e-prescription-1.5.1/changelog.json", "e-prescription-1.5.1/model.json", "e-prescription-1.5.1/samples/P001.xml",
            "e-prescription-1.5.1/xsd/NHIS-P001.xsd", "e-prescription-1.5.1/xsd/xmldsig-core-schema.xsd" ] );
        assert.deepEqual( await zip.file( "e-prescription-1.5.1/xsd/xmldsig-core-schema.xsd" ).async( "nodebuffer" ), xmldsigSchema() );
        assert.equal( await zip.file( "e-prescription-1.5.1/xsd/NHIS-P001.xsd" ).async( "string" ), ( await fixedFile( db(), store, sound, "NHIS-P001.xsd" ) ).bytes.toString( "utf8" ) );
        assert.equal( JSON.parse( await zip.file( "e-prescription-1.5.1/model.json" ).async( "string" ) ).format, "nhis-module/1" );
        assert.equal( JSON.parse( await zip.file( "e-prescription-1.5.1/changelog.json" ).async( "string" ) ).format, "nhis-changelog/1" );
    } );

    it( "logs a file it cannot make, stores nothing, and answers null", async () => {
        let answer;
        const logged = await loggedDuring( async () => {
            answer = await fixedFile( db(), store, broken, "NHIS-P002.xsd" );
        } );
        assert.equal( answer, null );
        assert.equal( logged.length, 1 );
        assert.match( logged[ 0 ], new RegExp( `${ broken }.*NHIS-P002\\.xsd|NHIS-P002\\.xsd.*${ broken }` ) );
        assert.equal( await db().get( "SELECT 1 AS one FROM fixed_files WHERE version_id = ? AND name = ?", [ broken, "NHIS-P002.xsd" ] ), null );
    } );

    it( "keeps the other messages' files when one cannot be made, and makes no zip", async () => {
        await loggedDuring( async () => {
            assert.notEqual( await fixedFile( db(), store, broken, "NHIS-P001.xsd" ), null );
            assert.notEqual( await fixedFile( db(), store, broken, "P001.xml" ), null );
            assert.equal( await fixedFile( db(), store, broken, "all.zip" ), null );
        } );
        assert.equal( await db().get( "SELECT 1 AS one FROM fixed_files WHERE version_id = ? AND name = ?", [ broken, "all.zip" ] ), null );
    } );

    it( "makes every file a module version can have at once, and leaves out the ones it cannot", async () => {
        await loggedDuring( () => makeFixedFiles( db(), store, broken ) );
        assert.deepEqual( await names( broken ), [ "NHIS-P001.xsd", "P001.xml", "changelog.json", "model.json" ] );
    } );

    // Final review of plan 8b: a database that fails while a file's inputs are read is no generator's failure. Caught as
    // one, it was a 404 cached for a minute, and the message's tab said the file could not be made.
    it( "lets a failure to read a version's inputs propagate, storing and logging nothing", async () => {
        const fresh = await frozenModule( "e-immunization", "1.0.0", [ soundP001() ] );
        const failing = { ...interleaved( db(), null ), all: ( sql, params ) => /FROM resolutions/.test( sql )
            ? Promise.reject( new Error( "connection lost" ) ) : db().all( sql, params ) };
        for ( const name of [ "NHIS-P001.xsd", "P001.xml", "changelog.json", "all.zip" ] ) {
            const logged = await loggedDuring( () => assert.rejects( fixedFile( failing, store, fresh, name ), /connection lost/, name ) );
            assert.deepEqual( logged, [], name );
        }
        await assert.rejects( loggedDuring( () => makeFixedFiles( failing, store, fresh ) ), /connection lost/ );
        assert.deepEqual( await names( fresh ), [] );
        // Once the database answers again, the files are made.
        assert.notEqual( await fixedFile( db(), store, fresh, "NHIS-P001.xsd" ), null );
    } );

    // CodeRabbit on #4: a message its generator refuses stays refused until a deploy, yet each request for its files read
    // every list the module reads, CL011's 39,005 entries among them, and logged again: anyone could make the site do it.
    it( "remembers a file its generator could not make, and reads nothing for it again", async () => {
        const twice = await frozenModule( "e-referral", "2.0.0", [ soundP001(), brokenP002() ] );
        let reads = 0;
        const counting = { ...interleaved( db(), null ), all: ( sql, params ) => {
            reads += /FROM resolutions/.test( sql ) ? 1 : 0;
            return db().all( sql, params );
        } };
        const first = await loggedDuring( async () => assert.equal( await fixedFile( counting, store, twice, "NHIS-P002.xsd" ), null ) );
        assert.equal( first.length, 1 );
        assert.ok( reads > 0 );
        reads = 0;
        const again = await loggedDuring( async () => {
            assert.equal( await fixedFile( counting, store, twice, "NHIS-P002.xsd" ), null );
            assert.equal( await fixedFile( counting, store, twice, "NHIS-P002.xsd" ), null );
        } );
        assert.deepEqual( [ again, reads ], [ [], 0 ] );
        // The version's sound files are still made, and the zip, which needs P002, is not.
        assert.notEqual( await fixedFile( counting, store, twice, "NHIS-P001.xsd" ), null );
        assert.equal( await loggedDuring( async () => assert.equal( await fixedFile( counting, store, twice, "all.zip" ), null ) ).then( ( logged ) => logged.length ), 1 );
    } );
} );
