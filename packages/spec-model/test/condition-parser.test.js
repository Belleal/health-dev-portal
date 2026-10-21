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
 * Reading conditions (design record §6): the canonical language, and the looser forms the workbooks write (§6.8).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { parseCondition } = require( "@health-dev-portal/spec-model/condition-parser" );
const { printCondition } = require( "@health-dev-portal/spec-model/condition-printer" );


describe( "parseCondition", () => {

    const CDP01_WORKBOOK = "IF 'prescription.category'.value = 'T2' OR 'T3'\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'";
    const CDR01_WORKBOOK = "IF 'nrnReferral'.value IS null\nTHEN ('lrn'.required = 'R' AND 'pmi'.required = 'R') OR ('identifier'.required = 'R' AND 'fromDate'.required = 'O' AND 'toDate'.required = 'O')\nELSE '..'.value IS null";
    const CDX29_WORKBOOK = "IF '..diagnosis.code'.meta['Contagious'] IS NOT NULL\nTHEN '..diagnosis.diseasesReporting'.value.required = 'R'\nELSE '..diagnosis.diseasesReporting'.value IS null";
    const CDP30_WORKBOOK = "IF 'subject.gender'.value = '1'\nTHEN 'medication.mkb'.value != 'E89.4x' OR 'N80.xx'\nELSE 'medication.mkb'.value IS any";
    const read = ( text, options ) => parseCondition( text, options );

    it( "reads the canonical form with no dialect form", () => {
        const text = "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'";
        const result = read( text );
        assert.deepEqual( [ result.forms, result.notes, result.error ], [ [], [], null ] );
        assert.equal( printCondition( result.condition ), text );
    } );

    it( "prints what it parses: a printed condition parses back to itself", () => {
        for ( const text of [ CDP01_WORKBOOK, CDR01_WORKBOOK, CDX29_WORKBOOK, CDP30_WORKBOOK ] ) {
            const first = read( text ).condition;
            const again = read( printCondition( first ) );
            assert.deepEqual( again.forms, [] );
            assert.deepEqual( again.condition, first );
        }
    } );

    it( "lists the dialect forms each workbook condition uses", () => {
        assert.deepEqual( read( CDP01_WORKBOOK ).forms, [ "shorthand OR" ] );
        assert.deepEqual( read( CDR01_WORKBOOK ).forms, [ "bare '*' or '..'" ] );
        assert.deepEqual( read( CDX29_WORKBOOK ).forms, [ ".value.required", ".meta[…]" ] );
        assert.deepEqual( read( CDP30_WORKBOOK ).forms, [ "shorthand OR", "x as a wildcard" ] );
        assert.deepEqual( read( "IF 'a'.value = 1 && 'b'.value != '01.01' AND != '01.04'\nTHEN 'c'.required = 'R'\nELSE 'c'.value = ANY" ).forms,
            [ "&&", "left side omitted", "unquoted value", "ANY without IS" ] );
        assert.deepEqual( read( "IF 'q'.nhifCode IS NOT null\nTHEN 'q'.nhifCode IN CL006.nhifCode\nELSE 'q' NOT IN [VF036, VF037]" ).forms,
            [ "unquoted value", "attribute without @", "CLxxx.column", "missing property" ] );
        assert.deepEqual( read( "IF 'x'.value = '2'\nTHEN 'y'.required = 'R'\nELSE 'y'.value = 'BG' (fixed)" ).forms, [ "annotation" ] );
    } );

    it( "reads x as a wildcard only at the end of a code (Review Focus 3)", () => {
        const effect = ( text ) => read( `IF 'a'.value = '1'\nTHEN 'b'.value = '${ text }'` ).condition.then.alternatives[ 0 ][ 0 ];
        assert.deepEqual( [ effect( "N80.xx" ).operator, effect( "N80.xx" ).values ], [ "matches", [ "N80.??" ] ] );
        assert.deepEqual( effect( "E89.4x" ).values, [ "E89.4?" ] );
        for ( const literal of [ "xml", "Max", "1x2", "x" ] ) {
            assert.deepEqual( [ effect( literal ).operator, effect( literal ).values ], [ "=", [ literal ] ], literal );
        }
    } );

    it( "keeps an unreadable clause as a note, and reads the others (Review Focus 2)", () => {
        const result = read( "IF 'header.sender'.value = '1' OR '2' OR '3'\nTHEN 'header.senderId'.value to be populated with person's identifier (pmi/pphi) that is sending the request\nELSE 'header.senderId'.value = 'NHIS'" );
        assert.equal( result.error, null );
        assert.deepEqual( result.notes, [ "'header.senderId'.value to be populated with person's identifier (pmi/pphi) that is sending the request" ] );
        assert.equal( result.condition.then.alternatives[ 0 ][ 0 ].kind, "note" );
        assert.deepEqual( result.condition.otherwise.alternatives[ 0 ][ 0 ].values, [ "NHIS" ] );
    } );

    it( "leaves a condition whose IF cannot be read as unread, with the reason", () => {
        const result = read( "IF 'referral.financingSource'.value = '2' AND CL006.nhifCode IS NOT null\nTHEN 'q'.@nhifCode.required = 'R'" );
        assert.equal( result.condition, null );
        assert.match( result.error, /CL006/ );
        assert.notEqual( read( "" ).error, null );
    } );

    it( "passes every value through the caller's hook before checking it", () => {
        const seen = [];
        const result = read( "IF 'nrnHospitalization'.value IS null\nTHEN '*'.required = 'О'\nELSE '*'.value IS null", { value: ( text ) => {
            seen.push( text );
            return text.replace( "О", "O" );
        } } );
        assert.deepEqual( seen, [ "О" ] );
        assert.equal( result.condition.then.alternatives[ 0 ][ 0 ].requirement, "O" );
        assert.equal( read( "IF 'a'.value = '1'\nTHEN 'b'.required = 'C'" ).notes.length, 1 );
    } );

    // e-Prescription CDP38 and e-Immunization CDI09 set a value by a test, not by =: "must be true", "must be above 1".
    it( "reads an effect that restricts a value with IS true, IS false or an ordering", () => {
        const effects = ( text ) => read( `IF 'a'.value = '1'\nTHEN ${ text }` ).condition.then.alternatives[ 0 ];
        assert.deepEqual( effects( "'..medication.isQuantityByForm'.value IS true" ).map( ( effect ) => [ effect.kind, effect.operator, effect.values ] ), [ [ "restrict", "is-true", [] ] ] );
        assert.deepEqual( effects( "'b'.value IS false AND 'immunization.doseNumber'.value > '1'" ).map( ( effect ) => [ effect.kind, effect.operator, effect.values ] ),
            [ [ "restrict", "is-false", [] ], [ "restrict", ">", [ "1" ] ] ] );
        const text = "IF 'a'.value = '1'\nTHEN 'b'.value IS true AND 'c'.value >= '2'";
        assert.equal( printCondition( read( text ).condition ), text );
    } );
} );
