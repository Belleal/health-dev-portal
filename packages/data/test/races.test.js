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
 * Two writes on one release or version at once, really at once: a second PostgreSQL connection holds a row lock until
 * both are in flight. A guard read before the batch took its lock let both through (final review of plan 6b, I1);
 * SQLite serialises writers, so there these are skipped.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, loadVersion, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { startDevelopment } = require( "#development" );
const { loadRelease, submitRelease } = require( "#releases" );
const { approveRelease, returnRelease } = require( "#review" );
const { eachDatabase, holding } = require( "./support/databases" );
const { ACTOR, APPROVER, NOW, cleanModule } = require( "./support/lifecycle" );

const SUMMARY = Object.freeze( { bg: "Версия", en: null } );
const pause = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) );
const settled = ( promise ) => promise.then( ( value ) => ( { ok: true, value: value } ), ( error ) => ( { ok: false, error: error } ) );

eachDatabase( "Races", ( db ) => {

    const store = memoryStore();
    const developing = async ( spec ) => {
        await ensureSpec( db(), spec, "module" );
        await storeVersion( db(), { spec: spec, kind: "module", number: "1.0.0", stage: "production", content: cleanModule( spec, "1.0.0" ) } );
        return startDevelopment( db(), store, spec );
    };

    before( async () => migrateSchema( db() ) );

    it( "lets one of an approval and a return made at once decide the round, and refuses the other", async ( t ) => {
        const version = await developing( "race-a" );
        const release = await submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: ACTOR, now: NOW } );
        const round = await db().get( "SELECT id FROM rounds WHERE release_id = ?", [ release ] );
        const free = await holding( db(), "UPDATE rounds SET decision = decision WHERE id = $1", [ round.id ] );
        if ( !free ) {
            t.skip( "SQLite serialises writers" );
            return;
        }
        const approving = settled( approveRelease( db(), store, release, { actor: APPROVER, now: NOW } ) );
        await pause( 500 );
        const returning = settled( returnRelease( db(), release, { comments: [ { text: "Назад." } ], actor: "second@example.test", now: NOW } ) );
        await pause( 500 );
        await free();
        const results = [ await approving, await returning ];
        assert.equal( results.filter( ( result ) => result.ok ).length, 1, JSON.stringify( results.map( ( result ) => result.ok || result.error.message ) ) );
        const loaded = await loadRelease( db(), release );
        const stage = ( await loadVersion( db(), version ) ).stage;
        assert.ok( ( loaded.status === "accepted" && stage === "implementation" ) || ( loaded.status === "returned" && stage === "development" ), `${ loaded.status } ${ stage }` );
        assert.equal( loaded.events.filter( ( event ) => event.event === "approved" || event.event === "returned" ).length, 1 );
    } );

    it( "gives a version to one of two submissions made at once, and refuses the other", async ( t ) => {
        const version = await developing( "race-b" );
        const free = await holding( db(), "UPDATE versions SET frozen = frozen WHERE id = $1", [ version ] );
        if ( !free ) {
            t.skip( "SQLite serialises writers" );
            return;
        }
        const first = settled( submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: ACTOR, now: NOW } ) );
        await pause( 500 );
        const second = settled( submitRelease( db(), { versions: [ version ], summary: SUMMARY, actor: "other@example.test", now: NOW } ) );
        await pause( 500 );
        await free();
        const results = [ await first, await second ];
        const won = results.filter( ( result ) => result.ok );
        assert.equal( won.length, 1, JSON.stringify( results.map( ( result ) => result.ok || result.error.message ) ) );
        assert.equal( ( await loadVersion( db(), version ) ).release, won[ 0 ].value );
        assert.equal( results.find( ( result ) => !result.ok ).error.name, "SubmissionRefusedError" );
    } );
} );
