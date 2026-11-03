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

const { createAnomaly } = require( "#anomalies" );

/**
 * @typedef {Object} BlueprintBinding An element bound to a blueprint (design record §4.4).
 * @property {string} message The message's code.
 * @property {string} element The group's identity, which for a group is its path.
 * @property {string} blueprint The blueprint's key.
 * @property {string} by `name`, `type` or `sibling`: the "Data types" name, the published type, or the same path in
 *     another message of the module.
 */

// A name's or a type's words, lower-cased: split at anything but a Latin letter or digit, and where a lower-case letter
// or digit meets an upper-case one — so `Diagnostic Report`, `diagnosticReport` and the type `diagnosticReport` agree.
const wordsOf = ( text ) => text.replace( /([a-z0-9])([A-Z])/g, "$1 $2" ).split( /[^A-Za-z0-9]+/ ).filter( Boolean ).map( ( word ) => word.toLowerCase() );

const containsRun = ( words, run ) => words.some( ( word, start ) => run.every( ( part, offset ) => words[ start + offset ] === part ) );

/**
 * The blueprint a name means (design record §4.4, §6.2): the one with a type whose words contain the name's words as a
 * run. Practitioner matches `medicalPractitionerSimple`, Diagnosis `diagnosisBasic`, `diagnosticReport` the type
 * `diagnosticReport`. Look-alike letters are the caller's to fold first: this package has no script tables.
 *
 * @method
 * @param {string} name A workbook's "Data types" name, or the first segment of a condition path.
 * @param {import( "#definitions" ).Blueprint[]} blueprints
 * @returns {string|null} The blueprint's key; `null` when none matches, or more than one, since a guess between two
 *     objects would bind a field to the wrong one.
 * @public
 */
module.exports.matchBlueprint = ( name, blueprints ) => {
    const run = wordsOf( name );
    if ( run.length === 0 ) {
        return null;
    }
    const matched = blueprints.filter( ( blueprint ) => blueprint.types.some( ( type ) => containsRun( wordsOf( type ), run ) ) );
    return matched.length === 1 ? matched[ 0 ].key : null;
};

const flatten = ( elements ) => elements.flatMap( ( element ) => [ element, ...flatten( element.children ) ] );

// A "Data types" cell on a group row names an object unless it holds the template's placeholder or a dash.
const PLACEHOLDER = /^(↸|-+)$/;
const nameOf = ( element ) => {
    const text = ( element.dataType || "" ).trim();
    return text && !PLACEHOLDER.test( text ) ? text : null;
};

const BY_TEXT = Object.freeze( { type: "published type", sibling: "sibling message" } );

/**
 * Binds a module's groups to blueprints (design record §4.4), each by the first of: its own "Data types" name; the type
 * the published XSD of its message gives the same path; the same path bound, either way, in the module's other
 * messages, when all of them that bind it agree.
 *
 * A name that matches no blueprint — Referral, Examination: objects of one module's messages — leaves its group unbound
 * without a word. A name whose blueprint differs from the one the type or a sibling gives is reported, and the name's
 * binding is kept: the workbook is the authority.
 *
 * @method
 * @param {import( "#definitions" ).Message[]} messages
 * @param {import( "#definitions" ).BlueprintCatalogue} catalogue
 * @param {{name?: function( string ): string}} [options] `name` prepares a name before matching; the importer folds
 *     look-alike letters with it (`Аccommodation` starts with a Cyrillic А).
 * @returns {{bindings: BlueprintBinding[], anomalies: import( "#definitions" ).Anomaly[]}} Bindings in message, then
 *     row order.
 * @public
 */
module.exports.bindBlueprints = ( messages, catalogue, options = {} ) => {
    const prepare = options.name || ( ( text ) => text );
    const groupsOf = ( message ) => flatten( message.elements ).filter( ( element ) => element.kind === "group" && element.path );
    // Per message: path → { blueprint, by }, from names and published types first.
    const bound = new Map( messages.map( ( message ) => [ message.code, new Map() ] ) );
    const named = new Map( messages.map( ( message ) => [ message.code, new Map() ] ) );
    for ( const message of messages ) {
        const published = catalogue.published[ message.code ] || {};
        for ( const group of groupsOf( message ) ) {
            const name = nameOf( group );
            const byName = name ? module.exports.matchBlueprint( prepare( name ), catalogue.blueprints ) : null;
            const byType = published[ group.path ] || null;
            if ( byName ) {
                bound.get( message.code ).set( group.path, { blueprint: byName, by: "name" } );
                named.get( message.code ).set( group.path, { group: group, name: name, blueprint: byName, type: byType } );
            } else if ( byType ) {
                bound.get( message.code ).set( group.path, { blueprint: byType, by: "type" } );
            }
        }
    }
    const siblingOf = ( code, path ) => {
        const others = new Set( messages.filter( ( other ) => other.code !== code )
            .map( ( other ) => bound.get( other.code ).get( path ) ).filter( Boolean ).map( ( binding ) => binding.blueprint ) );
        return others.size === 1 ? [ ...others ][ 0 ] : null;
    };
    const anomalies = [];
    for ( const message of messages ) {
        for ( const [ path, entry ] of named.get( message.code ) ) {
            const other = entry.type ? { blueprint: entry.type, by: "type" } : { blueprint: siblingOf( message.code, path ), by: "sibling" };
            if ( other.blueprint && other.blueprint !== entry.blueprint ) {
                anomalies.push( createAnomaly( "blueprint-name-differs", entry.group.source, { identity: entry.group.identity, message: message.code,
                    name: entry.name, named: entry.blueprint, by: BY_TEXT[ other.by ], bound: other.blueprint } ) );
            }
        }
    }
    // Siblings decide from names and published types only, so the order messages come in changes nothing.
    const siblings = messages.map( ( message ) => [ message.code, groupsOf( message )
        .filter( ( group ) => !bound.get( message.code ).has( group.path ) )
        .map( ( group ) => [ group.path, siblingOf( message.code, group.path ) ] )
        .filter( ( [ , blueprint ] ) => blueprint ) ] );
    for ( const [ code, found ] of siblings ) {
        for ( const [ path, blueprint ] of found ) {
            bound.get( code ).set( path, { blueprint: blueprint, by: "sibling" } );
        }
    }
    const bindings = messages.flatMap( ( message ) => groupsOf( message )
        .filter( ( group ) => bound.get( message.code ).has( group.path ) )
        .map( ( group ) => ( { message: message.code, element: group.identity, ...bound.get( message.code ).get( group.path ) } ) ) );
    return { bindings: bindings, anomalies: anomalies };
};

const shapeOf = ( element ) => [ element.dataType, element.constraint ? element.constraint.raw : null ].filter( Boolean ).join( " " ) || "(none)";

/**
 * Checks that one field of one blueprint is shaped the same in every message of a module (design record §4.4): its data
 * type and its constraint. Without it, a patient's identifier could be 12 characters in one message and 20 in another
 * and no report would say so. A field belongs to the nearest bound group above it, so an address inside a patient is the
 * address's, and is compared there.
 *
 * @method
 * @param {import( "#definitions" ).Message[]} messages
 * @param {BlueprintBinding[]} bindings
 * @returns {import( "#definitions" ).Anomaly[]} One `blueprint-field-differs` per field with more than one shape.
 * @public
 */
module.exports.checkBlueprintFields = ( messages, bindings ) => {
    // (blueprint, field) → shape → { codes, source }, in the order first seen.
    const fields = new Map();
    for ( const message of messages ) {
        const carriers = bindings.filter( ( binding ) => binding.message === message.code ).sort( ( a, b ) => b.element.length - a.element.length );
        for ( const element of flatten( message.elements ).filter( ( candidate ) => candidate.kind !== "group" && candidate.identity && candidate.path ) ) {
            const carrier = carriers.find( ( binding ) => element.path.startsWith( `${ binding.element }/` ) );
            if ( !carrier ) {
                continue;
            }
            const key = JSON.stringify( [ carrier.blueprint, element.identity.slice( carrier.element.length + 1 ) ] );
            const shapes = fields.get( key ) || new Map();
            const shape = shapes.get( shapeOf( element ) ) || { codes: [], source: element.source };
            if ( !shape.codes.includes( message.code ) ) {
                shape.codes.push( message.code );
            }
            shapes.set( shapeOf( element ), shape );
            fields.set( key, shapes );
        }
    }
    return [ ...fields ].filter( ( [ , shapes ] ) => shapes.size > 1 ).map( ( [ key, shapes ] ) => {
        const [ blueprint, field ] = JSON.parse( key );
        const first = [ ...shapes.values() ][ 0 ];
        return createAnomaly( "blueprint-field-differs", first.source, { blueprint: blueprint, field: field,
            variants: [ ...shapes ].map( ( [ shape, entry ] ) => `${ shape } in ${ entry.codes.join( ", " ) }` ).join( "; " ) } );
    } );
};
