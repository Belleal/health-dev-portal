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
 * A whole module workbook into one module version: messages with their trees and statuses, conditions, dictionary,
 * change history — and every anomaly from every sheet.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { importModuleWorkbook } = require( "#module-importer" );
const { element, messageSheet, row, sheet } = require( "./support/raw-builders" );
const { confirmationRows, moduleSheets } = require( "./support/fixtures" );

const workbook = ( sheets ) => ( { sheets: sheets, themeColours: {} } );
const types = ( result ) => result.anomalies.map( ( anomaly ) => anomaly.type );
const replace = ( sheets, name, replacement ) => sheets.map( ( candidate ) => ( candidate.name === name ? replacement : candidate ) );

describe( "importModuleWorkbook", () => {

    it( "imports a sound module with no anomaly", () => {
        const result = importModuleWorkbook( workbook( moduleSheets() ), { spec: "e-prescription" } );
        assert.deepEqual( result.anomalies, [] );
        assert.equal( result.version.kind, "module" );
        const { version } = result;
        assert.equal( version.spec, "e-prescription" );
        assert.equal( version.version, "1.1.0" );
        assert.deepEqual( version.messages.map( ( message ) => [ message.code, message.lifecycle, message.changedInVersion ] ),
            [ [ "P001", "active", false ], [ "P002", "active", false ], [ "P099", "active", false ] ] );
        assert.ok( version.messages[ 0 ].elements.length > 0 );
        assert.equal( version.conditions.length, 4 );
        assert.equal( version.dictionary.length, 1 );
        assert.equal( version.changeNotes.length, 2 );
        assert.ok( Object.isFrozen( version.messages[ 0 ] ) );
    } );

    it( "takes each message's lifecycle from its tab colour", () => {
        const sheets = replace( replace( moduleSheets(),
            "P002", messageSheet( "P002", confirmationRows(), "ED7D31" ) ),
            "P099", messageSheet( "P099", confirmationRows(), "C00000" ) );
        const [ , confirmation, error ] = importModuleWorkbook( workbook( sheets ), { spec: "e-prescription" } ).version.messages;
        assert.equal( confirmation.lifecycle, "in-development" );
        assert.equal( error.lifecycle, "withdrawn" );
    } );

    it( "warns about an unknown or missing tab colour", () => {
        const result = importModuleWorkbook( workbook( replace( moduleSheets(), "P002", messageSheet( "P002", confirmationRows(), null ) ) ), { spec: "e" } );
        assert.deepEqual( types( result ), [ "unknown-tab-colour" ] );
        assert.equal( result.version.messages[ 1 ].lifecycle, null );
    } );

    it( "blocks a listed message without a sheet and a workbook without a required sheet", () => {
        assert.deepEqual( types( importModuleWorkbook( workbook( moduleSheets().filter( ( candidate ) => candidate.name !== "P002" ) ), { spec: "e" } ) ),
            [ "message-without-sheet" ] );
        assert.deepEqual( types( importModuleWorkbook( workbook( moduleSheets().filter( ( candidate ) => candidate.name !== "Съобщения" ) ), { spec: "e" } ) ),
            [ "missing-sheet", "sheet-without-message", "sheet-without-message", "sheet-without-message" ] );
    } );

    it( "warns about a message sheet the index does not list", () => {
        const result = importModuleWorkbook( workbook( [ ...moduleSheets(), messageSheet( "P005", confirmationRows() ) ] ), { spec: "e" } );
        assert.deepEqual( types( result ), [ "sheet-without-message" ] );
    } );

    it( "matches a sheet whose name has stray spaces (Review Focus 4)", () => {
        const result = importModuleWorkbook( workbook( replace( moduleSheets(), "P002", messageSheet( "P002 ", confirmationRows() ) ) ), { spec: "e" } );
        assert.deepEqual( result.anomalies, [] );
        assert.ok( result.version.messages[ 1 ].elements.length > 0 );
    } );

    it( "blocks a workbook whose change notes name no version, and warns when the file name disagrees", () => {
        const noVersion = replace( moduleSheets(), "Change Notes", sheet( "Change Notes", [] ) );
        assert.deepEqual( types( importModuleWorkbook( workbook( noVersion ), { spec: "e" } ) ), [ "missing-version" ] );
        const mismatch = importModuleWorkbook( workbook( moduleSheets() ), { spec: "e", fileName: "НЗИС Е-Рецепта - API Спецификация v1.0.9.xlsx" } );
        assert.deepEqual( types( mismatch ), [ "version-mismatch" ] );
        assert.deepEqual( mismatch.anomalies[ 0 ].details, { fileVersion: "1.0.9", version: "1.1.0" } );
    } );

    it( "imports a module whose codes are not P/CDP (Review Focus 1)", () => {
        const header = moduleSheets()[ 0 ].rows[ 1 ];
        const referralRows = [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Patient Country", req: "C", card: "0..1", conditions: "CDR07", codeList: "CL005", tag: "country", attribute: "value" } )
        ];
        const sheets = [
            sheet( "Съобщения", [
                header,
                row( 4, [ "Заявка за създаване на Е-направление", "R001", "eReferral Issue Request", "/v1/ereferral/doctor/issue", "Request", "", "", "" ] ),
                row( 5, [ "Потвърждение", "R002", "eReferral Issue Confirmation", "---", "Response", "", "", "" ] )
            ] ),
            messageSheet( "R001", referralRows ),
            messageSheet( "R002", confirmationRows() ),
            sheet( "Change Notes", [ row( 1, [ "Версия 1.4.4" ] ) ] ),
            sheet( "Conditions", [ row( 1, [ "Condition ID", "Condition Logic" ] ), row( 3, [ "CDR07", "IF 'x'.value = '1'" ] ) ] )
        ];
        const result = importModuleWorkbook( workbook( sheets ), { spec: "e-referral" } );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.version.messages.map( ( message ) => message.pairedWith ), [ "R002", "R001" ] );
    } );

    it( "blocks two sheets whose names are equal once trimmed", () => {
        // "P002" and a stale "P002 " both present: whichever came first in tab order was used, silently (final review).
        const result = importModuleWorkbook( workbook( [ ...moduleSheets(), messageSheet( "P002 ", confirmationRows() ) ] ), { spec: "e" } );
        assert.deepEqual( types( result ), [ "ambiguous-sheet" ] );
        assert.equal( result.anomalies[ 0 ].level, "blocking" );
    } );

    it( "takes the highest version when the change notes run newest first", () => {
        const notes = sheet( "Change Notes", [ row( 1, [ "Версия 1.1.0" ] ), row( 2, [ "Newer" ] ), row( 3, [ "Версия 1.0.0" ] ), row( 4, [ "Older" ] ) ] );
        const result = importModuleWorkbook( workbook( replace( moduleSheets(), "Change Notes", notes ) ), { spec: "e" } );
        assert.equal( result.version.version, "1.1.0" );
        assert.deepEqual( types( result ), [ "versions-out-of-order" ] );
    } );

    it( "blocks a reference to a condition the Conditions sheet does not define", () => {
        // Design record §5.3 lists it as blocking, and both sides are in the same workbook.
        const conditions = sheet( "Conditions", moduleSheets().find( ( candidate ) => candidate.name === "Conditions" ).rows.filter( ( candidate ) => candidate.number < 10 || candidate.number > 11 ) );
        const result = importModuleWorkbook( workbook( replace( moduleSheets(), "Conditions", conditions ) ), { spec: "e" } );
        assert.deepEqual( types( result ), [ "unknown-condition" ] );
        assert.equal( result.anomalies[ 0 ].details.id, "CDP21" );
        assert.equal( result.anomalies[ 0 ].level, "blocking" );
    } );

    it( "requires a spec key", () => {
        assert.throws( () => importModuleWorkbook( workbook( moduleSheets() ), {} ), TypeError );
    } );
} );
