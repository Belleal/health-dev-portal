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

/*
 * Every kind of public page, in both languages where it has two (plan 8a, Task 9): the accessibility test opens each in
 * Chromium, and the studio's access test (plan 9a) checks each stays anonymous and cacheable with sign-in on. One list,
 * so that a page added for one is checked by both.
 */

const paths = require( "#paths" );
const { SEED } = require( "./seed" );

const SPEC = SEED.ePrescription.spec;

/**
 * The address of one element of P001, as the message's tree links to it: found on the page rather than named here, so a
 * test needs no knowledge of the slugs.
 *
 * @method
 * @param {string} html The tree of P001 at production.
 * @returns {string|null} The first element's address, or `null` when the page links to none.
 * @public
 */
module.exports.elementOf = ( html ) => {
    const selected = /href="([^"]*\/P001\/elements\/[^"]+)"/.exec( html );
    return selected === null ? null : selected[ 1 ];
};

/**
 * Every address to check: each kind of page, and both languages where a page has two.
 *
 * @method
 * @param {string} element The address of one element of P001, selected.
 * @returns {Array<[string, number]>} Each address with the status it should answer.
 * @public
 */
module.exports.pagesToCheck = ( element ) => {
    const addresses = [];
    for ( const lang of [ "bg", "en" ] ) {
        addresses.push( ...[
            paths.home( lang ),
            paths.specs( lang ),
            paths.spec( lang, SPEC, "production" ),
            paths.message( lang, SPEC, SEED.ePrescription.production, "P001" ),
            paths.message( lang, SPEC, "testing", "P001" ),
            paths.message( lang, SPEC, "testing", "P001", "conditions" ),
            paths.message( lang, SPEC, "testing", "P001", "changes" ),
            paths.spec( lang, SEED.rules.spec, "production" ),
            paths.conditions( lang, SPEC, "testing" ),
            paths.dictionary( lang, SPEC, "testing" ),
            paths.lists( lang ),
            paths.list( lang, SEED.cl007.spec, "production" ),
            paths.errors( lang ),
            paths.changes( lang ),
            paths.changes( lang, SPEC ),
            paths.compare( lang, SPEC, SEED.ePrescription.production, SEED.ePrescription.testing ),
            // Plan 8b: the Schemas section, the two file tabs, and the combined nomenclatures' history (HEL-36).
            paths.schemas( lang ),
            paths.schemaSet( lang, SPEC, SEED.ePrescription.production ),
            paths.message( lang, SPEC, "testing", "P001", "sample" ),
            paths.message( lang, SPEC, "testing", "P001", "xsd" ),
            paths.changes( lang, "nomenclatures" ),
            // Plan 8c: the guides, the FAQ, the status page with every state shown, and search, its results and a query too short.
            paths.guides( lang ),
            paths.guide( lang, "getting-started" ),
            paths.guide( lang, "environments" ),
            paths.faq( lang ),
            paths.status( lang ),
            paths.search( lang, "P001" ),
            paths.search( lang, "a" )
        ].map( ( address ) => [ address, 200 ] ) );
        // Nothing is in testing as far as errors go, so that address is the 404 page in its language.
        addresses.push(
            [ paths.errors( lang, true ), 404 ],
            [ `/${ lang }/no-such-page`, 404 ],
            [ paths.spec( lang, SPEC, SEED.history ), 410 ]
        );
    }
    addresses.push( [ element, 200 ], [ element.replace( "/bg/", "/en/" ), 200 ] );
    return addresses;
};
