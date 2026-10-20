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
 * The real nomenclatures 1.5.33 workbook, as published, read by the streaming reader. Every expected value here was
 * measured on 2026-10-19 and 2026-10-20 with prototypes independent of this code (design record §4.6, §5.7, HEL-15);
 * a failure means the importer and the measurement disagree.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { streamSheets } = require( "#stream-reader" );
const { importNomenclaturesWorkbook } = require( "#nomenclatures-importer" );

const FIXTURE = path.resolve( __dirname, "../../../.fixtures/public/nomenclatures-1.5.33.xlsx" );
const PRESENT = fs.existsSync( FIXTURE );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "The public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

const countBy = ( items, key ) => items.reduce( ( counts, item ) => ( { ...counts, [ key( item ) ]: ( counts[ key( item ) ] || 0 ) + 1 } ), {} );

describe( "Nomenclatures 1.5.33, the published workbook", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let result;
    const list = ( id ) => result.version.codeLists.find( ( candidate ) => candidate.id === id );
    const ofType = ( type ) => result.anomalies.filter( ( anomaly ) => anomaly.type === type );

    before( async () => {
        result = await importNomenclaturesWorkbook( streamSheets( FIXTURE ), { fileName: "НЗИС Номенклатури - Спецификация v1.5.33.xlsx" } );
    } );

    it( "reads the version and the change notes' staging and production dates", () => {
        assert.equal( result.version.version, "1.5.33" );
        assert.equal( result.version.changeNotes.length, 87 );
        const dates = ( version ) => {
            const found = result.version.changeNotes.find( ( candidate ) => candidate.version === version );
            return [ found.stagingDate, found.productionDate ];
        };
        assert.deepEqual( dates( "1.5.29" ), [ "2026-08-24", "2026-08-31" ] );
        assert.deepEqual( dates( "1.5.33" ), [ "2026-10-07", null ] );
    } );

    it( "reads 182 lists and 59,343 entries", () => {
        assert.equal( result.version.codeLists.length, 182 );
        assert.equal( result.version.codeLists.reduce( ( sum, candidate ) => sum + candidate.entries.length, 0 ), 59343 );
        assert.equal( list( "CL011" ).entries.length, 39005 );
    } );

    it( "takes each list's status from the index, keeping CL068 though it has no sheet", () => {
        assert.deepEqual( countBy( result.version.codeLists, ( candidate ) => candidate.status ),
            { "in-use": 173, "removed": 3, "under-revision": 1, "reserved": 2, "in-development": 2, "incomplete": 1 } );
        assert.deepEqual( [ list( "CL068" ).status, list( "CL068" ).entries ], [ "removed", [] ] );
        assert.equal( list( "CLS01" ), undefined );
    } );

    it( "is refused for exactly the 17 repeated keys of CL096 and CL127 (HEL-15)", () => {
        const blocking = result.anomalies.filter( ( anomaly ) => anomaly.level === "blocking" );
        assert.deepEqual( [ ...new Set( blocking.map( ( anomaly ) => anomaly.type ) ) ], [ "duplicate-key" ] );
        assert.deepEqual( blocking.map( ( anomaly ) => anomaly.sheet ).sort(), [ "CL096", ...Array( 16 ).fill( "CL127" ) ] );
        assert.deepEqual( blocking.find( ( anomaly ) => anomaly.sheet === "CL096" ).details, { key: "416", firstRow: 283, row: 284 } );
    } );

    it( "reports the known source defects as warnings", () => {
        const warnings = result.anomalies.filter( ( anomaly ) => anomaly.level === "warning" );
        // mixed-script-word was not counted independently: of ten sampled, five are slips (Oбилна, EКГ, туморeн) and
        // five are Latin–Bulgarian compounds across a hyphen (B-клетки, LDL-холестерол), which the check cannot tell
        // from E-рецепта (HEL-10), a real one.
        assert.deepEqual( countBy( warnings, ( anomaly ) => anomaly.type ), {
            "non-canonical-version": 252,
            "date-instead-of-version": 124,
            "skipped-rows": 9,
            "mixed-script-word": 532,
            "look-alike-letter": 55,
            "valid-until-before-since": 6,
            "invalid-version": 2,
            "sheet-not-listed": 2,
            "unknown-note-colour": 1,
            "versions-out-of-order": 1
        } );
        assert.deepEqual( ofType( "skipped-rows" ).map( ( anomaly ) => [ anomaly.sheet, anomaly.details.count ] ), [
            [ "CL006", 3 ], [ "CL009", 1 ], [ "CL026", 1 ], [ "CL038", 2 ], [ "CL076", 1 ], [ "CL122", 3323 ], [ "CL127", 19 ], [ "CL131", 2 ], [ "CL999", 1 ] ] );
        assert.deepEqual( ofType( "valid-until-before-since" ).map( ( anomaly ) => `${ anomaly.sheet }:${ anomaly.row }` ),
            [ "CL038:14", "CL038:15", "CL038:16", "CL038:17", "CL038:51", "CL038:62" ] );
        assert.deepEqual( ofType( "invalid-version" ).map( ( anomaly ) => [ anomaly.sheet, anomaly.row, anomaly.details.value ] ),
            [ [ "CL056", 45, "f1267" ], [ "CL056", 53, "16.07" ] ] );
        assert.deepEqual( ofType( "sheet-not-listed" ).map( ( anomaly ) => anomaly.sheet ).sort(), [ "CLS01", "CLS02" ] );
        assert.equal( ofType( "notes-before-version" ).length, 0 );
    } );

    it( "folds look-alike keys and the code columns that must follow them, and never text (Decision 2)", () => {
        assert.deepEqual( countBy( ofType( "look-alike-letter" ), ( anomaly ) => `${ anomaly.sheet }!${ anomaly.column }` ),
            { "CL022!1": 17, "CL024!1": 17, "CL999!1": 1, "CL024!6": 17, "CL107!4": 2, "CL037!14": 1 } );
        assert.ok( list( "CL999" ).entries.some( ( entry ) => entry.key === "E003" ) );
        const cl024 = list( "CL024" );
        const mapping = cl024.columns.findIndex( ( column ) => column.title === "CL022 Mapping" );
        assert.equal( cl024.entries.find( ( entry ) => entry.key === "01-00A-00" ).values[ mapping ], "01-00A" );
        assert.ok( list( "CL015" ).entries.some( ( entry ) => entry.description.bg === "Русе" ) );
    } );
} );
