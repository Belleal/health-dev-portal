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
const { STAGE } = require( "@health-dev-portal/spec-model/kinds" );

// A migration loads published versions into production and testing, and work in progress into development (design
// record §7.11); nothing is in implementation on the day.
const STAGES = Object.freeze( [ STAGE.PRODUCTION, STAGE.TESTING, STAGE.DEVELOPMENT ] );
const SPEC_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reads the manifest of a migration (design record §7.11): which workbook goes to which spec and stage, and where the
 * published XSD set is. Every path is resolved against the manifest's own directory.
 *
 * @method
 * @param {string} file
 * @returns {import( "#definitions" ).Manifest}
 * @throws {TypeError} Naming the entry, for a stage outside production, testing and development; two workbooks of one
 *     spec in one stage; a module without a spec key; a file or directory that is not there; or no production
 *     nomenclatures.
 * @public
 */
module.exports.readManifest = ( file ) => {
    const directory = path.dirname( path.resolve( file ) );
    const raw = JSON.parse( fs.readFileSync( file, "utf8" ) );
    const resolved = ( name, where ) => {
        const target = path.resolve( directory, String( name ) );
        if ( !fs.existsSync( target ) ) {
            throw new TypeError( `${ where }: ${ name } is not there.` );
        }
        return target;
    };
    const entries = ( kind, keyed ) => {
        const seen = new Set();
        return ( raw[ kind ] || [] ).map( ( entry, index ) => {
            const where = `${ kind }[${ index }]`;
            if ( keyed && !( typeof entry.spec === "string" && SPEC_KEY.test( entry.spec ) ) ) {
                throw new TypeError( `${ where }: a module needs its spec key, such as "e-prescription".` );
            }
            if ( !STAGES.includes( entry.stage ) ) {
                throw new TypeError( `${ where }: the stage "${ entry.stage }" is none of ${ STAGES.join( ", " ) }.` );
            }
            const key = `${ keyed ? entry.spec : kind } ${ entry.stage }`;
            if ( seen.has( key ) ) {
                throw new TypeError( `${ where }: a second workbook for ${ key }.` );
            }
            seen.add( key );
            return { ...( keyed ? { spec: entry.spec } : {} ), file: resolved( entry.file, where ), stage: entry.stage };
        } );
    };
    const manifest = {
        xsd: raw.xsd ? resolved( raw.xsd, "xsd" ) : null,
        nomenclatures: entries( "nomenclatures", false ),
        rules: entries( "rules", false ),
        modules: entries( "modules", true )
    };
    if ( !manifest.nomenclatures.some( ( entry ) => entry.stage === STAGE.PRODUCTION ) ) {
        throw new TypeError( "The manifest names no production nomenclatures: every code list starts from them (design record §4.6)." );
    }
    return manifest;
};
