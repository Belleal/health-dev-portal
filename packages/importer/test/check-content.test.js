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
 * One check for a workbook and an edit (design record §5.4): what an edited version is checked by is the importer's own
 * code, so an edit cannot pass what an import would have refused.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { checkContent } = require( "#check-content" );

const NONE = Object.freeze( { codeLists: null, rules: null, catalogue: null } );
const text = ( bg ) => ( { bg: bg, en: null } );
// An element as an editor makes it: no source, since it was never read from a sheet.
const field = ( tag, extra = {} ) => ( {
    identity: `contents/${ tag }`, path: `contents/${ tag }`, depth: 1, kind: "field", name: text( tag ), requirement: "R", cardinality: { min: 1, max: 1 },
    dataType: "String", constraint: null, fixedValue: null, defaultValue: null, rules: [], conditions: [], codeList: null, tag: tag, attribute: null,
    description: text( null ), source: null, children: [], ...extra
} );
const moduleOf = ( fields, conditions = [] ) => ( {
    kind: "module", spec: "e-prescription", version: null,
    messages: [ { code: "P001", title: text( "Съобщение" ), address: "/v1/p001", direction: "request", sender: null, recipient: null, pairedWith: null, source: null,
        lifecycle: "active", changedInVersion: null, elements: [ { ...field( "contents" ), identity: "contents", path: "contents", depth: 0, kind: "group", dataType: null,
            children: fields } ] } ],
    conditions: conditions, conditionBindings: [], blueprintBindings: [], dictionary: []
} );
const list = ( id, keys ) => ( { id: id, name: text( id ), status: "in-use", dynamic: null, visibility: null, remark: null, notes: [], keyType: "string", columns: [],
    entries: keys.map( ( key ) => ( { key: key, description: text( key ), display: text( null ), values: [], since: null, validUntil: null, source: null } ) ), source: null } );

describe( "checkContent", () => {

    it( "checks a module the way the importer does", () => {
        const content = moduleOf( [ field( "lrn", { conditions: [ "CDP09" ] } ), field( "x" ), field( "x" ) ] );
        const { anomalies } = checkContent( "module", content, NONE );
        assert.deepEqual( anomalies.map( ( anomaly ) => anomaly.type ).sort(), [ "duplicate-identity", "unknown-condition" ] );
    } );

    it( "recomputes a condition's parsed form and bindings from its text", () => {
        const content = moduleOf( [ field( "lrn", { conditions: [ "CDP01" ] } ), field( "note", { requirement: "C", cardinality: { min: 0, max: 1 } } ) ], [
            { id: "CDP01", text: "IF 'contents.lrn'.value IS NOT null\nTHEN 'contents.note'.required = 'R'", source: null, parsed: null, printed: null }
        ] );
        // An editor rewrites the condition; its parsed form and printed text were the old one's.
        content.conditions[ 0 ].text = "IF 'contents.lrn'.value IS null\nTHEN 'contents.note'.required = 'R'";
        const checked = checkContent( "module", content, NONE ).content;
        assert.notEqual( checked.conditions[ 0 ].parsed, null );
        assert.equal( checked.conditions[ 0 ].printed, "IF 'contents.lrn'.value IS null\nTHEN 'contents.note'.required = 'R'" );
        assert.deepEqual( checked.conditionBindings.map( ( binding ) => [ binding.condition, binding.element ] ), [ [ "CDP01", "contents/lrn" ] ] );
    } );

    it( "finds a repeated key and recomputes a list's key type", () => {
        const content = { kind: "code-list", spec: "CL009", version: null, list: list( "CL009", [ "1", "2", "2" ] ) };
        const checked = checkContent( "code-list", content, NONE );
        assert.equal( checked.content.list.keyType, "integer" );
        assert.deepEqual( checked.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.key ] ), [ [ "duplicate-key", "2" ] ] );
    } );

    it( "checks a value against the list it names, through the targets", () => {
        const content = moduleOf( [ field( "code", { codeList: "CL009", fixedValue: "99" } ) ] );
        const { anomalies } = checkContent( "module", content, { codeLists: [ list( "CL009", [ "1", "2" ] ) ], rules: null, catalogue: null } );
        assert.deepEqual( anomalies.map( ( anomaly ) => anomaly.type ), [ "fixed-value-not-a-key" ] );
    } );

    it( "finds a repeated rule and an active rule without a definition", () => {
        const rule = ( id, definition ) => ( { id: id, definition: text( definition ), sourceText: null, errorCode: null, since: null, lifecycle: "active",
            changedInVersion: null, source: null } );
        const { anomalies } = checkContent( "rules", { kind: "rules", spec: "rules", version: null, rules: [ rule( "RL001", "Правило" ), rule( "RL001", "Друго" ),
            rule( "RL002", null ) ] }, NONE );
        assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.id ] ), [ [ "duplicate-rule", "RL001" ], [ "rule-without-definition", "RL002" ] ] );
    } );
} );
