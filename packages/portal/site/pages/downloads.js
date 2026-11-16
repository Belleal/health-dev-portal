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
 * A module version's schema files and downloads (design record §7.7, §7.9; plan 8b, decision 7). A number's address
 * serves the fixed file, made the first time it is asked for and cached forever; a stage's redirects to it. Shaped as
 * plan 8a's code-list downloads: a retired version is a 410, anything else that is no public module version a 404.
 */

const { fixedFile, xmldsigSchema } = require( "@health-dev-portal/data/fixed-files" );
const { findPublished, listPublished } = require( "@health-dev-portal/data/published" );
const { LIFECYCLE, SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { LANGUAGES } = require( "#labels" );
const paths = require( "#paths" );
const { CACHE, gone, notFound, redirect, send } = require( "#responses" );

const XML = "application/xml; charset=utf-8";
const XMLDSIG = "xmldsig-core-schema.xsd";
// Which version's file to look up under which name: the zip and the model by format, a sample by its message.
const NAMES = Object.freeze( { zip: "all.zip", json: "model.json" } );

const codeOf = ( name ) => /^NHIS-([A-Z]\d{3})\.xsd$/.exec( name )[ 1 ];
// Whether a version holds a message that has files: one that is there and not withdrawn (plan 8b, decision 2).
const holds = ( version, code ) => Boolean( version.content ) && version.content.messages.some( ( message ) => message.code === code && message.lifecycle !== LIFECYCLE.WITHDRAWN );

// The public module version an address names, or null; a retired one is returned, for its 410.
const moduleAt = async ( db, spec, at ) => {
    const version = at === null ? null : await findPublished( db, spec, at );
    return version && version.kind === SPEC_KIND.MODULE ? version : null;
};

// The one module whose version at a stage holds a message, or null. A code is in one module only (measured), so two
// would be a data defect: logged, and answered as no file rather than one of the two at random.
const moduleWith = async ( db, stage, code ) => {
    const found = [];
    for ( const spec of ( await listPublished( db ) ).filter( ( one ) => one.kind === SPEC_KIND.MODULE ) ) {
        const version = await findPublished( db, spec.spec, { stage: stage } );
        if ( version && holds( version, code ) ) {
            found.push( version );
        }
    }
    if ( found.length > 1 ) {
        console.error( `Message ${ code } is in ${ found.map( ( version ) => `${ version.spec } ${ version.number }` ).join( " and " ) } at ${ stage }: its stage XSD address answers 404.` );
    }
    return found.length === 1 ? found[ 0 ] : null;
};

// Answers a version that is no file's: a retired one with 410, its notice linking that changelog, as plan 8a's downloads
// do; anything else with 404. True when it answered.
const refused = ( request, response, version ) => {
    if ( version === null ) {
        notFound( request, response );
        return true;
    }
    if ( version.retired ) {
        gone( request, response, paths.changes( LANGUAGES[ 0 ], version.spec ) );
        return true;
    }
    return false;
};

/**
 * Answers `/schemas/{spec}/{number}/{name}` with the fixed file, inline so that a validator reads it as a schema, and
 * `/schemas/{stage}/{name}` with a redirect to the fixed address of the one module whose version at that stage has the
 * message. W3C's xmldsig is served at every set's address and at every stage's, the same bytes.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {import( "#definitions" ).Address} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.schemaFile = async ( context, parts ) => {
    const { db, store, request, response } = context;
    if ( parts.spec === null ) {
        if ( parts.name === XMLDSIG ) {
            send( response, { cache: CACHE.FOREVER, body: xmldsigSchema(), type: XML } );
            return;
        }
        const version = await moduleWith( db, parts.at, codeOf( parts.name ) );
        if ( version === null ) {
            notFound( request, response );
            return;
        }
        redirect( response, { status: 302, location: paths.schemaFile( version.spec, version.number, parts.name ), cache: CACHE.BRIEF } );
        return;
    }
    const version = await moduleAt( db, parts.spec, paths.parseAt( parts.at ) );
    if ( refused( request, response, version ) ) {
        return;
    }
    if ( parts.name === XMLDSIG ) {
        send( response, { cache: CACHE.FOREVER, body: xmldsigSchema(), type: XML } );
        return;
    }
    // The name is looked up among the version's own files, never used as a path.
    const file = await fixedFile( db, store, version.id, parts.name );
    if ( file === null ) {
        notFound( request, response );
        return;
    }
    send( response, { cache: CACHE.FOREVER, body: file.bytes, type: file.type } );
};

/**
 * Answers `/downloads/specs/{spec}/{number}.zip`, `.json` and `/{number}/{code}.xml` with the fixed zip, model or sample,
 * as an attachment named after the spec and the version, and the same at a stage with a redirect to the fixed address.
 *
 * @method
 * @param {import( "#definitions" ).PageContext} context
 * @param {import( "#definitions" ).Address} parts
 * @returns {Promise<void>}
 * @public
 */
module.exports.specDownload = async ( context, parts ) => {
    const { db, store, request, response } = context;
    const at = paths.parseAt( parts.at );
    const version = await moduleAt( db, parts.spec, at );
    if ( refused( request, response, version ) ) {
        return;
    }
    if ( parts.code !== null && !holds( version, parts.code ) ) {
        notFound( request, response );
        return;
    }
    if ( !Object.hasOwn( at, "number" ) ) {
        const location = parts.code === null ? paths.specDownload( parts.spec, version.number, parts.ext ) : paths.sampleDownload( parts.spec, version.number, parts.code );
        redirect( response, { status: 302, location: location, cache: CACHE.BRIEF } );
        return;
    }
    const file = await fixedFile( db, store, version.id, parts.code === null ? NAMES[ parts.ext ] : `${ parts.code }.xml` );
    if ( file === null ) {
        notFound( request, response );
        return;
    }
    // Saved under the spec and the version, not as `1.5.1.zip`, which says nothing of the module (plan 8a, final review M4).
    // Every part is one the address parser has checked, so none can end the quoted name.
    const name = parts.code === null ? `${ parts.spec }-${ version.number }.${ parts.ext }` : `${ parts.spec }-${ version.number }-${ parts.code }.xml`;
    send( response, { cache: CACHE.FOREVER, body: file.bytes, type: file.type, headers: { "Content-Disposition": `attachment; filename="${ name }"` } } );
};
