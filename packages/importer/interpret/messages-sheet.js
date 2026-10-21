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

const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { MESSAGE_DIRECTION } = require( "@health-dev-portal/spec-model/kinds" );
const { cellAt, columnMap, findRow } = require( "#raw" );
const { noneToNull } = require( "#cells" );
const { findMixedScriptWords, foldLookAlikes } = require( "#scripts" );

// Titles as written without their footnote asterisks: e-Prescription writes "Име*", e-Referral, e-Dental and
// e-Examination write "Име", and an exact match imported no message of theirs (HEL-18).
const COLUMNS = Object.freeze( {
    title: "Съобщение",
    code: "Име",
    name: "Класификация",
    address: "Адрес",
    direction: "Тип",
    sender: "Изпращач",
    recipient: "Получател"
} );

// Asterisks and spaces together: "Име * *" kept a marker when only a final run of asterisks went (CodeRabbit on #7).
const withoutFootnote = ( title ) => title.replace( /[\s*]+$/, "" );

// P001 in e-Prescription, R001 in e-Referral: one letter and three digits (Review Focus 1).
const MESSAGE_CODE = /^[A-Z]\d{3}$/;

const DIRECTIONS = Object.freeze( { Request: MESSAGE_DIRECTION.REQUEST, Response: MESSAGE_DIRECTION.RESPONSE } );

// The x99 response is the module's error message: it answers every request and pairs with none.
const isErrorMessage = ( message ) => message.direction === MESSAGE_DIRECTION.RESPONSE && message.code.endsWith( "99" );

function pair( messages, anomalies ) {
    messages.forEach( ( message, index ) => {
        const next = messages[ index + 1 ];
        // A request without its own response, listed just before P099, must stay unpaired (CodeRabbit on #4).
        if ( message.direction === MESSAGE_DIRECTION.REQUEST && next && next.direction === MESSAGE_DIRECTION.RESPONSE && !isErrorMessage( next ) ) {
            message.pairedWith = next.code;
            next.pairedWith = message.code;
        }
    } );
    for ( const message of messages ) {
        if ( !message.pairedWith && !isErrorMessage( message ) ) {
            anomalies.push( createAnomaly( "unpaired-message", message.source, { code: message.code } ) );
        }
    }
}

/**
 * Reads the message index sheet ("Съобщения"): one entry per message, paired request with response.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{messages: Object[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readMessageIndex = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => row.cells.some( ( cell ) => withoutFootnote( cell.text ) === COLUMNS.code ) );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { messages: [], anomalies: anomalies };
    }
    // As columnMap, the first column of a title wins.
    const titles = new Map();
    for ( const [ title, column ] of columnMap( header ) ) {
        if ( !titles.has( withoutFootnote( title ) ) ) {
            titles.set( withoutFootnote( title ), column );
        }
    }
    const columns = {};
    for ( const [ key, title ] of Object.entries( COLUMNS ) ) {
        if ( !titles.has( title ) ) {
            anomalies.push( createAnomaly( "missing-column", { sheet: sheet.name, row: header.number }, { column: title } ) );
        }
        columns[ key ] = titles.get( title );
    }
    if ( anomalies.length ) {
        return { messages: [], anomalies: anomalies };
    }

    const messages = [];
    const firstRows = new Map();
    for ( const row of sheet.rows ) {
        if ( row.number <= header.number ) {
            continue;
        }
        const source = { sheet: sheet.name, row: row.number };
        const codeText = cellAt( row, columns.code ).text;
        const code = foldLookAlikes( codeText );
        // Rows below the list — the "Налично в Release" footnote, merged across every column — carry no code. A row with
        // a direction is a message, though: skipping its mistyped code would drop the message silently (final review).
        if ( !MESSAGE_CODE.test( code.folded ) ) {
            if ( Object.hasOwn( DIRECTIONS, cellAt( row, columns.direction ).text ) ) {
                anomalies.push( createAnomaly( "malformed-message-code", { ...source, column: columns.code }, { value: codeText } ) );
            }
            continue;
        }
        // A copied row whose code was left unchanged lists a message twice and leaves the new message's sheet unread.
        if ( firstRows.has( code.folded ) ) {
            anomalies.push( createAnomaly( "duplicate-message", { ...source, column: columns.code }, { code: code.folded, firstRow: firstRows.get( code.folded ), row: row.number } ) );
            continue;
        }
        firstRows.set( code.folded, row.number );
        if ( code.letters.length ) {
            anomalies.push( createAnomaly( "look-alike-letter", { ...source, column: columns.code }, { value: codeText, letters: code.letters.join( ", " ), folded: code.folded } ) );
        }
        const title = cellAt( row, columns.title ).text;
        for ( const word of findMixedScriptWords( title ) ) {
            anomalies.push( createAnomaly( "mixed-script-word", { ...source, column: columns.title }, { word: word } ) );
        }
        const directionText = cellAt( row, columns.direction ).text;
        const direction = Object.hasOwn( DIRECTIONS, directionText ) ? DIRECTIONS[ directionText ] : null;
        if ( !direction ) {
            anomalies.push( createAnomaly( "unknown-direction", { ...source, column: columns.direction }, { value: directionText } ) );
        }
        messages.push( {
            code: code.folded,
            title: { bg: title || null, en: noneToNull( cellAt( row, columns.name ).text ) },
            address: noneToNull( cellAt( row, columns.address ).text ),
            direction: direction,
            sender: noneToNull( cellAt( row, columns.sender ).text ),
            recipient: noneToNull( cellAt( row, columns.recipient ).text ),
            pairedWith: null,
            source: source
        } );
    }
    pair( messages, anomalies );
    return { messages: messages, anomalies: anomalies };
};
