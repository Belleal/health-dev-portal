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
 * The site's search (plan 8c, decision 7; design record §3.4): one index of everything public, folded as the code lists'
 * filter folds (`fold.js`), so case, the keyboard layout and the alphabet do not decide what is found. No database
 * full-text search: D1 and PostgreSQL behave alike.
 *
 * What is indexed: the guides and the questions; each module and the rules; each message not withdrawn, its elements and
 * its module's conditions; the rules' rules; each code list by its ID and name; and the errors and warnings of CL999 and
 * CL998. From the testing and production versions only: production first, and testing only for what production lacks.
 * Previous production expires by date with nothing to rebuild the index then, and a list's entries are searched by its
 * own filter.
 *
 * Each server process builds its index in memory on its first search, and again on the first search after the published
 * set changes, which a fingerprint of the testing and production versions' IDs tells. A stored index would need a rule
 * for when a code change makes it stale; memory starts empty after every deploy.
 */

const crypto = require( "node:crypto" );
const logger = require( "@ti-engine/core/logger" );
const { findPublishedById, listPublished } = require( "@health-dev-portal/data/published" );
const { LIFECYCLE, SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { fold, needles } = require( "#fold" );
const { elementSlugs } = require( "#paths" );
const { specName } = require( "#spec-names" );

/**
 * The groups of a search's results, in the order a page shows them.
 *
 * @type {string[]}
 * @public
 */
module.exports.KINDS = Object.freeze( [ "guide", "faq", "spec", "message", "condition", "rule", "list", "error", "warning", "element" ] );

const SHORTEST = 2;
const LONGEST = 200;
const SHOWN = 20;
// The lists whose entries are searched as errors and warnings, as the errors page shows them.
const ERROR_LISTS = Object.freeze( { CL999: "error", CL998: "warning" } );

const both = ( value ) => value === null || value === undefined ? "" : [ value.bg, value.en ].filter( ( one ) => typeof one === "string" ).join( "\n" );
const same = ( value ) => ( { bg: value, en: value } );
// A list entry's text, as the errors page shows it: its display when it has one in either language, else its description.
const entryText = ( entry ) => entry.display && ( entry.display.bg || entry.display.en ) ? entry.display : entry.description;

// An element's name where it stands alone: its tag, and an attribute's as `tag@attribute` (as message-tree.js names it).
const tagOf = ( node ) => node.tag || ( typeof node.path === "string" && node.path !== "" ? node.path.split( "/" ).at( -1 ) : "" );
const elementName = ( node ) => node.kind === "attribute" ? `${ tagOf( node ) }@${ node.attribute }` : tagOf( node );

const make = ( fields ) => {
    const entry = { spec: null, stage: null, code: null, slug: null, text: null, terms: "", ...fields };
    // Folded once, here: a search folds only the query.
    entry.folded = fold( [ entry.code, entry.terms, both( entry.title ), both( entry.text ) ].filter( Boolean ).join( "\n" ) );
    entry.foldedTitle = fold( [ entry.code, both( entry.title ) ].filter( Boolean ).join( "\n" ) );
    entry.foldedCode = entry.code === null ? null : fold( entry.code );
    return entry;
};

const contentEntries = ( content ) => [
    ...content.guides.map( ( guide ) => make( { kind: "guide", slug: guide.slug, title: { bg: guide.texts.bg.title, en: guide.texts.en ? guide.texts.en.title : null },
        text: { bg: `${ guide.texts.bg.summary }\n${ guide.texts.bg.plain }`, en: guide.texts.en ? `${ guide.texts.en.summary }\n${ guide.texts.en.plain }` : null } } ) ),
    ...content.faq.categories.flatMap( ( category ) => category.questions.map( ( question ) => make( { kind: "faq", slug: question.slug,
        title: { bg: question.texts.bg.question, en: question.texts.en ? question.texts.en.question : null },
        text: { bg: question.texts.bg.plain, en: question.texts.en ? question.texts.en.plain : null } } ) ) )
];

const moduleEntries = ( version ) => {
    const { spec, stage, content } = version;
    const entries = [ make( { kind: "spec", spec: spec, stage: stage, title: { bg: specName( spec, "bg" ), en: specName( spec, "en" ) }, terms: spec } ) ];
    for ( const message of content.messages.filter( ( one ) => one.lifecycle !== LIFECYCLE.WITHDRAWN ) ) {
        entries.push( make( { kind: "message", spec: spec, stage: stage, code: message.code, title: message.title } ) );
        const slugs = elementSlugs( message );
        const walk = ( nodes ) => {
            for ( const node of nodes || [] ) {
                if ( slugs.has( node ) ) {
                    entries.push( make( { kind: "element", spec: spec, stage: stage, code: message.code, slug: slugs.get( node ), title: same( elementName( node ) ),
                        text: { bg: [ node.name && node.name.bg, node.description && node.description.bg ].filter( Boolean ).join( "\n" ) || null,
                            en: [ node.name && node.name.en, node.description && node.description.en ].filter( Boolean ).join( "\n" ) || null },
                        terms: node.path } ) );
                }
                walk( node.children );
            }
        };
        walk( message.elements );
    }
    for ( const condition of content.conditions || [] ) {
        entries.push( make( { kind: "condition", spec: spec, stage: stage, code: condition.id, title: same( condition.id ),
            terms: condition.printed || condition.text || "" } ) );
    }
    return entries;
};

const rulesEntries = ( version ) => [
    make( { kind: "spec", spec: version.spec, stage: version.stage, title: { bg: specName( version.spec, "bg" ), en: specName( version.spec, "en" ) }, terms: version.spec } ),
    ...version.content.rules.map( ( rule ) => make( { kind: "rule", spec: version.spec, stage: version.stage, code: rule.id, title: same( rule.id ), text: rule.definition,
        terms: rule.errorCode || "" } ) )
];

const listEntries = ( version, name ) => [
    make( { kind: "list", spec: version.spec, stage: version.stage, code: version.spec, title: name || same( version.spec ) } ),
    ...( Object.hasOwn( ERROR_LISTS, version.spec ) && version.content ? version.content.list.entries.map( ( entry ) => make( { kind: ERROR_LISTS[ version.spec ],
        spec: version.spec, stage: version.stage, code: entry.key, title: same( entry.key ), text: entryText( entry ) } ) ) : [] )
];

const keyOf = ( entry ) => `${ entry.kind }|${ entry.spec }|${ entry.code }|${ entry.slug }`;

/**
 * Every entry of the index: the content's, then each version's, production before testing. An entry found again at
 * testing — the same kind, spec, code and slug — is production's: a testing version adds only what production lacks.
 *
 * @method
 * @param {Object} inputs
 * @param {Array<{spec: string, kind: string, stage: string, content: Object|null}>} inputs.versions The testing and
 *     production versions, with their content; a code list's may be `null` but for CL999's and CL998's.
 * @param {Map<string, import( "@health-dev-portal/spec-model/definitions" ).LocalText|null>} inputs.listNames Each code
 *     list's name, by its ID.
 * @param {import( "#definitions" ).Content} inputs.content
 * @returns {import( "#definitions" ).SearchEntry[]}
 * @public
 */
module.exports.indexEntries = ( { versions, listNames, content } ) => {
    const ordered = [ ...versions.filter( ( one ) => one.stage === STAGE.PRODUCTION ), ...versions.filter( ( one ) => one.stage === STAGE.TESTING ) ];
    const all = [ ...contentEntries( content ), ...ordered.flatMap( ( version ) => version.kind === SPEC_KIND.MODULE ? moduleEntries( version )
        : version.kind === SPEC_KIND.RULES ? rulesEntries( version )
            : version.kind === SPEC_KIND.CODE_LIST ? listEntries( version, listNames.get( version.spec ) ) : [] ) ];
    const seen = new Set();
    return all.filter( ( entry ) => {
        const key = keyOf( entry );
        if ( seen.has( key ) ) {
            return false;
        }
        seen.add( key );
        return true;
    } );
};

/**
 * The entries a query finds, by group in `KINDS` order, 20 of each at most with the group's total. Every word must be
 * found, in either form `needles` gives it. Within a group, an entry whose code is a word comes first, then one whose
 * title has every word, then the rest, each in the index's order.
 *
 * @method
 * @param {import( "#definitions" ).SearchEntry[]} entries
 * @param {string|null} query
 * @returns {import( "#definitions" ).SearchResults} `state` is `empty` with no query, `short` under 2 characters, `long`
 *     over 200 — none of them searched — and otherwise `done`.
 * @public
 */
module.exports.matchEntries = ( entries, query ) => {
    const shown = typeof query === "string" ? query.trim().replace( /\s+/g, " " ) : "";
    const state = shown === "" ? "empty" : shown.length < SHORTEST ? "short" : shown.length > LONGEST ? "long" : "done";
    if ( state !== "done" ) {
        return { query: shown, state: state, groups: [] };
    }
    const words = shown.split( " " ).map( ( word ) => ( { forms: needles( word ), folded: fold( word ) } ) ).filter( ( word ) => word.forms.length > 0 );
    const tiers = [];
    for ( const entry of entries ) {
        if ( words.length > 0 && words.every( ( word ) => word.forms.some( ( form ) => entry.folded.includes( form ) ) ) ) {
            const tier = entry.foldedCode !== null && words.some( ( word ) => word.folded === entry.foldedCode ) ? 0
                : words.every( ( word ) => word.forms.some( ( form ) => entry.foldedTitle.includes( form ) ) ) ? 1 : 2;
            tiers.push( { entry: entry, tier: tier } );
        }
    }
    // A stable sort: within a tier, the index's own order.
    tiers.sort( ( a, b ) => a.tier - b.tier );
    const groups = module.exports.KINDS.map( ( kind ) => {
        const found = tiers.filter( ( one ) => one.entry.kind === kind ).map( ( one ) => one.entry );
        return { kind: kind, total: found.length, entries: found.slice( 0, SHOWN ) };
    } ).filter( ( group ) => group.total > 0 );
    return { query: shown, state: "done", groups: groups };
};

// The published set an index stands for: the IDs of every testing and production version.
const fingerprintOf = ( published ) => crypto.createHash( "sha256" )
    .update( published.flatMap( ( one ) => [ one.testing, one.production ].filter( Boolean ).map( ( version ) => version.id ) ).sort().join( "\n" ) ).digest( "hex" );

// The versions an index is built from, with what each kind needs: a module's and the rules' content, a list's name, and
// CL999's and CL998's entries.
const readVersions = async ( db, published, nameOf ) => {
    const versions = [];
    const listNames = new Map();
    for ( const stage of [ STAGE.PRODUCTION, STAGE.TESTING ] ) {
        for ( const one of published ) {
            const version = stage === STAGE.PRODUCTION ? one.production : one.testing;
            if ( !version ) {
                continue;
            }
            if ( one.kind === SPEC_KIND.CODE_LIST ) {
                if ( !listNames.has( one.spec ) ) {
                    listNames.set( one.spec, await nameOf( db, version ) );
                }
                versions.push( { spec: one.spec, kind: one.kind, stage: stage,
                    content: Object.hasOwn( ERROR_LISTS, one.spec ) ? ( await findPublishedById( db, version.id ) ).content : null } );
            } else if ( one.kind === SPEC_KIND.MODULE || one.kind === SPEC_KIND.RULES ) {
                versions.push( { spec: one.spec, kind: one.kind, stage: stage, content: ( await findPublishedById( db, version.id ) ).content } );
            }
        }
    }
    return { versions: versions, listNames: listNames };
};

/**
 * A server's search: its own index, built from the database and the content on the first search, and again on the
 * first search after the published set changes. One build runs at a time for a fingerprint, however many searches wait
 * on it. The index belongs to the instance, never to the module, so two portals in one process never share one.
 *
 * @method
 * @param {import( "#definitions" ).Content} content
 * @param {function( Object, Object ): Promise<Object|null>} nameOf A code list's name by the version it is read from, as
 *     the nomenclatures index reads it.
 * @returns {{find: function( Object, string|null ): Promise<import( "#definitions" ).SearchResults>}}
 * @public
 */
module.exports.createSearch = ( content, nameOf ) => {
    let built = { fingerprint: null, entries: null };
    let building = null;
    const indexFor = async ( db ) => {
        const published = await listPublished( db );
        const fingerprint = fingerprintOf( published );
        if ( built.fingerprint === fingerprint ) {
            return built.entries;
        }
        if ( building === null || building.fingerprint !== fingerprint ) {
            const started = Date.now();
            const promise = readVersions( db, published, nameOf ).then( ( inputs ) => {
                const entries = module.exports.indexEntries( { ...inputs, content: content } );
                logger.log( `Built the search index: ${ entries.length } entries in ${ Date.now() - started } ms.`, logger.logSeverity.INFO );
                if ( building !== null && building.promise === promise ) {
                    built = { fingerprint: fingerprint, entries: entries };
                    building = null;
                }
                return entries;
            }, ( error ) => {
                // A failed build is not kept: the next search tries again.
                if ( building !== null && building.promise === promise ) {
                    building = null;
                }
                throw error;
            } );
            building = { fingerprint: fingerprint, promise: promise };
        }
        return building.promise;
    };
    return {
        find: async ( db, query ) => {
            const quick = module.exports.matchEntries( [], query );
            return quick.state !== "done" ? quick : module.exports.matchEntries( await indexFor( db ), query );
        }
    };
};
