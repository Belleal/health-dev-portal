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
 * An approved change in implementation reaches the development version (design record §7.8, plan 6a decision 10): what
 * development has not touched takes the change, and what it has becomes a conflict for the editor. The tests run in
 * order on one spec.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { checkContent } = require( "@health-dev-portal/importer/check" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, loadItems, loadVersion, storeContent, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { loadChangelog } = require( "#changelog" );
const { applyEdits } = require( "#editing" );
const { startDevelopment } = require( "#development" );
const { carryChange, listConflicts, resolveConflict } = require( "#carry" );
const { eachDatabase } = require( "./support/databases" );
const { moduleVersion } = require( "./support/models" );

const imported = ( number ) => checkContent( "module", moduleVersion( number ), { codeLists: [], rules: null, catalogue: null } ).content;

eachDatabase( "Carry", ( db ) => {

    const store = memoryStore();
    let implementation;
    let development;
    let beforeChange;
    let afterChange;
    const developmentContent = async () => ( await loadVersion( db(), development ) ).content;

    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "e-prescription", "module" );
        implementation = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.6.0", stage: "implementation", content: imported( "1.6.0" ) } );
        development = await startDevelopment( db(), store, "e-prescription" );
        // Development edits contents/lrn's description.
        const lrn = ( await loadItems( db(), development ) ).find( ( row ) => row.identity === "contents/lrn" );
        await applyEdits( db(), store, development, [ { op: "update", item: lrn.item_no, revision: lrn.revision,
            data: { ...JSON.parse( lrn.data ), description: { bg: "редактирано", en: null } } } ] );
        // The approved change in implementation: contents/lrn's maxLength, and contents/dose's name.
        beforeChange = ( await loadVersion( db(), implementation ) ).content;
        afterChange = structuredClone( beforeChange );
        afterChange.messages[ 0 ].elements[ 0 ].children[ 0 ].constraint = { raw: "max=50, chars=an", maxLength: 50, charset: "an" };
        afterChange.messages[ 0 ].elements[ 0 ].children[ 1 ].name = { bg: "Доза", en: "Dose" };
        await storeContent( db(), implementation, afterChange, [] );
    } );

    it( "applies a change the development version has not touched, and records a conflict where it has", async () => {
        const result = await carryChange( db(), store, "e-prescription", beforeChange, afterChange, implementation );
        assert.deepEqual( result, { applied: 1, conflicts: 1 } );
        const [ conflict ] = await listConflicts( db(), development );
        assert.equal( conflict.key, "element:P001:contents/lrn#1" );
        assert.deepEqual( [ conflict.base.constraint.maxLength, conflict.upstream.constraint.maxLength, conflict.current.description.bg ], [ 36, 50, "редактирано" ] );
        assert.deepEqual( ( await developmentContent() ).messages[ 0 ].elements[ 0 ].children[ 1 ].name, afterChange.messages[ 0 ].elements[ 0 ].children[ 1 ].name );
        // The development item is untouched: still its own description and the old maxLength.
        const lrn = ( await developmentContent() ).messages[ 0 ].elements[ 0 ].children[ 0 ];
        assert.deepEqual( [ lrn.description.bg, lrn.constraint.maxLength ], [ "редактирано", 36 ] );
    } );

    it( "adds nothing to the development changelog for an applied change, since its base now holds it", async () => {
        const keys = ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries.map( ( e ) => e.difference_key );
        assert.ok( !keys.includes( "element:P001:contents/dose@value#1|name" ) );
    } );

    it( "carries an added and a removed element, and keeps one conflict per item", async () => {
        const next = structuredClone( afterChange );
        const contents = next.messages[ 0 ].elements[ 0 ];
        contents.children.splice( 3, 1 );
        contents.children.push( { ...contents.children[ 2 ], identity: "contents/added@value", source: null, children: [] } );
        contents.children[ 0 ].constraint = { raw: "max=60, chars=an", maxLength: 60, charset: "an" };
        await storeContent( db(), implementation, next, [] );
        assert.deepEqual( await carryChange( db(), store, "e-prescription", afterChange, next, implementation ), { applied: 2, conflicts: 1 } );
        const children = ( await developmentContent() ).messages[ 0 ].elements[ 0 ].children.map( ( child ) => child.identity );
        assert.deepEqual( children, [ "contents/lrn", "contents/dose@value", "contents/note@value", "contents/added@value" ] );
        const conflicts = await listConflicts( db(), development );
        assert.deepEqual( conflicts.map( ( conflict ) => [ conflict.key, conflict.upstream.constraint.maxLength ] ), [ [ "element:P001:contents/lrn#1", 60 ] ] );
        afterChange = next;
    } );

    it( "resolves a conflict by the editor's choice", async () => {
        const [ conflict ] = await listConflicts( db(), development );
        await resolveConflict( db(), store, conflict.id, { choose: "upstream" } );
        assert.equal( ( await developmentContent() ).messages[ 0 ].elements[ 0 ].children[ 0 ].constraint.maxLength, 60 );
        assert.deepEqual( await listConflicts( db(), development ), [] );
    } );

    it( "does nothing for a spec without a development version", async () => {
        await ensureSpec( db(), "e-referral", "module" );
        assert.deepEqual( await carryChange( db(), store, "e-referral", afterChange, afterChange, implementation ), { applied: 0, conflicts: 0 } );
    } );
} );
