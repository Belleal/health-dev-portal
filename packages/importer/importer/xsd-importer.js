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
const { learnCatalogue } = require( "#blueprint-catalogue" );
const { readXsdSet } = require( "#xsd-reader" );

/**
 * Imports a published XSD set from a directory, such as a copy of his.bg's `/api/v1/` (design record §5.2): every
 * `*.xsd` in it is read, and the blueprint catalogue learned. The set is read once; the catalogue is what later imports
 * need, and storing it is plan 5's.
 *
 * @method
 * @param {string} directory
 * @returns {Promise<{set: import( "#xsd-reader" ).XsdSet, catalogue: import( "@health-dev-portal/spec-model/definitions" ).BlueprintCatalogue}>}
 * @throws {import( "#xsd-reader" ).UnreadableSchemaError} "Cannot read <file>: …" for a file that cannot be read.
 * @public
 */
module.exports.importXsdSet = async ( directory ) => {
    const names = ( await fs.promises.readdir( directory ) ).filter( ( name ) => name.endsWith( ".xsd" ) ).sort();
    const files = await Promise.all( names.map( async ( name ) => ( { name: name, text: await fs.promises.readFile( path.join( directory, name ), "utf8" ) } ) ) );
    const set = readXsdSet( files );
    return { set: set, catalogue: learnCatalogue( set ) };
};
