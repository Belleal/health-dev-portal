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

const { ANOMALY_LEVEL, SPEC_KIND, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { linkConditions, linkModule } = require( "@health-dev-portal/spec-model/links" );
const { referencedSpecs } = require( "@health-dev-portal/spec-model/references" );
const { resolveAt } = require( "#resolution" );
const { readContent, targetsFrom } = require( "#targets" );
const { findVersion, loadAnomalies } = require( "#versions" );

// The line every version moves along, one stage at a time (design record §7.1).
const LINE = Object.freeze( [ STAGE.DEVELOPMENT, STAGE.IMPLEMENTATION, STAGE.TESTING, STAGE.PRODUCTION ] );
const NEXT = Object.freeze( { [ STAGE.DEVELOPMENT ]: STAGE.IMPLEMENTATION, [ STAGE.IMPLEMENTATION ]: STAGE.TESTING, [ STAGE.TESTING ]: STAGE.PRODUCTION } );

/**
 * A move refused, as a whole (design record §7.3): every version and rule it breaks.
 *
 * @public
 */
class PromotionRefusedError extends Error {

    /**
     * @param {import( "#definitions" ).Refusal[]} refusals
     */
    constructor( refusals ) {
        super( `The move is refused: ${ refusals.map( ( refusal ) => `${ refusal.spec } (${ refusal.rule }): ${ refusal.message }` ).join( "; " ) }` );
        this.name = "PromotionRefusedError";
        this.refusals = refusals;
    }
}
module.exports.PromotionRefusedError = PromotionRefusedError;

// An anomaly as the same finding, wherever it was made: its type and what it names.
const findingOf = ( anomaly ) => `${ anomaly.type }\u0000${ JSON.stringify( anomaly.details || {}, Object.keys( anomaly.details || {} ).sort() ) }`;

// What a module would carry from linking against what it reads (§5.3): the anomalies linkModule and linkConditions find.
const linking = async ( db, content, resolutions ) => {
    const targets = await targetsFrom( db, resolutions );
    return [ ...linkModule( content, { nomenclatures: { codeLists: targets.codeLists }, rules: targets.rules } ),
        ...linkConditions( content, { codeLists: targets.codeLists } ) ];
};

const versionRow = async ( db, versionId ) => {
    const row = await db.get( "SELECT v.id, v.spec_id, v.stage, s.kind FROM versions v JOIN specs s ON s.id = v.spec_id WHERE v.id = ?", [ versionId ] );
    if ( !row ) {
        throw new RangeError( `There is no version ${ versionId }.` );
    }
    return row;
};

/**
 * Checks everything moving together — one release or several — by the rules of design record §7.1 and §4.8, over the
 * state after the move (plan 6b, decision 8). Refusals name each version and rule:
 * - `skip` — not the version's next stage; such a move is judged by that alone;
 * - `one-per-stage` — its spec would hold two versions in one stage. A version entering production replaces the one
 *   there, which goes to previous production; a fix replaces the testing version it names;
 * - `one-line` — a development version entering implementation while its spec has another in implementation or testing;
 * - `link` — a module that would carry a blocking anomaly from linking that it does not carry now, against what it
 *   will read in its new stage, counting what moves with it; one it carried already, as a migrated version may, does not
 *   refuse (§4.8);
 * - `key-type` — a list whose key type differs from the version it replaces, while a module in that stage names the
 *   list and no version of that module moves with it.
 * It warns of each module that will read a moving list and names something that list no longer has (§4.8).
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).Move[]} moves
 * @returns {Promise<{refusals: import( "#definitions" ).Refusal[], warnings: import( "#definitions" ).Warning[]}>}
 * @throws {RangeError} When a version named is none.
 * @public
 */
module.exports.checkMove = async ( db, moves ) => {
    const rows = new Map();
    for ( const move of moves ) {
        rows.set( move.version, await versionRow( db, move.version ) );
    }
    const refusals = [];
    const warnings = [];
    const refuse = ( version, rule, message, more = {} ) => refusals.push( { version: version, spec: rows.get( version ).spec_id, rule: rule, message: message, ...more } );

    const valid = [];
    for ( const move of moves ) {
        const row = rows.get( move.version );
        if ( NEXT[ row.stage ] !== move.to ) {
            refuse( move.version, "skip", `It is in ${ row.stage }, and moves to ${ NEXT[ row.stage ] || "no further stage" } next, not to ${ move.to }.` );
        } else {
            valid.push( move );
        }
    }

    // Each spec's versions by stage, before and after.
    const before = new Map();
    const after = new Map();
    for ( const spec of new Set( valid.map( ( move ) => rows.get( move.version ).spec_id ) ) ) {
        const was = new Map();
        for ( const stage of LINE ) {
            const found = await findVersion( db, spec, { stage: stage } );
            was.set( stage, found ? found.id : null );
        }
        before.set( spec, was );
        after.set( spec, new Map( LINE.map( ( stage ) => [ stage, new Set( was.get( stage ) ? [ was.get( stage ) ] : [] ) ] ) ) );
    }
    for ( const move of valid ) {
        const row = rows.get( move.version );
        const stages = after.get( row.spec_id );
        stages.get( row.stage ).delete( move.version );
        // The production version gives way to previous production (§7.6); a fix's testing version retires (§7.1).
        if ( move.to === STAGE.PRODUCTION && before.get( row.spec_id ).get( STAGE.PRODUCTION ) ) {
            stages.get( STAGE.PRODUCTION ).delete( before.get( row.spec_id ).get( STAGE.PRODUCTION ) );
        }
        if ( move.replaces ) {
            stages.get( move.to ).delete( move.replaces );
        }
        stages.get( move.to ).add( move.version );
    }
    const placed = new Map( [ ...after ].map( ( [ spec, stages ] ) => [ spec, new Map( [ ...stages ].map( ( [ stage, held ] ) =>
        [ stage, held.size ? [ ...held ].pop() : null ] ) ) ] ) );

    for ( const move of valid ) {
        const row = rows.get( move.version );
        const stages = after.get( row.spec_id );
        if ( stages.get( move.to ).size > 1 ) {
            refuse( move.version, "one-per-stage", `${ row.spec_id } would hold ${ stages.get( move.to ).size } versions in ${ move.to }.` );
        }
        if ( move.to === STAGE.IMPLEMENTATION && ( stages.get( STAGE.IMPLEMENTATION ).size > 1 || stages.get( STAGE.TESTING ).size > 0 ) ) {
            refuse( move.version, "one-line", `${ row.spec_id } still has a version in implementation or testing; the line holds one at a time (§7.1).` );
        }
        if ( row.kind === SPEC_KIND.MODULE ) {
            const carried = new Set( ( await loadAnomalies( db, move.version ) ).map( findingOf ) );
            const introduced = ( await linking( db, await readContent( db, move.version ), await resolveAt( db, move.version, move.to, placed ) ) )
                .filter( ( anomaly ) => anomaly.level === ANOMALY_LEVEL.BLOCKING && !carried.has( findingOf( anomaly ) ) );
            if ( introduced.length ) {
                refuse( move.version, "link", introduced.map( ( anomaly ) => anomaly.message ).join( " " ), { anomalies: introduced } );
            }
        }
    }

    const moving = new Set( valid.map( ( move ) => move.version ) );
    const lists = valid.filter( ( move ) => rows.get( move.version ).kind === SPEC_KIND.CODE_LIST );
    if ( lists.length ) {
        const modules = await db.all( `SELECT v.id, v.spec_id, v.stage FROM versions v JOIN specs s ON s.id = v.spec_id WHERE s.kind = '${ SPEC_KIND.MODULE }'
            AND v.stage IN ( ${ LINE.map( ( stage ) => `'${ stage }'` ).join( ", " ) } )` );
        for ( const move of lists ) {
            const spec = rows.get( move.version ).spec_id;
            await keyTypeRule( db, move, spec, before, modules, valid, rows, refuse );
            for ( const reader of modules.filter( ( candidate ) => !moving.has( candidate.id ) ) ) {
                const resolutions = await resolveAt( db, reader.id, reader.stage, placed );
                if ( !resolutions.some( ( resolution ) => resolution.version === move.version ) ) {
                    continue;
                }
                const carried = new Set( ( await loadAnomalies( db, reader.id ) ).map( findingOf ) );
                for ( const anomaly of await linking( db, await readContent( db, reader.id ), resolutions ) ) {
                    const names = anomaly.details && ( anomaly.details.id === spec || anomaly.details.list === spec );
                    if ( names && !carried.has( findingOf( anomaly ) ) ) {
                        warnings.push( { version: move.version, spec: spec, reader: reader.id, anomaly: anomaly } );
                    }
                }
            }
        }
    }
    return { refusals: refusals, warnings: warnings };
};

// §4.8: a list that changes its key type changes the XSD of every module that uses it, so it moves only with them.
const keyTypeRule = async ( db, move, spec, before, modules, valid, rows, refuse ) => {
    const replaced = before.get( spec ).get( move.to );
    if ( !replaced ) {
        return;
    }
    const keyType = ( await readContent( db, move.version ) ).list.keyType;
    const was = ( await readContent( db, replaced ) ).list.keyType;
    if ( keyType === was ) {
        return;
    }
    const carriedWith = new Set( valid.filter( ( other ) => other.to === move.to ).map( ( other ) => rows.get( other.version ).spec_id ) );
    const held = [];
    for ( const reader of modules.filter( ( candidate ) => candidate.stage === move.to && !carriedWith.has( candidate.spec_id ) ) ) {
        if ( referencedSpecs( await readContent( db, reader.id ) ).codeLists.includes( spec ) ) {
            held.push( reader.spec_id );
        }
    }
    if ( held.length ) {
        refuse( move.version, "key-type", `${ spec }'s key type changes from ${ was } to ${ keyType }, and ${ held.join( ", " ) } in ${ move.to } names it with no version `
            + "moving too (§4.8)." );
    }
};
