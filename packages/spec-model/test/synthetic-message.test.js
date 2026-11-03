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
 * Synthetic messages (design record §5.5, §8.6): every element of a shape, each value one its type accepts. The
 * published samples are templates of placeholders, so these are what a real validator checks.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { synthesizeMessage } = require( "@health-dev-portal/spec-model/synthetic-message" );
const { CHARSET_PATTERNS, messageShape } = require( "@health-dev-portal/spec-model/xsd-shape" );
const { prescriptionMessage } = require( "./support/messages" );

const LISTS = new Map( [ [ "CL007", { id: "CL007", keyType: "string" } ], [ "CL009", { id: "CL009", keyType: "integer" } ],
    [ "CL011", { id: "CL011", keyType: "string" } ], [ "CL018", { id: "CL018", keyType: "integer" } ], [ "CL035", { id: "CL035", keyType: "integer" } ] ] );
const value = ( base, facets = {} ) => ( { base: base, minLength: null, maxLength: null, patterns: [], minInclusive: null, maxInclusive: null,
    enumeration: [], totalDigits: null, fractionDigits: null, ...facets } );
const field = ( path, attributeValue, extra = {} ) => ( { tag: path.split( "/" ).pop(), path: path, kind: "field", min: 1, max: 1, type: null,
    attributes: [ { name: "value", required: true, value: attributeValue, fixed: null, documentation: null } ], children: [], documentation: null, origin: null, ...extra } );
const root = ( children ) => ( { tag: "message", path: "", kind: "group", min: 1, max: 1, type: "Message", attributes: [], children: children, documentation: null, origin: null } );
const valueOf = ( xml, tag ) => new RegExp( `<${ tag } value="([^"]*)"` ).exec( xml )[ 1 ];

describe( "synthesizeMessage", () => {

    it( "writes every element once, with a value of its type", () => {
        const xml = synthesizeMessage( messageShape( prescriptionMessage(), LISTS ) );
        assert.match( xml, /^<message xmlns="https:\/\/www\.his\.bg" xmlns:ds="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/ );
        for ( const tag of [ "header", "sender", "contents", "prescription", "lrn", "category", "isProtocolBased", "group", "medication", "medicationCode", "doseQuantityCode" ] ) {
            assert.equal( ( xml.match( new RegExp( `<${ tag }[ >/]`, "g" ) ) || [] ).length, 1, tag );
        }
        assert.equal( valueOf( xml, "isProtocolBased" ), "true" );
        assert.equal( valueOf( xml, "allowedRepeatsNumber" ), "1" );
        assert.match( xml, /<medicationCode value="1" name="1"\/>/ );
    } );

    it( "repeats an element its minimum times, and writes the signature empty in xmldsig's namespace", () => {
        const xml = synthesizeMessage( root( [ field( "item", value( "string" ), { min: 3, max: null } ),
            { tag: "Signature", path: "Signature", kind: "signature", min: 1, max: 1, type: null, attributes: [], children: [], documentation: null, origin: null } ] ) );
        assert.equal( ( xml.match( /<item value="A"\/>/g ) || [] ).length, 3 );
        assert.match( xml, /<ds:Signature\/><\/message>$/ );
    } );

    it( "finds a string that satisfies every pattern and length", () => {
        const xml = synthesizeMessage( root( [
            field( "an", value( "string", { minLength: 12, maxLength: 12, patterns: [ CHARSET_PATTERNS.an ] } ) ),
            field( "n", value( "string", { maxLength: 10, patterns: [ CHARSET_PATTERNS.n ] } ) ),
            field( "a", value( "string", { patterns: [ CHARSET_PATTERNS.a ] } ) ),
            field( "yymmdd", value( "string", { patterns: [ "[0-9]{6}" ] } ) ),
            field( "fixed", value( "string", { maxLength: 4 } ), { attributes: [ { name: "value", required: true, value: value( "string" ), fixed: "P001", documentation: null } ] } ),
            field( "listed", value( "string", { enumeration: [ "E002", "E003" ] } ) ),
            field( "count", value( "positiveInteger", { minInclusive: "5" } ) ),
            field( "when", value( "dateTime" ) ),
            field( "file", value( "base64Binary" ) )
        ] ) );
        assert.deepEqual( [ "an", "n", "a", "yymmdd", "fixed", "listed", "count", "when", "file" ].map( ( tag ) => valueOf( xml, tag ) ),
            [ "AAAAAAAAAAAA", "1", "A", "111111", "P001", "E002", "5", "2026-01-02T03:04:05", "QQ==" ] );
    } );

    it( "leaves out an omitted path and everything under it", () => {
        const shape = root( [ { tag: "contents", path: "contents", kind: "group", min: 1, max: 1, type: null, attributes: [], documentation: null, origin: null, children: [
            { tag: "laboratory", path: "contents/laboratory", kind: "group", min: 1, max: 1, type: null, attributes: [], documentation: null, origin: null,
                children: [ field( "contents/laboratory/code", value( "string" ) ) ] },
            field( "contents/consultation", value( "string" ) ) ] } ] );
        const xml = synthesizeMessage( shape, { omit: new Set( [ "contents/laboratory" ] ) } );
        assert.doesNotMatch( xml, /laboratory|<code/ );
        assert.match( xml, /<consultation value="A"\/>/ );
    } );

    it( "escapes a fixed value", () => {
        const xml = synthesizeMessage( root( [ field( "x", value( "string" ), { attributes: [ { name: "value", required: true, value: value( "string" ), fixed: "a&\"b<", documentation: null } ] } ) ] ) );
        assert.match( xml, /<x value="a&amp;&quot;b&lt;"\/>/ );
    } );

    // CodeRabbit on #12: a literal tab or line end in an attribute reads back as a space, so the message disagreed with
    // the fixed value its own XSD writes as &#9;.
    it( "writes a tab and line ends in an attribute as references", () => {
        const xml = synthesizeMessage( root( [ field( "x", value( "string" ), { attributes: [ { name: "value", required: true, value: value( "string" ), fixed: "a\tb\nc\rd", documentation: null } ] } ) ] ) );
        assert.match( xml, /<x value="a&#9;b&#10;c&#13;d"\/>/ );
    } );
} );
