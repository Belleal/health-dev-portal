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
 * The real business-rules 1.1.1 workbook, as published. Every expected value here was measured on 2026-10-19 with a
 * prototype independent of this code (design record §4.6.1, HEL-16); a failure means the importer and the measurement
 * disagree.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { readWorkbook } = require( "#workbook-reader" );
const { importRulesWorkbook } = require( "#rules-importer" );

const FIXTURE = path.resolve( __dirname, "../../../.fixtures/public/rules-1.1.1.xlsx" );
const PRESENT = fs.existsSync( FIXTURE );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "The public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

describe( "Business rules 1.1.1, the published workbook", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let result;

    before( async () => {
        result = importRulesWorkbook( await readWorkbook( FIXTURE ), { fileName: "НЗИС - API Бизнес Правила - Спецификация v1.1.1.xlsx" } );
    } );

    it( "reads the version and the whole change history", () => {
        assert.equal( result.version.version, "1.1.1" );
        assert.equal( result.version.changeNotes.length, 17 );
        assert.equal( result.version.changeNotes.reduce( ( sum, version ) => sum + version.notes.length, 0 ), 125 );
    } );

    it( "reads 97 rules with their status from the ID cell's fill", () => {
        const rules = result.version.rules;
        assert.equal( rules.length, 97 );
        assert.deepEqual( [ rules.filter( ( rule ) => rule.lifecycle === "active" ).length, rules.filter( ( rule ) => rule.lifecycle === "withdrawn" ).length ], [ 88, 9 ] );
        assert.deepEqual( rules.filter( ( rule ) => rule.lifecycle === "active" && rule.changedInVersion ).map( ( rule ) => rule.id ), [ "RL092" ] );
        assert.deepEqual( rules.filter( ( rule ) => rule.lifecycle === "withdrawn" ).map( ( rule ) => rule.id ),
            [ "RL019", "RL020", "RL033", "RL043", "RL044", "RL046", "RL052", "RL053", "RL075" ] );
        assert.ok( rules.filter( ( rule ) => rule.lifecycle === "withdrawn" ).every( ( rule ) => rule.definition.bg === null ) );
        assert.ok( rules.every( ( rule ) => rule.errorCode === "E002" || rule.errorCode === null ) );
    } );

    it( "imports with no blocking anomaly and reports the known source defects as warnings (HEL-16)", () => {
        assert.deepEqual( result.anomalies.filter( ( anomaly ) => anomaly.level === "blocking" ), [] );
        const tally = result.anomalies.reduce( ( counts, anomaly ) => ( { ...counts, [ anomaly.type ]: ( counts[ anomaly.type ] || 0 ) + 1 } ), {} );
        assert.deepEqual( tally, { "look-alike-letter": 11, "rule-without-definition": 2 } );
        assert.deepEqual( result.anomalies.filter( ( anomaly ) => anomaly.type === "rule-without-definition" ).map( ( anomaly ) => anomaly.details.id ),
            [ "RL096", "RL097" ] );
    } );
} );
