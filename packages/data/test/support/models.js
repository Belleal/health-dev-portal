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
 * Synthetic versions, built in code in the importer's shapes. Nothing here is specification data (CLAUDE.md, "Data
 * rules"); each builder returns a fresh object, so a test may change it.
 */

const { keyTypeOf } = require( "@health-dev-portal/spec-model/key-type" );

const text = ( bg, en = null ) => ( { bg: bg, en: en } );
const at = ( sheet, row ) => ( { sheet: sheet, row: row } );

const node = ( fields ) => ( {
    identity: null, path: null, depth: 1, kind: "field", name: text( null, null ), requirement: "R", cardinality: { min: 1, max: 1 }, dataType: "String",
    constraint: null, fixedValue: null, defaultValue: null, rules: [], conditions: [], codeList: null, tag: null, attribute: null, description: text( null ),
    source: at( "P001", 1 ), children: [], ...fields
} );

const attribute = ( path, name, row, extra = {} ) => node( { identity: `${ path }@${ name }`, path: path, depth: 3, kind: "attribute", attribute: name,
    name: text( name, name ), source: at( "P001", row ), ...extra } );

const message = ( code, row, elements ) => ( {
    code: code, title: text( `Съобщение ${ code }`, `Message ${ code }` ), address: `/v1/test/${ code.toLowerCase() }`, direction: "request", sender: "Лекар",
    recipient: "НЗИС", pairedWith: null, source: at( "Съобщения", row ), lifecycle: "active", changedInVersion: false, elements: elements
} );

/**
 * A module version without its change notes, which the changelog keeps (design record §4.7): two messages; a group
 * holding a field with attributes, a polymorphic element with two variants, and two elements with one identity, as in
 * e-Examination 1.3.10 (HEL-19); a condition; a dictionary entry; one binding of each kind.
 *
 * @param {string} [version]
 * @returns {Object}
 */
module.exports.moduleVersion = ( version = "1.5.1" ) => ( {
    kind: "module",
    spec: "e-prescription",
    version: version,
    messages: [
        message( "P001", 4, [
            node( { identity: "contents", path: "contents", depth: 0, kind: "group", tag: "contents", dataType: null, name: text( "Съдържание", "Contents" ),
                source: at( "P001", 3 ), children: [
                    node( { identity: "contents/lrn", path: "contents/lrn", tag: "lrn", codeList: "CL009", rules: [ "RL001" ], conditions: [ "CDP01" ],
                        constraint: { raw: "max=36, chars=an", maxLength: 36, charset: "an" }, description: text( "ЛРН < 36 & \"x\"", "LRN" ),
                        source: at( "P001", 5 ), children: [
                            attribute( "contents/lrn", "value", 6, { requirement: "R" } ),
                            attribute( "contents/lrn", "name", 7, { requirement: "O", cardinality: { min: 0, max: 1 } } )
                        ] } ),
                    node( { identity: "contents/dose@value", path: "contents/dose", tag: "dose", kind: "polymorphic", source: at( "P001", 8 ), children: [
                        node( { identity: "contents/dose@value#1", path: "contents/dose", tag: "dose", depth: 2, dataType: "Decimal", source: at( "P001", 9 ) } ),
                        node( { identity: "contents/dose@value#2", path: "contents/dose", tag: "dose", depth: 2, codeList: "CL035", source: at( "P001", 10 ) } )
                    ] } ),
                    node( { identity: "contents/note@value", path: "contents/note", tag: "note", cardinality: { min: 0, max: null }, requirement: "O", source: at( "P001", 11 ) } ),
                    node( { identity: "contents/note@value", path: "contents/note", tag: "note", source: at( "P001", 12 ) } )
                ] } )
        ] ),
        message( "P002", 5, [
            node( { identity: "contents", path: "contents", depth: 0, kind: "group", tag: "contents", dataType: null, source: at( "P002", 3 ), children: [] } )
        ] )
    ],
    conditions: [
        { id: "CDP01", text: "IF 'contents.lrn' IS NOT NULL\nTHEN 'contents.note' IS required", source: at( "Conditions", 2 ),
            parsed: { scope: null, predicate: { kind: "comparison", operand: { path: { text: "contents.lrn", self: false }, attribute: null, property: "value", column: null },
                operator: "is-not-null", values: [], set: null }, then: { alternatives: [ [ { kind: "require", requirement: "R",
                operand: { path: { text: "contents.note", self: false }, attribute: null, property: "value", column: null } } ] ] }, otherwise: null },
            printed: "IF 'contents.lrn' IS NOT NULL THEN 'contents.note' IS required" }
    ],
    conditionBindings: [ { condition: "CDP01", message: "P001", element: "contents/lrn", paths: { "contents.lrn": "contents/lrn", "contents.note": null } } ],
    blueprintBindings: [ { message: "P001", element: "contents", blueprint: "prescription", by: "name" } ],
    dictionary: [ { abbreviation: "ЛРН", name: text( "Лабораторен номер", "Laboratory number" ), description: text( "Номер", null ), source: at( "Речник", 3 ) } ]
} );

/**
 * A code-list version without its change notes: one list-specific column, and one entry per key, in the given order.
 *
 * @param {string} id
 * @param {string[]} keys
 * @param {string} [version]
 * @returns {Object}
 */
module.exports.codeListVersion = ( id, keys, version = "1.5.33" ) => ( {
    kind: "code-list",
    spec: id,
    version: version,
    list: {
        id: id, name: text( `Номенклатура ${ id }` ), status: "in-use", dynamic: false, visibility: null, remark: null, notes: [ "Източник: тест" ],
        keyType: keyTypeOf( keys ), columns: [ { title: "NHIF Code", column: 6 } ],
        entries: keys.map( ( key, index ) => ( { key: key, description: text( `Запис ${ key }`, `Entry ${ key }` ), display: text( null ), values: [ `N${ index }` ],
            since: "1.5.0", validUntil: null, source: at( id, 5 + index ) } ) ),
        source: at( id, 4 )
    }
} );

/**
 * A rules version without its change notes, one active rule per ID.
 *
 * @param {string[]} ids
 * @param {string} [version]
 * @returns {Object}
 */
module.exports.rulesVersion = ( ids, version = "1.1.1" ) => ( {
    kind: "rules",
    spec: "rules",
    version: version,
    rules: ids.map( ( id, index ) => ( { id: id, definition: text( `Правило ${ id }\nвтори ред` ), sourceText: null, errorCode: "E002", since: "1.0.0",
        lifecycle: "active", changedInVersion: false, source: at( "Бизнес правила", 3 + index ) } ) )
} );
