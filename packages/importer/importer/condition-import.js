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
const { bindCondition } = require( "@health-dev-portal/spec-model/condition-binding" );
const { checkConditionTypes } = require( "@health-dev-portal/spec-model/condition-checks" );
const { parseCondition } = require( "@health-dev-portal/spec-model/condition-parser" );
const { printCondition } = require( "@health-dev-portal/spec-model/condition-printer" );
const { foldCode } = require( "#scripts" );

const flatten = ( elements ) => elements.flatMap( ( node ) => [ node, ...flatten( node.children ) ] );

function parseOne( condition, anomalies ) {
    // Empty conditions were reported when the sheet was read; reading one again would add "cannot be read" on top.
    if ( condition.text.trim() === "" ) {
        return { ...condition, parsed: null, printed: null };
    }
    // Compared values are codes, so a Cyrillic look-alike folds (design record §6.5). The folds are kept back until the
    // parse succeeds: "read as T3" is untrue of a condition that was not read at all.
    const folds = [];
    const result = parseCondition( condition.text, { value: ( value ) => foldCode( value, condition.source, folds ) } );
    if ( result.error ) {
        anomalies.push( createAnomaly( "unparsed-condition", condition.source, { id: condition.id, error: result.error } ) );
        return { ...condition, parsed: null, printed: null };
    }
    const printed = printCondition( result.condition );
    anomalies.push( ...folds );
    if ( result.forms.length ) {
        anomalies.push( createAnomaly( "non-canonical-condition", condition.source, { id: condition.id, forms: result.forms.join( ", " ), printed: printed } ) );
    }
    for ( const note of result.notes ) {
        anomalies.push( createAnomaly( "free-text-effect", condition.source, { id: condition.id, text: note } ) );
    }
    return { ...condition, parsed: result.condition, printed: printed };
}

/**
 * Reads a module's conditions into the conditions language (design record §6): each is parsed, printed in the
 * canonical form, bound once per element naming it, and its tests checked against the bound elements' data types.
 *
 * A finding about a path or a type is the condition's, not the naming element's, so it is reported once per message
 * however many of its elements name the condition. Every anomaly sits at the condition's row on the Conditions sheet,
 * where the text that needs changing is. A reference to a condition that does not exist is not bound here; the module
 * importer reports it.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ConditionText[]} conditions
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message[]} messages
 * @returns {{conditions: import( "@health-dev-portal/spec-model/definitions" ).ConditionText[], bindings: import( "@health-dev-portal/spec-model/condition-binding" ).ConditionBinding[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 *     The conditions gain `parsed` and `printed`.
 * @public
 */
module.exports.importConditions = ( conditions, messages ) => {
    const anomalies = [];
    const read = conditions.map( ( condition ) => parseOne( condition, anomalies ) );
    const byId = new Map( read.map( ( condition ) => [ condition.id, condition ] ) );
    const bindings = [];
    const reported = new Set();
    const once = ( key, type, condition, details ) => {
        if ( !reported.has( key ) ) {
            reported.add( key );
            anomalies.push( createAnomaly( type, condition.source, { id: condition.id, ...details } ) );
        }
    };
    for ( const message of messages ) {
        const nodes = flatten( message.elements );
        const elements = new Map( nodes.map( ( node ) => [ node.identity, node ] ) );
        for ( const node of nodes ) {
            for ( const id of node.conditions ) {
                const condition = byId.get( id );
                if ( !condition || !condition.parsed ) {
                    continue;
                }
                const binding = { ...bindCondition( condition.parsed, message, node ), condition: id };
                bindings.push( binding );
                for ( const [ path, identity ] of Object.entries( binding.paths ) ) {
                    if ( identity === null ) {
                        once( `path ${ id } ${ message.code } ${ path }`, "unresolved-condition-path", condition, { message: message.code, path: path } );
                    }
                }
                for ( const problem of checkConditionTypes( condition.parsed, binding, elements ) ) {
                    once( `type ${ id } ${ message.code } ${ problem.identity } ${ problem.operator }`, "condition-type-mismatch", condition,
                        { message: message.code, operator: problem.operator, identity: problem.identity, dataType: problem.dataType } );
                }
            }
        }
    }
    return { conditions: read, bindings: bindings, anomalies: anomalies };
};
