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

const { testsOf } = require( "#condition-checks" );

/**
 * The specs a module version refers to, and so resolves against (design record §4.8): every code list an element
 * names, every list a condition uses as the set of `IN CLxxx['…']`, and whether any element names a business rule. A
 * list read through `.entry['…']` is the element's own list, already counted. A condition that could not be read
 * names nothing.
 *
 * @method
 * @param {import( "#definitions" ).ModuleVersion} module
 * @returns {{codeLists: string[], rules: boolean}} `codeLists` sorted, each once.
 * @public
 */
module.exports.referencedSpecs = ( module ) => {
    const lists = new Set();
    let rules = false;
    const visit = ( node ) => {
        if ( node.codeList ) {
            lists.add( node.codeList );
        }
        rules = rules || node.rules.length > 0;
        node.children.forEach( visit );
    };
    module.messages.forEach( ( message ) => message.elements.forEach( visit ) );
    for ( const condition of module.conditions || [] ) {
        if ( condition.parsed ) {
            testsOf( condition.parsed ).filter( ( test ) => test.set ).forEach( ( test ) => lists.add( test.set.list ) );
        }
    }
    return { codeLists: [ ...lists ].sort(), rules: rules };
};
