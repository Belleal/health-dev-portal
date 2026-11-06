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
 * The specifications index, `/{lang}/specs` (plan 8a, decision 3): every module and the rules by stage, each version a
 * link to its spec page. The code lists are not here: they have their own index under /nomenclatures.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { listPublished } = require( "@health-dev-portal/data/published" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const { specs } = require( "#paths" );
const { CACHE, send } = require( "#responses" );
const { aheadLegend, modulesAndRules, stageTable } = require( "./stages" );

/**
 * Answers the specifications index.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.specsIndexPage = async ( context ) => {
    const { db, lang, response, nonce } = context;
    const rows = modulesAndRules( await listPublished( db ) );
    const title = label( lang, "specsIndexTitle" );
    const main = html`<h1>${ title }</h1>
${ stageTable( { lang: lang, specs: rows, link: true } ) }
${ aheadLegend( lang ) }`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: specs( lang ), canonical: specs( lang ), section: "specs", main: main, nonce: nonce } ) } );
};
