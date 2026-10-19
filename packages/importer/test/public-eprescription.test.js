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
 * The real e-Prescription 1.5.1 workbook, as published. Every expected value here was measured on 2026-10-19 with a
 * prototype independent of this code (design record §5.7); a failure means the importer and the measurement disagree.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { readWorkbook } = require( "#workbook-reader" );
const { importModuleWorkbook } = require( "#module-importer" );

const FIXTURE = path.resolve( __dirname, "../../../.fixtures/public/eprescription-1.5.1.xlsx" );
const PRESENT = fs.existsSync( FIXTURE );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "The public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

const flatten = ( elements ) => elements.flatMap( ( node ) => [ node, ...flatten( node.children ) ] );

describe( "e-Prescription 1.5.1, the published workbook", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let result;
    const message = ( code ) => result.version.messages.find( ( candidate ) => candidate.code === code );
    const element = ( code, identity ) => flatten( message( code ).elements ).find( ( node ) => node.identity === identity );

    before( async () => {
        result = importModuleWorkbook( await readWorkbook( FIXTURE ), { spec: "e-prescription", fileName: "НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx" } );
    } );

    it( "imports with no blocking anomaly", () => {
        assert.deepEqual( result.anomalies.filter( ( anomaly ) => anomaly.level === "blocking" ), [] );
    } );

    it( "reads the version and the whole change history", () => {
        assert.equal( result.version.version, "1.5.1" );
        const versions = result.version.changeNotes;
        assert.equal( versions.length, 28 );
        assert.equal( versions[ 0 ].version, "1.0.2" );
        const notes = versions.flatMap( ( version ) => version.notes );
        assert.equal( notes.filter( ( note ) => note.category === "breaking" ).length, 30 );
        assert.equal( notes.filter( ( note ) => note.category === "dropped-plan" ).length, 0 );
    } );

    it( "lists the 23 messages with their status from the tab colours", () => {
        const byLifecycle = ( lifecycle ) => result.version.messages.filter( ( candidate ) => candidate.lifecycle === lifecycle ).map( ( candidate ) => candidate.code );
        assert.equal( result.version.messages.length, 23 );
        assert.deepEqual( byLifecycle( "withdrawn" ), [ "P011", "P012" ] );
        assert.deepEqual( byLifecycle( "in-development" ), [ "P021", "P022" ] );
        assert.equal( byLifecycle( "active" ).length, 19 );
    } );

    it( "pairs requests with responses and keeps P099 as the error message", () => {
        assert.equal( message( "P001" ).address, "/v4/eprescription/doctor/issue" );
        assert.equal( message( "P001" ).pairedWith, "P002" );
        assert.equal( message( "P099" ).pairedWith, null );
    } );

    it( "builds P001's tree", () => {
        assert.equal( flatten( message( "P001" ).elements ).length, 95 );
        const lrn = element( "P001", "contents/prescription/lrn@value" );
        assert.equal( lrn.requirement, "R" );
        assert.deepEqual( lrn.cardinality, { min: 1, max: 1 } );
        assert.equal( lrn.constraint.maxLength, 36 );
        assert.equal( lrn.constraint.charset, "an" );
        const name = element( "P001", "contents/prescription/group/medication/medicationCode@name" );
        assert.equal( name.kind, "attribute" );
        assert.equal( name.codeList, "CL009" );
        assert.deepEqual( name.rules, [ "RL023" ] );
        const unit = element( "P001", "contents/prescription/group/medication/dosageInstruction/doseQuantityCode@value" );
        assert.equal( unit.kind, "polymorphic" );
        assert.deepEqual( unit.children.map( ( variant ) => variant.dataType ), [ "String", "Codeable Concept" ] );
        assert.equal( unit.children[ 1 ].codeList, "CL035" );
        assert.equal( element( "P001", "contents/prescription/allowedRepeatsNumber@value" ).constraint.maxValue, 1 );
    } );

    it( "reports the known source defects as warnings", () => {
        const warnings = result.anomalies.filter( ( anomaly ) => anomaly.level === "warning" );
        // HEL-10: nine message titles spell "E-рецепта" with a Latin E.
        assert.equal( warnings.filter( ( anomaly ) => anomaly.type === "mixed-script-word" && anomaly.sheet === "Съобщения" ).length, 9 );
        // P001 row 16: "Е-prescription LRN" starts with a Cyrillic Е.
        assert.ok( warnings.some( ( anomaly ) => anomaly.type === "mixed-script-word" && anomaly.sheet === "P001" && anomaly.row === 16 ) );
        // HEL-12: 30 requirement cells hold a Cyrillic О.
        assert.equal( warnings.filter( ( anomaly ) => anomaly.type === "look-alike-letter" && anomaly.column === 2 ).length, 30 );
        // HEL-5: CDP09 and CDP36 are empty.
        assert.deepEqual( warnings.filter( ( anomaly ) => anomaly.type === "empty-condition" ).map( ( anomaly ) => anomaly.details.id ), [ "CDP09", "CDP36" ] );
    } );
} );
