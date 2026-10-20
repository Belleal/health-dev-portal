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
 * The package as npm installs it. `npm ci` links only the commands the lock file records, so a command added to
 * package.json without regenerating the lock is not installed — and `npx <command>` then goes looking for it on the
 * public registry (final review of plan 2).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const read = ( file ) => JSON.parse( fs.readFileSync( path.resolve( __dirname, file ), "utf8" ) );

// npm records "./bin/x.js" as "bin/x.js".
const normalised = ( bins ) => Object.fromEntries( Object.entries( bins ).map( ( [ name, file ] ) => [ name, path.posix.normalize( file ) ] ) );

describe( "the importer package", () => {

    it( "records every command it declares in the lock file", () => {
        const declared = read( "../package.json" ).bin;
        const locked = read( "../../../package-lock.json" ).packages[ "packages/importer" ].bin;
        assert.deepEqual( normalised( locked ), normalised( declared ) );
    } );
} );
