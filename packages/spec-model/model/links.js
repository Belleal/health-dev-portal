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
