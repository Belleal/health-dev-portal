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
const { LIFECYCLE } = require( "@health-dev-portal/spec-model/kinds" );
const { cellAt, columnMap, findRow } = require( "#raw" );
const { isUsableKey, listRows, noneToNull, readVersionCell } = require( "#cells" );
const { findMixedScriptWords, foldCode } = require( "#scripts" );
const { TAB_STATUS, matchLegend } = require( "#legend" );

const COLUMNS = Object.freeze( { id: "Rule ID", definition: "Definition", source: "Source", errorCode: "Error Code", since: "Since" } );

// The reference parser of plan 1 accepts exactly this, so an ID of any other shape could never be referenced.
const RULE_ID = /^RL\d+$/;

/**
 * Reads the business-rules sheet (design record §4.6.1). As on a module's message tabs, each rule's status is a
 * colour: its ID cell's fill — green active, yellow active and changed in this version, red withdrawn, with the
 * definition cleared.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{rules: import( "@health-dev-portal/spec-model/definitions" ).Rule[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readRulesSheet = ( sheet ) => {
    const anomalies = [];
    // Rules 1.1.1 has a note on row 1 and its header on row 3.
    const header = findRow( sheet, ( row ) => row.cells.some( ( cell ) => cell.text === COLUMNS.id ) );
    if ( !header ) {
        return { rules: [], anomalies: [ createAnomaly( "missing-header-row", { sheet: sheet.name } ) ] };
    }
    const columns = columnMap( header );
    const missing = [ COLUMNS.id, COLUMNS.definition ].filter( ( title ) => !columns.has( title ) );
    if ( missing.length ) {
        return { rules: [], anomalies: missing.map( ( title ) => createAnomaly( "missing-column", { sheet: sheet.name, row: header.number }, { column: title } ) ) };
    }
    const column = ( key ) => columns.get( COLUMNS[ key ] );

    const rules = [];
    const skipped = [];
    const firstRows = new Map();
    for ( const row of sheet.rows.filter( ( candidate ) => candidate.number > header.number ) ) {
        if ( row.cells.every( ( cell ) => !cell.text ) ) {
            continue;
        }
        const idCell = cellAt( row, column( "id" ) );
        if ( !isUsableKey( idCell.text ) ) {
            skipped.push( row.number );
            continue;
        }
        const at = ( number ) => ( { sheet: sheet.name, row: row.number, column: number } );
        const id = foldCode( idCell.text, at( column( "id" ) ), anomalies );
        if ( !RULE_ID.test( id ) ) {
            anomalies.push( createAnomaly( "malformed-rule-id", at( column( "id" ) ), { value: idCell.text } ) );
            continue;
        }
        const repeated = firstRows.has( id );
        if ( repeated ) {
            anomalies.push( createAnomaly( "duplicate-rule", { sheet: sheet.name, row: row.number }, { id: id, firstRow: firstRows.get( id ), row: row.number } ) );
        } else {
            firstRows.set( id, row.number );
        }

        const status = matchLegend( idCell.fill, TAB_STATUS );
        if ( !status ) {
            anomalies.push( createAnomaly( "unknown-rule-colour", at( column( "id" ) ), { id: id, colour: idCell.fill || "none" } ) );
        }
        const definition = noneToNull( cellAt( row, column( "definition" ) ).text );
        for ( const word of definition ? findMixedScriptWords( definition ) : [] ) {
            anomalies.push( createAnomaly( "mixed-script-word", at( column( "definition" ) ), { word: word } ) );
        }
        // A withdrawn rule's definition is cleared in the workbook (all nine in 1.1.1); an active one's must not be.
        if ( !definition && ( !status || status.lifecycle !== LIFECYCLE.WITHDRAWN ) ) {
            anomalies.push( createAnomaly( "rule-without-definition", { sheet: sheet.name, row: row.number }, { id: id } ) );
        }
        const errorText = column( "errorCode" ) ? cellAt( row, column( "errorCode" ) ).text : "";
        const rule = {
            id: id,
            definition: { bg: definition, en: null },
            sourceText: column( "source" ) ? noneToNull( cellAt( row, column( "source" ) ).text ) : null,
            // 11 rules of 1.1.1 return "Е002" with a Cyrillic Е.
            errorCode: noneToNull( errorText ? foldCode( errorText, at( column( "errorCode" ) ), anomalies ) : "" ),
            since: column( "since" ) ? readVersionCell( cellAt( row, column( "since" ) ).text, at( column( "since" ) ), anomalies ) : null,
            lifecycle: status ? status.lifecycle : null,
            changedInVersion: status ? status.changed : null,
            source: { sheet: sheet.name, row: row.number }
        };
        // A repeat is checked like any row, so its own defects are reported, but the first rule under the ID stands.
        if ( !repeated ) {
            rules.push( rule );
        }
    }
    if ( skipped.length ) {
        anomalies.push( createAnomaly( "skipped-rows", { sheet: sheet.name, row: skipped[ 0 ] }, { count: skipped.length, rows: listRows( skipped ) } ) );
    }
    return { rules: rules, anomalies: anomalies };
};
