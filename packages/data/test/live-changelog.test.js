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
 * The changelog written while editing (design record §7.5, plan 6a decision 9): one detected entry per difference from
 * the base, reconciled after every edit, the editor's corrections kept. The tests run in order on one development
 * version whose base is the production one.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, freezeVersion, loadItems, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { addChangelogEntry, dropChangelogEntry, editChangelogEntry, loadChangelog, restoreChangelogEntry, storeHistory } = require( "#changelog" );
const { applyEdits } = require( "#editing" );
const { eachDatabase } = require( "./support/databases" );
const { moduleVersion } = require( "./support/models" );

const LRN = "element:P001:contents/lrn#1|cardinality";
const DOSE = "element:P001:contents/dose@value#1|name";

eachDatabase( "Live changelog", ( db ) => {

    const store = memoryStore();
    let production;
    let development;
    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "e-prescription", "module" );
        production = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: moduleVersion() } );
        development = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: null, stage: "development", content: moduleVersion( null ), base: production } );
        // A development workbook's own notes, attached as plan 5 attaches them.
        await storeHistory( db(), "e-prescription", "module", [ { version: "1.6.0", stagingDate: null, productionDate: null,
            notes: [ { category: "non-breaking", text: "Ново поле", source: { sheet: "Change Notes", row: 7 } } ] } ], { number: "1.6.0", version: development } );
    } );

    // Each builder reads the item's current revision, as an editor's screen would.
    const updating = async ( kind, identity, change ) => {
        const row = ( await loadItems( db(), development ) ).find( ( candidate ) => candidate.kind === kind && candidate.identity === identity );
        return { op: "update", item: row.item_no, revision: row.revision, data: change( JSON.parse( row.data ) ) };
    };
    const raiseMinimumOfLrn = () => updating( "element", "contents/lrn", ( data ) => ( { ...data, cardinality: { min: 2, max: 2 } } ) );
    const raiseMaximumOfLrnToo = () => updating( "element", "contents/lrn", ( data ) => ( { ...data, cardinality: { min: 2, max: 3 } } ) );
    const restoreLrnCardinality = () => updating( "element", "contents/lrn", ( data ) => ( { ...data, cardinality: { min: 1, max: 1 } } ) );
    const changeDoseName = () => updating( "element", "contents/dose@value", ( data ) => ( { ...data, name: { ...data.name, bg: "Доза" } } ) );
    const restoreDoseName = () => updating( "element", "contents/dose@value", ( data ) => ( { ...data, name: { ...data.name, bg: null } } ) );
    let unrelated = 0;
    const unrelatedEdit = () => updating( "dictionary", "ЛРН", ( data ) => ( { ...data, description: { bg: `Номер ${ ++unrelated }`, en: null } } ) );

    const entriesOf = async () => ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries;
    const entryOf = async ( key ) => ( await entriesOf() ).find( ( entry ) => entry.difference_key === key );

    it( "writes a detected entry for each difference as the editor edits", async () => {
        await applyEdits( db(), store, development, [ await raiseMinimumOfLrn() ] );
        const entries = ( await entriesOf() ).filter( ( entry ) => entry.origin !== "imported" );
        assert.deepEqual( entries.map( ( e ) => [ e.difference_key, e.category, e.origin ] ), [ [ LRN, "breaking", "detected" ] ] );
    } );

    it( "keeps the editor's explanation and category when the same difference changes again", async () => {
        await editChangelogEntry( db(), ( await entryOf( LRN ) ).id, { category: "non-breaking", textBg: "Задължително поле" } );
        await applyEdits( db(), store, development, [ await raiseMaximumOfLrnToo() ] );
        const entry = await entryOf( LRN );
        assert.deepEqual( [ entry.origin, entry.category, entry.text_bg, entry.after_value !== null ], [ "edited", "non-breaking", "Задължително поле", true ] );
        assert.deepEqual( JSON.parse( entry.after_value ), { min: 2, max: 3 } );
    } );

    it( "removes a detected entry whose difference is gone, and flags an edited one", async () => {
        await applyEdits( db(), store, development, [ await restoreLrnCardinality() ] );
        const entry = await entryOf( LRN );
        assert.deepEqual( [ entry.origin, entry.flagged ], [ "edited", true ] );
        await applyEdits( db(), store, development, [ await changeDoseName() ] );
        await applyEdits( db(), store, development, [ await restoreDoseName() ] );
        assert.equal( await entryOf( DOSE ), undefined );
    } );

    it( "keeps a dropped entry, marked dropped, and restores it", async () => {
        await applyEdits( db(), store, development, [ await changeDoseName() ] );
        const dropped = await entryOf( DOSE );
        await dropChangelogEntry( db(), dropped.id );
        await applyEdits( db(), store, development, [ await unrelatedEdit() ] );
        assert.deepEqual( [ ( await entryOf( DOSE ) ).dropped, ( await entryOf( DOSE ) ).origin ], [ true, "edited" ] );
        await restoreChangelogEntry( db(), dropped.id );
        assert.equal( ( await entryOf( DOSE ) ).dropped, false );
    } );

    it( "keeps imported entries as they are", async () => {
        // A development workbook's own notes, attached by plan 5, are not differences and are never reconciled away.
        const imported = ( await entriesOf() ).filter( ( e ) => e.origin === "imported" );
        assert.equal( imported.length, 1 );
        await applyEdits( db(), store, development, [ await unrelatedEdit() ] );
        assert.deepEqual( ( await entriesOf() ).filter( ( e ) => e.origin === "imported" ), imported );
    } );

    it( "adds an editor's own entry last, which no edit takes away", async () => {
        const id = await addChangelogEntry( db(), development, { category: "breaking", textBg: "Сменен адрес", textEn: null, target: "message", identity: "P001" } );
        await applyEdits( db(), store, development, [ await unrelatedEdit() ] );
        const entries = await entriesOf();
        const added = entries.find( ( entry ) => entry.id === id );
        assert.deepEqual( [ added.origin, added.category, added.target_identity, added.flagged ], [ "editor", "breaking", "P001", false ] );
        assert.equal( added.position_no, Math.max( ...entries.filter( ( entry ) => entry.id !== id ).map( ( entry ) => entry.position_no ) ) + 1 );
    } );

    it( "refuses to write the changelog of a frozen version", async () => {
        await freezeVersion( db(), production );
        await assert.rejects( addChangelogEntry( db(), production, { category: "breaking", textBg: "x", textEn: null } ), { name: "FrozenVersionError" } );
    } );
} );
