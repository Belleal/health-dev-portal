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
 * Editing a development version item by item (design record §7.4, plan 6a decisions 1–3 and 6): numbers stay, an edited
 * item's revision goes up, a stale edit is refused whole, and every edit is checked.
 */

const { before, beforeEach, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { checkContent } = require( "@health-dev-portal/importer/check" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, loadAnomalies, loadApprovedContent, loadItems, loadVersion, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { addChangelogEntry, editChangelogEntry } = require( "#changelog" );
const { applyEdits, recheckVersion } = require( "#editing" );
const { resolveVersion } = require( "#resolution" );
const { loadTargets } = require( "#targets" );
const { eachDatabase, interleaved } = require( "./support/databases" );
const { ACTOR, BY_EDITOR, NOW, inImplementation, putUnderReview } = require( "./support/lifecycle" );
const { codeListVersion, moduleVersion } = require( "./support/models" );

// An R 1..1 String field an editor made: it was read from no sheet.
const field = ( identity ) => ( {
    identity: identity, path: identity.split( "@" )[ 0 ], depth: 1, kind: "field", name: { bg: "Поле", en: null }, requirement: "R", cardinality: { min: 1, max: 1 },
    dataType: "String", constraint: null, fixedValue: null, defaultValue: null, rules: [], conditions: [], codeList: null, tag: identity.split( "@" )[ 0 ].split( "/" ).pop(),
    attribute: "value", description: { bg: null, en: null }, source: null
} );

// What the importer stores: the model's derived parts as checkContent makes them, here against nothing (none of the lists
// the model names is stored), and anomalies inherited from a workbook — one of its layout, one of the model.
const imported = ( spec ) => ( { ...checkContent( "module", moduleVersion( null ), { codeLists: [], rules: null, catalogue: null } ).content, spec: spec } );
const INHERITED = [
    { type: "unknown-fill", level: "warning", message: "…", sheet: "P001", row: 6, column: 1, details: { colour: "FFFF00" } },
    { type: "duplicate-identity", level: "blocking", message: "…", sheet: "P001", row: 12, column: null, details: { identity: "contents/note@value" } }
];

eachDatabase( "Editing", ( db ) => {

    const store = memoryStore();
    let specs = 0;
    let production;
    let id;
    let lrnNo;
    let contentsNo;
    let noteNo;
    let conditionNo;
    let lrn;
    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "e-prescription", "module" );
        production = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: moduleVersion() } );
    } );

    beforeEach( async () => {
        specs += 1;
        const spec = `e-test-${ specs }`;
        await ensureSpec( db(), spec, "module" );
        id = await storeVersion( db(), { spec: spec, kind: "module", number: null, stage: "development", content: imported( spec ), anomalies: INHERITED } );
        const rows = await loadItems( db(), id );
        const numberOf = ( kind, identity ) => rows.find( ( row ) => row.kind === kind && row.identity === identity ).item_no;
        lrnNo = numberOf( "element", "contents/lrn" );
        contentsNo = numberOf( "element", "contents" );
        noteNo = numberOf( "element", "contents/note@value" );
        conditionNo = numberOf( "condition", "CDP01" );
        lrn = JSON.parse( rows.find( ( row ) => row.item_no === lrnNo ).data );
    } );

    it( "updates one item, raising its revision and no other", async () => {
        const before = await loadItems( db(), id );
        const { revisions } = await applyEdits( db(), store, id, [ { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "ново", en: null } } } ], BY_EDITOR );
        assert.deepEqual( revisions, { [ lrnNo ]: 2 } );
        const changedRows = ( await loadItems( db(), id ) ).filter( ( row ) => row.revision !== before.find( ( r ) => r.item_no === row.item_no ).revision );
        assert.deepEqual( changedRows.map( ( row ) => row.item_no ), [ lrnNo ] );
    } );

    it( "inserts in place, renumbering nothing", async () => {
        const before = await loadItems( db(), id );
        const { inserted } = await applyEdits( db(), store, id, [ { op: "insert", kind: "element", parent: contentsNo, position: 1, data: field( "contents/new@value" ) } ], BY_EDITOR );
        const after = await loadItems( db(), id );
        assert.equal( inserted[ 0 ], Math.max( ...before.map( ( row ) => row.item_no ) ) + 1 );
        for ( const row of before ) {
            assert.equal( after.find( ( r ) => r.item_no === row.item_no ).revision, row.revision, row.identity );
        }
        assert.deepEqual( ( await loadVersion( db(), id ) ).content.messages[ 0 ].elements[ 0 ].children.map( ( e ) => e.identity ).slice( 0, 3 ),
            [ "contents/lrn", "contents/new@value", "contents/dose@value" ] );
    } );

    it( "moves an item, raising its revision and keeping its siblings'", async () => {
        const before = await loadItems( db(), id );
        const { revisions } = await applyEdits( db(), store, id, [ { op: "move", item: noteNo, revision: 1, parent: contentsNo, position: 0 } ], BY_EDITOR );
        assert.deepEqual( revisions, { [ noteNo ]: 2 } );
        const after = await loadItems( db(), id );
        assert.deepEqual( after.map( ( row ) => row.item_no ), before.map( ( row ) => row.item_no ) );
        assert.deepEqual( ( await loadVersion( db(), id ) ).content.messages[ 0 ].elements[ 0 ].children.map( ( e ) => e.identity ),
            [ "contents/note@value", "contents/lrn", "contents/dose@value", "contents/note@value" ] );
    } );

    // The number a removal freed was taken again at revision 1, and an edit made against the removed item then landed on
    // the new one (final review, C1).
    it( "never gives a removed item's number to another, so a stale edit to it is refused", async () => {
        const insert = ( identity ) => ( { op: "insert", kind: "element", parent: contentsNo, position: 0, data: field( identity ) } );
        const { inserted: [ x ] } = await applyEdits( db(), store, id, [ insert( "contents/x@value" ) ], BY_EDITOR );
        await applyEdits( db(), store, id, [ { op: "remove", item: x, revision: 1 } ], BY_EDITOR );
        const { inserted: [ y ] } = await applyEdits( db(), store, id, [ insert( "contents/y@value" ) ], BY_EDITOR );
        assert.ok( y > x, `${ y } after ${ x }` );
        await assert.rejects( applyEdits( db(), store, id, [ { op: "update", item: x, revision: 1, data: field( "contents/x@value" ) } ], BY_EDITOR ),
            { name: "EditConflictError", item: x } );
    } );

    it( "refuses an edit made against an older revision, writing nothing", async () => {
        await applyEdits( db(), store, id, [ { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "първа", en: null } } } ], BY_EDITOR );
        await assert.rejects( applyEdits( db(), store, id, [
            { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "втора", en: null } } },
            { op: "remove", item: noteNo, revision: 1 }
        ], BY_EDITOR ), { name: "EditConflictError", item: lrnNo, revision: 1 } );
        assert.equal( ( await loadItems( db(), id ) ).some( ( row ) => row.item_no === noteNo ), true );
    } );

    it( "rechecks after an edit: removing a condition another element names blocks", async () => {
        const { anomalies } = await applyEdits( db(), store, id, [ { op: "remove", item: conditionNo, revision: 1 } ], BY_EDITOR );
        assert.ok( anomalies.some( ( a ) => a.type === "unknown-condition" && a.level === "blocking" ) );
    } );

    it( "drops the workbook's layout anomalies at the first check, and keeps the model's", async () => {
        // The version was stored with an inherited unknown-fill (layout) and duplicate-identity (model): moduleVersion() repeats contents/note@value.
        await applyEdits( db(), store, id, [ { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "ново", en: null } } } ], BY_EDITOR );
        const types = ( await loadAnomalies( db(), id ) ).map( ( a ) => a.type );
        assert.ok( types.includes( "duplicate-identity" ) );
        assert.ok( !types.includes( "unknown-fill" ) );
    } );

    it( "rechecks a version without editing it, changing no item", async () => {
        const before = await loadItems( db(), id );
        const anomalies = await recheckVersion( db(), store, id );
        assert.ok( anomalies.some( ( a ) => a.type === "duplicate-identity" ) );
        assert.deepEqual( await loadItems( db(), id ), before );
    } );

    describe( "a code list", () => {

        let list;
        let rows;
        before( async () => {
            await ensureSpec( db(), "CL900", "code-list" );
            list = await storeVersion( db(), { spec: "CL900", kind: "code-list", number: null, stage: "development", content: codeListVersion( "CL900", [ "1", "2" ], null ) } );
            rows = await loadItems( db(), list );
        } );
        const rowOf = ( kind ) => rows.find( ( row ) => row.kind === kind );

        // Its name and status could change only through a workbook (final review, I3).
        it( "edits the list's own fields, and never adds or takes away the list", async () => {
            const own = rowOf( "list" );
            const { revisions } = await applyEdits( db(), store, list, [ { op: "update", item: own.item_no, revision: 1,
                data: { ...JSON.parse( own.data ), status: "removed" } } ], BY_EDITOR );
            assert.deepEqual( revisions, { [ own.item_no ]: 2 } );
            assert.equal( ( await loadVersion( db(), list ) ).content.list.status, "removed" );
            await assert.rejects( applyEdits( db(), store, list, [ { op: "remove", item: own.item_no, revision: 2 } ], BY_EDITOR ), { name: "TypeError" } );
        } );

        // An entry's values follow the columns by place: a column added or taken away shifted every value under another
        // title (final review, I4).
        it( "refuses to add, remove or move a column while the list has entries, and edits one in place", async () => {
            const column = rowOf( "column" );
            const listNo = rowOf( "list" ).item_no;
            await assert.rejects( applyEdits( db(), store, list, [ { op: "insert", kind: "column", parent: listNo, position: 0, data: { title: "Ново", column: 7 } } ], BY_EDITOR ),
                { name: "TypeError" } );
            await assert.rejects( applyEdits( db(), store, list, [ { op: "remove", item: column.item_no, revision: 1 } ], BY_EDITOR ), { name: "TypeError" } );
            await applyEdits( db(), store, list, [ { op: "update", item: column.item_no, revision: 1, data: { ...JSON.parse( column.data ), title: "NHIF" } } ], BY_EDITOR );
            assert.deepEqual( ( await loadVersion( db(), list ) ).content.list.columns.map( ( c ) => c.title ), [ "NHIF" ] );
        } );
    } );

    it( "refuses to edit a version in testing or production", async () => {
        await assert.rejects( applyEdits( db(), store, production, [ { op: "remove", item: 2, revision: 1 } ], BY_EDITOR ), { name: "TypeError" } );
    } );

    // Plan 6b: changes in implementation kept apart until approved, a version under review read-only (design record
    // §7.4), and every edit's author and time recorded (§10.1).
    describe( "in implementation, under review, and by whom", () => {

        const lrnOf = ( content ) => content.messages[ 0 ].elements[ 0 ].children[ 0 ];
        const lrnEdit = async ( version, change ) => {
            const row = ( await loadItems( db(), version ) ).find( ( candidate ) => candidate.identity === "contents/lrn" );
            return { op: "update", item: row.item_no, revision: row.revision, data: change( JSON.parse( row.data ) ) };
        };

        it( "keeps an implementation version's edits apart from its approved content", async () => {
            const implementation = await inImplementation( db, { spec: "e-built", number: "1.6.0", content: imported( "e-built" ) } );
            await applyEdits( db(), store, implementation, [ await lrnEdit( implementation, ( data ) => ( { ...data, cardinality: { min: 2, max: 2 } } ) ) ], BY_EDITOR );
            assert.equal( lrnOf( await loadApprovedContent( db(), implementation ) ).cardinality.min, 1 );
            assert.equal( lrnOf( ( await loadVersion( db(), implementation ) ).content ).cardinality.min, 2 );
        } );

        it( "refuses an edit to a version under review, and one that lands after the submission it was computed before", async () => {
            const entry = await addChangelogEntry( db(), id, { category: "breaking", textBg: "Преди прегледа", textEn: null } );
            const edit = await lrnEdit( id, ( data ) => ( { ...data, description: { bg: "късно", en: null } } ) );
            await assert.rejects( applyEdits( interleaved( db(), () => putUnderReview( db, id ) ), store, id, [ edit ], BY_EDITOR ), { name: "UnderReviewError" } );
            assert.ok( ( await loadItems( db(), id ) ).every( ( row ) => row.revision === 1 ) );
            await assert.rejects( applyEdits( db(), store, id, [ edit ], BY_EDITOR ), { name: "UnderReviewError", version: id } );
            await assert.rejects( editChangelogEntry( db(), entry, { textBg: "по време на прегледа" } ), { name: "UnderReviewError" } );
            await assert.rejects( addChangelogEntry( db(), id, { category: "breaking", textBg: "x", textEn: null } ), { name: "UnderReviewError" } );
            // A recheck is no edit: approved changes still reach a version under review, and are checked (§7.4).
            await recheckVersion( db(), store, id );
        } );

        it( "records who edited and when, and refuses an edit that names no author", async () => {
            const edit = await lrnEdit( id, ( data ) => ( { ...data, description: { bg: "от кого", en: null } } ) );
            await applyEdits( db(), store, id, [ edit ], BY_EDITOR );
            const rows = await db().all( "SELECT edit_no, actor, at, edits FROM edit_log WHERE version_id = ?", [ id ] );
            assert.deepEqual( rows.map( ( row ) => [ row.edit_no, row.actor, row.at, JSON.parse( row.edits ) ] ), [ [ 1, ACTOR, NOW.toISOString(), [ edit ] ] ] );
            await assert.rejects( applyEdits( db(), store, id, [ edit ] ), { name: "TypeError" } );
        } );

        it( "checks a module against a list's approved content, not its pending changes", async () => {
            const list = await inImplementation( db, { spec: "CL009", kind: "code-list", number: "1.5.40", content: codeListVersion( "CL009", [ "1", "2" ], "1.5.40" ) } );
            const listNo = ( await loadItems( db(), list ) ).find( ( row ) => row.kind === "list" ).item_no;
            await applyEdits( db(), store, list, [ { op: "insert", kind: "entry", parent: listNo, position: 2, data: { key: "A", description: { bg: "А", en: null },
                display: { bg: null, en: null }, values: [ "NA" ], since: "1.5.40", validUntil: null, source: null } } ], BY_EDITOR );
            const targets = await loadTargets( db(), store, id );
            assert.deepEqual( targets.codeLists.find( ( candidate ) => candidate.id === "CL009" ).entries.map( ( entry ) => entry.key ), [ "1", "2" ] );
            assert.equal( ( await resolveVersion( db(), id ) ).find( ( resolution ) => resolution.spec === "CL009" ).keyType, "integer" );
        } );
    } );
} );
