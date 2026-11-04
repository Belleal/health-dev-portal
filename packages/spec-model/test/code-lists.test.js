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
 * One spec per code list (design record §4.6): the combined nomenclatures split into a version per list, and its
 * change notes given to the lists they name.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { namedLists, splitNomenclatures } = require( "@health-dev-portal/spec-model/code-lists" );

const list = ( id ) => ( { id: id, name: { bg: id, en: null }, status: "in-use", dynamic: null, visibility: null, remark: null, notes: [], keyType: "string",
    columns: [], entries: [], source: { sheet: id, row: 4 } } );
const nomenclatures = ( version, ids, changeNotes ) => ( { kind: "nomenclatures", spec: "nomenclatures", version: version, codeLists: ids.map( list ), changeNotes: changeNotes } );
const change = ( version, stagingDate, productionDate, notes ) => ( { version: version, stagingDate: stagingDate, productionDate: productionDate, notes: notes,
    source: { sheet: "Change Notes", row: notes.length ? notes[ 0 ].source.row - 1 : 1 } } );
const note = ( text, row ) => ( { category: "non-breaking", text: text, source: { sheet: "Change Notes", row: row } } );

describe( "namedLists", () => {

    it( "names a list by its ID, only when the workbook has it", () => {
        const ids = new Set( [ "CL037", "CL038", "CL011" ] );
        assert.deepEqual( namedLists( "Номенклатура CL038 - релации към CL037 и CL037", ids ), [ "CL038", "CL037" ] );
        assert.deepEqual( namedLists( "CL50 и CL999X и XCL011", ids ), [] );
    } );
} );

describe( "splitNomenclatures", () => {

    it( "makes one version per list, numbered as the combined version", () => {
        const split = splitNomenclatures( nomenclatures( "1.5.33", [ "CL009", "CL011" ], [] ) );
        assert.deepEqual( split.lists.map( ( version ) => [ version.kind, version.spec, version.version, version.list.id ] ),
            [ [ "code-list", "CL009", "1.5.33", "CL009" ], [ "code-list", "CL011", "1.5.33", "CL011" ] ] );
        assert.deepEqual( split.combined, [] );
    } );

    it( "gives a note to every list it names, and keeps the rest as the combined history", () => {
        const split = splitNomenclatures( nomenclatures( "1.5.33", [ "CL009", "CL011", "CL038" ], [
            change( "1.5.32", "2026-09-01", "2026-09-08", [ note( "Номенклатура CL011 - добавяне", 5 ), note( "CL038 - релации към CL037", 6 ), note( "Отключени съобщенията", 7 ) ] ),
            change( "1.5.33", "2026-10-07", null, [ note( "CL009 и CL011 - корекции", 9 ), note( "CL50 - грешен номер", 10 ) ] )
        ] ) );
        const of = ( id ) => split.lists.find( ( version ) => version.spec === id ).changeNotes;
        assert.deepEqual( of( "CL011" ).map( ( version ) => [ version.version, version.notes.map( ( entry ) => entry.source.row ) ] ), [ [ "1.5.32", [ 5 ] ], [ "1.5.33", [ 9 ] ] ] );
        assert.deepEqual( of( "CL009" ).map( ( version ) => [ version.version, version.stagingDate, version.productionDate ] ), [ [ "1.5.33", "2026-10-07", null ] ] );
        assert.deepEqual( of( "CL038" ).map( ( version ) => version.version ), [ "1.5.32" ] );
        assert.deepEqual( split.combined.map( ( version ) => [ version.version, version.notes.map( ( entry ) => entry.text ) ] ),
            [ [ "1.5.32", [ "Отключени съобщенията" ] ], [ "1.5.33", [ "CL50 - грешен номер" ] ] ] );
    } );

    it( "keeps each list and note as the same object, so its source and category stay", () => {
        const notes = [ note( "CL009 - нов запис", 3 ) ];
        const workbook = nomenclatures( "1.5.33", [ "CL009" ], [ change( "1.5.33", null, null, notes ) ] );
        const split = splitNomenclatures( workbook );
        assert.equal( split.lists[ 0 ].changeNotes[ 0 ].notes[ 0 ], notes[ 0 ] );
        assert.equal( split.lists[ 0 ].list, workbook.codeLists[ 0 ] );
    } );
} );
