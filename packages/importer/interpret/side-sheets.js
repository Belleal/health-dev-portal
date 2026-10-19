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
const { cellAt, findRow } = require( "#raw" );
const { noneToNull } = require( "#cells" );

/**
 * Reads the "Conditions" sheet as written: an ID in column A starts a condition, column B carries its lines. Plan 3
 * parses the text into the conditions language.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{conditions: import( "@health-dev-portal/spec-model/definitions" ).ConditionText[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readConditions = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === "Condition ID" );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { conditions: [], anomalies: anomalies };
    }
    const collected = [];
    const firstRows = new Map();
    let current = null;
    for ( const row of sheet.rows ) {
        if ( row.number <= header.number ) {
            continue;
        }
        const id = cellAt( row, 1 ).text;
        const line = cellAt( row, 2 ).text;
        if ( id ) {
            current = { id: id, lines: [], source: { sheet: sheet.name, row: row.number } };
            // A copied block leaves one ID pointing at two texts; the first is kept and the repeat blocks, as a repeated
            // message code does (CodeRabbit on #4). Its lines go into a condition that is not collected.
            if ( firstRows.has( id ) ) {
                anomalies.push( createAnomaly( "duplicate-condition", current.source, { id: id, firstRow: firstRows.get( id ), row: row.number } ) );
            } else {
                firstRows.set( id, row.number );
                collected.push( current );
            }
        }
        if ( line && current ) {
            current.lines.push( line );
        }
    }
    for ( const condition of collected ) {
        if ( condition.lines.length === 0 ) {
            anomalies.push( createAnomaly( "empty-condition", condition.source, { id: condition.id } ) );
        }
    }
    return {
        conditions: collected.map( ( condition ) => ( { id: condition.id, text: condition.lines.join( "\n" ), source: condition.source } ) ),
        anomalies: anomalies
    };
};

/**
 * Reads the "Dictionary" sheet of abbreviations.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{entries: import( "@health-dev-portal/spec-model/definitions" ).DictionaryEntry[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readDictionary = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === "Abbreviation" );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { entries: [], anomalies: anomalies };
    }
    const entries = sheet.rows
        .filter( ( row ) => row.number > header.number && cellAt( row, 1 ).text )
        .map( ( row ) => ( {
            abbreviation: cellAt( row, 1 ).text,
            name: { bg: null, en: noneToNull( cellAt( row, 2 ).text ) },
            description: { bg: noneToNull( cellAt( row, 3 ).text ), en: null },
            source: { sheet: sheet.name, row: row.number }
        } ) );
    return { entries: entries, anomalies: anomalies };
};
