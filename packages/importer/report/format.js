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

const { ANOMALY_LEVEL } = require( "@health-dev-portal/spec-model/kinds" );

const LEVEL_ORDER = Object.freeze( { [ ANOMALY_LEVEL.BLOCKING ]: 0, [ ANOMALY_LEVEL.WARNING ]: 1 } );

function columnLetters( column ) {
    let letters = "";
    for ( let remaining = column; remaining > 0; remaining = Math.floor( ( remaining - 1 ) / 26 ) ) {
        letters = String.fromCharCode( 65 + ( ( remaining - 1 ) % 26 ) ) + letters;
    }
    return letters;
}

/**
 * Writes where an anomaly was found the way Excel names it: `P001!B3`, or less when less is known.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Anomaly} anomaly
 * @returns {string}
 * @public
 */
module.exports.cellReference = ( anomaly ) => {
    if ( !anomaly.sheet ) {
        return "(workbook)";
    }
    if ( !anomaly.row ) {
        return anomaly.sheet;
    }
    if ( !anomaly.column ) {
        return `${ anomaly.sheet } row ${ anomaly.row }`;
    }
    return `${ anomaly.sheet }!${ columnLetters( anomaly.column ) }${ anomaly.row }`;
};

/**
 * Formats an import result as the text report a person reads: a summary line, each anomaly (blocking first, then by
 * sheet, row and column), and whether the import was accepted.
 *
 * @method
 * @param {{version: import( "@health-dev-portal/spec-model/definitions" ).ModuleVersion, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}} result
 * @returns {string}
 * @public
 */
module.exports.formatReport = ( result ) => {
    const { version, anomalies } = result;
    const sorted = [ ...anomalies ].sort( ( a, b ) =>
        LEVEL_ORDER[ a.level ] - LEVEL_ORDER[ b.level ]
        || String( a.sheet || "" ).localeCompare( String( b.sheet || "" ) )
        || ( a.row || 0 ) - ( b.row || 0 )
        || ( a.column || 0 ) - ( b.column || 0 ) );
    const blocking = anomalies.filter( ( anomaly ) => anomaly.level === ANOMALY_LEVEL.BLOCKING ).length;
    const lines = [ `${ version.spec } ${ version.version || "(version unknown)" }: ${ version.messages.length } messages, ${ blocking } blocking, ${ anomalies.length - blocking } warnings` ];
    for ( const anomaly of sorted ) {
        lines.push( `[${ anomaly.level }] ${ module.exports.cellReference( anomaly ) } ${ anomaly.type }: ${ anomaly.message }` );
    }
    lines.push( blocking ? "Import refused: fix the blocking anomalies in the source workbook and import it again." : "Import accepted." );
    return lines.join( "\n" );
};
