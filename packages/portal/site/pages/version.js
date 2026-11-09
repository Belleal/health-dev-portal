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
 * What every page of one spec version shares (plan 8a, decisions 3, 4 and 7): finding the version an address names —
 * or answering 404 or 410 for it — its caching and canonical address, the stage switcher in the mint band, the module's
 * sidebar, and the versions of the lists and the rules its links name, those of the stage it shows. The module, rules,
 * conditions and dictionary pages (specs.js), the message page (message.js) and a list's "used in" (nomenclatures.js)
 * are built from these.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { findPublished, findPublishedById, listPublished, upcoming } = require( "@health-dev-portal/data/published" );
const { SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { resolutionOrder } = require( "@health-dev-portal/spec-model/stages" );
const { formatDate } = require( "#format" );
const { label } = require( "#labels" );
const paths = require( "#paths" );
const { CACHE, gone, notFound } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { localText } = require( "#text" );
const { compatibleUntil } = require( "./stages" );

// The stages a public version can be in, in the switcher's order.
const STAGES = Object.freeze( [ STAGE.TESTING, STAGE.PRODUCTION, STAGE.PREVIOUS_PRODUCTION ] );

/**
 * The endpoint segment a message is grouped under (decision 7): the second-to-last segment of its address's path, so
 * `/v4/eprescription/doctor/issue` is under `/doctor`.
 *
 * @method
 * @param {string|null} address
 * @returns {string|null} `null` for a message with no address, or one too short to have the segment.
 * @public
 */
module.exports.endpointSegment = ( address ) => {
    if ( typeof address !== "string" ) {
        return null;
    }
    const segments = address.split( /[?#]/ )[ 0 ].split( "/" ).filter( ( segment ) => segment !== "" );
    return segments.length < 2 ? null : `/${ segments.at( -2 ) }`;
};

/**
 * A module's messages by endpoint segment, each group in the module's own order and the groups in the order they first
 * appear. A response has no address of its own, and is listed under the segment of the request it answers, through
 * `pairedWith`: read literally, decision 7 put every response under "other", where no reader would look for it
 * (controller's ruling, task 5 review). Only a message with neither an address nor a paired one that has one is
 * "other", last, where `segment` is `null`.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message[]} messages
 * @returns {Array<{segment: string|null, messages: import( "@health-dev-portal/spec-model/definitions" ).Message[]}>}
 * @public
 */
module.exports.bySegment = ( messages ) => {
    const groups = new Map();
    for ( const message of messages ) {
        // One step only: the paired message's own address, never its pair's in turn.
        const paired = message.pairedWith ? messages.find( ( one ) => one.code === message.pairedWith ) : null;
        const segment = module.exports.endpointSegment( message.address ) || ( paired ? module.exports.endpointSegment( paired.address ) : null );
        if ( !groups.has( segment ) ) {
            groups.set( segment, [] );
        }
        groups.get( segment ).push( message );
    }
    const other = groups.get( null );
    groups.delete( null );
    return [ ...[ ...groups ].map( ( [ segment, group ] ) => ( { segment: segment, messages: group } ) ), ...( other ? [ { segment: null, messages: other } ] : [] ) ];
};

/**
 * The public version an address names, of one of `kinds`. Anything else is answered here: a version that is not public,
 * or of another kind, with the 404 page; a retired one, at its fixed address, with the 410 page and a link to its spec's
 * changes. A staff-only stage never gets this far, since it has no address (`paths.parseAt`).
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string, at: string}} parts
 * @param {string[]} kinds The `SPEC_KIND`s the page shows.
 * @returns {Promise<import( "#definitions" ).ShownVersion|null>} `null` once the response is sent.
 * @public
 */
module.exports.findShown = async ( context, parts, kinds ) => {
    const { db, lang, request, response } = context;
    const at = paths.parseAt( parts.at );
    const version = at === null ? null : await findPublished( db, parts.spec, at );
    if ( version === null || !kinds.includes( version.kind ) ) {
        notFound( request, response );
        return null;
    }
    if ( version.retired ) {
        gone( request, response, paths.changes( lang, parts.spec ) );
        return null;
    }
    const fixed = Object.hasOwn( at, "number" );
    return { version: version, fixed: fixed, cache: fixed ? CACHE.FIXED : CACHE.BRIEF };
};

/**
 * The spec's version in each public stage, with its content, in the switcher's order.
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).Database} db
 * @param {string} spec
 * @returns {Promise<Array<{stage: string, version: Object}>>} Only the stages that hold one.
 * @public
 */
module.exports.stageVersions = async ( db, spec ) => {
    const found = await Promise.all( STAGES.map( ( stage ) => findPublished( db, spec, { stage: stage } ) ) );
    return STAGES.map( ( stage, index ) => ( { stage: stage, version: found[ index ] } ) ).filter( ( one ) => one.version !== null );
};

/**
 * The date a version in testing is due in production: its release's planned date, `null` while none is set.
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).Database} db
 * @param {{spec: string, number: string}} version
 * @returns {Promise<string|null>}
 * @public
 */
module.exports.plannedOn = async ( db, version ) => {
    const release = ( await upcoming( db ) ).find( ( one ) => one.versions.some( ( found ) => found.spec === version.spec && found.number === version.number ) );
    return release ? release.plannedOn : null;
};

const switchName = ( lang, stage, version ) => {
    if ( stage === STAGE.TESTING ) {
        return label( lang, "switchTesting", { number: version.number } );
    }
    if ( stage === STAGE.PRODUCTION ) {
        return label( lang, "switchProduction", { number: version.number } );
    }
    // Previous production is only backward compatible for a time, and says until when, wherever it appears (§7.6).
    const name = label( lang, "switchPrevious", { number: version.number } );
    const until = compatibleUntil( lang, stage, version.expiresOn );
    return until ? `${ name } · ${ until }` : name;
};

/**
 * The mint band of a spec version's pages (decision 7): one link per kept stage to the same page there, the shown
 * version's stage marked; on a version in testing, the date it is due in production and a link to its comparison with
 * production. The band keeps to ink and green: the muted grey falls below 4.5:1 on mint.
 *
 * @method
 * @param {string} lang
 * @param {Object} parts
 * @param {Array<{stage: string, version: Object}>} parts.stages From `stageVersions`.
 * @param {Object} parts.version The version shown.
 * @param {function( string, Object ): string} parts.address The same page at a stage, given the stage and its version.
 * @param {string|null} [parts.planned] For a version in testing, the date it is due in production.
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.stageBand = ( lang, { stages, version, address, planned = null } ) => {
    const links = stages.map( ( one ) => one.stage === version.stage
        ? html`<li><a href="${ address( one.stage, one.version ) }" aria-current="true">${ switchName( lang, one.stage, one.version ) }</a></li>`
        : html`<li><a href="${ address( one.stage, one.version ) }">${ switchName( lang, one.stage, one.version ) }</a></li>` );
    let due = null;
    if ( version.stage === STAGE.TESTING ) {
        const production = stages.find( ( one ) => one.stage === STAGE.PRODUCTION );
        due = html`
<p>${ planned === null ? label( lang, "plannedNotSet" ) : label( lang, "plannedProduction", { date: formatDate( planned, lang ) } ) }${ production
            ? html` · <a href="${ paths.compare( lang, version.spec, production.version.number, version.number ) }">${ label( lang, "compareWithProduction" ) }</a>` : null }</p>`;
    }
    return html`<nav class="stages" aria-label="${ label( lang, "stageSwitcher" ) }"><span>${ label( lang, "stageSwitcher" ) }:</span>
<ul>${ links }</ul></nav>${ due }`;
};

// A published spec's version in a public stage, by the field `listPublished` keeps it under.
const FIELDS = Object.freeze( { [ STAGE.TESTING ]: "testing", [ STAGE.PRODUCTION ]: "production", [ STAGE.PREVIOUS_PRODUCTION ]: "previousProduction" } );

// The stages a page at `stage` looks in for the lists and the rules it links, nearest first (design record §4.8, ruling
// F2): its own, then each public stage further on, as `resolutionOrder` gives them. Previous production is on no stage's
// line, and `resolutionOrder` refuses it: a page there reads a list in previous production where the list has a version
// there, and otherwise the one in production, which has been in force beside it all along.
const linkOrder = ( stage ) => stage === STAGE.PREVIOUS_PRODUCTION ? [ STAGE.PREVIOUS_PRODUCTION, STAGE.PRODUCTION ]
    : resolutionOrder( stage ).filter( ( one ) => Object.hasOwn( FIELDS, one ) );

/**
 * The number of each code list and of the rules that a page of a version links to (design record §4.8, "Membership
 * stays live"): the public version of that spec in the stage the page shows — a page by number counts as the stage its
 * version is in — else in the nearest stage further on; a page in previous production falls back to production. Never
 * the versions the module's frozen resolution record names: a production page then linked CL007 1.5.33, previous
 * production, which is retired with the list's next update and answers 410 from then on (final review I2).
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).Database} db
 * @param {string} stage The stage of the version shown.
 * @returns {Promise<Map<string, string>>} By spec ID; a spec found in no such stage is absent, and is named without a link.
 * @public
 */
module.exports.linkedNumbers = async ( db, stage ) => {
    const order = linkOrder( stage );
    const numbers = new Map();
    // One read of every published spec's stages, rather than a version and its content read for each list a module names.
    for ( const published of await listPublished( db ) ) {
        const found = order.map( ( one ) => published[ FIELDS[ one ] ] ).find( ( version ) => version !== null );
        if ( found ) {
            numbers.set( published.spec, found.number );
        }
    }
    return numbers;
};

/**
 * The public module versions in a stage, each with its content, in spec order: those a list page at that stage names
 * under "used in" (ruling F2).
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).Database} db
 * @param {string} stage A public stage.
 * @returns {Promise<Object[]>} As `findPublishedById` gives them.
 * @public
 */
module.exports.modulesIn = async ( db, stage ) => {
    const modules = ( await listPublished( db ) ).filter( ( one ) => one.kind === SPEC_KIND.MODULE && one[ FIELDS[ stage ] ] !== null );
    // By the ID listed, read once: looked up by stage again, a promotion in between could name another version.
    return ( await Promise.all( modules.map( ( one ) => findPublishedById( db, one[ FIELDS[ stage ] ].id ) ) ) ).filter( ( one ) => one !== null );
};

/**
 * The sidebar of a module's pages (decision 7): the version, its messages by endpoint segment, then its conditions,
 * dictionary and errors.
 *
 * @method
 * @param {string} lang
 * @param {Object} parts
 * @param {string} parts.spec
 * @param {string} parts.at As the address has it, so the sidebar keeps to the stage or the number the reader chose.
 * @param {Object} parts.version
 * @param {string|null} [parts.code] The message shown, marked.
 * @param {string|null} [parts.current] `conditions` or `dictionary`, when that page is shown, marked.
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.moduleSidebar = ( lang, { spec, at, version, code = null, current = null } ) => {
    const link = ( address, marked, text ) => marked ? html`<a href="${ address }" aria-current="true">${ text }</a>` : html`<a href="${ address }">${ text }</a>`;
    const groups = module.exports.bySegment( version.content.messages ).map( ( group ) => html`<h2>${ group.segment === null ? label( lang, "segmentOther" ) : group.segment }</h2>
<ul>
${ group.messages.map( ( message ) => html`<li>${ link( paths.message( lang, spec, at, message.code ), message.code === code,
        html`${ message.code } · ${ localText( message.title, lang ) }` ) }</li>\n` ) }</ul>
` );
    return html`<p class="title"><a href="${ paths.spec( lang, spec, at ) }">${ specName( spec, lang ) } ${ version.number }</a></p>
${ groups }<nav aria-label="${ label( lang, "moduleLinks" ) }"><ul>
<li>${ link( paths.conditions( lang, spec, at ), current === "conditions", label( lang, "conditions" ) ) }</li>
<li>${ link( paths.dictionary( lang, spec, at ), current === "dictionary", label( lang, "dictionary" ) ) }</li>
<li><a href="${ paths.errors( lang ) }">${ label( lang, "sectionErrors" ) }</a></li>
<li><a href="${ paths.changes( lang, spec ) }">${ label( lang, "changelog" ) }</a></li>
</ul></nav>`;
};

/**
 * A table of conditions, each row anchored by the condition's ID so that a link can name it: its canonical form where
 * it was read, else its text as written, and what it applies to.
 *
 * @method
 * @param {string} lang
 * @param {Array<{id: string, condition: import( "@health-dev-portal/spec-model/definitions" ).ConditionText|null, uses: import( "@ti-engine/web-content/html" ).SafeString}>} rows
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.conditionsTable = ( lang, rows ) => html`<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnCode" ) }</th><th scope="col">${ label( lang, "columnCondition" ) }</th><th scope="col">${ label( lang, "columnAppliesTo" ) }</th></tr></thead>
<tbody>
${ rows.map( ( row ) => {
        const text = row.condition ? row.condition.printed || row.condition.text : null;
        // A condition left blank in the workbook is shown as such, and one an element names that this version lacks says so.
        const shown = row.condition === null ? html`<p class="muted">${ label( lang, "conditionMissing" ) }</p>`
            : text ? html`<pre>${ text }</pre>` : html`—`;
        return html`<tr id="${ row.id }"><td><code>${ row.id }</code></td><td>${ shown }</td><td>${ row.uses }</td></tr>\n`;
    } ) }</tbody>
</table>`;
