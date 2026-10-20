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
 * A whole nomenclatures workbook, assembled from its sheets in whatever order they arrive (design record §4.6, §5.7).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { importNomenclaturesWorkbook } = require( "#nomenclatures-importer" );
const { row, sheet } = require( "./support/raw-builders" );
const { nomenclatureSheets } = require( "./support/fixtures" );

describe( "importNomenclaturesWorkbook", () => {

    const ids = ( result ) => result.version.codeLists.map( ( list ) => list.id );

    it( "imports a sound workbook with no anomaly", async () => {
        const result = await importNomenclaturesWorkbook( nomenclatureSheets() );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( [ result.version.kind, result.version.spec, result.version.version, ids( result ) ],
            [ "nomenclatures", "nomenclatures", "1.5.33", [ "CL001", "CL068" ] ] );
        const [ sex, removed ] = result.version.codeLists;
        assert.deepEqual( [ sex.status, sex.entries.length, removed.status, removed.entries ], [ "in-use", 2, "removed", [] ] );
        assert.equal( result.version.changeNotes[ 0 ].stagingDate, "2026-10-07" );
        assert.ok( Object.isFrozen( sex.entries[ 0 ] ) );
    } );

    it( "imports the same lists whatever order the sheets arrive in (Review Focus 1)", async () => {
        const inOrder = await importNomenclaturesWorkbook( nomenclatureSheets( [ "CL001", "CL002" ] ) );
        const reversed = await importNomenclaturesWorkbook( [ ...nomenclatureSheets( [ "CL001", "CL002" ] ) ].reverse() );
        assert.deepEqual( reversed, inOrder );
    } );

    it( "reads sheets from an async iterable, as the streaming reader yields them", async () => {
        async function* yieldAll() { yield* nomenclatureSheets(); }
        assert.deepEqual( await importNomenclaturesWorkbook( yieldAll() ), await importNomenclaturesWorkbook( nomenclatureSheets() ) );
    } );

    it( "does not import a sheet the index does not list, and reports only that", async () => {
        const result = await importNomenclaturesWorkbook( [ ...nomenclatureSheets(), sheet( "CLS01", [ row( 1, [ "CLS01 - Референтни стойности" ] ) ] ) ] );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.sheet ] ), [ [ "sheet-not-listed", "CLS01" ] ] );
        assert.deepEqual( ids( result ), [ "CL001", "CL068" ] );
    } );

    it( "blocks a list listed as in use without a sheet, and a workbook without its index or change notes", async () => {
        const withoutSheet = await importNomenclaturesWorkbook( nomenclatureSheets().filter( ( raw ) => raw.name !== "CL001" ) );
        assert.deepEqual( withoutSheet.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.id, anomaly.details.status ] ),
            [ [ "list-without-sheet", "CL001", "in-use" ] ] );
        const bare = await importNomenclaturesWorkbook( nomenclatureSheets().filter( ( raw ) => raw.name.startsWith( "CL" ) ) );
        assert.deepEqual( bare.anomalies.map( ( anomaly ) => anomaly.type ), [ "missing-sheet", "missing-sheet", "missing-version" ] );
    } );

    it( "takes the index's name when the title row has none, and checks the file name's version", async () => {
        const sheets = nomenclatureSheets().map( ( raw ) => ( raw.name === "CL001"
            ? sheet( "CL001", raw.rows.map( ( entry ) => ( entry.number === 1 ? row( 1, [ "CL001 - " ] ) : entry ) ) ) : raw ) );
        const result = await importNomenclaturesWorkbook( sheets, { fileName: "НЗИС Номенклатури - Спецификация v1.5.32.xlsx" } );
        assert.equal( result.version.codeLists[ 0 ].name.bg, "Пол" );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "version-mismatch" ] );
    } );
} );
