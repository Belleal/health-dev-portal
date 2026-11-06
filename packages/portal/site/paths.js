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
 * Every address the site has (plan 8a, decision 3; design record §7.7, §8.1): a builder for each, and `parseAddress`,
 * the inverse of all of them, which routes.js dispatches on. An address is checked here, by its shape, before anything
 * is looked up: a staff stage, a list under the specifications or a module under the lists has no address at all, and
 * hostile input never reaches the data layer as anything but a well-formed key.
 *
 * A builder takes what a page has — a stage slug or a number for `at`, an element's slug from `elementSlugs` — and
 * throws for a part it could not read back, so a page cannot link to an address that would answer 404.
 */

const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { LANGUAGES, otherLanguage } = require( "#labels" );

const STAGES = Object.freeze( [ STAGE.TESTING, STAGE.PRODUCTION, STAGE.PREVIOUS_PRODUCTION ] );
const NUMBER = /^\d+(?:\.\d+)*$/;
// A module's key, and the rules' (`rules`): the manifest's spec key (data's load/manifest.js).
const MODULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A code list's ID, as the nomenclatures workbook names its sheets (importer's nomenclatures-importer.js).
const LIST = /^CL[A-Z0-9]+$/;
// A message's code, as the module workbooks name their sheets (importer's module-importer.js).
const CODE = /^[A-Z]\d{3}$/;
const TABS = Object.freeze( [ "elements", "conditions", "changes" ] );
const MODULE_PAGES = Object.freeze( [ "conditions", "dictionary" ] );
const EXTENSIONS = Object.freeze( [ "json", "csv" ] );
const PAGE_NUMBER = /^[1-9]\d*$/;

let publicUrl = null;

const checked = ( value, test, what ) => {
    if ( typeof value !== "string" || !test( value ) ) {
        throw new RangeError( `${ JSON.stringify( value ) } is not ${ what } an address can hold.` );
    }
    return value;
};
const language = ( lang ) => checked( lang, ( value ) => LANGUAGES.includes( value ), "a language" );
const moduleKey = ( spec ) => checked( spec, ( value ) => MODULE.test( value ), "a module or the rules" );
const listId = ( id ) => checked( id, ( value ) => LIST.test( value ), "a code list" );
const anySpec = ( spec ) => checked( spec, ( value ) => MODULE.test( value ) || LIST.test( value ), "a spec" );
const atSegment = ( at ) => checked( at, ( value ) => module.exports.parseAt( value ) !== null, "a public stage or a number" );
const number = ( value ) => checked( value, ( one ) => NUMBER.test( one ), "a version number" );
const messageCode = ( code ) => checked( code, ( value ) => CODE.test( value ), "a message code" );

// One segment as an address writes it: the canonical percent-encoding of what it says, so a browser's other spellings
// of it (lower-case hex, a raw Cyrillic letter) name the same thing.
const canonical = ( segment ) => encodeURIComponent( segment );
const isCanonicalSlug = ( slug ) => typeof slug === "string" && slug.split( "/" ).every( ( segment ) => {
    try {
        return segment !== "" && canonical( decodeURIComponent( segment ) ) === segment;
    } catch {
        return false;
    }
} );

// The query string of a page, from the parameters that differ from their defaults: one page, one address.
const query = ( parameters ) => {
    const written = Object.entries( parameters ).filter( ( [ , value ] ) => value !== null && value !== undefined && value !== "" )
        .map( ( [ name, value ] ) => `${ name }=${ encodeURIComponent( String( value ) ) }` );
    return written.length ? `?${ written.join( "&" ) }` : "";
};
const text = ( value ) => value === null || value === undefined || value === "" ? null : String( value );

/**
 * Reads the `{at}` of an address: a stage slug the public may see, or a version number. A staff-only stage —
 * development, implementation — and the retired stage are none: they have no public address (design record §7.7).
 *
 * @method
 * @param {string} segment
 * @returns {{stage: string}|{number: string}|null} What `findPublished` takes, or `null`.
 * @public
 */
module.exports.parseAt = ( segment ) => {
    if ( typeof segment !== "string" ) {
        return null;
    }
    if ( STAGES.includes( segment ) ) {
        return { stage: segment };
    }
    return NUMBER.test( segment ) ? { number: segment } : null;
};

/**
 * The home page.
 *
 * @method
 * @param {string} lang
 * @returns {string}
 * @throws {RangeError} For a part no address can hold, as every builder here does.
 * @public
 */
module.exports.home = ( lang ) => `/${ language( lang ) }/`;

/**
 * The modules and the business rules by stage.
 *
 * @method
 * @param {string} lang
 * @returns {string}
 * @public
 */
module.exports.specs = ( lang ) => `/${ language( lang ) }/specs`;

/**
 * A module's messages, or the rules, at a stage or number.
 *
 * @method
 * @param {string} lang
 * @param {string} spec A module's key or `rules`.
 * @param {string} at A public stage slug or a number.
 * @returns {string}
 * @public
 */
module.exports.spec = ( lang, spec, at ) => `/${ language( lang ) }/specs/${ moduleKey( spec ) }/${ atSegment( at ) }`;

/**
 * A module's conditions.
 *
 * @method
 * @param {string} lang
 * @param {string} spec
 * @param {string} at
 * @returns {string}
 * @public
 */
module.exports.conditions = ( lang, spec, at ) => `${ module.exports.spec( lang, spec, at ) }/conditions`;

/**
 * A module's dictionary.
 *
 * @method
 * @param {string} lang
 * @param {string} spec
 * @param {string} at
 * @returns {string}
 * @public
 */
module.exports.dictionary = ( lang, spec, at ) => `${ module.exports.spec( lang, spec, at ) }/dictionary`;

/**
 * A message, on one of its tabs; the Elements tab is the message's own address.
 *
 * @method
 * @param {string} lang
 * @param {string} spec
 * @param {string} at
 * @param {string} code e.g. `P001`.
 * @param {string} [tab] `elements` (the default), `conditions` or `changes`.
 * @returns {string}
 * @public
 */
module.exports.message = ( lang, spec, at, code, tab = "elements" ) => {
    const base = `${ module.exports.spec( lang, spec, at ) }/${ messageCode( code ) }`;
    checked( tab, ( value ) => TABS.includes( value ), "a message's tab" );
    return tab === "elements" ? base : `${ base }/${ tab }`;
};

/**
 * A message with one element selected.
 *
 * @method
 * @param {string} lang
 * @param {string} spec
 * @param {string} at
 * @param {string} code
 * @param {string} slug The element's slug, as `elementSlugs` gives it.
 * @returns {string}
 * @public
 */
module.exports.element = ( lang, spec, at, code, slug ) => {
    checked( slug, isCanonicalSlug, "an element's slug" );
    return `${ module.exports.message( lang, spec, at, code ) }/elements/${ slug }`;
};

/**
 * The address of each element of a message (decision 3): its path, each segment percent-encoded. A path met again in the
 * same message — an attribute shares its field's path, and a polymorphic element's variants share theirs — gets `~2`,
 * `~3` in document order, so every element keeps an address of its own. An element with no path has none.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message} message
 * @returns {Map<import( "@health-dev-portal/spec-model/definitions" ).ElementNode, string>} In document order.
 * @public
 */
module.exports.elementSlugs = ( message ) => {
    const slugs = new Map();
    const seen = new Map();
    const walk = ( nodes ) => {
        for ( const node of nodes || [] ) {
            if ( typeof node.path === "string" && node.path !== "" ) {
                const base = node.path.split( "/" ).map( canonical ).join( "/" );
                const count = ( seen.get( base ) || 0 ) + 1;
                seen.set( base, count );
                slugs.set( node, count === 1 ? base : `${ base }~${ count }` );
            }
            walk( node.children );
        }
    };
    walk( message.elements );
    return slugs;
};

/**
 * Every code list, filtered by `q`.
 *
 * @method
 * @param {string} lang
 * @param {{q?: string|null}} [parameters]
 * @returns {string}
 * @public
 */
module.exports.lists = ( lang, parameters = {} ) => `/${ language( lang ) }/nomenclatures${ query( { q: text( parameters.q ) } ) }`;

/**
 * One code list at a stage or number, filtered, with or without its expired entries, at a page of 500 rows.
 *
 * @method
 * @param {string} lang
 * @param {string} id e.g. `CL007`.
 * @param {string} at
 * @param {{q?: string|null, expired?: boolean, page?: number}} [parameters]
 * @returns {string}
 * @public
 */
module.exports.list = ( lang, id, at, parameters = {} ) => {
    const page = parameters.page === undefined || parameters.page === null ? 1 : parameters.page;
    if ( !Number.isSafeInteger( page ) || page < 1 ) {
        throw new RangeError( `${ JSON.stringify( parameters.page ) } is not a page number.` );
    }
    return `/${ language( lang ) }/nomenclatures/${ listId( id ) }/${ atSegment( at ) }`
        + query( { q: text( parameters.q ), expired: parameters.expired === true ? "1" : null, page: page > 1 ? page : null } );
};

/**
 * A code list's download: a fixed file at a number, or a stage's, which redirects to the fixed one.
 *
 * @method
 * @param {string} id
 * @param {string} number A number, or a public stage slug.
 * @param {string} ext `json` or `csv`.
 * @returns {string}
 * @public
 */
module.exports.download = ( id, number, ext ) => {
    checked( ext, ( value ) => EXTENSIONS.includes( value ), "a download's format" );
    return `/downloads/nomenclatures/${ listId( id ) }/${ atSegment( number ) }.${ ext }`;
};

/**
 * The errors and warnings in production, or in testing.
 *
 * @method
 * @param {string} lang
 * @param {boolean} [testing]
 * @returns {string}
 * @public
 */
module.exports.errors = ( lang, testing = false ) => `/${ language( lang ) }/errors${ testing === true ? "/testing" : "" }`;

/**
 * Every spec's latest changes, or one spec's changelog.
 *
 * @method
 * @param {string} lang
 * @param {string|null} [spec] A module, the rules or a code list.
 * @returns {string}
 * @public
 */
module.exports.changes = ( lang, spec = null ) => `/${ language( lang ) }/changes${ spec === null ? "" : `/${ anySpec( spec ) }` }`;

/**
 * The comparison of two kept versions of a spec.
 *
 * @method
 * @param {string} lang
 * @param {string} spec
 * @param {string} from A number.
 * @param {string} to A number.
 * @returns {string}
 * @public
 */
module.exports.compare = ( lang, spec, from, to ) => `${ module.exports.changes( lang, spec ) }/compare?from=${ number( from ) }&to=${ number( to ) }`;

/**
 * The Atom feed of every publication, or of one spec's.
 *
 * @method
 * @param {string} lang
 * @param {string|null} [spec]
 * @returns {string}
 * @public
 */
module.exports.feed = ( lang, spec = null ) => `${ module.exports.changes( lang, spec ) }/feed.atom`;

/**
 * The same address in the other language, its query kept: the language switch's link. Any address under a language
 * has one, even one that answers 404, which then answers 404 in the other language too.
 *
 * @method
 * @param {string} path
 * @returns {string|null} `null` for an address that is under no language.
 * @public
 */
module.exports.other = ( path ) => {
    const found = typeof path === "string" ? /^\/([a-z]{2})(?=[/?]|$)/.exec( path ) : null;
    if ( !found || !LANGUAGES.includes( found[ 1 ] ) ) {
        return null;
    }
    return `/${ otherLanguage( found[ 1 ] ) }${ path.slice( found[ 0 ].length ) }`;
};

// The page under `/{lang}/specs/…`, from the segments after `specs`.
const specsPage = ( lang, rest ) => {
    if ( rest.length === 0 ) {
        return { lang: lang, page: "specs" };
    }
    const [ spec, at, third, fourth, ...slug ] = rest;
    if ( rest.length < 2 || !MODULE.test( spec ) || module.exports.parseAt( at ) === null ) {
        return null;
    }
    const where = { lang: lang, page: "spec", spec: spec, at: at };
    if ( rest.length === 2 ) {
        return where;
    }
    if ( rest.length === 3 && MODULE_PAGES.includes( third ) ) {
        return { ...where, page: third };
    }
    if ( !CODE.test( third ) ) {
        return null;
    }
    const message = { ...where, page: "message", code: third, tab: "elements", slug: null };
    if ( rest.length === 3 ) {
        return message;
    }
    if ( rest.length === 4 ) {
        return fourth !== "elements" && TABS.includes( fourth ) ? { ...message, tab: fourth } : null;
    }
    if ( fourth !== "elements" || slug.some( ( segment ) => segment === "" ) ) {
        return null;
    }
    return { ...message, slug: slug.map( canonical ).join( "/" ) };
};

// The page under `/{lang}/nomenclatures/…`.
const nomenclaturesPage = ( lang, rest, search ) => {
    const q = text( search.get( "q" ) );
    if ( rest.length === 0 ) {
        return { lang: lang, page: "lists", query: { q: q } };
    }
    const [ id, at ] = rest;
    const page = search.get( "page" );
    if ( rest.length !== 2 || !LIST.test( id ) || module.exports.parseAt( at ) === null ) {
        return null;
    }
    // A page that is no positive whole number is out of range, and out of range is a 404 (decision 9).
    if ( page !== null && !( PAGE_NUMBER.test( page ) && Number.isSafeInteger( Number( page ) ) ) ) {
        return null;
    }
    return { lang: lang, page: "list", id: id, at: at, query: { q: q, expired: search.get( "expired" ) === "1", page: page === null ? 1 : Number( page ) } };
};

// The page under `/{lang}/changes/…`.
const changesPage = ( lang, rest, search ) => {
    if ( rest.length === 0 ) {
        return { lang: lang, page: "changes", spec: null };
    }
    if ( rest.length === 1 && rest[ 0 ] === "feed.atom" ) {
        return { lang: lang, page: "feed", spec: null };
    }
    const [ spec, what ] = rest;
    if ( rest.length > 2 || !( MODULE.test( spec ) || LIST.test( spec ) ) ) {
        return null;
    }
    if ( rest.length === 1 ) {
        return { lang: lang, page: "changes", spec: spec };
    }
    if ( what === "feed.atom" ) {
        return { lang: lang, page: "feed", spec: spec };
    }
    const from = search.get( "from" );
    const to = search.get( "to" );
    // Only numbers: `from=../1.5.1` is no version, and is refused here rather than looked up (review focus 5).
    if ( what !== "compare" || !NUMBER.test( from || "" ) || !NUMBER.test( to || "" ) ) {
        return null;
    }
    return { lang: lang, page: "compare", spec: spec, from: from, to: to };
};

// A download, `/downloads/nomenclatures/{id}/{at}.{ext}`.
const downloadPage = ( rest ) => {
    const [ kind, id, file ] = rest;
    const dot = typeof file === "string" ? file.lastIndexOf( "." ) : -1;
    if ( rest.length !== 3 || kind !== "nomenclatures" || !LIST.test( id ) || dot < 1 ) {
        return null;
    }
    const at = file.slice( 0, dot );
    const ext = file.slice( dot + 1 );
    return module.exports.parseAt( at ) !== null && EXTENSIONS.includes( ext ) ? { lang: null, page: "download", id: id, at: at, ext: ext } : null;
};

/**
 * Reads an address as a request carries it — percent-encoded, with its query — into the page it names and that page's
 * parameters: the inverse of every builder here. A query is read only by the pages that take one, and only its first
 * value of a name, so a repeated parameter cannot turn into a list. `at` stays a string; `parseAt` reads it.
 *
 * @method
 * @param {string} address e.g. `request.originalUrl`.
 * @returns {Object|null} `{ lang, page, …parameters }`: `page` is `home`, `specs`, `spec`, `conditions`, `dictionary`,
 *     `message` (with `code`, `tab`, `slug`), `lists`, `list` (with `query: { q, expired, page }`), `download` (with
 *     `lang: null`), `errors` (with `testing`), `changes` (with `spec`, `null` for the index), `compare` (with `from`,
 *     `to`) or `feed`. `null` for what is no address of the site.
 * @public
 */
module.exports.parseAddress = ( address ) => {
    if ( typeof address !== "string" ) {
        return null;
    }
    const mark = address.indexOf( "?" );
    const pathname = mark === -1 ? address : address.slice( 0, mark );
    const search = new URLSearchParams( mark === -1 ? "" : address.slice( mark + 1 ) );
    const raw = pathname.split( "/" );
    if ( raw[ 0 ] !== "" || raw.length < 2 ) {
        return null;
    }
    let segments;
    try {
        segments = raw.slice( 1 ).map( ( segment ) => decodeURIComponent( segment ) );
    } catch {
        // A malformed escape, such as `%E0%A4%A`, names nothing.
        return null;
    }
    if ( segments[ 0 ] === "downloads" ) {
        return downloadPage( segments.slice( 1 ) );
    }
    const [ lang, section, ...rest ] = segments;
    if ( !LANGUAGES.includes( lang ) || section === undefined ) {
        return null;
    }
    if ( section === "" ) {
        return rest.length === 0 ? { lang: lang, page: "home" } : null;
    }
    if ( section === "specs" ) {
        return specsPage( lang, rest );
    }
    if ( section === "nomenclatures" ) {
        return nomenclaturesPage( lang, rest, search );
    }
    if ( section === "errors" ) {
        return rest.length === 0 ? { lang: lang, page: "errors", testing: false }
            : rest.length === 1 && rest[ 0 ] === "testing" ? { lang: lang, page: "errors", testing: true } : null;
    }
    if ( section === "changes" ) {
        return changesPage( lang, rest, search );
    }
    return null;
};

/**
 * Sets the deployment's public URL, which every absolute link is written from (decision 1): the canonical address, the
 * `hreflang` alternates, the feeds. The server sets it once, when it starts, from the framework's `publicUrl`
 * (`TI_WEB_PUBLIC_URL`); a page renders outside anything that knows it, and core allows one server per process.
 *
 * @method
 * @param {string} url An origin such as `https://developers.his.bg`; a trailing slash is dropped.
 * @returns {void}
 * @throws {TypeError} For anything but an http(s) origin: a path, query or fragment would be written into every link.
 * @public
 */
module.exports.setPublicUrl = ( url ) => {
    let parsed;
    try {
        parsed = new URL( String( url ) );
    } catch {
        parsed = null;
    }
    if ( !parsed || ![ "https:", "http:" ].includes( parsed.protocol ) || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password ) {
        throw new TypeError( `The public URL must be an origin such as https://developers.his.bg; got ${ JSON.stringify( url ) }.` );
    }
    publicUrl = parsed.origin;
};

/**
 * An address as an absolute URL, from the public URL.
 *
 * @method
 * @param {string} path Starting with `/`.
 * @returns {string}
 * @throws {Error} Before the public URL is set.
 * @public
 */
module.exports.absolute = ( path ) => {
    if ( publicUrl === null ) {
        throw new Error( "The public URL is not set: the server sets it from TI_WEB_PUBLIC_URL when it starts." );
    }
    return `${ publicUrl }${ path }`;
};
