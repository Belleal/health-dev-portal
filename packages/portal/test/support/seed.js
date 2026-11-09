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
 * The seed's own lifecycle (plan 8a, decision 13), on top of the public production set the migration loaded, all
 * through the data layer's own functions, as staff would move it. The changes are synthetic and say so in their text:
 * nothing here is unpublished specification data (CLAUDE.md, "Data rules").
 *
 * The order is ruling P2's: CL007 1.5.34 reaches production before e-Prescription 1.5.2 is promoted to testing, so 1.5.2
 * reads CL007 1.5.34, while 1.5.1 still reads 1.5.33.
 */

const path = require( "node:path" );
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { loadIntoDevelopment, startDevelopment } = require( "@health-dev-portal/data/development" );
const { abandonRelease, submitRelease } = require( "@health-dev-portal/data/releases" );
const { approveRelease } = require( "@health-dev-portal/data/review" );
const { promoteReleases } = require( "@health-dev-portal/data/promotion" );
const { readContent } = require( "@health-dev-portal/data/targets" );
const { findVersion } = require( "@health-dev-portal/data/versions" );

const NOW = new Date( "2026-11-05T10:00:00Z" );
const BY_EDITOR = Object.freeze( { actor: "editor@example.test", now: NOW } );
const BY_APPROVER = Object.freeze( { actor: "approver@example.test", now: NOW } );
const SUMMARY = Object.freeze( { bg: "Синтетична версия за тестовете на портала", en: "A synthetic version for the portal's tests" } );

/**
 * Where the seed is built: the git-ignored .fixtures/portal/ at the repository's root.
 *
 * @type {string}
 * @public
 */
module.exports.SEED_DIRECTORY = path.resolve( __dirname, "../../../../.fixtures/portal" );

/**
 * The seed's database, a SQLite file.
 *
 * @type {string}
 * @public
 */
module.exports.SEED_DATABASE = path.join( module.exports.SEED_DIRECTORY, "seed.sqlite" );

/**
 * The seed's file store, by content hash: the blueprint catalogue and the fixed files of the versions it promoted.
 *
 * @type {string}
 * @public
 */
module.exports.SEED_FILES = path.join( module.exports.SEED_DIRECTORY, "files" );

// The path of an element, as a comparison or a changelog would name it: the path itself, or its identity (`…/lrn@value`),
// but never a longer path it is the start of.
const atPath = ( path ) => new RegExp( `${ path.replace( /[.*+?^${}()|[\]\\/]/g, "\\$&" ) }(?![\\w/])` );

/**
 * What the seed holds, for a test's expectations: decision 13's specs and numbers, the history the migration kept, and
 * the changes it made.
 *
 * @type {Object}
 * @public
 */
module.exports.SEED = Object.freeze( {
    // The moment every lifecycle step was taken at.
    now: NOW.toISOString(),
    nomenclatures: "1.5.33",
    ePrescription: Object.freeze( { spec: "e-prescription", production: "1.5.1", testing: "1.5.2", plannedOn: "2026-12-05" } ),
    // The newest retired version the migration kept of e-Prescription: published once, with no content now (a 410).
    history: "1.5.0",
    rules: Object.freeze( { spec: "rules", production: "1.1.1" } ),
    // CL007 1.5.33 already holds T1–T9 (measured), so the entry 1.5.34 adds is T10.
    cl007: Object.freeze( { spec: "CL007", previous: "1.5.33", production: "1.5.34", expiresOn: "2027-04-30", added: "T10", expired: "T4" } ),
    // CL008's next version reached implementation with an entry of its own, and its release was abandoned: never public.
    cl008Abandoned: "1.5.34",
    cl008AbandonedKey: "3",
    // Each change e-Prescription 1.5.2 makes to P001, with a pattern a comparison or a changelog shows it by.
    ePrescriptionChanges: Object.freeze( [
        { message: "P001", path: "contents/prescription/lrn", aspect: "description", pattern: atPath( "contents/prescription/lrn" ) },
        { message: "P001", path: "contents/prescription/supplements", aspect: "requirement", pattern: atPath( "contents/prescription/supplements" ) },
        { message: "P001", path: "contents/prescription/exampleNote", aspect: "added", pattern: atPath( "contents/prescription/exampleNote" ) }
    ].map( Object.freeze ) )
} );

const SEED = module.exports.SEED;

/**
 * Whether the tests run in CI, where a missing seed or browser is a failure rather than a skip: `CI` set, and not to
 * `false`. The seed's build read any value as CI, so `CI=false` failed a local run the tests themselves would have
 * skipped (final review M1); the build, the server and the accessibility test now read it alike.
 *
 * @method
 * @param {Object<string, string|undefined>} [environment]
 * @returns {boolean}
 * @public
 */
module.exports.inCi = ( environment = process.env ) => Boolean( environment.CI ) && environment.CI !== "false";

/**
 * A spec's production content, deep-cloned, to change into a new version: what readContent gives is shared and
 * deep-frozen.
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).Database} db
 * @param {string} spec
 * @returns {Promise<import( "@health-dev-portal/data/definitions" ).VersionContent>}
 * @public
 */
const productionContent = module.exports.productionContent = async ( db, spec ) => structuredClone( await readContent( db, ( await findVersion( db, spec, { stage: STAGE.PRODUCTION } ) ).id ) );

const walk = ( nodes, out = [] ) => {
    for ( const node of nodes ) {
        out.push( node );
        walk( node.children, out );
    }
    return out;
};

const elementAt = ( message, path, kind = "field" ) => {
    const found = walk( message.elements ).find( ( node ) => node.path === path && node.kind === kind );
    if ( !found ) {
        throw new Error( `The seed expected ${ path } in ${ message.code }; the public workbook has changed.` );
    }
    return found;
};

/**
 * A version through review into implementation, by the workbook route into development: submitted by the editor,
 * approved by the approver as `number`. A test that moves a spec on from the seed starts here, as the seed does.
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).Database} db
 * @param {import( "@health-dev-portal/data/definitions" ).FileStore} store
 * @param {string} spec
 * @param {import( "@health-dev-portal/data/definitions" ).VersionContent} content
 * @param {string} number
 * @returns {Promise<string>} The release's ID.
 * @public
 */
const implemented = module.exports.implemented = async ( db, store, spec, content, number ) => {
    await loadIntoDevelopment( db, store, spec, content, BY_EDITOR );
    const development = await findVersion( db, spec, { stage: STAGE.DEVELOPMENT } );
    const release = await submitRelease( db, { versions: [ development.id ], summary: SUMMARY, ...BY_EDITOR } );
    await approveRelease( db, store, release, { numbers: { [ development.id ]: number }, ...BY_APPROVER } );
    return release;
};

// CL007 1.5.34: T10 added, T4 valid until 1.5.34; promoted with no notice, so in production the same day, with 1.5.33
// kept as previous production until 30.04.2027.
const cl007 = async ( db, store ) => {
    const content = await productionContent( db, SEED.cl007.spec );
    const last = content.list.entries.at( -1 );
    content.list.entries.find( ( entry ) => entry.key === SEED.cl007.expired ).validUntil = SEED.cl007.production;
    content.list.entries.push( { ...structuredClone( last ), key: SEED.cl007.added,
        description: { bg: "Рецепта - пример (синтетичен запис за тестовете)", en: "Prescription - example (a synthetic entry for the tests)" },
        display: { bg: "Пример", en: "Example" }, values: last.values.map( () => null ), since: SEED.cl007.production, validUntil: null,
        source: { ...last.source, row: last.source.row + 1 } } );
    const previous = await findVersion( db, SEED.cl007.spec, { stage: STAGE.PRODUCTION } );
    const release = await implemented( db, store, SEED.cl007.spec, content, SEED.cl007.production );
    await promoteReleases( db, store, [ release ], { to: STAGE.TESTING, noticeDays: 0, ...BY_APPROVER } );
    await promoteReleases( db, store, [ release ], { to: STAGE.PRODUCTION, previous: { [ previous.id ]: SEED.cl007.expiresOn }, ...BY_APPROVER } );
};

// e-Prescription 1.5.2: lrn's description changed, supplements made required, and exampleNote added after
// nrnPreValidation, with no English description, as every element of the workbook has none. Promoted with 30 days'
// notice, so planned for 05.12.2026.
const ePrescription = async ( db, store ) => {
    const content = await productionContent( db, SEED.ePrescription.spec );
    const message = content.messages.find( ( one ) => one.code === "P001" );
    elementAt( message, "contents/prescription/lrn" ).description = {
        bg: "Уникален код, генериран от системата на лекаря или стоматолога (синтетично променено описание).", en: null };
    const supplements = elementAt( message, "contents/prescription/supplements" );
    supplements.requirement = "R";
    supplements.cardinality = { min: 1, max: 1 };
    const prescription = elementAt( message, "contents/prescription", "group" );
    const after = elementAt( message, "contents/prescription/nrnPreValidation" );
    const added = { ...structuredClone( after ), identity: "contents/prescription/exampleNote@value", path: "contents/prescription/exampleNote", tag: "exampleNote",
        name: { bg: "Пример", en: "Example" }, requirement: "O", cardinality: { min: 0, max: 1 }, constraint: { raw: "max=200", maxLength: 200 },
        rules: [], conditions: [], codeList: null, children: [],
        description: { bg: "Пример за ново поле (синтетични данни за тестовете на портала)", en: null } };
    prescription.children.splice( prescription.children.indexOf( after ) + 1, 0, added );
    const release = await implemented( db, store, SEED.ePrescription.spec, content, SEED.ePrescription.testing );
    await promoteReleases( db, store, [ release ], { to: STAGE.TESTING, noticeDays: 30, ...BY_APPROVER } );
};

// CL008's next version, with one entry of its own, reaches implementation; its release is then abandoned.
const cl008 = async ( db, store ) => {
    const content = await productionContent( db, "CL008" );
    const last = content.list.entries.at( -1 );
    content.list.entries.push( { ...structuredClone( last ), key: SEED.cl008AbandonedKey,
        description: { bg: "Изоставен запис (синтетичен, никога публикуван)", en: "An abandoned entry (synthetic, never published)" },
        display: { bg: "Изоставен", en: "Abandoned" }, since: SEED.cl008Abandoned, validUntil: null, source: { ...last.source, row: last.source.row + 1 } } );
    await abandonRelease( db, store, await implemented( db, store, "CL008", content, SEED.cl008Abandoned ), BY_APPROVER );
};

/**
 * Runs decision 13 on a database the public production set was migrated into: CL007 to production, e-Prescription to
 * testing, CL008 abandoned in implementation, and a development version of the rules.
 *
 * @method
 * @param {import( "@health-dev-portal/data/definitions" ).Database} db
 * @param {import( "@health-dev-portal/data/definitions" ).FileStore} store The store the migration wrote the catalogue to.
 * @returns {Promise<void>}
 * @public
 */
module.exports.seed = async ( db, store ) => {
    await cl007( db, store );
    await ePrescription( db, store );
    await cl008( db, store );
    await startDevelopment( db, store, SEED.rules.spec );
};
