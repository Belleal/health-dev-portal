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
 * One check for every move (design record §7.1, §4.8; plan 6b, decision 8): over the state after everything moving
 * together has moved, each refusal names the version and the rule.
 */

const { before, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { checkContent } = require( "@health-dev-portal/importer/check" );
const { migrateSchema } = require( "#schema" );
const { ensureSpec, storeVersion } = require( "#versions" );
const { memoryStore } = require( "#files" );
const { recheckVersion } = require( "#editing" );
const { checkMove } = require( "#moves" );
const { eachDatabase } = require( "./support/databases" );
const { codeListVersion, moduleVersion } = require( "./support/models" );

const rules = ( result ) => result.refusals.map( ( refusal ) => [ refusal.version, refusal.rule ] );

// A module that names one list and nothing else — lrn, its value attribute and the coded dose variant — and whose
// condition compares lrn's value with `value`, which must be one of the list's keys. The model's own CL035 and RL001 are
// dropped, so a version stored without anomalies carries none it would otherwise have. Its condition's parsed form and
// bindings are made from the new text, as the importer makes them; the model's are for another text.
const naming = ( spec, number, list, value ) => {
    const content = { ...moduleVersion( number ), spec: spec };
    const children = content.messages[ 0 ].elements[ 0 ].children;
    children[ 0 ].codeList = list;
    children[ 0 ].rules = [];
    children[ 0 ].children[ 0 ].codeList = list;
    children[ 1 ].children[ 1 ].codeList = list;
    content.conditions[ 0 ].text = `IF 'contents.lrn'.value = '${ value }'\nTHEN 'contents.note'.required = 'R'`;
    return checkContent( "module", content, { codeLists: null, rules: null, catalogue: null } ).content;
};
const listOf = ( spec, keys, number ) => codeListVersion( spec, keys, number );

eachDatabase( "Moves", ( db ) => {

    const store = memoryStore();
    const versions = {};
    // A version stored as the portal would hold it: content and anomalies checked against what it reads in its stage.
    const stored = async ( spec, kind, stage, number, content, anomalies ) => {
        await ensureSpec( db(), spec, kind );
        const id = await storeVersion( db(), { spec: spec, kind: kind, number: number, stage: stage, content: content, anomalies: anomalies || [] } );
        if ( stage === "development" ) {
            await recheckVersion( db(), store, id );
        }
        return id;
    };

    before( async () => {
        await migrateSchema( db() );
        // e-Prescription: production 1.5.1, testing 1.6.0, and a development version.
        versions.production = await stored( "e-prescription", "module", "production", "1.5.1", naming( "e-prescription", "1.5.1", "CL009", "1" ) );
        versions.testing = await stored( "e-prescription", "module", "testing", "1.6.0", naming( "e-prescription", "1.6.0", "CL009", "1" ) );
        versions.development = await stored( "e-prescription", "module", "development", null, naming( "e-prescription", null, "CL009", "1" ) );
        // CL009: production without key 3, development with it; e-Needs, in development only, compares lrn with 3.
        versions.cl009 = await stored( "CL009", "code-list", "production", "1.5.33", listOf( "CL009", [ "1", "2" ], "1.5.33" ) );
        versions.cl009Next = await stored( "CL009", "code-list", "development", null, listOf( "CL009", [ "1", "2", "3" ], null ) );
        versions.needs = await stored( "e-needs", "module", "development", null, naming( "e-needs", null, "CL009", "3" ) );
        // e-Carried, in testing, already compares with a key production's CL009 lacks: a defect it was published with.
        const carried = naming( "e-carried", "1.0.0", "CL009", "3" );
        const lists = [ listOf( "CL009", [ "1", "2" ], "1.5.33" ).list ];
        versions.carried = await stored( "e-carried", "module", "testing", "1.0.0", carried,
            checkContent( "module", carried, { codeLists: lists, rules: null, catalogue: null } ).anomalies );
        // CL050 keyed by integers in production, by strings in testing; e-Keyed names it, in production and in testing.
        versions.cl050 = await stored( "CL050", "code-list", "production", "1.0.0", listOf( "CL050", [ "1", "2" ], "1.0.0" ) );
        versions.cl050Next = await stored( "CL050", "code-list", "testing", "1.1.0", listOf( "CL050", [ "A", "B" ], "1.1.0" ) );
        versions.keyed = await stored( "e-keyed", "module", "production", "1.0.0", naming( "e-keyed", "1.0.0", "CL050", "1" ) );
        versions.keyedNext = await stored( "e-keyed", "module", "testing", "1.1.0", naming( "e-keyed", "1.1.0", "CL050", "A" ) );
        // CL060 withdraws key 3 in testing; e-Reader, in production, compares with 3.
        versions.cl060 = await stored( "CL060", "code-list", "production", "1.0.0", listOf( "CL060", [ "1", "2", "3" ], "1.0.0" ) );
        versions.cl060Next = await stored( "CL060", "code-list", "testing", "1.1.0", listOf( "CL060", [ "1", "2" ], "1.1.0" ) );
        versions.reader = await stored( "e-reader", "module", "production", "1.0.0", naming( "e-reader", "1.0.0", "CL060", "3" ) );
    } );

    it( "refuses a skipped stage and a busy line, naming the version and the rule", async () => {
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.development, to: "testing" } ] ) ), [ [ versions.development, "skip" ] ] );
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.development, to: "implementation" } ] ) ), [ [ versions.development, "one-line" ] ] );
    } );

    it( "refuses two versions of one spec in one stage, and lets a version replace the one it moves past", async () => {
        // Testing 1.6.0 goes to production, where 1.5.1 gives way to previous production.
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.testing, to: "production" } ] ) ), [] );
        // e-Double's implementation version would join its testing version there, which stays.
        await stored( "e-double", "module", "testing", "2.0.0", naming( "e-double", "2.0.0", "CL009", "1" ) );
        const building = await stored( "e-double", "module", "implementation", "2.1.0", naming( "e-double", "2.1.0", "CL009", "1" ) );
        assert.deepEqual( rules( await checkMove( db(), [ { version: building, to: "testing" } ] ) ), [ [ building, "one-per-stage" ] ] );
    } );

    it( "refuses a module that needs a key only a list in development has, unless the list moves with it", async () => {
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.needs, to: "implementation" } ] ) ), [ [ versions.needs, "link" ] ] );
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.needs, to: "implementation" }, { version: versions.cl009Next, to: "implementation" } ] ) ),
            [] );
    } );

    it( "does not refuse an anomaly the module already carried", async () => {
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.carried, to: "production" } ] ) ), [] );
    } );

    it( "holds a list whose key type changed until a version of each module that names it moves too", async () => {
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.cl050Next, to: "production" } ] ) ), [ [ versions.cl050Next, "key-type" ] ] );
        assert.deepEqual( rules( await checkMove( db(), [ { version: versions.cl050Next, to: "production" }, { version: versions.keyedNext, to: "production" } ] ) ), [] );
    } );

    it( "warns of a reader that names a key the moving list withdrew, and does not refuse", async () => {
        const result = await checkMove( db(), [ { version: versions.cl060Next, to: "production" } ] );
        assert.deepEqual( rules( result ), [] );
        assert.deepEqual( result.warnings.map( ( warning ) => [ warning.version, warning.reader, warning.anomaly.type ] ),
            [ [ versions.cl060Next, versions.reader, "unknown-condition-value" ] ] );
    } );
} );
