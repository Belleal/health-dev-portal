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
 * The public view of the data (plan 8a, decision 2): the one rule for what is public, and what the public pages read
 * through it. States are built with the real lifecycle, so the rule is tested against what the lifecycle leaves.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { addChangelogEntry, dropChangelogEntry } = require( "#changelog" );
const { recheckVersion } = require( "#editing" );
const { startDevelopment } = require( "#development" );
const { abandonRelease, submitRelease } = require( "#releases" );
const { approveRelease } = require( "#review" );
const { promoteReleases } = require( "#promotion" );
const { createFix } = require( "#fixes" );
const { findPublished, findPublishedById, listPublished, publications, publishedChangelog, upcoming } = require( "#published" );
const { eachDatabase } = require( "./support/databases" );
const { ACTOR, APPROVER, NOW, cleanModule } = require( "./support/lifecycle" );
const { codeListVersion } = require( "./support/models" );

const SUMMARY = Object.freeze( { bg: "Версия", en: null } );
const BY_APPROVER = Object.freeze( { actor: APPROVER, now: NOW } );
const EARLIER = new Date( "2026-10-20T10:00:00Z" );

eachDatabase( "Published", ( db ) => {

    const store = memoryStore();
    const ids = {};

    const production = async ( spec, number ) => {
        await ensureSpec( db(), spec, "module" );
        return storeVersion( db(), { spec: spec, kind: "module", number: number, stage: "production", content: cleanModule( spec, number ) } );
    };
    // A development version of the spec, submitted and approved as the given number: in implementation, in an accepted release.
    const implemented = async ( spec, number, development ) => {
        const release = await submitRelease( db(), { versions: [ development ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        await approveRelease( db(), store, release, { ...BY_APPROVER, numbers: { [ development ]: number } } );
        return release;
    };
    const toTesting = ( release, noticeDays, now = NOW ) => promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: noticeDays, actor: APPROVER, now: now } );
    const published = async ( spec, number ) => findPublished( db(), spec, { number: number } );

    before( async () => {
        await migrateSchema( db() );

        // e-pub: 1.5.1 replaced by 1.5.2 in production (1.5.1 stays until 2027-04-30), and 1.6.0 in testing with changelog entries.
        ids.pubOld = await production( "e-pub", "1.5.1" );
        const second = await startDevelopment( db(), store, "e-pub" );
        const secondRelease = await implemented( "e-pub", "1.5.2", second );
        await toTesting( secondRelease, 0, EARLIER );
        await promoteReleases( db(), store, [ secondRelease ], { to: "production", previous: { [ ids.pubOld ]: "2027-04-30" }, ...BY_APPROVER } );
        const third = await startDevelopment( db(), store, "e-pub" );
        await addChangelogEntry( db(), third, { category: "breaking", textBg: "Нарушаваща промяна", textEn: "A breaking change" } );
        await addChangelogEntry( db(), third, { category: "non-breaking", textBg: "Обикновена промяна", textEn: null } );
        await dropChangelogEntry( db(), await addChangelogEntry( db(), third, { category: "breaking", textBg: "Отпаднала бележка", textEn: null } ) );
        ids.pubRelease = await implemented( "e-pub", "1.6.0", third );
        await toTesting( ids.pubRelease, 30 );

        // e-hidden: a development version, one in implementation, and one retired by an abandoned release; nothing else.
        await ensureSpec( db(), "e-hidden", "module" );
        const abandoned = await storeVersion( db(), { spec: "e-hidden", kind: "module", number: null, stage: "development", content: cleanModule( "e-hidden", null ) } );
        await recheckVersion( db(), store, abandoned );
        await abandonRelease( db(), store, await implemented( "e-hidden", "2.0.0", abandoned ), BY_APPROVER );
        ids.hiddenAbandoned = abandoned;
        ids.hiddenImplemented = await storeVersion( db(), { spec: "e-hidden", kind: "module", number: null, stage: "development", content: cleanModule( "e-hidden", null ) } );
        await recheckVersion( db(), store, ids.hiddenImplemented );
        await implemented( "e-hidden", "2.1.0", ids.hiddenImplemented );
        ids.hiddenDevelopment = await storeVersion( db(), { spec: "e-hidden", kind: "module", number: null, stage: "development", content: cleanModule( "e-hidden", null ) } );

        // e-fixed: 1.0.0 in testing, then fixed by 1.0.1.
        await production( "e-fixed", "0.9.0" );
        ids.fixedRelease = await implemented( "e-fixed", "1.0.0", await startDevelopment( db(), store, "e-fixed" ) );
        await toTesting( ids.fixedRelease, 0 );
        ids.fixedTesting = ( await published( "e-fixed", "1.0.0" ) ).id;
        ids.fix = await createFix( db(), store, ids.fixedTesting, BY_APPROVER );

        // e-undated: in testing, with no planned date.
        await production( "e-undated", "0.9.0" );
        const undatedRelease = await implemented( "e-undated", "0.9.1", await startDevelopment( db(), store, "e-undated" ) );
        await toTesting( undatedRelease, 10 );
        await db().run( "UPDATE releases SET planned_on = NULL WHERE id = ?", [ undatedRelease ] );

        // e-aband: reached testing, then its release was abandoned.
        await production( "e-aband", "0.9.0" );
        await abandonRelease( db(), store, await ( async () => {
            const release = await implemented( "e-aband", "1.0.0", await startDevelopment( db(), store, "e-aband" ) );
            await toTesting( release, 0 );
            return release;
        } )(), BY_APPROVER );

        // e-history: versions the migration kept for their changelog: one dated, one undated, one that was in implementation.
        await ensureSpec( db(), "e-history", "module" );
        await storeVersion( db(), { spec: "e-history", kind: "module", number: "0.8.0", stage: "retired", frozen: true,
            stages: [ { stage: "development", enteredOn: null }, { stage: "implementation", enteredOn: "2026-01-02" } ] } );
        await storeVersion( db(), { spec: "e-history", kind: "module", number: "0.9.0", stage: "retired", frozen: true } );
        await storeVersion( db(), { spec: "e-history", kind: "module", number: "1.0.0", stage: "retired", frozen: true,
            stages: [ { stage: "testing", enteredOn: "2026-01-10" }, { stage: "production", enteredOn: "2026-02-01" } ] } );

        // CL080 in production: a code list among the published specs.
        await ensureSpec( db(), "CL080", "code-list" );
        await storeVersion( db(), { spec: "CL080", kind: "code-list", number: "1.0.0", stage: "production", content: codeListVersion( "CL080", [ "1" ], "1.0.0" ) } );
    } );

    it( "lists each spec's versions in testing, production and previous production, with the expiry and the date each entered its stage", async () => {
        const spec = ( await listPublished( db() ) ).find( ( one ) => one.spec === "e-pub" );
        assert.deepEqual( [ spec.testing.number, spec.production.number, spec.previousProduction.number, spec.previousProduction.expiresOn ],
            [ "1.6.0", "1.5.2", "1.5.1", "2027-04-30" ] );
        assert.equal( spec.production.enteredOn, "2026-11-05" );
        assert.equal( spec.testing.enteredOn, "2026-11-05" );
        assert.deepEqual( [ spec.kind, spec.production.kind, spec.production.spec, spec.production.stage, spec.production.frozen, spec.production.retired,
            spec.production.expiresOn, spec.production.replacedBy ], [ "module", "module", "e-pub", "production", true, false, null, null ] );
        assert.deepEqual( ( await listPublished( db() ) ).map( ( one ) => one.spec ), [ "CL080", "e-aband", "e-fixed", "e-pub", "e-undated" ] );
    } );

    it( "never shows a development or implementation version, nor one abandoned before testing", async () => {
        assert.equal( ( await listPublished( db() ) ).some( ( one ) => one.spec === "e-hidden" ), false );
        for ( const number of [ "2.0.0", "2.1.0" ] ) {
            assert.equal( await findPublished( db(), "e-hidden", { number: number } ), null );
        }
        for ( const stage of [ "development", "implementation" ] ) {
            assert.equal( await findPublished( db(), "e-hidden", { stage: stage } ), null );
        }
        for ( const id of [ ids.hiddenAbandoned, ids.hiddenImplemented, ids.hiddenDevelopment, ids.fix ] ) {
            assert.equal( await findPublishedById( db(), id ), null );
        }
        assert.deepEqual( ( await publishedChangelog( db(), "e-hidden" ) ).map( ( one ) => one.number ), [] );
        assert.equal( ( await publications( db(), { limit: 1000 } ) ).some( ( one ) => one.spec === "e-hidden" ), false );
        assert.equal( ( await upcoming( db() ) ).some( ( one ) => one.versions.some( ( version ) => version.spec === "e-hidden" ) ), false );
        assert.equal( await findPublished( db(), "e-pub", { number: "9.9.9" } ), null );
        assert.equal( await findPublishedById( db(), "no-such-version" ), null );
    } );

    it( "finds a version by its stage or number with its content, and a retired one as retired, with the fix that replaced it, and no content", async () => {
        const production = await findPublished( db(), "e-pub", { stage: "production" } );
        assert.deepEqual( [ production.number, production.retired, production.content.version ], [ "1.5.2", false, "1.5.2" ] );
        assert.equal( ( await findPublishedById( db(), production.id ) ).number, "1.5.2" );
        // The fix is in implementation, so 1.0.0 is not yet replaced in the public's eyes.
        assert.deepEqual( [ ( await published( "e-fixed", "1.0.0" ) ).replacedBy, ( await published( "e-fixed", "1.0.0" ) ).retired ], [ null, false ] );
        await promoteReleases( db(), store, [ ids.fixedRelease ], { to: "testing", ...BY_APPROVER } );
        // e-fixed: 1.0.0 in testing, fixed by 1.0.1 (createFix), which was promoted and so retired 1.0.0.
        const found = await findPublished( db(), "e-fixed", { number: "1.0.0" } );
        assert.deepEqual( [ found.retired, found.replacedBy, found.content ], [ true, "1.0.1", null ] );
        assert.equal( found.stage, "retired" );
        assert.equal( ( await findPublishedById( db(), ids.fixedTesting ) ).content, null );
        const fix = await findPublishedById( db(), ids.fix );
        assert.deepEqual( [ fix.number, fix.stage, fix.retired, fix.content.version ], [ "1.0.1", "testing", false, "1.0.1" ] );
        await assert.rejects( findPublished( db(), "e-fixed", { stage: "retired" } ), { name: "TypeError" } );
    } );

    it( "gives a spec's changelog newest first, public versions only, grouped by category, without dropped entries or anyone's name", async () => {
        const versions = await publishedChangelog( db(), "e-pub" );
        assert.deepEqual( versions.map( ( one ) => one.number ), [ "1.6.0", "1.5.2", "1.5.1" ] );
        assert.deepEqual( versions.map( ( one ) => [ one.stage, one.enteredTesting, one.enteredProduction, one.replacedBy, one.abandoned ] ), [
            [ "testing", "2026-11-05", null, null, false ],
            [ "production", "2026-10-20", "2026-11-05", null, false ],
            [ "previous-production", null, null, null, false ]
        ] );
        // Previous production says until when it stays backward compatible wherever it appears (§7.6), the changelog
        // included, which had no date to say it with (final review M3).
        assert.deepEqual( versions.map( ( one ) => one.expiresOn ), [ null, null, "2027-04-30" ] );
        const entries = versions[ 0 ].entries;
        assert.deepEqual( Object.keys( entries ), [ "breaking", "dropped-plan", "non-breaking" ] );
        assert.deepEqual( entries.breaking.map( ( entry ) => entry.text ), [ { bg: "Нарушаваща промяна", en: "A breaking change" } ] );
        assert.deepEqual( entries[ "non-breaking" ].map( ( entry ) => entry.text.bg ), [ "Обикновена промяна" ] );
        assert.deepEqual( entries[ "dropped-plan" ], [] );
        assert.deepEqual( Object.keys( entries.breaking[ 0 ] ), [ "origin", "target", "aspect", "before", "after", "text" ] );
        assert.equal( entries.breaking[ 0 ].aspect, null, "an entry written by hand has no aspect" );
        // A detected entry's key ends in its aspect, after the last "|".
        const detected = ( await db().all( "SELECT e.id FROM changelog_entries e JOIN versions v ON v.id = e.version_id WHERE v.spec_id = ? AND v.number = ? AND e.text_bg = ?",
            [ "e-pub", "1.6.0", "Обикновена промяна" ] ) )[ 0 ].id;
        await db().run( "UPDATE changelog_entries SET origin = ?, difference_key = ? WHERE id = ?", [ "detected", "element:P001:a@value#1|requirement", detected ] );
        assert.equal( ( await publishedChangelog( db(), "e-pub" ) )[ 0 ].entries[ "non-breaking" ][ 0 ].aspect, "requirement" );
        await db().run( "UPDATE changelog_entries SET origin = ?, difference_key = NULL WHERE id = ?", [ "editor", detected ] );
        assert.deepEqual( [ entries.breaking[ 0 ].origin, entries.breaking[ 0 ].target, entries.breaking[ 0 ].before, entries.breaking[ 0 ].after ], [ "editor", null, null, null ] );
        const text = JSON.stringify( versions );
        assert.equal( text.includes( "Отпаднала" ), false );
        for ( const name of [ ACTOR, APPROVER, "example.test" ] ) {
            assert.equal( text.includes( name ), false );
        }
    } );

    it( "marks a version retired by an abandoned release after testing, and keeps the migrated history that was never in development or implementation", async () => {
        const aband = await publishedChangelog( db(), "e-aband" );
        assert.deepEqual( aband.map( ( one ) => [ one.number, one.stage, one.abandoned ] ), [ [ "1.0.0", "retired", true ], [ "0.9.0", "production", false ] ] );
        assert.equal( ( await findPublished( db(), "e-aband", { number: "1.0.0" } ) ).retired, true );
        const history = await publishedChangelog( db(), "e-history" );
        assert.deepEqual( history.map( ( one ) => [ one.number, one.enteredTesting, one.enteredProduction ] ), [ [ "1.0.0", "2026-01-10", "2026-02-01" ], [ "0.9.0", null, null ] ] );
        assert.equal( ( await findPublished( db(), "e-history", { number: "1.0.0" } ) ).retired, true );
        assert.equal( await findPublished( db(), "e-history", { number: "0.8.0" } ), null );
        assert.equal( ( await listPublished( db() ) ).some( ( one ) => one.spec === "e-history" ), false );
    } );

    it( "lists publications newest first from the dates each version entered testing or production", async () => {
        const all = await publications( db(), { limit: 1000 } );
        assert.deepEqual( all.filter( ( one ) => one.spec === "e-pub" ).map( ( one ) => [ one.on, one.stage, one.number ] ), [
            [ "2026-11-05", "testing", "1.6.0" ], [ "2026-11-05", "production", "1.5.2" ], [ "2026-10-20", "testing", "1.5.2" ]
        ] );
        assert.deepEqual( all.find( ( one ) => one.spec === "e-pub" ), { on: "2026-11-05", stage: "testing", spec: "e-pub", kind: "module", number: "1.6.0" } );
        assert.deepEqual( all.map( ( one ) => one.on ), all.map( ( one ) => one.on ).sort().reverse() );
        assert.equal( all.some( ( one ) => one.on === null ), false );
        assert.deepEqual( all.filter( ( one ) => one.spec === "e-history" ).map( ( one ) => [ one.on, one.stage ] ), [ [ "2026-02-01", "production" ], [ "2026-01-10", "testing" ] ] );
        assert.equal( ( await publications( db(), { limit: 2 } ) ).length, 2 );
        assert.equal( ( await publications( db() ) ).length <= 20, true );
    } );

    it( "gives the releases due in production, the dated first, with their breaking-change count", async () => {
        const due = await upcoming( db() );
        assert.deepEqual( due.map( ( one ) => [ one.plannedOn, one.versions, one.breaking ] ), [
            [ "2026-11-05", [ { spec: "e-fixed", kind: "module", number: "1.0.1", production: "0.9.0" } ], 0 ],
            [ "2026-12-05", [ { spec: "e-pub", kind: "module", number: "1.6.0", production: "1.5.2" } ], 1 ],
            [ null, [ { spec: "e-undated", kind: "module", number: "0.9.1", production: "0.9.0" } ], 0 ]
        ] );
        assert.deepEqual( Object.keys( due[ 0 ] ), [ "plannedOn", "versions", "breaking" ] );
    } );
} );
