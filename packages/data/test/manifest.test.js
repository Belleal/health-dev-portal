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
 * The migration's manifest (design record §7.11): which workbook goes to which spec and stage.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { readManifest } = require( "#manifest" );

const written = ( manifest, files = [ "n.xlsx", "r.xlsx", "p.xlsx", "p2.xlsx" ] ) => {
    const directory = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-manifest-" ) );
    files.forEach( ( file ) => fs.writeFileSync( path.join( directory, file ), "" ) );
    fs.mkdirSync( path.join( directory, "api-v1" ) );
    const file = path.join( directory, "migration.json" );
    fs.writeFileSync( file, JSON.stringify( manifest ) );
    return { directory: directory, file: file };
};
const production = ( file ) => ( { file: file, stage: "production" } );

describe( "readManifest", () => {

    it( "resolves every file against the manifest's directory", () => {
        const { directory, file } = written( { xsd: "api-v1", nomenclatures: [ production( "n.xlsx" ) ], rules: [ production( "r.xlsx" ) ],
            modules: [ { spec: "e-prescription", ...production( "p.xlsx" ) }, { spec: "e-prescription", file: "p2.xlsx", stage: "testing" } ] } );
        const manifest = readManifest( file );
        assert.equal( manifest.xsd, path.join( directory, "api-v1" ) );
        assert.deepEqual( manifest.nomenclatures, [ { file: path.join( directory, "n.xlsx" ), stage: "production" } ] );
        assert.deepEqual( manifest.modules.map( ( entry ) => [ entry.spec, path.basename( entry.file ), entry.stage ] ),
            [ [ "e-prescription", "p.xlsx", "production" ], [ "e-prescription", "p2.xlsx", "testing" ] ] );
    } );

    it( "takes missing rules and modules as none", () => {
        const manifest = readManifest( written( { nomenclatures: [ production( "n.xlsx" ) ] } ).file );
        assert.deepEqual( [ manifest.xsd, manifest.rules, manifest.modules ], [ null, [], [] ] );
    } );

    it( "refuses a stage outside the three, naming the entry", () => {
        assert.throws( () => readManifest( written( { nomenclatures: [ production( "n.xlsx" ) ], modules: [ { spec: "e-prescription", file: "p.xlsx", stage: "staging" } ] } ).file ),
            { name: "TypeError", message: /modules\[0\].*staging/ } );
    } );

    it( "refuses two workbooks of one spec in one stage", () => {
        assert.throws( () => readManifest( written( { nomenclatures: [ production( "n.xlsx" ) ],
            modules: [ { spec: "e-prescription", ...production( "p.xlsx" ) }, { spec: "e-prescription", ...production( "p2.xlsx" ) } ] } ).file ),
        { name: "TypeError", message: /modules\[1\].*e-prescription.*production/ } );
    } );

    it( "needs the production nomenclatures", () => {
        assert.throws( () => readManifest( written( { nomenclatures: [ { file: "n.xlsx", stage: "testing" } ] } ).file ), { name: "TypeError", message: /production nomenclatures/ } );
    } );

    it( "refuses a file that is not there", () => {
        assert.throws( () => readManifest( written( { nomenclatures: [ production( "missing.xlsx" ) ] } ).file ), { name: "TypeError", message: /nomenclatures\[0\].*missing\.xlsx/ } );
    } );

    it( "refuses a module without a spec key", () => {
        assert.throws( () => readManifest( written( { nomenclatures: [ production( "n.xlsx" ) ], modules: [ production( "p.xlsx" ) ] } ).file ), { name: "TypeError", message: /modules\[0\]/ } );
    } );
} );
