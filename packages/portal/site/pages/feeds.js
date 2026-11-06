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
 * The Atom feeds (plan 8a, decision 10; design record §7.10): `/{lang}/changes/feed.atom` for every publication, and
 * `/{lang}/changes/{spec}/feed.atom` for one spec's. Atom 1.0, one entry for each time a public version entered testing or
 * production. Everything the feed says goes through the escaping `html` template, which escapes the five markup characters
 * and so is as good for XML text and attributes as for HTML's.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { listPublished, publications } = require( "@health-dev-portal/data/published" );
const { label } = require( "#labels" );
const paths = require( "#paths" );
const { CACHE, notFound, send } = require( "#responses" );
const { specName } = require( "#spec-names" );
const { stageName } = require( "./changes" );

const ATOM = "application/atom+xml; charset=utf-8";

// How many entries a feed holds: a reader wants what is new, not every publication since the migration.
const ENTRIES = 50;

// The feed's own `updated` when it has no entry. Atom requires one, and the request's time is wrong twice over: a feed
// that changes with every request defeats a reader's conditional get, and one dated today claims news there is none of.
// The epoch is fixed, so an empty feed is the same bytes each time and is older than anything a reader has seen.
const NO_ENTRIES = "1970-01-01";

// A publication's day, as Atom writes a moment: the Sofia date at midnight UTC (decision 10).
const moment = ( day ) => `${ day }T00:00:00Z`;

// One publication: the changelog address and the version's number and stage make its ID, which no later change to the page
// can alter, so a reader that has seen the entry does not show it again.
const entry = ( lang, publication ) => {
    const changelog = paths.absolute( paths.changes( lang, publication.spec ) );
    return html`<entry>
<id>${ changelog }#${ publication.number }-${ publication.stage }</id>
<title>${ specName( publication.spec, lang ) } ${ publication.number } · ${ stageName( lang, publication.stage ) }</title>
<updated>${ moment( publication.on ) }</updated>
<link href="${ changelog }#v${ publication.number }" rel="alternate"/>
</entry>
`;
};

/**
 * Answers an Atom feed of the publications: every spec's, or with `spec` that spec's. A spec that is not published is the
 * 404 page.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {{spec: string|null}} parts `spec` is `null` for the feed of everything.
 * @returns {Promise<void>}
 * @public
 */
module.exports.feedPage = async ( context, parts ) => {
    const { db, lang, request, response } = context;
    const { spec } = parts;
    if ( spec !== null && !( await listPublished( db ) ).some( ( one ) => one.spec === spec ) ) {
        notFound( request, response );
        return;
    }
    // Newest first, so the first is the latest and `updated` is its day.
    const all = await publications( db, { limit: Infinity } );
    const shown = ( spec === null ? all : all.filter( ( one ) => one.spec === spec ) ).slice( 0, ENTRIES );
    const alternate = paths.absolute( paths.changes( lang, spec ) );
    const title = spec === null ? label( lang, "changesIndexTitle" ) : `${ specName( spec, lang ) } · ${ label( lang, "changelog" ) }`;
    const body = html`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<id>${ paths.absolute( paths.feed( lang, spec ) ) }</id>
<title>${ label( lang, "siteName" ) } · ${ title }</title>
<updated>${ moment( shown.length === 0 ? NO_ENTRIES : shown[ 0 ].on ) }</updated>
<author><name>${ label( lang, "siteName" ) }</name></author>
<link href="${ alternate }" rel="alternate"/>
<link href="${ paths.absolute( paths.feed( lang, spec ) ) }" rel="self"/>
${ shown.map( ( one ) => entry( lang, one ) ) }</feed>
`;
    send( response, { cache: CACHE.BRIEF, type: ATOM, body: String( body ) } );
};
