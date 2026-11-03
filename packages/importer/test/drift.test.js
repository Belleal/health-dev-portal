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
 * The generator's acceptance (design record §5.5): XSDs generated from a workbook against the published XSDs.
 *
 * Like for like, e-Dental 1.0.5 and e-Hospitalization 1.0.6 are the exact versions of a published set. Their drift
 * reports are kept in test/expected/ and compared whole, so a change in what the generator produces shows in review as
 * a change to those files. Every unexplained entry in them was read against the workbook and the published XSD; see
 * each file's notes. To rewrite them after a deliberate change, run the tests with HDP_WRITE_SNAPSHOTS=1, then read
 * the diff.
 *
 * Across versions, the current workbooks against the same set: the count per cause is pinned.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { importSet } = require( "#set-importer" );
const { driftReport, importXsdSet } = require( "#xsd-importer" );

const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public" );
const EXPECTED = path.join( __dirname, "expected" );
const NOMENCLATURES = "nomenclatures-1.5.33.xlsx";
const PAIRS = Object.freeze( { "e-dental": "edental-1.0.5.xlsx", "e-hospitalization": "ehospitalization-1.0.6.xlsx" } );
const CURRENT = Object.freeze( {
    "e-prescription": "eprescription-1.5.1.xlsx",
    "common-services": "common-services-1.2.2.xlsx",
    "e-referral": "ereferral-1.4.4.xlsx",
    "e-dental": "edental-1.0.7.xlsx",
    "e-examination": "eexamination-1.3.10.xlsx",
    "e-hospitalization": "ehospitalization-1.1.1.xlsx",
    "e-immunization": "eimmunization-1.2.2.xlsx"
} );
const PRESENT = [ "api-v1/NHIS-Entities.xsd", NOMENCLATURES, ...Object.values( PAIRS ), ...Object.values( CURRENT ) ]
    .every( ( file ) => fs.existsSync( path.join( DIRECTORY, file ) ) );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "A public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

// Measured on 2026-11-03, after e-Dental 1.0.7's unexplained entries were read in full: its 55 are 1.0.5's 53, which
// are real drift (see drift-edental-1.0.5.json), and patientSignature in D001 and D003, added in 1.0.7 at the message
// root although its change note says "to tag dentalTreatment" (HEL-26). Across versions an unexplained entry is also
// a change no note names, so these counts are a baseline for review, not a verdict. Since the final review, a note
// explains only its own message and quoted path, never an order difference, and a field today's shared type requires
// is no looseness.
const ACROSS_VERSIONS = Object.freeze( {
    "e-prescription": { "deliberate": 136, "unexplained": 91, "change-note": 33, "shared-type": 21, "choice": 13 },
    "common-services": { "deliberate": 94, "unexplained": 94, "shared-type": 11, "change-note": 9, "choice": 3 },
    "e-referral": { "deliberate": 256, "unexplained": 183, "choice": 34, "change-note": 2, "shared-type": 19 },
    "e-dental": { "deliberate": 97, "unexplained": 55, "shared-type": 1 },
    "e-examination": { "deliberate": 128, "unexplained": 83, "change-note": 7, "shared-type": 16 },
    "e-hospitalization": { "deliberate": 163, "unexplained": 107, "choice": 3, "shared-type": 21, "change-note": 6 },
    "e-immunization": { "deliberate": 68, "unexplained": 46, "change-note": 18, "shared-type": 6 }
} );

const count = ( entries, key ) => entries.reduce( ( counts, entry ) => ( { ...counts, [ entry[ key ] ]: ( counts[ entry[ key ] ] || 0 ) + 1 } ), {} );
const line = ( entry ) => `${ entry.message } ${ entry.path }${ entry.attribute ? `@${ entry.attribute }` : "" } ${ entry.kind } ${ entry.cause }`;

// The snapshot is the report plus the reader's notes on its unexplained entries, which the test leaves alone.
function matchesSnapshot( name, report ) {
    const file = path.join( EXPECTED, name );
    if ( process.env.HDP_WRITE_SNAPSHOTS ) {
        const notes = fs.existsSync( file ) ? JSON.parse( fs.readFileSync( file, "utf8" ) ).notes : {};
        fs.mkdirSync( EXPECTED, { recursive: true } );
        fs.writeFileSync( file, `${ JSON.stringify( { notes: notes, skipped: report.skipped, entries: report.entries }, null, 2 ) }\n` );
        return;
    }
    const expected = JSON.parse( fs.readFileSync( file, "utf8" ) );
    assert.deepEqual( { skipped: report.skipped, entries: report.entries }, { skipped: expected.skipped, entries: expected.entries } );
    // Every unexplained entry has been read: its note says whether it is real drift or a defect still to fix. A note
    // keyed with * for the message covers that finding in every message.
    assert.deepEqual( report.entries.filter( ( entry ) => entry.cause === "unexplained" ).map( line )
        .filter( ( key ) => !expected.notes[ key ] && !expected.notes[ key.replace( /^\S+/, "*" ) ] ), [] );
}

describe( "The drift report", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let xsd;
    let nomenclatures;
    const reportOf = async ( spec, file ) => {
        const set = await importSet( { modules: [ { spec: spec, source: path.join( DIRECTORY, file ) } ] } );
        return driftReport( set.modules[ 0 ].version, nomenclatures, xsd.set );
    };

    before( async () => {
        xsd = await importXsdSet( path.join( DIRECTORY, "api-v1" ) );
        nomenclatures = ( await importSet( { nomenclatures: { source: path.join( DIRECTORY, NOMENCLATURES ) } } ) ).nomenclatures.version;
    } );

    describe( "like for like", () => {

        it( "matches e-Dental 1.0.5's drift report", async () => {
            const report = await reportOf( "e-dental", PAIRS[ "e-dental" ] );
            assert.deepEqual( report.skipped, [] );
            // As the recon measured, seven fields come from shared types. D006's nhifCode is optional there, a looseness;
            // header/senderISName is required in the six responses, so a message without it is refused (final review).
            assert.deepEqual( report.entries.filter( ( entry ) => entry.kind === "only-published" ).map( line ), [
                "D002 header/senderISName only-published unexplained",
                "D004 header/senderISName only-published unexplained",
                "D006 header/senderISName only-published unexplained",
                "D006 contents/results/performer/qualification@nhifCode only-published shared-type",
                "D008 header/senderISName only-published unexplained",
                "D010 header/senderISName only-published unexplained",
                "D099 header/senderISName only-published unexplained"
            ] );
            assert.deepEqual( report.entries.filter( ( entry ) => entry.kind === "cardinality" ).map( ( entry ) => `${ entry.message } ${ entry.path } ${ entry.published } ${ entry.generated }` ), [
                "D006 contents/results 0..20 0..*",
                "D006 contents/results/dentalTreatment/dentalProcedure/status 0..1 1..1",
                "D099 contents/error/description 0..1 0..*"
            ] );
            assert.equal( report.entries.filter( ( entry ) => entry.kind === "only-generated" ).length, 0 );
            matchesSnapshot( "drift-edental-1.0.5.json", report );
        } );

        it( "matches e-Hospitalization 1.0.6's drift report, over its twelve importable messages", async () => {
            const report = await reportOf( "e-hospitalization", PAIRS[ "e-hospitalization" ] );
            assert.deepEqual( report.skipped.map( ( skipped ) => skipped.code ), [ "H001", "H002", "H003", "H009", "H011" ] );
            assert.deepEqual( report.entries.filter( ( entry ) => entry.kind === "only-published" ).map( ( entry ) => `${ entry.message } ${ entry.path }${ entry.attribute ? `@${ entry.attribute }` : "" }` ), [
                "H004 header/senderISName",
                "H005 contents/hospitalization/epicrisis/dischargingPhysician/qualification@nhifCode",
                "H006 header/senderISName",
                "H007 contents/accommodation/attendingPhysician/qualification@nhifCode",
                "H008 header/senderISName",
                "H010 header/senderISName",
                "H012 header/senderISName",
                "H013 contents/epicrisis/dischargingPhysician/qualification@nhifCode",
                "H014 header/senderISName",
                "H016 header/senderISName",
                "H099 header/senderISName"
            ] );
            assert.deepEqual( report.entries.filter( ( entry ) => entry.kind === "cardinality" ).map( ( entry ) => `${ entry.message } ${ entry.path } ${ entry.published } ${ entry.generated }` ), [
                "H005 contents/hospitalization/dischargeDiagnosis/additionalCode 0..1 0..*",
                "H005 contents/hospitalization/comorbidity/additionalCode 0..1 0..*",
                "H099 contents/error/description 0..1 0..*"
            ] );
            assert.equal( report.entries.filter( ( entry ) => entry.kind === "only-generated" ).length, 0 );
            matchesSnapshot( "drift-ehospitalization-1.0.6.json", report );
        } );
    } );

    describe( "across versions", () => {

        it( "pins the causes per module, the current workbooks against /api/v1/", async () => {
            const causes = {};
            for ( const [ spec, file ] of Object.entries( CURRENT ) ) {
                causes[ spec ] = count( ( await reportOf( spec, file ) ).entries, "cause" );
            }
            assert.deepEqual( causes, ACROSS_VERSIONS );
        } );
    } );
} );
