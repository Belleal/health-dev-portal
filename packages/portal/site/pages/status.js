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
 * The environments' status (plan 8c, decision 6; design record §8.2, §8.7): the status page, its Atom feed, and the home
 * page's band. Staff set it (hdp-status, then plan 9's form). A state is always written in words, its colour only added
 * (WCAG 1.4.1), and an environment nobody has reported on is said to be so, never shown as working. Nothing here names who
 * made a change (§10.2). Status and its feed are cached for a minute (§10.3).
 */

const { html } = require( "@ti-engine/web-content/html" );
const { currentStatus, maintenanceWindows, statusEvents, statusHistory } = require( "@health-dev-portal/data/status" );
const { formatDateTime } = require( "#format" );
const { label } = require( "#labels" );
const { page } = require( "#layout" );
const paths = require( "#paths" );
const { CACHE, send } = require( "#responses" );

const ATOM = "application/atom+xml; charset=utf-8";
// Each environment's and each state's words: a key is never spliced into a label's name, so a new key without words is
// caught here, as an unknown label, rather than shown as a blank.
const ENVIRONMENT_LABELS = Object.freeze( { production: "environmentProduction", test: "environmentTest" } );
const STATE_LABELS = Object.freeze( { operational: "stateOperational", degraded: "stateDegraded", maintenance: "stateMaintenance", outage: "stateOutage" } );
// The feed's own `updated` with no event: fixed, so an empty feed is the same bytes each time (as feeds.js does).
const NO_EVENTS = "1970-01-01T00:00:00Z";

const environmentName = ( lang, environment ) => label( lang, ENVIRONMENT_LABELS[ environment ] );

/**
 * A state in words, in an element whose class names it for its colour: `state-none` for an environment never reported.
 *
 * @method
 * @param {string} lang
 * @param {string|null} state
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.stateMark = ( lang, state ) => state === null ? html`<span class="state state-none">${ label( lang, "stateNotReported" ) }</span>`
    : html`<span class="state state-${ state }">${ label( lang, STATE_LABELS[ state ] ) }</span>`;

const span = ( lang, window ) => `${ formatDateTime( window.startsAt, lang ) } – ${ formatDateTime( window.endsAt, lang ) }`;

const windowLine = ( lang, window ) => html`${ environmentName( lang, window.environment ) }: ${ span( lang, window ) }${ window.message === null ? null
    : html` — ${ window.message[ lang ] }` }`;

/**
 * The home page's band (§8.2): each environment's state, linked to the status page, the windows not yet ended, and the
 * newcomer's link — to Getting started, or to the Guides index while the register has no such guide.
 *
 * @method
 * @param {string} lang
 * @param {Object} parts
 * @param {Array<{environment: string, state: string|null, message: {bg: string, en: string}|null}>} parts.status As
 *     `currentStatus` gives it.
 * @param {Array<{environment: string, startsAt: string, endsAt: string, message: {bg: string, en: string}|null}>} parts.windows
 *     As `maintenanceWindows` gives them.
 * @param {import( "#definitions" ).Content} parts.content
 * @returns {import( "@ti-engine/web-content/html" ).SafeString}
 * @public
 */
module.exports.statusBand = ( lang, { status, windows, content } ) => {
    const start = content.guides.some( ( one ) => one.slug === "getting-started" ) ? paths.guide( lang, "getting-started" ) : paths.guides( lang );
    const environments = status.map( ( one ) => html`<li><a href="${ paths.status( lang ) }">${ environmentName( lang, one.environment ) }</a>: ${ module.exports.stateMark( lang, one.state ) }${
        one.message === null || one.state === "operational" ? null : html` — ${ one.message[ lang ] }` }</li>\n` );
    return html`<ul class="environments">
${ environments }</ul>
${ windows.map( ( one ) => html`<p>${ label( lang, "maintenancePlanned" ) }: ${ windowLine( lang, one ) }</p>\n` ) }<p><a href="${ start }">${ label( lang, "newcomer" ) }</a></p>`;
};

/**
 * Answers the status page: each environment's state, message and time, the windows not yet ended, and the latest
 * updates, with the feed.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.statusPage = async ( context ) => {
    const { db, lang, response, nonce } = context;
    const status = await currentStatus( db );
    const windows = await maintenanceWindows( db, { now: new Date() } );
    const history = await statusHistory( db );
    const title = label( lang, "statusTitle" );
    const main = html`<h1>${ title }</h1>
<p>${ label( lang, "statusLede" ) }</p>
<table class="rows">
<thead><tr><th scope="col">${ label( lang, "columnEnvironment" ) }</th><th scope="col">${ label( lang, "columnState" ) }</th><th scope="col">${ label( lang, "columnMessage" ) }</th><th scope="col">${ label( lang, "columnUpdated" ) }</th></tr></thead>
<tbody>
${ status.map( ( one ) => html`<tr><td>${ environmentName( lang, one.environment ) }</td><td>${ module.exports.stateMark( lang, one.state ) }</td><td>${ one.message === null ? "—" : one.message[ lang ] }</td><td>${ one.updatedAt === null ? "—" : formatDateTime( one.updatedAt, lang ) }</td></tr>\n` ) }</tbody>
</table>
<h2>${ label( lang, "maintenancePlanned" ) }</h2>
${ windows.length === 0 ? html`<p class="muted">${ label( lang, "maintenanceNone" ) }</p>` : html`<ul>
${ windows.map( ( one ) => html`<li>${ windowLine( lang, one ) }</li>\n` ) }</ul>` }
<h2>${ label( lang, "statusHistory" ) }</h2>
${ history.length === 0 ? html`<p class="muted">${ label( lang, "statusHistoryNone" ) }</p>` : html`<ul class="releases">
${ history.map( ( one ) => html`<li><span class="muted">${ formatDateTime( one.updatedAt, lang ) }</span> ${ environmentName( lang, one.environment ) }: ${ module.exports.stateMark( lang, one.state ) }${
        one.message === null ? null : html` — ${ one.message[ lang ] }` }</li>\n` ) }</ul>` }
<p><a href="${ paths.statusFeed( lang ) }">${ label( lang, "statusFeed" ) }</a></p>`;
    send( response, { cache: CACHE.BRIEF, body: page( { lang: lang, title: title, path: paths.status( lang ), canonical: paths.status( lang ), main: main,
        feed: { path: paths.statusFeed( lang ), title: label( lang, "statusFeed" ) }, nonce: nonce } ) } );
};

// One event: its ID is the status page's address with the update's or the window's own, which no later change alters,
// and a cancelled window keeps the ID it was announced with, so a reader sees the same entry change.
const entry = ( lang, event ) => {
    const page = paths.absolute( paths.status( lang ) );
    const title = event.kind === "status" ? `${ environmentName( lang, event.environment ) }: ${ label( lang, STATE_LABELS[ event.state ] ) }`
        : `${ label( lang, event.cancelled ? "maintenanceCancelled" : "maintenancePlanned" ) }: ${ environmentName( lang, event.environment ) }, ${ span( lang, event ) }`;
    return html`<entry>
<id>${ page }#${ event.id }</id>
<title>${ title }</title>
<updated>${ event.at }</updated>
<link href="${ page }" rel="alternate"/>
${ event.message === null ? null : html`<summary>${ event.message[ lang ] }</summary>\n` }</entry>
`;
};

/**
 * Answers the Atom feed of the status updates and the maintenance windows, newest first, 50 at most.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @returns {Promise<void>}
 * @public
 */
module.exports.statusFeedPage = async ( context ) => {
    const { db, lang, response } = context;
    const events = await statusEvents( db );
    const self = paths.absolute( paths.statusFeed( lang ) );
    const body = html`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<id>${ self }</id>
<title>${ label( lang, "siteName" ) } · ${ label( lang, "statusTitle" ) }</title>
<updated>${ events.length === 0 ? NO_EVENTS : events[ 0 ].at }</updated>
<author><name>${ label( lang, "siteName" ) }</name></author>
<link href="${ paths.absolute( paths.status( lang ) ) }" rel="alternate"/>
<link href="${ self }" rel="self"/>
${ events.map( ( one ) => entry( lang, one ) ) }</feed>
`;
    send( response, { cache: CACHE.BRIEF, type: ATOM, body: String( body ) } );
};
