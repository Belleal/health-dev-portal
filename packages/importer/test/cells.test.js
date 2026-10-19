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
 * Parsers for the cell formats of the specification template, with the formats measured in e-Prescription 1.5.1.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { isNone, noneToNull, parseCardinality, parseConstraint, parseReferenceList, parseRequirement } = require( "#cells" );

describe( "cells", () => {

    it( "treats an empty cell and a run of dashes as no value", () => {
        for ( const text of [ "", "-", "---" ] ) {
            assert.equal( isNone( text ), true, text );
            assert.equal( noneToNull( text ), null, text );
        }
        assert.equal( noneToNull( "lrn" ), "lrn" );
    } );

    it( "parses R, C and O and nothing else", () => {
        assert.equal( parseRequirement( "R" ), "R" );
        assert.equal( parseRequirement( "C" ), "C" );
        assert.equal( parseRequirement( "O" ), "O" );
        // Folding a Cyrillic О is the caller's job (and its warning); the parser sees only Latin.
        assert.equal( parseRequirement( "О" ), null );
        assert.equal( parseRequirement( "" ), null );
        assert.equal( parseRequirement( "r" ), null );
    } );

    it( "parses cardinalities, with * as unbounded", () => {
        assert.deepEqual( parseCardinality( "1..1" ), { min: 1, max: 1 } );
        assert.deepEqual( parseCardinality( "0..1" ), { min: 0, max: 1 } );
        assert.deepEqual( parseCardinality( "1..*" ), { min: 1, max: null } );
        assert.deepEqual( parseCardinality( "1..3" ), { min: 1, max: 3 } );
        assert.equal( parseCardinality( "1-1" ), null );
        assert.equal( parseCardinality( "" ), null );
    } );

    it( "splits a text constraint into lengths, character set and format", () => {
        assert.deepEqual( parseConstraint( "min=1, max=255, chars=an", "String" ),
            { constraint: { raw: "min=1, max=255, chars=an", minLength: 1, maxLength: 255, charset: "an" }, unparsed: [] } );
        assert.equal( parseConstraint( "YYYY-MM-DD", "Date" ).constraint.format, "date" );
        assert.equal( parseConstraint( "ISO 8601", "Date and Time" ).constraint.format, "date-time" );
        assert.equal( parseConstraint( "true/false", "Boolean" ).constraint.format, "boolean" );
        // YYMMDD is the expiry-date format of P005 and P011 (design record §5.7).
        assert.equal( parseConstraint( "YYMMDD", "String" ).constraint.format, "yymmdd" );
    } );

    it( "reads bounds on a numeric type as values, not lengths", () => {
        // P001 allowedRepeatsNumber: Unsigned Int, "max=1" — the value 1, not one digit.
        assert.deepEqual( parseConstraint( "max=1", "Unsigned Int" ).constraint, { raw: "max=1", maxValue: 1 } );
        assert.deepEqual( parseConstraint( "min=1", "Positive Int" ).constraint, { raw: "min=1", minValue: 1 } );
    } );

    it( "keeps what it does not understand, and reports it", () => {
        assert.deepEqual( parseConstraint( "max=36, odd one", "String" ),
            { constraint: { raw: "max=36, odd one", maxLength: 36 }, unparsed: [ "odd one" ] } );
        assert.deepEqual( parseConstraint( "---", "String" ), { constraint: null, unparsed: [] } );
        assert.deepEqual( parseConstraint( "", null ), { constraint: null, unparsed: [] } );
    } );

    it( "splits reference lists and separates the invalid entries", () => {
        assert.deepEqual( parseReferenceList( "RL026,RL059,RL067", "rule" ), { values: [ "RL026", "RL059", "RL067" ], invalid: [] } );
        assert.deepEqual( parseReferenceList( "CDP11, CDP30 CDP31", "condition" ), { values: [ "CDP11", "CDP30", "CDP31" ], invalid: [] } );
        // Other modules use other prefixes: e-Referral's conditions are CDR… (Review Focus 1).
        assert.deepEqual( parseReferenceList( "CDR07", "condition" ), { values: [ "CDR07" ], invalid: [] } );
        assert.deepEqual( parseReferenceList( "CLS02", "codeList" ), { values: [ "CLS02" ], invalid: [] } );
        assert.deepEqual( parseReferenceList( "CL007 see note", "codeList" ), { values: [ "CL007" ], invalid: [ "see", "note" ] } );
        assert.deepEqual( parseReferenceList( "---", "rule" ), { values: [], invalid: [] } );
        assert.throws( () => parseReferenceList( "X", "nope" ), TypeError );
    } );
} );
