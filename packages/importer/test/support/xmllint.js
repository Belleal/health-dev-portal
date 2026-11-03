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
 * libxml2's xmllint, compiled to WebAssembly, as the tests' real XSD validator (design record §5.5): the published set
 * made loadable offline, and a pool that keeps 172 validations to seconds.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const { validateXML } = require( "xmllint-wasm" );

const API_V1 = path.resolve( __dirname, "../../../../.fixtures/public/api-v1" );
const SHARED = Object.freeze( [ "NHIS-Commons.xsd", "NHIS-Entities.xsd", "NHIS-Fields.xsd", "NHIS-Nomenclatures.xsd", "xmldsig-core-schema.xsd" ] );
const XMLDSIG_IMPORT = "<xs:import namespace=\"http://www.w3.org/2000/09/xmldsig#\" schemaLocation=\"xmldsig-core-schema.xsd\"/>";

// The published files include each other by his.bg addresses, and xmllint fetches nothing: the addresses become names.
const localised = ( text ) => text.replace( /https:\/\/www\.his\.bg\/api\/v1\//g, "" );

const published = ( name ) => ( { fileName: name, contents: localised( fs.readFileSync( path.join( API_V1, name ), "utf8" ) ) } );

/**
 * The xmldsig schema, as the generated XSDs import it.
 *
 * @returns {{fileName: string, contents: string}}
 */
const xmldsig = () => published( "xmldsig-core-schema.xsd" );

/**
 * A published message XSD and the files it needs, loadable offline. A message file references ds:Signature without
 * importing xmldsig itself — only NHIS-Commons does — and libxml2, like Xerces, will not compile that; the import is
 * added to the message file, the one change made to a published file.
 *
 * @param {string} code
 * @returns {{schema: Array<{fileName: string, contents: string}>, preload: Array<{fileName: string, contents: string}>}}
 */
function publishedSchema( code ) {
    const own = published( `NHIS-${ code }.xsd` );
    own.contents = own.contents.replace( /(<xs:schema[^>]*>)/, `$1${ XMLDSIG_IMPORT }` );
    return { schema: [ own ], preload: SHARED.map( published ) };
}

// An error that is xmldsig's alone: its element is one of xmldsig's and it names no his.bg element. A synthetic
// message's empty ds:Signature is refused by xmldsig itself. Matching the word Signature anywhere also dropped errors
// about his.bg's patientSignature (CodeRabbit on #12), and a missing his.bg element is reported at the ds:Signature that
// follows it ("Expected is ( {https://www.his.bg}patientSignature )"), so the element alone does not decide.
const XMLDSIG_ELEMENT = /Element '\{http:\/\/www\.w3\.org\/2000\/09\/xmldsig#\}/;
const HIS_ELEMENT = /\{https:\/\/www\.his\.bg\}/;
const xmldsigAlone = ( message ) => XMLDSIG_ELEMENT.test( message ) && !HIS_ELEMENT.test( message );

/**
 * Validates a message, returning xmllint's error messages but those that are xmldsig's alone.
 *
 * @param {string} xml
 * @param {{schema: Array<{fileName: string, contents: string}>, preload: Array<{fileName: string, contents: string}>}} schemas
 * @returns {Promise<string[]>}
 */
async function errorsOf( xml, schemas ) {
    const result = await validateXML( { xml: [ { fileName: "message.xml", contents: xml } ], schema: schemas.schema, preload: schemas.preload } );
    return result.errors.map( ( error ) => error.message ).filter( ( message ) => !xmldsigAlone( message ) );
}

/**
 * Runs a few at a time: each call is an xmllint in a worker of its own.
 *
 * @param {Array} items
 * @param {number} size
 * @param {function( * ): Promise<*>} run
 * @returns {Promise<Array>}
 */
async function inBatches( items, size, run ) {
    const results = [];
    for ( let start = 0; start < items.length; start += size ) {
        results.push( ...await Promise.all( items.slice( start, start + size ).map( run ) ) );
    }
    return results;
}

module.exports = { errorsOf, inBatches, publishedSchema, validateXML, xmldsig };
