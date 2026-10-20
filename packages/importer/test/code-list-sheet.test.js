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
 * One code-list sheet of the nomenclatures workbook (design record §4.6), with the layouts measured on 1.5.33.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readCodeListSheet } = require( "#code-list-sheet" );
const { row, sheet } = require( "./support/raw-builders" );

describe( "readCodeListSheet", () => {

    const HEADER = [ "Key", "Description BG", "Description EN", "Display value BG", "Display value EN", "NHIF Code", "Since", "Valid Until" ];
    const list = ( rows, header = HEADER ) => sheet( "CL006", [
        row( 1, [ "CL006 - Код на специалност" ] ), row( 2, [ "Източник: НЗОК" ] ),
        row( 3, [ "Entity", "", "", "", "", "Meta Data", "System Data" ] ), row( 4, header ), ...rows ] );
    const types = ( anomalies ) => anomalies.map( ( anomaly ) => anomaly.type );

    it( "reads a list: name, notes, its own columns and its entries", () => {
        const { codeList, anomalies } = readCodeListSheet( list( [ row( 5, [ "1002", "Ангиология", "Angiology", "Ангиология", "Angiology", "73", "v1.0.0" ] ) ] ) );
        assert.deepEqual( anomalies, [] );
        assert.deepEqual( [ codeList.id, codeList.name, codeList.notes, codeList.columns ],
            [ "CL006", { bg: "Код на специалност", en: null }, [ "Източник: НЗОК" ], [ { title: "NHIF Code", column: 6 } ] ] );
        assert.deepEqual( codeList.entries, [ { key: "1002", description: { bg: "Ангиология", en: "Angiology" }, display: { bg: "Ангиология", en: "Angiology" },
            values: [ "73" ], since: "1.0.0", validUntil: null, source: { sheet: "CL006", row: 5 } } ] );
    } );

    it( "maps every measured header layout (Review Focus 4)", () => {
        const read = ( header, values ) => readCodeListSheet( list( [ row( 5, values ) ], header ) ).codeList;
        const old = read( [ "Key", "Description", "Language EN", "Since", "Valid Until" ], [ "1", "Постоянен адрес", "Permanent address", "v1.1.1" ] );
        assert.deepEqual( [ old.entries[ 0 ].description, old.entries[ 0 ].display, old.columns ],
            [ { bg: "Постоянен адрес", en: "Permanent address" }, { bg: null, en: null }, [] ] );
        const capitalised = read( [ "Key", "Description", "Display Value BG", "Display Value EN" ], [ "1", "а", "б", "b" ] );
        assert.deepEqual( capitalised.entries[ 0 ].display, { bg: "б", en: "b" } );
        const errors = read( [ "Key", "Display Value (English)", "Display Value (Bulgarian)" ], [ "E001", "General error", "Обща грешка" ] );
        assert.deepEqual( [ errors.entries[ 0 ].display, errors.entries[ 0 ].since ], [ { bg: "Обща грешка", en: "General error" }, null ] );
        const cl007 = read( [ "Key", "Description BG", "Description EN", "Display value BG", "Display value EN", "NHIF Document", "Description", "Since" ],
            [ "1", "Бяла", "White", "Бяла", "White", "---", "обикновена" ] );
        assert.deepEqual( [ cl007.columns, cl007.entries[ 0 ].values ],
            [ [ { title: "NHIF Document", column: 6 }, { title: "Description", column: 7 } ], [ null, "обикновена" ] ] );
    } );

    it( "skips rows without a usable key, once per sheet (Review Focus 2)", () => {
        const { codeList, anomalies } = readCodeListSheet( list( [
            row( 5, [ "1004", "Вътрешни болести" ] ), row( 6, [ "", "", "", "", "", "00" ] ), row( 7, [ "..." ] ),
            row( 8, [ "---", "x" ] ), row( 9, [ "---", "y" ] ), row( 10, [ "* За лекари, завършили преди 2007 година" ] ) ] ) );
        assert.deepEqual( codeList.entries.map( ( entry ) => entry.key ), [ "1004" ] );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.row, anomaly.details.count, anomaly.details.rows ] ),
            [ [ "skipped-rows", 6, 5, "6, 7, 8, 9, 10" ] ] );
    } );

    it( "folds a look-alike key and blocks a key repeated once folded", () => {
        const { codeList, anomalies } = readCodeListSheet( list( [ row( 5, [ "E003" ] ), row( 6, [ "Е003" ] ), row( 7, [ "10-0А0" ] ) ] ) );
        assert.deepEqual( codeList.entries.map( ( entry ) => entry.key ), [ "E003", "10-0A0" ] );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.row, anomaly.column ] ), [
            [ "look-alike-letter", "warning", 6, 1 ], [ "duplicate-key", "blocking", 6, null ], [ "look-alike-letter", "warning", 7, 1 ] ] );
        assert.deepEqual( anomalies[ 1 ].details, { key: "E003", firstRow: 5, row: 6 } );
    } );

    it( "reads versions and reports the forms it does not expect, at their cells", () => {
        const at = ( since, validUntil ) => readCodeListSheet( list( [ row( 5, [ "1", "", "", "", "", "", since, validUntil ] ) ] ) );
        const late = at( "v.1.5.21", "v1.5.19" );
        assert.deepEqual( [ late.codeList.entries[ 0 ].since, late.codeList.entries[ 0 ].validUntil ], [ "1.5.21", "1.5.19" ] );
        assert.deepEqual( late.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.column ] ), [ [ "non-canonical-version", 7 ], [ "valid-until-before-since", null ] ] );
        assert.deepEqual( types( at( "10.10.2023" ).anomalies ), [ "date-instead-of-version" ] );
        assert.equal( at( "10.10.2023" ).codeList.entries[ 0 ].since, null );
        assert.deepEqual( types( at( "f1267" ).anomalies ), [ "invalid-version" ] );
    } );

    it( "folds a list-specific column that holds codes, and leaves text alone (Decision 2)", () => {
        const header = [ "Key", "Description BG", "Description EN", "Display value BG", "Display value EN", "CL022 Mapping", "Risk Group definition", "Since" ];
        const { codeList, anomalies } = readCodeListSheet( list( [
            row( 5, [ "01-001-00", "Русе", "", "", "", "01-001", "a. Мъже 40-65 г" ] ),
            row( 6, [ "01-00А-00", "АНТРАКС", "", "", "", "01-00А", "b. Не" ] ) ], header ) );
        assert.deepEqual( codeList.entries.map( ( entry ) => [ entry.key, entry.description.bg, ...entry.values ] ), [
            [ "01-001-00", "Русе", "01-001", "a. Мъже 40-65 г" ], [ "01-00A-00", "АНТРАКС", "01-00A", "b. Не" ] ] );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.row, anomaly.column ] ),
            [ [ "look-alike-letter", 6, 1 ], [ "look-alike-letter", 6, 6 ] ] );
    } );

    it( "warns about a word that mixes scripts in a description, and blocks a sheet without a Key header", () => {
        const mixed = readCodeListSheet( list( [ row( 5, [ "1", "E-рецепта" ] ) ] ) );
        assert.deepEqual( mixed.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.column, anomaly.details.word ] ), [ [ "mixed-script-word", 2, "E-рецепта" ] ] );
        assert.deepEqual( types( readCodeListSheet( sheet( "CLS01", [ row( 1, [ "CLS01 - Референтни стойности" ] ), row( 4, [ "CL024 Mapping" ] ) ] ) ).anomalies ),
            [ "missing-header-row" ] );
    } );
} );
