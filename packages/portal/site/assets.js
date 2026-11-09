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
 * The portal's own assets by their content (plan 8a, decision 6; design record §10.3). The framework serves the public
 * folder under /static and answers a request whose `?v=` is the first 12 hex digits of the file's SHA-256 as
 * `immutable`; it writes that `?v=` into its own fragments only, so the portal writes it into its pages here, by the
 * same rule. A request without it is revalidated, as any stable name is.
 */

const crypto = require( "node:crypto" );
const fs = require( "node:fs" );
const path = require( "node:path" );

/**
 * The folder the framework serves under /static: the server's `publicPath`.
 *
 * @type {string}
 * @public
 */
module.exports.PUBLIC_DIRECTORY = path.resolve( __dirname, "..", "public" );

/**
 * The one stylesheet, under the public folder.
 *
 * @type {string}
 * @public
 */
module.exports.STYLESHEET = "portal/portal.css";

/**
 * The one script, under the public folder.
 *
 * @type {string}
 * @public
 */
module.exports.SCRIPT = "portal/portal.js";

// Hashed once per process: the files change only with a release, and a release is a new process. A file edited under a
// running server keeps its old `?v=`, which the framework then answers as revalidating, so it is never served stale.
const fingerprints = new Map();

/**
 * An asset's address with its content hash, as a page links it.
 *
 * @method
 * @param {string} name Its path under the public folder, such as `portal/portal.css`.
 * @returns {string} `/static/<name>?v=<first 12 hex digits of its SHA-256>`.
 * @throws {Error} When the file cannot be read: a page linking a missing asset is a broken release.
 * @public
 */
module.exports.assetPath = ( name ) => {
    if ( !fingerprints.has( name ) ) {
        const bytes = fs.readFileSync( path.join( module.exports.PUBLIC_DIRECTORY, name ) );
        fingerprints.set( name, crypto.createHash( "sha256" ).update( bytes ).digest( "hex" ).slice( 0, 12 ) );
    }
    return `/static/${ name }?v=${ fingerprints.get( name ) }`;
};
