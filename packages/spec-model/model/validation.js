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
const { ELEMENT_KIND, REQUIREMENT } = require( "#kinds" );

const showCardinality = ( cardinality ) => `${ cardinality.min }..${ cardinality.max === null ? "*" : cardinality.max }`;

/**
 * Checks what only the whole tree can show: unique identities, cardinality ranges, conditional elements without a
 * condition, empty groups and polymorphic elements without variants.
 *
 * @method
 * @param {import( "#definitions" ).ElementNode[]} elements The message's top-level elements.
 * @returns {import( "#definitions" ).Anomaly[]}
 * @public
 */
module.exports.validateMessageTree = ( elements ) => {
    const anomalies = [];
    const firstRows = new Map();
    const visit = ( node ) => {
        if ( node.identity ) {
            if ( firstRows.has( node.identity ) ) {
                anomalies.push( createAnomaly( "duplicate-identity", node.source,
                    { identity: node.identity, firstRow: firstRows.get( node.identity ), row: node.source.row } ) );
            } else {
                firstRows.set( node.identity, node.source.row );
            }
        }
        const cardinality = node.cardinality;
        if ( cardinality && cardinality.max !== null && cardinality.min > cardinality.max ) {
            anomalies.push( createAnomaly( "invalid-cardinality-range", node.source, { value: showCardinality( cardinality ) } ) );
        }
        if ( node.requirement === REQUIREMENT.CONDITIONAL && node.conditions.length === 0 ) {
            anomalies.push( createAnomaly( "conditional-without-condition", node.source, { identity: node.identity } ) );
        }
        if ( node.requirement === REQUIREMENT.REQUIRED && cardinality && cardinality.min === 0 ) {
            anomalies.push( createAnomaly( "required-with-zero-minimum", node.source, { identity: node.identity, value: showCardinality( cardinality ) } ) );
        }
        if ( node.kind === ELEMENT_KIND.GROUP && node.children.length === 0 ) {
            anomalies.push( createAnomaly( "empty-group", node.source, { identity: node.identity } ) );
        }
        if ( node.kind === ELEMENT_KIND.POLYMORPHIC && node.children.length < 2 ) {
            anomalies.push( createAnomaly( "single-variant", node.source, { identity: node.identity || node.name.en, count: node.children.length } ) );
        }
        node.children.forEach( visit );
    };
    elements.forEach( visit );
    return anomalies;
};
