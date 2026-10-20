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
 * The nomenclatures workbook's index sheet "Номенклатури": each list's name, status, flags and remark (design record §4.6).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readNomenclatureIndex } = require( "#nomenclature-index" );
const { row, sheet } = require( "./support/raw-builders" );

describe( "readNomenclatureIndex", () => {

    const index = ( ...rows ) => sheet( "Номенклатури", [ row( 1, [ "Номенклатури използвани от НЗИС" ] ),
        row( 5, [ "Номенклатура", "ID", "Статус", "Динамична", "Видимост", "Забележка" ] ), ...rows ] );

    it( "reads each list's name, status, flag, visibility and remark", () => {
        const { lists, anomalies } = readNomenclatureIndex( index(
            row( 6, [ "Пол", "CL001", "В УПОТРЕБА", "false" ] ), row( 7, [ "Лекарствен продукт", "CL009", "В УПОТРЕБА", "true" ] ),
            row( 8, [ "", "CL068", "ПРЕМАХНАТА" ] ), row( 9, [ "Употреба на тютюн", "CL104", "РЕЗЕРВИРАНА", "false", "", "Ще се включи в профилактика итерация 2" ] ) ) );
        assert.deepEqual( anomalies, [] );
        assert.deepEqual( lists.map( ( list ) => [ list.id, list.name, list.status, list.dynamic, list.visibility, list.remark, list.source.row ] ), [
            [ "CL001", "Пол", "in-use", false, null, null, 6 ], [ "CL009", "Лекарствен продукт", "in-use", true, null, null, 7 ],
            [ "CL068", null, "removed", null, null, null, 8 ], [ "CL104", "Употреба на тютюн", "reserved", false, null, "Ще се включи в профилактика итерация 2", 9 ] ] );
    } );

    it( "maps all six statuses", () => {
        const texts = [ "В УПОТРЕБА", "ПРЕМАХНАТА", "ЗА РЕВИЗИЯ", "РЕЗЕРВИРАНА", "В РАЗРАБОТКА", "ЗА ДОПЪЛВАНЕ" ];
        const { lists } = readNomenclatureIndex( index( ...texts.map( ( text, offset ) => row( 6 + offset, [ "x", `CL00${ offset }`, text ] ) ) ) );
        assert.deepEqual( lists.map( ( list ) => list.status ), [ "in-use", "removed", "under-revision", "reserved", "in-development", "incomplete" ] );
    } );

    it( "warns about an unknown status or flag and keeps the list; blocks a list listed twice", () => {
        const { lists, anomalies } = readNomenclatureIndex( index( row( 6, [ "Пол", "CL001", "АКТИВНА", "да" ] ), row( 7, [ "Пол", "CL001", "В УПОТРЕБА" ] ) ) );
        assert.deepEqual( anomalies.map( ( anomaly ) => anomaly.type ), [ "unknown-list-status", "invalid-flag", "duplicate-list" ] );
        assert.deepEqual( [ lists.length, lists[ 0 ].status, lists[ 0 ].dynamic ], [ 1, null, null ] );
    } );

    it( "blocks an index without its header row", () => {
        assert.deepEqual( readNomenclatureIndex( sheet( "Номенклатури", [ row( 1, [ "Пол", "CL001" ] ) ] ) ).anomalies.map( ( anomaly ) => anomaly.type ),
            [ "missing-header-row" ] );
    } );
} );
