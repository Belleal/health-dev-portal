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

const { before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, freezeVersion, loadItems, storeContent, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { addChangelogEntry, dropChangelogEntry, editChangelogEntry, loadChangelog, refreshChangelog, restoreChangelogEntry, storeHistory } = require( "#changelog" );
const { applyEdits } = require( "#editing" );
const { eachDatabase, interleaved } = require( "./support/databases" );
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

    // A refresh's statements were computed from entries read before its batch, which checks only the content: a refresh
    // never changes that, so another refresh or an editor's change in between went unseen (final review, I1).
    describe( "with another write in between", () => {

        let spec = 0;
        const fresh = async () => {
            spec += 1;
            const id = `e-between-${ spec }`;
            await ensureSpec( db(), id, "module" );
            const base = await storeVersion( db(), { spec: id, kind: "module", number: "1.0.0", stage: "production", content: { ...moduleVersion( "1.0.0" ), spec: id } } );
            const version = await storeVersion( db(), { spec: id, kind: "module", number: null, stage: "development", content: { ...moduleVersion( null ), spec: id }, base: base } );
            const described = { ...moduleVersion( null ), spec: id };
            described.messages[ 0 ].elements[ 0 ].children[ 0 ].description = { bg: "ново", en: null };
            return { id: id, version: version, described: described, plain: { ...moduleVersion( null ), spec: id } };
        };
        const entriesFor = async ( spec, key ) => ( await loadChangelog( db(), spec ) )[ 0 ].entries.filter( ( entry ) => entry.difference_key === key );
        const DESCRIBED = "element:P001:contents/lrn#1|description";

        it( "keeps an explanation the editor gave while a refresh was computing, flagged", async () => {
            const { id, version, described, plain } = await fresh();
            await storeContent( db(), version, described, [] );
            await refreshChangelog( db(), version );
            const [ entry ] = await entriesFor( id, DESCRIBED );
            await storeContent( db(), version, plain, [] );
            await refreshChangelog( interleaved( db(), () => editChangelogEntry( db(), entry.id, { textBg: "Обяснение" } ) ), version );
            const kept = await entriesFor( id, DESCRIBED );
            assert.deepEqual( kept.map( ( e ) => [ e.origin, e.flagged, e.text_bg ] ), [ [ "edited", true, "Обяснение" ] ] );
        } );

        it( "stores one entry for a difference two refreshes found at once", async () => {
            const { id, version, described } = await fresh();
            await storeContent( db(), version, described, [] );
            await refreshChangelog( interleaved( db(), () => refreshChangelog( db(), version ) ), version );
            assert.equal( ( await entriesFor( id, DESCRIBED ) ).length, 1 );
        } );

        // The edit was written; throwing told the caller it was not, and a retry inserted twice. Every write refreshes in
        // its turn, so a refresh overtaken three times has nothing left to do (final review, Task 6 ruling reversed).
        it( "returns, writing nothing, when later writes overtake every attempt", async () => {
            const { version, described, plain } = await fresh();
            let flip = 0;
            const overtaken = { ...interleaved( db(), async () => {} ), batch: async ( statements ) => {
                flip += 1;
                await storeContent( db(), version, flip % 2 ? described : plain, [] );
                return db().batch( statements );
            } };
            assert.deepEqual( await refreshChangelog( overtaken, version ), { added: 0, updated: 0, removed: 0, flagged: 0, superseded: true } );
        } );
    } );

    it( "refuses to write the changelog of a frozen version", async () => {
        await freezeVersion( db(), production );
        await assert.rejects( addChangelogEntry( db(), production, { category: "breaking", textBg: "x", textEn: null } ), { name: "FrozenVersionError" } );
    } );
} );
