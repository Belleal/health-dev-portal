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

    // HEL-18: e-Referral, e-Dental and e-Examination title the column "Име", without e-Prescription's footnote asterisk,
    // and the whole module imported no messages.
    it( "reads a header whose titles carry no footnote asterisks, or other ones", () => {
        const header = [ "Съобщение", "Име", "Класификация", "Адрес", "Тип", "Налично в Release*", "Изпращач", "Получател" ];
        const result = readMessageIndex( sheet( "Съобщения", [ row( 3, header ),
            row( 4, [ "Заявка за създаване на Е-направление", "R001", "eReferral Create Request", "/v3/ereferral/doctor/issue", "Request", "1.0", "външна система", "НЗИС" ] ),
            row( 5, [ "Потвърждение за успешно създаване на Е-направление", "R002", "eReferral Create Confirmation", "---", "Response", "1.0", "НЗИС", "външна система" ] ) ] ) );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.messages.map( ( message ) => [ message.code, message.pairedWith ] ), [ [ "R001", "R002" ], [ "R002", "R001" ] ] );
        const starred = readMessageIndex( sheet( "Съобщения", [ row( 3, header.map( ( title ) => ( title === "Изпращач" ? "Изпращач**" : title ) ) ),
            row( 4, [ "Заявка", "R001", "Request one", "/v1/x", "Request", "1.0", "външна система", "НЗИС" ] ) ] ) );
        assert.equal( starred.messages[ 0 ].sender, "външна система" );
    } );

    // CodeRabbit on #7: footnote markers spaced apart ("Име * *") read as "Име *" and the header was not found.
    it( "reads footnote asterisks however they are spaced", () => {
        const header = [ "Съобщение", "Име * *", "Класификация", "Адрес", "Тип", "Налично в Release *", "Изпращач", "Получател" ];
        const result = readMessageIndex( sheet( "Съобщения", [ row( 3, header ),
            row( 4, [ "Заявка", "R001", "Request one", "/v1/x", "Request", "1.0", "външна система", "НЗИС" ] ) ] ) );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "unpaired-message" ] );
        assert.deepEqual( result.messages.map( ( message ) => message.code ), [ "R001" ] );
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

    it( "never pairs a request with the x99 error message", () => {
        // CodeRabbit on #4: a request without its own response, listed just before P099, took P099 as its partner.
        const header = index().rows[ 1 ];
        const result = readMessageIndex( sheet( "Съобщения", [
            header,
            row( 4, [ "Заявка", "P001", "Issue", "/v4/x", "Request", "", "", "" ] ),
            row( 5, [ "Отговор", "P002", "Result", "---", "Response", "", "", "" ] ),
            row( 6, [ "Заявка", "P003", "Fetch", "/v4/y", "Request", "", "", "" ] ),
            row( 7, [ "Грешка", "P099", "Error", "---", "Response", "", "", "" ] )
        ] ) );
        const byCode = ( code ) => result.messages.find( ( message ) => message.code === code );
        assert.equal( byCode( "P003" ).pairedWith, null );
        assert.equal( byCode( "P099" ).pairedWith, null );
        assert.deepEqual( types( result ), [ "unpaired-message" ] );
        assert.equal( result.anomalies[ 0 ].details.code, "P003" );
    } );

    it( "blocks a message listed twice", () => {
        // A copied index row whose code was left as P001 gave P001 twice and dropped the new message (final review).
        const header = index().rows[ 1 ];
        const result = readMessageIndex( sheet( "Съобщения", [
            header,
            row( 4, [ "Заявка", "P001", "Issue", "/v4/x", "Request", "", "", "" ] ),
            row( 5, [ "Отговор", "P002", "Result", "---", "Response", "", "", "" ] ),
            row( 6, [ "Заявка", "P001", "Fetch", "/v4/y", "Request", "", "", "" ] ),
            row( 7, [ "Отговор", "P004", "Result", "---", "Response", "", "", "" ] )
        ] ) );
        assert.deepEqual( types( result ).filter( ( type ) => type !== "unpaired-message" ), [ "duplicate-message" ] );
        assert.equal( result.anomalies.find( ( anomaly ) => anomaly.type === "duplicate-message" ).level, "blocking" );
        assert.deepEqual( result.messages.map( ( message ) => message.code ), [ "P001", "P002", "P004" ] );
    } );

    it( "blocks a message row whose code is mistyped instead of skipping it", () => {
        const header = index().rows[ 1 ];
        const result = readMessageIndex( sheet( "Съобщения", [
            header,
            row( 4, [ "Заявка", "P001", "Issue", "/v4/x", "Request", "", "", "" ] ),
            row( 5, [ "Отговор", "P002", "Result", "---", "Response", "", "", "" ] ),
            row( 6, [ "Заявка", "P0O3", "Fetch", "/v4/y", "Request", "", "", "" ] )
        ] ) );
        assert.deepEqual( types( result ), [ "malformed-message-code" ] );
        assert.equal( result.anomalies[ 0 ].level, "blocking" );
    } );

    it( "blocks a sheet without its header or a column", () => {
        assert.deepEqual( types( readMessageIndex( sheet( "Съобщения", [ row( 1, [ "Нещо друго" ] ) ] ) ) ), [ "missing-header-row" ] );
        const result = readMessageIndex( sheet( "Съобщения", [ row( 3, [ "Съобщение", "Име*", "Класификация", "Адрес", "Тип", "Изпращач" ] ) ] ) );
        assert.deepEqual( types( result ), [ "missing-column" ] );
        assert.equal( result.anomalies[ 0 ].details.column, "Получател" );
    } );
} );
