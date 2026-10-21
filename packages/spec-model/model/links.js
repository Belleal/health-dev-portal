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

const { createAnomaly } = require( "#anomalies" );
const { CODE_LIST_STATUS, LIFECYCLE } = require( "#kinds" );
const { OPERATOR, PROPERTY } = require( "#conditions" );
const { operandKey } = require( "#condition-binding" );
const { testsOf } = require( "#condition-checks" );

/**
 * The code list whose keys are the error codes NHIS returns; each rule names one of them (design record §4.6.1).
 *
 * @type {string}
 * @public
 */
const ERROR_CODE_LIST = "CL999";
module.exports.ERROR_CODE_LIST = ERROR_CODE_LIST;

const byId = ( items ) => new Map( items.map( ( item ) => [ item.id, item ] ) );

/**
 * Resolves a module version's code-list and rule references against the nomenclatures and rules of the same import
 * set (design record §4.8, §5.3). A target that does not exist blocks; a removed list or a withdrawn rule exists but
 * should no longer be used, so it warns. A kind whose spec is not given is not checked at all.
 *
 * @method
 * @param {import( "#definitions" ).ModuleVersion} module
 * @param {{nomenclatures?: import( "#definitions" ).NomenclaturesVersion|null, rules?: import( "#definitions" ).RulesVersion|null}} targets
 * @returns {import( "#definitions" ).Anomaly[]}
 * @public
 */
module.exports.linkModule = ( module, targets ) => {
    // Built once per call: e-Prescription alone makes 224 code-list and 211 rule references.
    const lists = targets.nomenclatures ? byId( targets.nomenclatures.codeLists ) : null;
    const rules = targets.rules ? byId( targets.rules.rules ) : null;
    const anomalies = [];
    const visit = ( node ) => {
        const details = ( id ) => ( { identity: node.identity || node.name.en, id: id } );
        if ( lists && node.codeList ) {
            const list = lists.get( node.codeList );
            if ( !list ) {
                anomalies.push( createAnomaly( "unknown-code-list", node.source, details( node.codeList ) ) );
            } else if ( list.status === CODE_LIST_STATUS.REMOVED ) {
                anomalies.push( createAnomaly( "removed-code-list", node.source, details( node.codeList ) ) );
            }
        }
        if ( rules ) {
            for ( const id of node.rules ) {
                const rule = rules.get( id );
                if ( !rule ) {
                    anomalies.push( createAnomaly( "unknown-rule", node.source, details( id ) ) );
                } else if ( rule.lifecycle === LIFECYCLE.WITHDRAWN ) {
                    anomalies.push( createAnomaly( "withdrawn-rule", node.source, details( id ) ) );
                }
            }
        }
        node.children.forEach( visit );
    };
    module.messages.forEach( ( message ) => message.elements.forEach( visit ) );
    return anomalies;
};

/**
 * Checks each rule's error code against CL999. CL999 is itself marked incomplete in the index, so a code it lacks is
 * a warning; without CL999 there is nothing to check against.
 *
 * @method
 * @param {import( "#definitions" ).RulesVersion} rules
 * @param {import( "#definitions" ).NomenclaturesVersion} nomenclatures
 * @returns {import( "#definitions" ).Anomaly[]}
 * @public
 */
module.exports.linkRules = ( rules, nomenclatures ) => {
    const errorCodes = nomenclatures.codeLists.find( ( list ) => list.id === ERROR_CODE_LIST );
    if ( !errorCodes ) {
        return [];
    }
    const keys = new Set( errorCodes.entries.map( ( entry ) => entry.key ) );
    return rules.rules.filter( ( rule ) => rule.errorCode !== null && rule.errorCode !== undefined && !keys.has( rule.errorCode ) )
        .map( ( rule ) => createAnomaly( "unknown-error-code", rule.source, { id: rule.id, code: rule.errorCode } ) );
};

const KEYED = new Set( [ OPERATOR.EQUAL, OPERATOR.NOT_EQUAL, OPERATOR.IN, OPERATOR.NOT_IN ] );

// "NHIF Code", "nhifCode" and "nhif code" are one column; so are "Contagious" and "Contagious (CL148)".
const columnName = ( title ) => title.replace( /\s*\([^)]*\)\s*$/, "" ).replace( /\s+/g, "" ).toLowerCase();

/**
 * Finds a list-specific column of a code list by a loosely written name: case, spaces and a trailing `(…)` do not
 * count, so `nhifCode` finds "NHIF Code" and `Contagious` finds "Contagious (CL148)".
 *
 * @method
 * @param {import( "#definitions" ).CodeList} list
 * @param {string} column
 * @returns {number} The column's index in `list.columns` — and so in each entry's `values` — or -1.
 * @public
 */
module.exports.findColumn = ( list, column ) => list.columns.findIndex( ( candidate ) => columnName( candidate.title ) === columnName( column ) );

const hasColumn = ( list, column ) => module.exports.findColumn( list, column ) >= 0;

/**
 * Checks a module's conditions against the nomenclatures of the same slot (design record §6.5).
 *
 * - **Keys.** A value compared with `=`, `!=`, `IN` or `NOT IN` on an element with a code list must be a key of that
 *   list, or it blocks. A comparison that can never be true is not published.
 * - **Columns.** A column read by `.entry['…']`, or used as the set of `IN CLxxx['…']`, must exist in its list.
 *
 * A list the nomenclatures lack is not checked here; linkModule reports it.
 *
 * @method
 * @param {import( "#definitions" ).ModuleVersion} module With `conditionBindings` and parsed conditions.
 * @param {import( "#definitions" ).NomenclaturesVersion} nomenclatures
 * @returns {import( "#definitions" ).Anomaly[]}
 * @public
 */
module.exports.linkConditions = ( module, nomenclatures ) => {
    const lists = byId( nomenclatures.codeLists );
    const flatten = ( elements ) => elements.flatMap( ( element ) => [ element, ...flatten( element.children ) ] );
    // Per message: an identity is unique only within its message, and e-Immunization's contents/status@value is CL039 in
    // I002 but CL043 in I009 (final review: with one map for the module, the last message won).
    const elements = new Map( module.messages.map( ( message ) => [ message.code,
        new Map( flatten( message.elements ).map( ( element ) => [ element.identity, element ] ) ) ] ) );
    const conditions = new Map( ( module.conditions || [] ).map( ( condition ) => [ condition.id, condition ] ) );
    const anomalies = [];
    const reported = new Set();
    // Once per condition and finding, whichever element it is bound to. Keyed on the details, the identity made
    // e-Referral's CDR17 report one value twice, and the missing ID hid CDC12's 'QN' behind CDC04's (Task 7 corpus).
    const report = ( condition, type, finding, details ) => {
        const key = JSON.stringify( [ condition.id, type, ...finding ] );
        if ( !reported.has( key ) ) {
            reported.add( key );
            anomalies.push( createAnomaly( type, condition.source, { id: condition.id, ...details } ) );
        }
    };
    for ( const binding of module.conditionBindings || [] ) {
        const condition = conditions.get( binding.condition );
        if ( !condition || !condition.parsed ) {
            continue;
        }
        for ( const test of testsOf( condition.parsed ) ) {
            if ( test.set ) {
                const setList = lists.get( test.set.list );
                if ( setList && !hasColumn( setList, test.set.column ) ) {
                    report( condition, "unknown-list-column", [ setList.id, test.set.column ], { list: setList.id, column: test.set.column } );
                }
            }
            const identity = binding.paths[ operandKey( test.operand ) ];
            const inMessage = elements.get( binding.message );
            const element = identity && inMessage ? inMessage.get( identity ) : null;
            const list = element && element.codeList ? lists.get( element.codeList ) : null;
            if ( !list ) {
                continue;
            }
            if ( test.operand.property === PROPERTY.ENTRY ) {
                if ( !hasColumn( list, test.operand.column ) ) {
                    report( condition, "unknown-list-column", [ list.id, test.operand.column ], { list: list.id, column: test.operand.column } );
                }
                continue;
            }
            // Only a value is a key: `'x'.required = 'R'` in an IF blocked as "'R' is not a key" (final review).
            if ( test.operand.property !== PROPERTY.VALUE || !KEYED.has( test.operator ) || test.set ) {
                continue;
            }
            const keys = new Set( list.entries.map( ( entry ) => entry.key ) );
            for ( const value of test.values.filter( ( candidate ) => !keys.has( candidate ) ) ) {
                report( condition, "unknown-condition-value", [ value, list.id ], { value: value, list: list.id, identity: identity } );
            }
        }
    }
    return anomalies;
};
