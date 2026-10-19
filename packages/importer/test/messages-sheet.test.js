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
 * The message index ("Съобщения"): codes, endpoints, directions, and the request/response pairing.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readMessageIndex } = require( "#messages-sheet" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

const index = () => moduleSheets()[ 0 ];
const types = ( result ) => result.anomalies.map( ( anomaly ) => anomaly.type );

describe( "readMessageIndex", () => {

    it( "lists the messages and stops at the footnote", () => {
        const result = readMessageIndex( index() );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.messages.map( ( message ) => message.code ), [ "P001", "P002", "P099" ] );
        const [ request ] = result.messages;
        assert.deepEqual( request.title, { bg: "Заявка за създаване на Е-рецепта", en: "ePrescription Issue Request" } );
        assert.equal( request.address, "/v4/eprescription/doctor/issue" );
        assert.equal( request.direction, "request" );
        assert.equal( request.sender, "външна система" );
        assert.equal( request.recipient, "НЗИС" );
        assert.equal( result.messages[ 1 ].address, null );
        assert.deepEqual( request.source, { sheet: "Съобщения", row: 4 } );
    } );

    it( "pairs each request with the response after it, and leaves the x99 error message unpaired without a warning", () => {
        const [ request, response, error ] = readMessageIndex( index() ).messages;
        assert.equal( request.pairedWith, "P002" );
        assert.equal( response.pairedWith, "P001" );
        assert.equal( error.pairedWith, null );
    } );

    it( "warns about an unpaired message, an unknown direction and a mixed-script title", () => {
        const header = index().rows[ 1 ];
        const result = readMessageIndex( sheet( "Съобщения", [
            header,
            row( 4, [ "Заявка", "P001", "Issue", "/v4/x", "Request", "", "", "" ] ),
            row( 5, [ "Заявка", "P003", "Fetch", "/v4/y", "Request", "", "", "" ] ),
            row( 6, [ "Отговор на E-рецепта", "P004", "Result", "---", "Answer", "", "", "" ] )
        ] ) );
        assert.deepEqual( types( result ), [ "mixed-script-word", "unknown-direction", "unpaired-message", "unpaired-message", "unpaired-message" ] );
    } );

    it( "blocks a sheet without its header or a column", () => {
        assert.deepEqual( types( readMessageIndex( sheet( "Съобщения", [ row( 1, [ "Нещо друго" ] ) ] ) ) ), [ "missing-header-row" ] );
        const result = readMessageIndex( sheet( "Съобщения", [ row( 3, [ "Съобщение", "Име*", "Класификация", "Адрес", "Тип", "Изпращач" ] ) ] ) );
        assert.deepEqual( types( result ), [ "missing-column" ] );
        assert.equal( result.anomalies[ 0 ].details.column, "Получател" );
    } );
} );
