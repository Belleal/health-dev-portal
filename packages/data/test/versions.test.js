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
 * Storing and loading a version (design record §4.1, §7.7): exactly what was stored comes back, on both databases, and
 * a frozen version refuses every write.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, findVersion, freezeVersion, loadAnomalies, loadVersion, storeContent, storeVersion } = require( "#versions" );
const { eachDatabase } = require( "./support/databases" );
const { codeListVersion, moduleVersion } = require( "./support/models" );

eachDatabase( "Versions", ( db ) => {

    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "e-prescription", "module" );
        await ensureSpec( db(), "CL011", "code-list" );
    } );

    it( "loads a module exactly as stored, two elements with one identity included", async () => {
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: moduleVersion() } );
        const loaded = await loadVersion( db(), id );
        assert.deepEqual( loaded.content, moduleVersion() );
        assert.deepEqual( [ loaded.spec, loaded.kind, loaded.number, loaded.stage, loaded.frozen, loaded.release, loaded.base ],
            [ "e-prescription", "module", "1.5.1", "production", false, null, null ] );
        assert.match( loaded.contentHash, /^[0-9a-f]{64}$/ );
        assert.equal( ( await findVersion( db(), "e-prescription", { stage: "production" } ) ).id, id );
        assert.equal( ( await findVersion( db(), "e-prescription", { number: "1.5.1" } ) ).content, undefined );
    } );

    it( "returns entries in stored order on both databases", async () => {
        const keys = [ "b", "A", "a", "10", "9", "Б", "б" ];
        const id = await storeVersion( db(), { spec: "CL011", kind: "code-list", number: "1.5.32", stage: "retired", content: codeListVersion( "CL011", keys ) } );
        assert.deepEqual( ( await loadVersion( db(), id ) ).content.list.entries.map( ( entry ) => entry.key ), keys );
    } );

    it( "stores and loads a list of 39,005 entries", async () => {
        const keys = Array.from( { length: 39005 }, ( _, i ) => `A${ String( i ).padStart( 5, "0" ) }.1` );
        const id = await storeVersion( db(), { spec: "CL011", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL011", keys ) } );
        const entries = ( await loadVersion( db(), id ) ).content.list.entries;
        assert.deepEqual( [ entries.length, entries[ 0 ].key, entries[ 39004 ].key ], [ 39005, "A00000.1", "A39004.1" ] );
    } );

    it( "maps an anomaly to the item it was found on", async () => {
        const content = moduleVersion( "1.4.0" );
        const row = content.messages[ 0 ].elements[ 0 ].source.row;
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.4.0", stage: "retired", content: content, anomalies: [
            { type: "look-alike-letter", level: "warning", message: "…", sheet: "P001", row: row, column: 3, details: {} },
            { type: "missing-sheet", level: "blocking", message: "…", sheet: "Съобщения", row: null, column: null, details: { sheet: "Съобщения" } }
        ] } );
        const anomalies = await loadAnomalies( db(), id );
        assert.equal( anomalies[ 0 ].item, 2 );
        assert.deepEqual( [ anomalies[ 0 ].sheet, anomalies[ 0 ].row, anomalies[ 0 ].column ], [ "P001", row, 3 ] );
        assert.equal( anomalies[ 1 ].item, null );
        assert.deepEqual( anomalies[ 1 ].details, { sheet: "Съобщения" } );
    } );

    it( "keeps a version stored without content, as history is", async () => {
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.0.0", stage: "retired" } );
        const loaded = await loadVersion( db(), id );
        assert.deepEqual( [ loaded.content, loaded.contentHash ], [ null, null ] );
    } );

    it( "refuses to change a frozen version and writes nothing", async () => {
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.3.0", stage: "retired", content: moduleVersion( "1.3.0" ) } );
        await freezeVersion( db(), id );
        const changed = moduleVersion( "1.3.0" );
        changed.messages.pop();
        await assert.rejects( storeContent( db(), id, changed, [] ), { name: "FrozenVersionError", version: id } );
        assert.deepEqual( ( await loadVersion( db(), id ) ).content, moduleVersion( "1.3.0" ) );
        assert.equal( ( await loadVersion( db(), id ) ).frozen, true );
    } );

    it( "replaces an unfrozen version's content", async () => {
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: null, stage: "development", content: moduleVersion( null ) } );
        const changed = moduleVersion( null );
        changed.messages.pop();
        await storeContent( db(), id, changed, [] );
        assert.deepEqual( ( await loadVersion( db(), id ) ).content, changed );
    } );

    it( "refuses a spec of another kind under a known key", async () => {
        await ensureSpec( db(), "CL011", "code-list" );
        await assert.rejects( ensureSpec( db(), "CL011", "module" ), { name: "TypeError" } );
    } );
} );
