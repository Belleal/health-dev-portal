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

const fs = require( "node:fs" );
const path = require( "node:path" );
const { LIFECYCLE } = require( "@health-dev-portal/spec-model/kinds" );
const { compareShapes, explainDifferences } = require( "@health-dev-portal/spec-model/schema-compare" );
const { messageShape } = require( "@health-dev-portal/spec-model/xsd-shape" );
const { learnCatalogue } = require( "#blueprint-catalogue" );
const { UnreadableSchemaError, expandMessage, readXsdSet } = require( "#xsd-reader" );

const ENTITIES_FILE = "NHIS-Entities.xsd";

/**
 * Imports a published XSD set from a directory, such as a copy of his.bg's `/api/v1/` (design record §5.2): every
 * `*.xsd` in it is read, and the blueprint catalogue learned. The set is read once; the catalogue is what later imports
 * need, and storing it is plan 5's.
 *
 * @method
 * @param {string} directory
 * @returns {Promise<{set: import( "#xsd-reader" ).XsdSet, catalogue: import( "@health-dev-portal/spec-model/definitions" ).BlueprintCatalogue}>}
 * @throws {import( "#xsd-reader" ).UnreadableSchemaError} "Cannot read <file or directory>: …" for a directory that cannot be
 *     listed or holds no NHIS-Entities.xsd, for a file that cannot be read or parsed, and for a message file that cannot
 *     be expanded.
 * @public
 */
module.exports.importXsdSet = async ( directory ) => {
    // A person names this directory, so what goes wrong reading it is one line naming what, never a stack trace from
    // the CLIs (plan 4's final review).
    const reading = async ( name, read ) => {
        try {
            return await read();
        } catch ( error ) {
            throw new UnreadableSchemaError( `Cannot read ${ name }: ${ error.message }`, { cause: error } );
        }
    };
    const names = ( await reading( directory, () => fs.promises.readdir( directory ) ) ).filter( ( name ) => name.endsWith( ".xsd" ) ).sort();
    // Without it nothing binds, and an import given the wrong directory would look like one with no blueprints.
    if ( !names.includes( ENTITIES_FILE ) ) {
        throw new UnreadableSchemaError( `Cannot read ${ directory }: it holds no ${ ENTITIES_FILE }, so it is not a published XSD set.` );
    }
    const files = await Promise.all( names.map( async ( name ) => ( { name: name,
        text: await reading( name, () => fs.promises.readFile( path.join( directory, name ), "utf8" ) ) } ) ) );
    const set = readXsdSet( files );
    // Learning expands every message, and a message file that declares no message element, or holds a type that
    // contains itself, cannot be expanded. It is the set's fault, so it reads as one line too (CodeRabbit on #12).
    try {
        return { set: set, catalogue: learnCatalogue( set ) };
    } catch ( error ) {
        if ( !( error instanceof RangeError ) ) {
            throw error;
        }
        throw new UnreadableSchemaError( `Cannot read ${ directory }: ${ error.message }`, { cause: error } );
    }
};

/**
 * The drift report of a module version against a published XSD set (design record §5.5): for each of its messages the
 * set has, the differences between what the published XSD accepts and what the generated one would, each with its
 * cause. A withdrawn message has no generated XSD and is left out. A message the set lacks, or one that cannot be
 * generated because its tree repeats an identity, is listed as skipped with the reason.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ModuleVersion} version
 * @param {import( "@health-dev-portal/spec-model/definitions" ).NomenclaturesVersion} nomenclatures The ones the version
 *     resolved against: a coded value's type is its list's key type.
 * @param {import( "#xsd-reader" ).XsdSet} set
 * @returns {{entries: import( "@health-dev-portal/spec-model/definitions" ).DriftEntry[], skipped: Array<{code: string, reason: string}>}}
 * @public
 */
module.exports.driftReport = ( version, nomenclatures, set ) => {
    const lists = new Map( nomenclatures.codeLists.map( ( list ) => [ list.id, list ] ) );
    const entries = [];
    const skipped = [];
    for ( const message of version.messages.filter( ( candidate ) => candidate.lifecycle !== LIFECYCLE.WITHDRAWN ) ) {
        if ( !set.messages.has( message.code ) ) {
            skipped.push( { code: message.code, reason: "no published XSD" } );
            continue;
        }
        let generated;
        try {
            generated = messageShape( message, lists );
        } catch ( error ) {
            // A repeated identity (H001 in e-Hospitalization 1.0.6) cannot be generated; anything else is a fault.
            if ( !( error instanceof RangeError ) ) {
                throw error;
            }
            skipped.push( { code: message.code, reason: error.message } );
            continue;
        }
        const published = expandMessage( set, message.code );
        entries.push( ...explainDifferences( compareShapes( message.code, published, generated ), {
            publishedShape: published, generatedShape: generated, publishedVersion: set.messages.get( message.code ).version, changeNotes: version.changeNotes
        } ) );
    }
    return { entries: entries, skipped: skipped };
};
