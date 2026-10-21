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
 * A message sheet into an element tree (design record §5.3, "Structure" and "Interpret"): depth from indentation,
 * kind from fill, identities from tags, and every anomaly at its row.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildMessageTree } = require( "#message-tree" );
const { element, endRow, messageSheet, row, sheet, MESSAGE_HEADER } = require( "./support/raw-builders" );
const { prescriptionRows } = require( "./support/fixtures" );

const flatten = ( elements ) => elements.flatMap( ( node ) => [ node, ...flatten( node.children ) ] );
const find = ( tree, identity ) => flatten( tree.elements ).find( ( node ) => node.identity === identity );
const types = ( tree ) => tree.anomalies.map( ( anomaly ) => anomaly.type );

describe( "buildMessageTree", () => {

    it( "builds the tree and gives every element its identity", () => {
        const tree = buildMessageTree( messageSheet( "P001", prescriptionRows() ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.deepEqual( flatten( tree.elements ).map( ( node ) => node.identity ), [
            "header",
            "header/sender@value",
            "contents",
            "contents/prescription",
            "contents/prescription/lrn@value",
            "contents/prescription/isProtocolBased@value",
            "contents/prescription/group",
            "contents/prescription/group/medication",
            "contents/prescription/group/medication/medicationCode@value",
            "contents/prescription/group/medication/medicationCode@name",
            "contents/prescription/group/medication/doseQuantityCode@value",
            "contents/prescription/group/medication/doseQuantityCode@value#1",
            "contents/prescription/group/medication/doseQuantityCode@value#2",
            "contents/prescription/allowedRepeatsNumber@value",
            "contents/prescription/category@value",
            "contents/prescription/dispensationType@value"
        ] );
    } );

    it( "reads each column of a row", () => {
        const tree = buildMessageTree( messageSheet( "P001", prescriptionRows() ) );
        const lrn = find( tree, "contents/prescription/lrn@value" );
        assert.equal( lrn.kind, "field" );
        assert.deepEqual( lrn.name, { bg: null, en: "Prescription LRN" } );
        assert.equal( lrn.requirement, "R" );
        assert.deepEqual( lrn.cardinality, { min: 1, max: 1 } );
        assert.equal( lrn.dataType, "String" );
        assert.deepEqual( lrn.constraint, { raw: "max=36, chars=an", maxLength: 36, charset: "an" } );
        assert.deepEqual( lrn.description, { bg: "Уникален номер", en: null } );
        assert.deepEqual( lrn.source, { sheet: "P001", row: 8 } );
        const name = find( tree, "contents/prescription/group/medication/medicationCode@name" );
        assert.equal( name.kind, "attribute" );
        assert.equal( name.codeList, "CL009" );
        assert.deepEqual( name.rules, [ "RL023" ] );
        const medication = find( tree, "contents/prescription/group/medication" );
        assert.deepEqual( medication.cardinality, { min: 1, max: null } );
        assert.deepEqual( medication.conditions, [ "CDP29" ] );
        assert.equal( find( tree, "contents/prescription/allowedRepeatsNumber@value" ).constraint.maxValue, 1 );
        assert.equal( find( tree, "contents/prescription/isProtocolBased@value" ).defaultValue, "false" );
        const polymorphic = find( tree, "contents/prescription/group/medication/doseQuantityCode@value" );
        assert.equal( polymorphic.kind, "polymorphic" );
        assert.equal( polymorphic.children.length, 2 );
        assert.equal( polymorphic.tag, null );
    } );

    it( "freezes the tree", () => {
        const tree = buildMessageTree( messageSheet( "P001", prescriptionRows() ) );
        assert.ok( Object.isFrozen( tree.elements[ 0 ].children ) );
    } );

    it( "blocks a row indented two levels below its parent", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 2, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "depth-jump" ] );
        assert.equal( tree.anomalies[ 0 ].level, "blocking" );
        assert.equal( tree.anomalies[ 0 ].row, 4 );
    } );

    it( "folds a Cyrillic О in R/C/O with a warning, and the row still counts as optional", () => {
        // HEL-12: 30 rows of e-Prescription 1.5.1 hold U+041E here.
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Note", req: "О", card: "0..1", tag: "note", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "look-alike-letter" ] );
        assert.equal( tree.anomalies[ 0 ].level, "warning" );
        assert.equal( tree.anomalies[ 0 ].column, 2 );
        assert.equal( find( tree, "contents/note@value" ).requirement, "O" );
    } );

    it( "warns about a mixed-script name", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Е-prescription LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "mixed-script-word" ] );
    } );

    it( "reads a white fill as a field and warns about an unknown fill", () => {
        const rows = [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            row( 4, [ "Plain", "R", "1..1", "", "", "", "", "", "", "", "plain", "value" ], { fill: "FFFFFF", indent: 1 } ),
            row( 5, [ "Odd", "R", "1..1", "", "", "", "", "", "", "", "odd", "value" ], { fill: "123456", indent: 1 } ),
            row( 6, [ "Grey", "R", "1..1", "", "", "", "", "", "", "", "grey", "value" ], { fill: "F2F2F2", indent: 1 } )
        ];
        const tree = buildMessageTree( messageSheet( "P001", rows ) );
        assert.deepEqual( types( tree ), [ "unknown-fill", "end-fill-on-data-row" ] );
        assert.equal( find( tree, "contents/plain@value" ).kind, "field" );
        assert.equal( find( tree, "contents/odd@value" ).kind, "field" );
    } );

    it( "warns when asterisks disagree with indentation or appear on a field", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "group", { name: "**Prescription", req: "R", card: "1..1", tag: "prescription" } ),
            element( 5, 2, "field", { name: "*LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "asterisks-disagree", "asterisks-disagree" ] );
        assert.equal( find( tree, "contents/prescription" ).name.en, "Prescription" );
    } );

    it( "warns about an END row that closes no open group", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } ),
            endRow( 5, 0, "Header" )
        ] ) );
        assert.deepEqual( types( tree ), [ "unexpected-end-row" ] );
    } );

    it( "keeps a field named 'End of Period' (Review Focus 3)", () => {
        // P001 rows 44–47 of e-Prescription 1.5.1: the field sits inside the group its END row then closes.
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "group", { name: "*Effective Dose Period", req: "O", card: "0..1", tag: "effectiveDosePeriod" } ),
            element( 5, 2, "field", { name: "Start of Period", req: "R", card: "1..1", type: "Date", constraint: "YYYY-MM-DD", tag: "start", attribute: "value" } ),
            element( 6, 2, "field", { name: "End of Period", req: "R", card: "1..1", type: "Date", constraint: "YYYY-MM-DD", tag: "end", attribute: "value" } ),
            endRow( 7, 1, "Effective Dose Period" )
        ] ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.ok( find( tree, "contents/effectiveDosePeriod/end@value" ) );
    } );

    it( "blocks a field indented under another field", () => {
        // One Increase Indent too many would otherwise give contents/date/lrn@value with no anomaly (final review).
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Date", req: "R", card: "1..1", tag: "date", attribute: "value" } ),
            element( 5, 2, "field", { name: "Lrn", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "field-with-elements" ] );
        assert.equal( tree.anomalies[ 0 ].level, "blocking" );
        assert.equal( tree.anomalies[ 0 ].row, 5 );
    } );

    it( "blocks an element under an attribute row", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Code", req: "R", card: "1..1", tag: "code", attribute: "value" } ),
            element( 5, 2, "attribute", { name: "Code Name", req: "O", card: "0..1", tag: "code", attribute: "name" } ),
            element( 6, 3, "field", { name: "Extra", req: "O", card: "0..1", tag: "extra", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "attribute-with-children" ] );
    } );

    it( "blocks a row with values but no name", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            row( 4, [ "", "R", "1..1", "String", "", "", "", "", "", "", "lrn", "value" ], { indent: 1 } ),
            element( 5, 1, "field", { name: "NRN", req: "R", card: "1..1", tag: "nrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "missing-name" ] );
        assert.equal( tree.anomalies[ 0 ].level, "blocking" );
    } );

    it( "reads a legend fill picked from the theme palette", () => {
        // "Orange, Accent 2, Lighter 80%" resolves to FBE5D6; the legend's polymorphic fill is FCE4D6 (final review).
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            row( 4, [ "Dose Quantity Unit", "R", "1..1", "---", "", "", "", "", "", "", "---", "" ], { fill: "FBE5D6", indent: 1 } ),
            element( 5, 2, "field", { name: "As UCUM", req: "R", card: "1..1", tag: "doseQuantityCode", attribute: "value" } ),
            element( 6, 2, "field", { name: "As Form", req: "R", card: "1..1", tag: "doseQuantityCode", attribute: "value" } )
        ] ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.equal( find( tree, "contents/doseQuantityCode@value" ).kind, "polymorphic" );
    } );

    it( "blocks a tag or attribute with letters outside Latin", () => {
        // Folding catches look-alikes only; a Cyrillic к (not a look-alike) or a Bulgarian word must not pass as a tag.
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Kind", req: "R", card: "1..1", tag: "кind", attribute: "value" } ),
            element( 5, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "лрн" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "non-latin-tag", "non-latin-tag" ] );
        assert.ok( tree.anomalies.every( ( anomaly ) => anomaly.level === "blocking" ) );
    } );

    it( "blocks two elements with one identity", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } ),
            element( 5, 1, "field", { name: "LRN again", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "duplicate-identity" ] );
    } );

    it( "blocks invalid R/C/O, cardinality and tags, and an attribute outside a field", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "A", req: "X", card: "1..1", tag: "a", attribute: "value" } ),
            element( 5, 1, "field", { name: "B", req: "R", card: "one", tag: "b", attribute: "value" } ),
            element( 6, 1, "field", { name: "C", req: "R", card: "1..1", tag: "---", attribute: "value" } ),
            element( 7, 1, "field", { name: "D", req: "R", card: "1..1", tag: "d e", attribute: "value" } ),
            element( 8, 1, "attribute", { name: "E", req: "O", card: "0..1", tag: "e", attribute: "name" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "invalid-requirement", "invalid-cardinality", "missing-tag", "invalid-tag", "attribute-without-field" ] );
        assert.ok( tree.anomalies.every( ( anomaly ) => anomaly.level === "blocking" ) );
    } );

    it( "warns about unparsed constraints, invalid references and several code lists", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "A", req: "R", card: "1..1", type: "String", constraint: "max=5, weird", rules: "RL1, R2", codeList: "CL001,CL002", tag: "a", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "unparsed-constraint", "invalid-reference", "multiple-code-lists" ] );
        assert.equal( find( tree, "contents/a@value" ).codeList, "CL001" );
    } );

    it( "skips a note row (Review Focus 2)", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } ),
            row( 9, [ "Забележка: полето lrn е уникално за УИН." ] )
        ] ) );
        assert.deepEqual( types( tree ), [ "note-row" ] );
        assert.equal( tree.anomalies[ 0 ].level, "warning" );
        assert.equal( flatten( tree.elements ).length, 2 );
    } );

    it( "reads a row with any element column as an element, not a note", () => {
        // CodeRabbit on #4: a name with only a data type or a code list was dropped as a note, with a warning only.
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } ),
            element( 5, 1, "field", { name: "Typed", type: "String" } ),
            element( 6, 1, "field", { name: "Coded", codeList: "CL007" } )
        ] ) );
        assert.ok( !types( tree ).includes( "note-row" ) );
        assert.ok( tree.anomalies.some( ( anomaly ) => anomaly.type === "invalid-requirement" && anomaly.row === 5 ) );
        assert.ok( tree.anomalies.some( ( anomaly ) => anomaly.type === "invalid-requirement" && anomaly.row === 6 ) );
    } );

    it( "numbers every identity under a polymorphic variant with the variant's ordinal", () => {
        // CodeRabbit on #4 (and the final review): two Codeable Concept variants with a name attribute each shared
        // …@name, so a valid workbook was refused as duplicate-identity.
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "polymorphic", { name: "Unit", req: "R", card: "1..1", type: "---", tag: "---" } ),
            element( 5, 2, "field", { name: "As UCUM", req: "R", card: "1..1", type: "Codeable Concept", tag: "unit", attribute: "value" } ),
            element( 6, 3, "attribute", { name: "UCUM Name", req: "O", card: "0..1", tag: "unit", attribute: "name" } ),
            element( 7, 2, "field", { name: "As Form", req: "R", card: "1..1", type: "Codeable Concept", tag: "unit", attribute: "value" } ),
            element( 8, 3, "attribute", { name: "Form Name", req: "O", card: "0..1", tag: "unit", attribute: "name" } )
        ] ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.deepEqual( flatten( tree.elements ).map( ( node ) => node.identity ), [
            "contents",
            "contents/unit@value",
            "contents/unit@value#1",
            "contents/unit@name#1",
            "contents/unit@value#2",
            "contents/unit@name#2"
        ] );
    } );

    it( "finds a header row below a title", () => {
        const tree = buildMessageTree( sheet( "P001", [
            row( 1, [ "Заявка за създаване на Е-рецепта" ] ),
            row( 3, MESSAGE_HEADER ),
            element( 4, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 5, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ], "70AD47" ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.ok( find( tree, "contents/lrn@value" ) );
    } );

    it( "blocks a sheet without the header or with a column missing", () => {
        assert.deepEqual( types( buildMessageTree( sheet( "P001", [ row( 1, [ "Something else" ] ) ] ) ) ), [ "missing-header-row" ] );
        const missing = buildMessageTree( sheet( "P001", [ row( 1, MESSAGE_HEADER.filter( ( title ) => title !== "Cardinality" ) ) ] ) );
        assert.deepEqual( types( missing ), [ "missing-column" ] );
        assert.equal( missing.anomalies[ 0 ].details.column, "Cardinality" );
        assert.deepEqual( missing.elements, [] );
    } );
} );
