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

const crypto = require( "node:crypto" );
const { importSet } = require( "@health-dev-portal/importer/set" );
const { importXsdSet } = require( "@health-dev-portal/importer/xsd" );
const { splitNomenclatures } = require( "@health-dev-portal/spec-model/code-lists" );
const { SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { resolutionOrder } = require( "@health-dev-portal/spec-model/stages" );
const { encodeContent } = require( "#items" );
const { ensureSpec, findVersion, freezeVersion, storeVersion } = require( "#versions" );
const { compareNumbers, storeHistory } = require( "#changelog" );
const { recordResolution } = require( "#resolution" );
const { storeCatalogue } = require( "#files" );

const COMBINED = "nomenclatures";
const RULES = "rules";
// Production first, so testing can tell a changed list from an unchanged one; development last, since it starts from
// the most advanced published version (design record §7.5).
const ORDER = Object.freeze( [ STAGE.PRODUCTION, STAGE.TESTING, STAGE.DEVELOPMENT ] );
const PUBLISHED = new Set( [ STAGE.PRODUCTION, STAGE.TESTING ] );

/**
 * A version already stored with other content than the workbook's (design record §7.11): a published one, which is
 * never replaced, or a development one, which only the workbook route may replace.
 *
 * @public
 */
class MigrationConflictError extends Error {

    /**
     * @param {string} spec
     * @param {string|null} number `null` for a development version.
     * @param {string} [message] In place of the published version's message.
     */
    constructor( spec, number, message ) {
        super( message || `${ spec } ${ number } is already stored with other content; a published version is never replaced (design record §7.11).` );
        this.name = "MigrationConflictError";
        this.spec = spec;
        this.number = number;
    }
}
module.exports.MigrationConflictError = MigrationConflictError;

/**
 * A published workbook in the wrong place on its spec's line (design record §7.1, §7.11): a testing version not ahead of
 * production, or a stage that already holds another version.
 *
 * @public
 */
class MigrationOrderError extends Error {

    /**
     * @param {string} spec
     * @param {string} number
     * @param {string} message
     */
    constructor( spec, number, message ) {
        super( message );
        this.name = "MigrationOrderError";
        this.spec = spec;
        this.number = number;
    }
}
module.exports.MigrationOrderError = MigrationOrderError;

const changeOf = ( version, number ) => ( version.changeNotes || [] ).find( ( change ) => change.version === number ) || null;

const datesOf = ( change ) => change ? [
    ...( change.stagingDate ? [ { stage: STAGE.TESTING, enteredOn: change.stagingDate } ] : [] ),
    ...( change.productionDate ? [ { stage: STAGE.PRODUCTION, enteredOn: change.productionDate } ] : [] )
] : [];

// The newest change version of a development workbook: the notes of the version it is working on.
const newestOf = ( version ) => {
    const notes = version.changeNotes || [];
    return notes.length ? notes[ notes.length - 1 ] : null;
};

/**
 * One migration run: what it stored, what it found already stored, and what history it kept.
 *
 * @private
 */
class Run {

    constructor( db ) {
        this.db = db;
        this.specs = new Set();
        this.stored = [];
        this.skipped = [];
        this.retired = 0;
        this.entries = 0;
        this.anomalies = { blocking: 0, warning: 0 };
        // Per spec, the history of its published workbook with the highest number (design record §7.11).
        this.history = new Map();
        // Each published nomenclatures workbook's number and the anomalies that sit on no list's sheet.
        this.workbooks = [];
    }

    async spec( id, kind ) {
        if ( !this.specs.has( id ) ) {
            await ensureSpec( this.db, id, kind );
            this.specs.add( id );
        }
    }

    // Taken by number, not by stage: by stage, a testing workbook behind production replaced production's history, which
    // lost production's own notes and its older versions (final review of plan 5).
    historyFrom( spec, kind, number, changes ) {
        const current = this.history.get( spec );
        if ( !current || compareNumbers( number, current.number ) > 0 ) {
            this.history.set( spec, { kind: kind, number: number, changes: changes } );
        }
    }

    count( anomalies ) {
        for ( const anomaly of anomalies ) {
            this.anomalies[ anomaly.level === "blocking" ? "blocking" : "warning" ] += 1;
        }
    }

    // The spec's most advanced version before development: the one a development version starts from (§7.5).
    async mostAdvanced( spec ) {
        for ( const stage of resolutionOrder( STAGE.IMPLEMENTATION ) ) {
            const found = await findVersion( this.db, spec, { stage: stage } );
            if ( found ) {
                return found;
            }
        }
        return null;
    }

    /**
     * Stores one version at its stage, or finds it already there with the same content.
     *
     * @param {string} spec
     * @param {string} kind
     * @param {string} stage
     * @param {Object} version The model object, with its change notes.
     * @param {Array} anomalies
     * @returns {Promise<string>} The version's ID.
     */
    async version( spec, kind, stage, version, anomalies ) {
        const hash = encodeContent( kind, version ).hash;
        if ( !PUBLISHED.has( stage ) ) {
            return this.development( spec, kind, version, anomalies, hash );
        }
        const number = version.version;
        if ( !number ) {
            throw new TypeError( `The ${ stage } workbook of ${ spec } gives no version number.` );
        }
        const existing = await findVersion( this.db, spec, { number: number } );
        if ( existing ) {
            if ( existing.contentHash !== hash ) {
                throw new MigrationConflictError( spec, number );
            }
            // his.bg lists the same number for test and production when nothing is ahead (HEL-7): the testing workbook is
            // the production version itself, and nothing goes to testing (§7.11, "where it is ahead").
            const notAhead = stage === STAGE.TESTING && existing.stage === STAGE.PRODUCTION;
            if ( existing.stage !== stage && !notAhead ) {
                throw new MigrationOrderError( spec, number, `${ spec } ${ number } is stored in ${ existing.stage }; the migration never moves a version to ${ stage } (design record §7.11).` );
            }
            this.skipped.push( { spec: spec, number: number, stage: stage } );
            await this.publish( existing.id, kind );
            return existing.id;
        }
        if ( stage === STAGE.TESTING ) {
            // Frozen in testing behind production, it could never be replaced, and its history would have overwritten
            // production's (final review of plan 5).
            const production = await findVersion( this.db, spec, { stage: STAGE.PRODUCTION } );
            if ( production && compareNumbers( number, production.number ) <= 0 ) {
                throw new MigrationOrderError( spec, number, `${ spec } ${ number } is not ahead of production ${ production.number }, so it cannot go to testing (design record §7.11).` );
            }
        }
        const holder = await findVersion( this.db, spec, { stage: stage } );
        if ( holder ) {
            throw new MigrationOrderError( spec, number, `${ spec } ${ stage } already holds ${ holder.number }; ${ number } cannot be stored there, since a published version is never replaced (design record §7.11).` );
        }
        let release;
        if ( stage === STAGE.TESTING ) {
            // Each migrated testing version moves on its own, its notice period and date left for the approver (§7.11).
            release = crypto.randomUUID();
            await this.db.run( "INSERT INTO releases ( id, created_at ) VALUES ( ?, ? )", [ release, new Date().toISOString() ] );
        }
        const id = await storeVersion( this.db, { spec: spec, kind: kind, number: number, stage: stage, content: version, anomalies: anomalies, release: release,
            stages: datesOf( changeOf( version, number ) ) } );
        this.stored.push( { spec: spec, number: number, stage: stage } );
        this.count( anomalies );
        await this.publish( id, kind );
        return id;
    }

    // A published version records what it reads, then freezes (§4.8, §7.7). A run cut short between the two finishes here.
    async publish( id, kind ) {
        const row = await this.db.get( "SELECT frozen FROM versions WHERE id = ?", [ id ] );
        if ( row.frozen === 1 ) {
            return;
        }
        if ( kind === SPEC_KIND.MODULE ) {
            await recordResolution( this.db, id );
        }
        await freezeVersion( this.db, id );
    }

    async development( spec, kind, version, anomalies, hash ) {
        let id;
        const existing = await findVersion( this.db, spec, { stage: STAGE.DEVELOPMENT } );
        if ( existing ) {
            if ( existing.contentHash !== hash ) {
                throw new MigrationConflictError( spec, null, `${ spec }'s development version differs from this workbook; only the workbook route replaces it (design record §7.11).` );
            }
            this.skipped.push( { spec: spec, number: null, stage: STAGE.DEVELOPMENT } );
            id = existing.id;
        } else {
            const base = await this.mostAdvanced( spec );
            id = await storeVersion( this.db, { spec: spec, kind: kind, number: null, stage: STAGE.DEVELOPMENT, content: version, anomalies: anomalies,
                base: base ? base.id : undefined } );
            this.stored.push( { spec: spec, number: null, stage: STAGE.DEVELOPMENT } );
            this.count( anomalies );
        }
        // Done for a skipped version too: both are idempotent, so a run cut short after storing it finishes here
        // (CodeRabbit on #13).
        if ( kind === SPEC_KIND.MODULE ) {
            await recordResolution( this.db, id );
        }
        // A development workbook's copy of older notes may be mid-edit; only the notes of the version it is working on are
        // kept. A list's newest note may belong to an older, published version, and is then not its own.
        const newest = newestOf( version );
        if ( newest && newest.version === version.version ) {
            this.keep( await storeHistory( this.db, spec, kind, [ newest ], { number: newest.version, version: id } ) );
        }
        return id;
    }

    keep( result ) {
        this.retired += result.retired;
        this.entries += result.entries;
    }
}

// The nomenclatures workbook as one version per list (design record §4.6). At testing and in development only the
// lists that differ from the list's most advanced version are stored; an unchanged list stays where it is.
const migrateNomenclatures = async ( run, stage, result ) => {
    const split = splitNomenclatures( result.version );
    const lists = new Set( split.lists.map( ( version ) => version.spec ) );
    const anomaliesOf = new Map();
    const workbookAnomalies = [];
    for ( const anomaly of result.anomalies ) {
        if ( lists.has( anomaly.sheet ) ) {
            anomaliesOf.set( anomaly.sheet, [ ...( anomaliesOf.get( anomaly.sheet ) || [] ), anomaly ] );
        } else {
            workbookAnomalies.push( anomaly );
        }
    }
    await run.spec( COMBINED, SPEC_KIND.NOMENCLATURES );
    for ( const version of split.lists ) {
        await run.spec( version.spec, SPEC_KIND.CODE_LIST );
        if ( stage !== STAGE.PRODUCTION ) {
            // Unchanged since an earlier stage: nothing to store. The same version found again at its own stage is a
            // second run, which run.version counts as skipped.
            const current = await run.mostAdvanced( version.spec );
            if ( current && current.stage !== stage && current.contentHash === encodeContent( SPEC_KIND.CODE_LIST, version ).hash ) {
                continue;
            }
        }
        await run.version( version.spec, SPEC_KIND.CODE_LIST, stage, version, anomaliesOf.get( version.spec ) || [] );
    }
    if ( PUBLISHED.has( stage ) ) {
        for ( const version of split.lists ) {
            run.historyFrom( version.spec, SPEC_KIND.CODE_LIST, result.version.version, version.changeNotes );
        }
        run.historyFrom( COMBINED, SPEC_KIND.NOMENCLATURES, result.version.version, split.combined );
        run.workbooks.push( { number: result.version.version, anomalies: workbookAnomalies } );
    }
};

// What the combined spec keeps beyond its history: the workbook-level anomalies, on a retired version of the workbook's
// own number (design record §7.11). It runs before the history, so the version is created with them and frozen at once
// (§4.1); the history then finds it and only adds its notes.
const keepWorkbookAnomalies = async ( run, workbook ) => {
    if ( workbook.anomalies.length === 0 ) {
        return;
    }
    const existing = await findVersion( run.db, COMBINED, { number: workbook.number } );
    if ( !existing ) {
        await storeVersion( run.db, { spec: COMBINED, kind: SPEC_KIND.NOMENCLATURES, number: workbook.number, stage: STAGE.RETIRED, anomalies: workbook.anomalies,
            frozen: true } );
        run.retired += 1;
        run.count( workbook.anomalies );
        return;
    }
    const kept = await run.db.get( "SELECT COUNT(*) AS n FROM anomalies WHERE version_id = ?", [ existing.id ] );
    if ( kept.n !== workbook.anomalies.length ) {
        // The version was stored by an earlier run of a workbook with other anomalies under the same number: the
        // published workbook changed, and a published version is never replaced.
        throw new MigrationConflictError( COMBINED, workbook.number, `It holds ${ kept.n } workbook-level anomalies; this workbook has ${ workbook.anomalies.length }.` );
    }
};

/**
 * Stores the imports of each stage (design record §7.11): per stage — production, then testing, then development — the
 * code lists, then the rules, then the modules.
 *
 * - Published versions are stored as published, defects included, record what they read and freeze. A testing
 *   version gets a release of its own, with no notice period or date yet.
 * - Development versions have no number, start from the spec's most advanced version, and keep only their own newest
 *   notes.
 * - A version already stored with the same content is skipped; with other content it is refused, before anything of it
 *   is written.
 * - History comes from each spec's most advanced published workbook; a number the portal does not hold becomes a
 *   retired version with only its changelog.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Unused until generated files are stored (§7.9); kept so the call does
 *     not change then.
 * @param {{production?: import( "#definitions" ).StageImport, testing?: import( "#definitions" ).StageImport,
 *     development?: import( "#definitions" ).StageImport}} stages Each holding only the workbooks at that stage.
 * @returns {Promise<import( "#definitions" ).MigrationReport>}
 * @throws {MigrationConflictError} When a published version is stored with other content, or its stage holds another.
 * @public
 */
module.exports.migrateImported = async ( db, store, stages ) => {
    const run = new Run( db );
    for ( const stage of ORDER ) {
        const imports = stages[ stage ];
        if ( !imports ) {
            continue;
        }
        if ( imports.nomenclatures ) {
            await migrateNomenclatures( run, stage, imports.nomenclatures );
        }
        for ( const [ result, spec, kind ] of [
            ...( imports.rules ? [ [ imports.rules, RULES, SPEC_KIND.RULES ] ] : [] ),
            ...( imports.modules || [] ).map( ( module ) => [ module, module.version.spec, SPEC_KIND.MODULE ] )
        ] ) {
            await run.spec( spec, kind );
            await run.version( spec, kind, stage, result.version, result.anomalies );
            if ( PUBLISHED.has( stage ) ) {
                run.historyFrom( spec, kind, result.version.version, result.version.changeNotes || [] );
            }
        }
    }
    for ( const workbook of run.workbooks ) {
        await keepWorkbookAnomalies( run, workbook );
    }
    for ( const [ spec, history ] of run.history ) {
        run.keep( await storeHistory( db, spec, history.kind, history.changes ) );
    }
    return { stored: run.stored, skipped: run.skipped, specs: run.specs.size, retired: run.retired, entries: run.entries, anomalies: run.anomalies };
};

/**
 * Migrates the published workbooks a manifest names (design record §7.11). The blueprint catalogue is learned from the
 * XSD set and stored first. Then each stage that has a workbook is imported in one `importSet`, its nomenclatures and
 * rules taken from the stage itself or else from the nearest stage further on, so linking reads what resolution will
 * (§4.8); only the workbooks at the stage are stored there.
 *
 * @method
 * @param {import( "#definitions" ).Database} db With its schema applied.
 * @param {import( "#definitions" ).FileStore} store
 * @param {import( "#definitions" ).Manifest} manifest
 * @returns {Promise<import( "#definitions" ).MigrationReport>}
 * @throws {MigrationConflictError}
 * @public
 */
module.exports.migrate = async ( db, store, manifest ) => {
    let catalogue;
    if ( manifest.xsd ) {
        catalogue = ( await importXsdSet( manifest.xsd ) ).catalogue;
        await storeCatalogue( db, store, catalogue );
    }
    const nearest = ( entries, stage ) => {
        for ( const candidate of resolutionOrder( stage ) ) {
            const found = entries.find( ( entry ) => entry.stage === candidate );
            if ( found ) {
                return found;
            }
        }
        return null;
    };
    const stages = {};
    for ( const stage of ORDER ) {
        const modules = manifest.modules.filter( ( entry ) => entry.stage === stage );
        const nomenclatures = nearest( manifest.nomenclatures, stage );
        const rules = nearest( manifest.rules, stage );
        const here = ( entry ) => Boolean( entry ) && entry.stage === stage;
        if ( modules.length === 0 && !here( nomenclatures ) && !here( rules ) ) {
            continue;
        }
        const set = await importSet( {
            nomenclatures: nomenclatures ? { source: nomenclatures.file } : undefined,
            rules: rules ? { source: rules.file } : undefined,
            modules: modules.map( ( entry ) => ( { spec: entry.spec, source: entry.file } ) ),
            catalogue: catalogue
        } );
        stages[ stage ] = { nomenclatures: here( nomenclatures ) ? set.nomenclatures : null, rules: here( rules ) ? set.rules : null, modules: set.modules };
    }
    return module.exports.migrateImported( db, store, stages );
};

const grouped = ( number ) => number.toLocaleString( "en-US" );

/**
 * The one line a person reads after a migration.
 *
 * @method
 * @param {import( "#definitions" ).MigrationReport} report
 * @returns {string}
 * @public
 */
module.exports.formatMigrationReport = ( report ) => `Stored ${ grouped( report.stored.length ) } versions of ${ grouped( report.specs ) } specs `
    + `(${ grouped( report.skipped.length ) } skipped); ${ grouped( report.retired ) } retired versions of history with ${ grouped( report.entries ) } entries; `
    + `anomalies: ${ grouped( report.anomalies.blocking ) } blocking, ${ grouped( report.anomalies.warning ) } warnings.`;
