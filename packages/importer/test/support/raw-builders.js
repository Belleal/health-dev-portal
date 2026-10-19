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
 * Builders for raw sheets, the reader's output, so the pure stages are tested without writing .xlsx files.
 */

const MESSAGE_HEADER = Object.freeze( [ "Name", "R/C/O", "Cardinality", "Data types", "Constraint", "Fixed Value", "Default Value",
    "Rules", "Conditions", "Code Lists", "Field Name / Tag", "Attribute", "Описание на значението на елемента" ] );

// The keys `element()` accepts, in the template's column order.
const ELEMENT_KEYS = Object.freeze( [ "name", "req", "card", "type", "constraint", "fixed", "default", "rules", "conditions",
    "codeList", "tag", "attribute", "description" ] );

const KIND_FILLS = Object.freeze( { group: "BDD7EE", field: null, polymorphic: "FCE4D6", attribute: "FFF2CC", end: "F2F2F2" } );

const cell = ( text, style = {} ) => Object.freeze( {
    text: text === null || text === undefined ? "" : String( text ),
    fill: style.fill || null,
    fontColour: style.fontColour || null,
    indent: style.indent || 0
} );

// The style applies to the first cell only: the template carries fill and indentation in column A.
const row = ( number, values, firstCellStyle = {} ) => Object.freeze( {
    number: number,
    cells: Object.freeze( values.map( ( value, index ) => cell( value, index === 0 ? firstCellStyle : {} ) ) )
} );

const sheet = ( name, rows, tabColour = null ) => Object.freeze( { name: name, tabColour: tabColour, rows: Object.freeze( rows ) } );

const element = ( number, depth, kind, values ) => row( number, ELEMENT_KEYS.map( ( key ) => values[ key ] ), { fill: KIND_FILLS[ kind ], indent: depth } );

const endRow = ( number, depth, name ) => row( number, [ `END of ${ name }` ], { fill: KIND_FILLS.end, indent: depth } );

const messageSheet = ( name, rows, tabColour = "70AD47" ) => sheet( name, [ row( 1, MESSAGE_HEADER ), ...rows ], tabColour );

module.exports = { MESSAGE_HEADER, cell, row, sheet, element, endRow, messageSheet };
