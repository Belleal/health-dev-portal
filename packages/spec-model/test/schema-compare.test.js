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
 * Comparing what two XSDs accept, and the drift report's causes (design record §5.5).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { compareShapes, describeValueType, explainDifferences } = require( "@health-dev-portal/spec-model/schema-compare" );

const value = ( base, facets = {} ) => ( { base: base, minLength: null, maxLength: null, patterns: [], minInclusive: null, maxInclusive: null,
    enumeration: [], totalDigits: null, fractionDigits: null, ...facets } );
const attribute = ( name, extra = {} ) => ( { name: name, required: name === "value", value: value( "string" ), fixed: null, documentation: null, ...extra } );
const origin = ( file = "NHIS-D001.xsd", choice = null ) => ( { file: file, choice: choice } );
const node = ( path, kind, extra = {} ) => ( { tag: path.split( "/" ).pop() || "message", path: path, kind: kind, min: 1, max: 1, type: null,
    attributes: kind === "field" ? [ attribute( "value" ) ] : [], children: [], documentation: null, origin: null, ...extra } );
const root = ( children ) => node( "", "group", { children: children } );
const kinds = ( differences ) => differences.map( ( difference ) => [ difference.kind, difference.path, difference.attribute ] );

describe( "compareShapes", () => {

    it( "finds each kind of difference", () => {
        const published = root( [ node( "contents", "group", { origin: origin(), children: [
            node( "contents/a", "field", { origin: origin(), min: 0 } ),
            node( "contents/b", "field", { origin: origin(), attributes: [ attribute( "value", { value: value( "string", { maxLength: 10 } ) } ), attribute( "name" ) ] } ),
            node( "contents/c", "field", { origin: origin() } ),
            node( "contents/d", "field", { origin: origin(), attributes: [ attribute( "value", { required: false } ) ] } )
        ] } ) ] );
        const generated = root( [ node( "contents", "group", { children: [
            node( "contents/a", "field" ),
            node( "contents/b", "field", { attributes: [ attribute( "value", { value: value( "string", { maxLength: 36 } ), fixed: "x" } ), attribute( "nhifCode" ) ] } ),
            node( "contents/d", "field" ),
            node( "contents/e", "field" )
        ] } ) ] );
        assert.deepEqual( kinds( compareShapes( "D001", published, generated ) ), [
            [ "cardinality", "contents/a", null ],
            [ "value-type", "contents/b", "value" ],
            [ "fixed", "contents/b", "value" ],
            [ "only-published", "contents/b", "name" ],
            [ "only-generated", "contents/b", "nhifCode" ],
            [ "only-published", "contents/c", null ],
            [ "required", "contents/d", "value" ],
            [ "only-generated", "contents/e", null ]
        ] );
        const cardinality = compareShapes( "D001", published, generated )[ 0 ];
        assert.deepEqual( [ cardinality.message, cardinality.published, cardinality.generated ], [ "D001", "0..1", "1..1" ] );
        assert.deepEqual( compareShapes( "D001", published, generated ).filter( ( difference ) => difference.kind === "value-type" )
            .map( ( difference ) => [ difference.published, difference.generated ] ), [ [ "string, maxLength 10", "string, maxLength 36" ] ] );
    } );

    it( "compares order only over the children both sides have", () => {
        const published = root( [ node( "x", "field" ), node( "y", "field" ), node( "z", "field" ) ] );
        assert.deepEqual( compareShapes( "D001", published, root( [ node( "x", "field" ), node( "w", "field" ), node( "z", "field" ) ] ) )
            .map( ( difference ) => difference.kind ), [ "only-published", "only-generated" ] );
        assert.deepEqual( compareShapes( "D001", published, root( [ node( "z", "field" ), node( "x", "field" ), node( "y", "field" ) ] ) )
            .map( ( difference ) => [ difference.kind, difference.published, difference.generated ] ), [ [ "order", "x y z", "z x y" ] ] );
    } );

    it( "reports a missing group once, not each element under it", () => {
        const published = root( [ node( "g", "group", { children: [ node( "g/a", "field" ), node( "g/b", "field" ) ] } ) ] );
        assert.deepEqual( kinds( compareShapes( "D001", published, root( [] ) ) ), [ [ "only-published", "g", null ] ] );
    } );

    // e-Dental 1.0.5's first report: every published note field said minLength 0, which accepts what no minimum does.
    it( "reads a minimum length of 0 as no minimum", () => {
        const published = root( [ node( "x", "field", { attributes: [ attribute( "value", { value: value( "string", { minLength: 0, maxLength: 4000 } ) } ) ] } ) ] );
        const generated = root( [ node( "x", "field", { attributes: [ attribute( "value", { value: value( "string", { maxLength: 4000 } ) } ) ] } ) ] );
        assert.deepEqual( compareShapes( "D001", published, generated ), [] );
    } );

    it( "compares patterns and enumerations as sets", () => {
        const published = root( [ node( "x", "field", { attributes: [ attribute( "value", { value: value( "string", { patterns: [ "a", "b" ] } ) } ) ] } ) ] );
        const generated = root( [ node( "x", "field", { attributes: [ attribute( "value", { value: value( "string", { patterns: [ "b", "a" ] } ) } ) ] } ) ] );
        assert.deepEqual( compareShapes( "D001", published, generated ), [] );
    } );
} );

describe( "describeValueType", () => {

    it( "writes a value type in one line", () => {
        assert.equal( describeValueType( value( "string", { minLength: 1, maxLength: 36, patterns: [ "[0-9]+" ] } ) ), "string, minLength 1, maxLength 36, pattern [0-9]+" );
        assert.equal( describeValueType( value( "int" ) ), "int" );
    } );
} );

describe( "explainDifferences", () => {

    const published = root( [
        node( "header", "group", { origin: origin( "NHIS-Commons.xsd" ), children: [ node( "header/senderISName", "field", { origin: origin( "NHIS-Commons.xsd" ), min: 0 } ) ] } ),
        node( "contents", "group", { origin: origin(), children: [
            node( "contents/laboratory", "group", { origin: origin( "NHIS-R001.xsd", "contents#1" ), min: 1 } ),
            node( "contents/code", "field", { origin: origin() } ),
            node( "contents/status", "field", { origin: origin(), min: 0 } ),
            node( "contents/note", "field", { origin: origin(), min: 0 } )
        ] } )
    ] );
    const generated = root( [
        node( "header", "group" ),
        node( "contents", "group", { children: [
            node( "contents/laboratory", "group", { min: 0 } ),
            node( "contents/code", "field", { attributes: [ attribute( "value", { value: value( "int" ), documentation: "Code list CL001." } ) ] } ),
            node( "contents/status", "field" ),
            node( "contents/note", "field" )
        ] } )
    ] );
    // As the workbooks write them: the path quoted with a leading "..", the messages named after it.
    const NOTES = [
        { version: "1.0.5", notes: [ { text: "Добавено поле \"..status\" в съобщение R001" } ] },
        { version: "1.0.10", notes: [ { text: "Поле \"..note\" е направено задължително в съобщения R001, R002" } ] }
    ];
    const explain = ( differences, notes ) => explainDifferences( differences, { publishedShape: published, generatedShape: generated, publishedVersion: "1.0.6", changeNotes: notes } );
    const difference = ( path, kind, extra = {} ) => ( { message: "R001", path: path, attribute: null, kind: kind, published: "0..1", generated: "1..1", ...extra } );
    const later = ( text ) => [ { version: "1.0.10", notes: [ { text: text } ] } ];

    // Final review: a tag matched as a word anywhere explained 109 differences, 11 by notes about other messages and 33
    // by notes about other paths — the HEL-26 order break among them.
    it( "explains by a note only when it names this element's path and this message, or no message", () => {
        assert.deepEqual( [
            explain( [ difference( "contents/note", "cardinality" ) ], later( "Поле \"..note\" е направено задължително в съобщение R002" ) ),
            explain( [ difference( "contents/note", "cardinality" ) ], later( "Поле \"..subject.note\" е направено задължително" ) ),
            explain( [ difference( "contents/note", "cardinality" ) ], later( "The field note is now required." ) ),
            explain( [ difference( "contents/note", "cardinality" ) ], later( "Поле \"..contents.note\" е направено задължително" ) )
        ].map( ( entries ) => entries[ 0 ].cause ), [ "unexplained", "unexplained", "unexplained", "change-note" ] );
    } );

    it( "never explains an order difference by a note", () => {
        assert.equal( explain( [ difference( "contents/note", "order", { published: "a b", generated: "b a" } ) ], later( "Преместено поле \"..note\"" ) )[ 0 ].cause, "unexplained" );
    } );

    // Final review: X001's subject/address and the responses' senderISName are required today; a message without them
    // is refused, which is no looseness.
    it( "does not call a field or attribute today's shared type requires a looseness", () => {
        const required = root( [ node( "header", "group", { origin: origin( "NHIS-Commons.xsd" ), children: [
            node( "header/senderISName", "field", { origin: origin( "NHIS-Commons.xsd" ) } ),
            node( "header/q", "field", { origin: { file: "NHIS-Commons.xsd", choice: null, typeFile: "NHIS-Fields.xsd" },
                attributes: [ attribute( "value" ), attribute( "nhifCode", { required: true } ) ] } ) ] } ) ] );
        const ours = root( [ node( "header", "group", { children: [ node( "header/q", "field" ) ] } ) ] );
        const entries = explainDifferences( compareShapes( "R002", required, ours ), { publishedShape: required, generatedShape: ours, publishedVersion: "1.0.6", changeNotes: [] } );
        assert.deepEqual( entries.map( ( entry ) => [ entry.path, entry.attribute, entry.cause ] ),
            [ [ "header/senderISName", null, "unexplained" ], [ "header/q", "nhifCode", "unexplained" ] ] );
    } );

    it( "explains a shared type's extra field, a choice, a deliberate int, a fixed value and a change note", () => {
        const differences = [ ...compareShapes( "R001", published, generated ),
            { message: "R001", path: "contents/code", attribute: "value", kind: "fixed", published: null, generated: "1" } ];
        const entries = explainDifferences( differences, { publishedShape: published, generatedShape: generated, publishedVersion: "1.0.6", changeNotes: NOTES } );
        assert.deepEqual( entries.map( ( entry ) => [ entry.kind, entry.path, entry.cause ] ), [
            [ "only-published", "header/senderISName", "shared-type" ],
            [ "cardinality", "contents/laboratory", "choice" ],
            [ "value-type", "contents/code", "deliberate" ],
            [ "cardinality", "contents/status", "unexplained" ],
            [ "cardinality", "contents/note", "change-note" ],
            [ "fixed", "contents/code", "deliberate" ]
        ] );
    } );

    // A coded value is typed by its list alone (§4.10): a published restriction on it — nhifCode's two digits — is
    // dropped on purpose, whatever its base.
    it( "explains any value type of a coded value as deliberate", () => {
        const theirs = root( [ node( "q", "field", { origin: origin(), attributes: [ attribute( "value" ),
            attribute( "nhifCode", { value: value( "string", { minLength: 2, maxLength: 2, patterns: [ "[0-9]+" ] } ) } ) ] } ) ] );
        const ours = root( [ node( "q", "field", { attributes: [ attribute( "value" ), attribute( "nhifCode", { documentation: "Code list CL006." } ) ] } ) ] );
        const entries = explainDifferences( compareShapes( "D001", theirs, ours ), { publishedShape: theirs, generatedShape: ours, publishedVersion: "1.0.5", changeNotes: [] } );
        assert.deepEqual( entries.map( ( entry ) => [ entry.kind, entry.attribute, entry.cause ] ), [ [ "value-type", "nhifCode", "deliberate" ] ] );
    } );

    // e-Hospitalization 1.0.6: a physician typed in the message's own file, whose qualification is NHIS-Fields' type.
    it( "explains an attribute only a shared field type has as the shared type's", () => {
        const theirs = root( [ node( "q", "field", { origin: { file: "NHIS-H005.xsd", choice: null, typeFile: "NHIS-Fields.xsd" },
            attributes: [ attribute( "value" ), attribute( "nhifCode" ) ] } ) ] );
        const ours = root( [ node( "q", "field" ) ] );
        const entries = explainDifferences( compareShapes( "H005", theirs, ours ), { publishedShape: theirs, generatedShape: ours, publishedVersion: "1.0.6", changeNotes: [] } );
        assert.deepEqual( entries.map( ( entry ) => [ entry.kind, entry.attribute, entry.cause ] ), [ [ "only-published", "nhifCode", "shared-type" ] ] );
    } );

    it( "leaves anything else unexplained", () => {
        const entries = explainDifferences( [ { message: "R001", path: "contents/status", attribute: null, kind: "cardinality", published: "0..1", generated: "1..1" } ],
            { publishedShape: published, generatedShape: generated, publishedVersion: "1.0.6", changeNotes: [] } );
        assert.deepEqual( entries.map( ( entry ) => entry.cause ), [ "unexplained" ] );
    } );
} );
