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
 * The same checks run on every edit (design record §5.4), measured on the published workbooks: on the content the
 * importer read, checkContent finds every anomaly of the model the importer found, at the same row. The sheet readers and
 * checkContent were two implementations with no such test, and eight checks were missing from the second before anyone
 * noticed (final review of plan 6a, I2).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { ANOMALY_TYPES } = require( "@health-dev-portal/spec-model/anomalies" );
const { splitNomenclatures } = require( "@health-dev-portal/spec-model/code-lists" );
const { readWorkbook } = require( "#workbook-reader" );
const { streamSheets } = require( "#stream-reader" );
const { importModuleWorkbook } = require( "#module-importer" );
const { importNomenclaturesWorkbook } = require( "#nomenclatures-importer" );
const { importRulesWorkbook } = require( "#rules-importer" );
const { checkContent } = require( "#check-content" );

const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public" );
const MODULES = [ "common-services-1.2.2.xlsx", "edental-1.0.5.xlsx", "edental-1.0.7.xlsx", "eexamination-1.3.10.xlsx", "ehospitalization-1.0.6.xlsx",
    "ehospitalization-1.1.1.xlsx", "eimmunization-1.2.2.xlsx", "eprescription-1.5.1.xlsx", "ereferral-1.4.4.xlsx", "longterm-care-1.0.4.xlsx" ];
const PRESENT = [ ...MODULES, "rules-1.1.1.xlsx", "nomenclatures-1.5.33.xlsx" ].every( ( file ) => fs.existsSync( path.join( DIRECTORY, file ) ) );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "A public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

// About a workbook's form — its sheets, cells, fills, colours and the spelling of a value — which content cannot hold.
const WORKBOOK = new Set( [ "missing-sheet", "missing-header-row", "missing-column", "missing-version", "version-mismatch", "notes-before-version",
    "non-canonical-version-heading", "versions-out-of-order", "unknown-note-colour", "ambiguous-sheet", "invalid-date", "message-without-sheet",
    "sheet-without-message", "unknown-tab-colour", "unknown-direction", "depth-jump", "invalid-requirement", "invalid-cardinality", "attribute-without-field",
    "note-row", "look-alike-letter", "mixed-script-word", "unknown-fill", "end-fill-on-data-row", "asterisks-disagree", "unexpected-end-row", "unparsed-constraint",
    "invalid-reference", "multiple-code-lists", "attribute-tag-mismatch", "skipped-rows", "non-canonical-version", "date-instead-of-version", "invalid-version",
    "unknown-list-status", "invalid-flag", "duplicate-list", "list-without-sheet", "sheet-not-listed", "unknown-rule-colour" ] );
// Reported and dropped by the reader — a row without a name or with a malformed code, a key's repeat — so the content it
// gives cannot show them. checkContent finds them in an edit (check-content.test.js).
const DROPPED = new Set( [ "missing-name", "malformed-message-code", "malformed-rule-id", "duplicate-key" ] );

// Every other type, at its sheet and row; a type added to the registry is compared until it is classified otherwise.
const ofTheModel = ( anomalies ) => anomalies.filter( ( anomaly ) => !WORKBOOK.has( anomaly.type ) && !DROPPED.has( anomaly.type ) )
    .map( ( anomaly ) => `${ anomaly.type } ${ anomaly.sheet }:${ anomaly.row }` ).sort();
const contentOf = ( version ) => Object.fromEntries( Object.entries( version ).filter( ( [ field ] ) => field !== "changeNotes" ) );
const NONE = Object.freeze( { codeLists: null, rules: null, catalogue: null } );

describe( "checkContent on the published workbooks", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {

    it( "classifies only types the registry has", () => {
        assert.deepEqual( [ ...WORKBOOK, ...DROPPED ].filter( ( type ) => !Object.hasOwn( ANOMALY_TYPES, type ) ), [] );
    } );

    for ( const file of MODULES ) {
        it( `finds in ${ file } every anomaly of the model the importer found`, async () => {
            const result = importModuleWorkbook( await readWorkbook( path.join( DIRECTORY, file ) ), { spec: file.replace( /-\d.*$/, "" ), fileName: file } );
            assert.deepEqual( ofTheModel( checkContent( "module", contentOf( result.version ), NONE ).anomalies ), ofTheModel( result.anomalies ) );
        } );
    }

    it( "finds in the rules every anomaly of the model the importer found", async () => {
        const result = importRulesWorkbook( await readWorkbook( path.join( DIRECTORY, "rules-1.1.1.xlsx" ) ), { fileName: "rules-1.1.1.xlsx" } );
        assert.deepEqual( ofTheModel( checkContent( "rules", contentOf( result.version ), NONE ).anomalies ), ofTheModel( result.anomalies ) );
    } );

    it( "finds in every code list every anomaly of the model the importer found", async () => {
        const result = await importNomenclaturesWorkbook( streamSheets( path.join( DIRECTORY, "nomenclatures-1.5.33.xlsx" ) ), { fileName: "nomenclatures-1.5.33.xlsx" } );
        const checked = splitNomenclatures( result.version ).lists.flatMap( ( list ) => checkContent( "code-list", contentOf( list ), NONE ).anomalies );
        assert.deepEqual( ofTheModel( checked ), ofTheModel( result.anomalies ) );
    } );
} );
