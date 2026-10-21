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
 * The conditions of all eight production module workbooks, linked with nomenclatures 1.5.33 (design record §6.9).
 * Every expected value was measured on 2026-10-21. The headline figures were checked against measurements independent
 * of this code: 1,259 path references, 344 of them unresolved before de-duplication, against §6.9's prototype's
 * "about 1,290" and "about 340".
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { importSet } = require( "#set-importer" );
const { parseCondition } = require( "@health-dev-portal/spec-model/condition-parser" );

const DIRECTORY = path.resolve( __dirname, "../../../.fixtures/public" );
const NOMENCLATURES = "nomenclatures-1.5.33.xlsx";
const MODULES = Object.freeze( {
    "e-prescription": "eprescription-1.5.1.xlsx",
    "common-services": "common-services-1.2.2.xlsx",
    "e-referral": "ereferral-1.4.4.xlsx",
    "e-dental": "edental-1.0.7.xlsx",
    "e-examination": "eexamination-1.3.10.xlsx",
    "e-hospitalization": "ehospitalization-1.1.1.xlsx",
    "long-term-care": "longterm-care-1.0.4.xlsx",
    "e-immunization": "eimmunization-1.2.2.xlsx"
} );
const PRESENT = [ NOMENCLATURES, ...Object.values( MODULES ) ].every( ( file ) => fs.existsSync( path.join( DIRECTORY, file ) ) );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "A public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

describe( "The conditions of the eight production modules", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let modules;
    const perModule = ( measure ) => Object.fromEntries( modules.map( ( result ) => [ result.version.spec, measure( result ) ] ) );
    const ofType = ( result, type ) => result.anomalies.filter( ( anomaly ) => anomaly.type === type );
    const condition = ( spec, id ) => modules.find( ( result ) => result.version.spec === spec ).version.conditions.find( ( candidate ) => candidate.id === id );

    before( async () => {
        const set = await importSet( {
            nomenclatures: { source: path.join( DIRECTORY, NOMENCLATURES ) },
            modules: Object.entries( MODULES ).map( ( [ spec, file ] ) => ( { spec: spec, source: path.join( DIRECTORY, file ) } ) )
        } );
        modules = set.modules;
    } );

    it( "reads every non-empty production condition but CDR33", () => {
        // Per module: the conditions, the empty ones, and the ones that cannot be read.
        assert.deepEqual( perModule( ( result ) => [
            result.version.conditions.length,
            result.version.conditions.filter( ( candidate ) => candidate.text.trim() === "" ).length,
            ofType( result, "unparsed-condition" ).map( ( anomaly ) => anomaly.details.id )
        ] ), {
            "e-prescription": [ 38, 2, [] ],
            "common-services": [ 23, 2, [] ],
            "e-referral": [ 36, 1, [ "CDR33" ] ],
            "e-dental": [ 12, 8, [] ],
            "e-examination": [ 29, 3, [] ],
            "e-hospitalization": [ 23, 2, [] ],
            "long-term-care": [ 0, 0, [] ],
            "e-immunization": [ 10, 2, [] ]
        } );
        // Kept as notes: CDP14's and CDX28's THEN, and CDH02's cardinality of '[newbornNumber]'.
        assert.deepEqual( modules.flatMap( ( result ) => ofType( result, "free-text-effect" ).map( ( anomaly ) => anomaly.details.id ) ), [ "CDP14", "CDX28", "CDH02" ] );
    } );

    it( "round-trips every production condition: printing then parsing gives it back (Review Focus 4)", () => {
        const parsed = modules.flatMap( ( result ) => result.version.conditions ).filter( ( candidate ) => candidate.parsed );
        assert.equal( parsed.length, 150 );
        for ( const candidate of parsed ) {
            const again = parseCondition( candidate.printed );
            assert.deepEqual( again.condition, candidate.parsed, candidate.id );
            assert.deepEqual( again.forms, [], candidate.id );
        }
    } );

    it( "prints CDP01, CDR01 and CDH13 in the canonical form", () => {
        assert.equal( condition( "e-prescription", "CDP01" ).printed, [
            "IF 'prescription.category'.value IN ['T2', 'T3']",
            "THEN 'prescription.isProtocolBased'.required = 'R'",
            "ELSE 'prescription.isProtocolBased'.required = 'O'"
        ].join( "\n" ) );
        // Alternatives, and a bare '..' for the naming element.
        assert.equal( condition( "e-referral", "CDR01" ).printed, [
            "IF 'nrnReferral'.value IS null",
            "THEN ('lrn'.required = 'R' AND 'pmi'.required = 'R') OR ('identifier'.required = 'R' AND 'fromDate'.required = 'O' AND 'toDate'.required = 'O')",
            "ELSE THIS.value IS null"
        ].join( "\n" ) );
        // The workbook's requirement is a Cyrillic О, folded to the letter O.
        assert.equal( condition( "e-hospitalization", "CDH13" ).printed, [
            "IF 'nrnHospitalization'.value IS null",
            "THEN THIS.required = 'O'",
            "ELSE THIS.value IS null"
        ].join( "\n" ) );
    } );

    it( "blocks exactly the eight values that are not code-list keys (HEL-20)", () => {
        // e-Prescription's CDP08 compares with a Cyrillic Т3, which folds to the key T3 and so is not among them.
        assert.deepEqual( modules.flatMap( ( result ) => ofType( result, "unknown-condition-value" )
            .map( ( anomaly ) => [ result.version.spec, anomaly.details.id, anomaly.details.value, anomaly.details.list, anomaly.level ] ) ), [
            [ "common-services", "CDC17", "VNT001", "CL022", "blocking" ],
            [ "common-services", "CDC17", "10.64", "CL022", "blocking" ],
            [ "common-services", "CDC08", "NOM", "CL028", "blocking" ],
            [ "common-services", "CDC04", "QN", "CL028", "blocking" ],
            [ "common-services", "CDC05", "NOM", "CL028", "blocking" ],
            [ "common-services", "CDC06", "NAR", "CL028", "blocking" ],
            [ "common-services", "CDC12", "QN", "CL028", "blocking" ],
            [ "e-referral", "CDR17", "10.64", "CL022", "blocking" ]
        ] );
    } );

    it( "pins each module's unresolved paths", () => {
        // Per module: other paths once per condition, message and path, and relative ones once per naming element too,
        // as a relative path can fail from one element and hold from another. Plan 4 resolves the entity names
        // ('patient.…') among the first. Both counts were re-derived from the bindings alone.
        assert.deepEqual( perModule( ( result ) => [ ofType( result, "unresolved-condition-path" ).length, ofType( result, "unresolved-relative-path" ).length ] ), {
            "e-prescription": [ 86, 0 ],
            "common-services": [ 12, 0 ],
            "e-referral": [ 52, 14 ],
            "e-dental": [ 4, 0 ],
            "e-examination": [ 27, 93 ],
            "e-hospitalization": [ 7, 6 ],
            "long-term-care": [ 0, 0 ],
            "e-immunization": [ 6, 0 ]
        } );
    } );

    // Review Focus 1, as the final review measured it: R010 binds CDR21 from its execution element, and only its
    // diagnostic report's reference range, from which no observation can be reached, is reported.
    it( "reports CDR21 in R010 only at the element it fails from", () => {
        const referral = modules.find( ( result ) => result.version.spec === "e-referral" );
        assert.deepEqual( ofType( referral, "unresolved-relative-path" ).filter( ( anomaly ) => anomaly.details.id === "CDR21" )
            .map( ( anomaly ) => [ anomaly.details.message, anomaly.details.element, anomaly.details.path ] ), [
            [ "R010", "contents/results/examination/diagnosticReport/result/referenceRange", "..observation.valueScale" ],
            [ "R010", "contents/results/examination/diagnosticReport/result/referenceRange", "..observation.referenceRange" ]
        ] );
        assert.ok( referral.version.conditionBindings.some( ( binding ) => binding.condition === "CDR21" && binding.message === "R010"
            && Object.values( binding.paths ).every( ( identity ) => identity !== null ) ) );
    } );
} );
