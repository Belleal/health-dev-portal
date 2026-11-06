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
 * The public view of the data (plan 8a, decision 2). The site reads the data layer through this module and nowhere
 * else, so that what is public is decided in one place: `PUBLIC`, below.
 */

const { CHANGE_CATEGORY, RELEASE_STATUS, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { compareNumbers } = require( "@health-dev-portal/spec-model/numbers" );
const { loadChangelog } = require( "#changelog" );
const { listReleases } = require( "#releases" );
const { readContent } = require( "#targets" );
const { findVersion } = require( "#versions" );

const LIVE = `'${ STAGE.TESTING }', '${ STAGE.PRODUCTION }', '${ STAGE.PREVIOUS_PRODUCTION }'`;

// A version is public when it is in testing, production or previous production; or when it is retired and was once in
// one of them, or never in development or implementation (the history the migration kept). A version abandoned in
// implementation satisfies neither, so it never reaches the site. The one rule, as SQL for a `versions` row under
// `alias`; nothing else in the portal decides what is public.
const PUBLIC = ( alias ) => `( ${ alias }.stage IN ( ${ LIVE } ) OR ( ${ alias }.stage = '${ STAGE.RETIRED }' AND (
    EXISTS ( SELECT 1 FROM version_stages live WHERE live.version_id = ${ alias }.id AND live.stage IN ( ${ LIVE } ) )
    OR NOT EXISTS ( SELECT 1 FROM version_stages early WHERE early.version_id = ${ alias }.id
        AND early.stage IN ( '${ STAGE.DEVELOPMENT }', '${ STAGE.IMPLEMENTATION }' ) ) ) ) )`;

// A public version's columns, with the date it entered its stage, its release's status, and the number of the public
// version that replaced it. Only what the site shows is selected: never a release, round, actor or comment.
const COLUMNS = `v.id, v.spec_id, s.kind, v.number, v.stage, v.frozen, v.expires_on,
    ( SELECT vs.entered_on FROM version_stages vs WHERE vs.version_id = v.id AND vs.stage = v.stage ) AS entered_on,
    ( SELECT r.status FROM releases r WHERE r.id = v.release_id ) AS release_status,
    ( SELECT f.number FROM versions f WHERE f.replaces_id = v.id AND ${ PUBLIC( "f" ) } ) AS replaced_by`;
const FROM = "FROM versions v JOIN specs s ON s.id = v.spec_id";

const versionOf = ( row ) => ( { id: row.id, spec: row.spec_id, kind: row.kind, number: row.number, stage: row.stage, frozen: row.frozen === 1,
    expiresOn: row.expires_on, enteredOn: row.entered_on, retired: row.stage === STAGE.RETIRED, replacedBy: row.replaced_by } );

// Compared by the character, never by the database's collation, which differs between the two (design record §3.2).
const compareText = ( a, b ) => a < b ? -1 : a > b ? 1 : 0;

/**
 * The public version of each spec that has one in testing, production or previous production, sorted by spec ID.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @returns {Promise<import( "#definitions" ).PublishedSpec[]>}
 * @public
 */
module.exports.listPublished = async ( db ) => {
    const rows = await db.all( `SELECT ${ COLUMNS } ${ FROM } WHERE v.stage IN ( ${ LIVE } ) AND ${ PUBLIC( "v" ) }` );
    const specs = new Map();
    for ( const row of rows ) {
        if ( !specs.has( row.spec_id ) ) {
            specs.set( row.spec_id, { spec: row.spec_id, kind: row.kind, testing: null, production: null, previousProduction: null } );
        }
        const field = row.stage === STAGE.TESTING ? "testing" : row.stage === STAGE.PRODUCTION ? "production" : "previousProduction";
        specs.get( row.spec_id )[ field ] = versionOf( row );
    }
    return [ ...specs.values() ].sort( ( a, b ) => compareText( a.spec, b.spec ) );
};

/**
 * A public version by its ID, with its content as others read it. A retired version has none to show: the site names
 * it, and what replaced it.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<(import( "#definitions" ).PublishedVersion & {content: import( "#definitions" ).VersionContent|null})|null>} `null` for a version
 *     that does not exist or is not public.
 * @public
 */
module.exports.findPublishedById = async ( db, versionId ) => {
    const row = await db.get( `SELECT ${ COLUMNS } ${ FROM } WHERE v.id = ? AND ${ PUBLIC( "v" ) }`, [ versionId ] );
    if ( !row ) {
        return null;
    }
    const version = versionOf( row );
    return { ...version, content: version.retired ? null : await readContent( db, version.id ) };
};

/**
 * A spec's public version by stage or by number, with its content.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} spec
 * @param {{stage?: string, number?: string}} at A stage other than retired, or a number.
 * @returns {Promise<(import( "#definitions" ).PublishedVersion & {content: import( "#definitions" ).VersionContent|null})|null>} A retired number gives
 *     `retired: true` and no content; a version that is not public gives `null`.
 * @throws {TypeError} For neither, or for the retired stage.
 * @public
 */
module.exports.findPublished = async ( db, spec, at ) => {
    const found = await findVersion( db, spec, at );
    return found ? module.exports.findPublishedById( db, found.id ) : null;
};

/**
 * A spec's changelog for the public, newest first: its public versions, each with the dates it entered testing and
 * production and its entries grouped by category. An entry an editor dropped is left out, and none names a person.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} spec
 * @returns {Promise<import( "#definitions" ).PublishedChangelogVersion[]>}
 * @public
 */
module.exports.publishedChangelog = async ( db, spec ) => {
    const rows = await db.all( `SELECT ${ COLUMNS } ${ FROM } WHERE v.spec_id = ? AND ${ PUBLIC( "v" ) }`, [ spec ] );
    const dates = new Map();
    for ( const row of await db.all( `SELECT vs.version_id, vs.stage, vs.entered_on FROM version_stages vs JOIN versions v ON v.id = vs.version_id
        WHERE v.spec_id = ? AND vs.stage IN ( '${ STAGE.TESTING }', '${ STAGE.PRODUCTION }' )`, [ spec ] ) ) {
        dates.set( `${ row.version_id }/${ row.stage }`, row.entered_on );
    }
    const entries = new Map( ( await loadChangelog( db, spec ) ).map( ( logged ) => [ logged.version, logged.entries ] ) );
    return rows.map( versionOf ).map( ( version, index ) => {
        const grouped = { [ CHANGE_CATEGORY.BREAKING ]: [], [ CHANGE_CATEGORY.DROPPED_PLAN ]: [], [ CHANGE_CATEGORY.NON_BREAKING ]: [] };
        for ( const entry of entries.get( version.id ) || [] ) {
            if ( !entry.dropped ) {
                grouped[ entry.category ].push( { origin: entry.origin, target: entry.target_kind === null ? null : { kind: entry.target_kind, identity: entry.target_identity },
                    before: entry.before_value === null ? null : JSON.parse( entry.before_value ), after: entry.after_value === null ? null : JSON.parse( entry.after_value ),
                    text: { bg: entry.text_bg, en: entry.text_en } } );
            }
        }
        return { number: version.number, stage: version.stage, enteredTesting: dates.get( `${ version.id }/${ STAGE.TESTING }` ) || null,
            enteredProduction: dates.get( `${ version.id }/${ STAGE.PRODUCTION }` ) || null, replacedBy: version.replacedBy,
            abandoned: rows[ index ].release_status === RELEASE_STATUS.ABANDONED, entries: grouped };
    } ).sort( ( a, b ) => compareNumbers( b.number, a.number ) );
};

/**
 * The latest publications: each time a public version entered testing or production on a date that was recorded,
 * newest first.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {{limit?: number}} [options] How many, 20 by default.
 * @returns {Promise<Array<{on: string, stage: string, spec: string, kind: string, number: string}>>}
 * @public
 */
module.exports.publications = async ( db, { limit = 20 } = {} ) => {
    const rows = await db.all( `SELECT vs.entered_on, vs.stage, v.spec_id, s.kind, v.number ${ FROM } JOIN version_stages vs ON vs.version_id = v.id
        WHERE vs.stage IN ( '${ STAGE.TESTING }', '${ STAGE.PRODUCTION }' ) AND vs.entered_on IS NOT NULL AND ${ PUBLIC( "v" ) }` );
    return rows.sort( ( a, b ) => compareText( b.entered_on, a.entered_on ) || compareText( a.spec_id, b.spec_id ) || compareNumbers( b.number, a.number )
        || compareText( a.stage, b.stage ) ).slice( 0, limit ).map( ( row ) => ( { on: row.entered_on, stage: row.stage, spec: row.spec_id, kind: row.kind, number: row.number } ) );
};

/**
 * The accepted releases with a version in testing, which are due in production: the dated ones by date, then the undated.
 * A release past its date stays, as it is still waiting. Each carries the production version its versions will replace
 * and how many breaking changes they bring, which an editor dropped not counted. Nothing of the release itself is passed on:
 * no summary, round or person.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @returns {Promise<Array<{plannedOn: string|null, versions: Array<{spec: string, kind: string, number: string, production: string|null}>, breaking: number}>>}
 * @public
 */
module.exports.upcoming = async ( db ) => {
    const kinds = new Map( ( await db.all( "SELECT id, kind FROM specs" ) ).map( ( row ) => [ row.id, row.kind ] ) );
    const live = new Map( ( await db.all( `SELECT spec_id, number FROM versions WHERE stage = '${ STAGE.PRODUCTION }'` ) ).map( ( row ) => [ row.spec_id, row.number ] ) );
    const breaking = new Map( ( await db.all( `SELECT e.version_id, COUNT( * ) AS n FROM changelog_entries e JOIN versions v ON v.id = e.version_id
        WHERE v.stage = '${ STAGE.TESTING }' AND e.category = '${ CHANGE_CATEGORY.BREAKING }' AND e.dropped = 0 GROUP BY e.version_id` ) ).map( ( row ) => [ row.version_id, Number( row.n ) ] ) );
    const due = [];
    for ( const release of await listReleases( db, { status: RELEASE_STATUS.ACCEPTED } ) ) {
        const testing = release.versions.filter( ( version ) => version.stage === STAGE.TESTING );
        if ( testing.length ) {
            due.push( { plannedOn: release.plannedOn, breaking: testing.reduce( ( sum, version ) => sum + ( breaking.get( version.id ) || 0 ), 0 ),
                versions: testing.map( ( version ) => ( { spec: version.spec, kind: kinds.get( version.spec ), number: version.number, production: live.get( version.spec ) || null } ) )
                    .sort( ( a, b ) => compareText( a.spec, b.spec ) ) } );
        }
    }
    return due.map( ( one ) => ( { plannedOn: one.plannedOn, versions: one.versions, breaking: one.breaking } ) ).sort( ( a, b ) => {
        if ( a.plannedOn === null || b.plannedOn === null ) {
            return ( a.plannedOn === null ? 1 : 0 ) - ( b.plannedOn === null ? 1 : 0 );
        }
        return compareText( a.plannedOn, b.plannedOn );
    } );
};

/**
 * The public module versions that read a version, by what their resolutions name: the readers of a list or the rules.
 * Newest first within a spec. A version that is not public has no readers to show.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {string} versionId
 * @returns {Promise<import( "#definitions" ).PublishedVersion[]>}
 * @public
 */
module.exports.readersOf = async ( db, versionId ) => {
    if ( !await module.exports.findPublishedById( db, versionId ) ) {
        return [];
    }
    const rows = await db.all( `SELECT ${ COLUMNS } ${ FROM } JOIN resolutions x ON x.version_id = v.id
        WHERE x.resolved_id = ? AND s.kind = 'module' AND ${ PUBLIC( "v" ) }`, [ versionId ] );
    return rows.map( versionOf ).sort( ( a, b ) => compareText( a.spec, b.spec ) || compareNumbers( b.number, a.number ) );
};
