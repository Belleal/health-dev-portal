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

const { hasBlocking } = require( "@health-dev-portal/spec-model/anomalies" );
const { ANOMALY_LEVEL, SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );

const LEVEL_ORDER = Object.freeze( { [ ANOMALY_LEVEL.BLOCKING ]: 0, [ ANOMALY_LEVEL.WARNING ]: 1 } );

function columnLetters( column ) {
    let letters = "";
    for ( let remaining = column; remaining > 0; remaining = Math.floor( ( remaining - 1 ) / 26 ) ) {
        letters = String.fromCharCode( 65 + ( ( remaining - 1 ) % 26 ) ) + letters;
    }
    return letters;
}

// What a version holds, by kind. A version without a kind is a module: plan 1's results carry none.
function contents( version ) {
    if ( version.kind === SPEC_KIND.NOMENCLATURES ) {
        const entries = version.codeLists.reduce( ( sum, list ) => sum + list.entries.length, 0 );
        return `${ version.codeLists.length } code lists, ${ entries } entries`;
    }
    if ( version.kind === SPEC_KIND.RULES ) {
        return `${ version.rules.length } rules`;
    }
    return `${ version.messages.length } messages`;
}

// One line counting each type, blocking types first, then the most frequent. Nomenclatures 1.5.33 alone has a
// thousand warnings, and the tally is what a person reads before the list.
function tally( anomalies ) {
    const counts = new Map();
    for ( const anomaly of anomalies ) {
        const entry = counts.get( anomaly.type ) || { type: anomaly.type, level: anomaly.level, count: 0 };
        entry.count++;
        counts.set( anomaly.type, entry );
    }
    const ordered = [ ...counts.values() ]
        .sort( ( a, b ) => LEVEL_ORDER[ a.level ] - LEVEL_ORDER[ b.level ] || b.count - a.count || a.type.localeCompare( b.type ) );
    return `By type: ${ ordered.map( ( entry ) => `${ entry.type } ${ entry.count }` ).join( ", " ) }`;
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
 * Formats an import result as the text report a person reads: a summary line saying what the version holds, a tally
 * by type, each anomaly (blocking first, then by sheet, row and column), and whether the import was accepted.
 *
 * @method
 * @param {{version: Object, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}} result A
 *     module, nomenclatures or rules version and its anomalies.
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
    const lines = [ `${ version.spec } ${ version.version || "(version unknown)" }: ${ contents( version ) }, ${ blocking } blocking, ${ anomalies.length - blocking } warnings` ];
    if ( anomalies.length ) {
        lines.push( tally( anomalies ) );
    }
    for ( const anomaly of sorted ) {
        lines.push( `[${ anomaly.level }] ${ module.exports.cellReference( anomaly ) } ${ anomaly.type }: ${ anomaly.message }` );
    }
    lines.push( blocking ? "Import refused: fix the blocking anomalies in the source workbook and import it again." : "Import accepted." );
    return lines.join( "\n" );
};

/**
 * Formats a set import: each workbook's report — nomenclatures, rules, then the modules in the order given — what
 * could not be linked for want of a workbook, and whether the set as a whole was accepted.
 *
 * @method
 * @param {{nomenclatures: Object|null, rules: Object|null, modules: Object[]}} set `importSet`'s result.
 * @returns {string}
 * @public
 */
module.exports.formatSetReport = ( set ) => {
    const results = [ set.nomenclatures, set.rules, ...set.modules ].filter( Boolean );
    const closing = [];
    if ( set.modules.length && !set.nomenclatures ) {
        closing.push( "Code lists were not linked: no nomenclatures workbook was given." );
    }
    if ( set.modules.length && !set.rules ) {
        closing.push( "Rules were not linked: no rules workbook was given." );
    }
    const refused = results.filter( ( result ) => hasBlocking( result.anomalies ) ).length;
    closing.push( refused ? `Set refused: ${ refused } of ${ results.length } workbooks have blocking anomalies.` : "Set accepted." );
    return [ ...results.map( module.exports.formatReport ), closing.join( "\n" ) ].join( "\n\n" );
};
