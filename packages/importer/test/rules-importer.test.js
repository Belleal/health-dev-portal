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
 * A whole business-rules workbook.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { importRulesWorkbook } = require( "#rules-importer" );
const { rulesSheets } = require( "./support/fixtures" );

describe( "importRulesWorkbook", () => {

    it( "imports a rules workbook, its version from the change notes", () => {
        const result = importRulesWorkbook( { sheets: rulesSheets( [ "RL001", "RL002" ] ), themeColours: {} }, { fileName: "НЗИС - API Бизнес Правила - Спецификация v1.1.1.xlsx" } );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( [ result.version.kind, result.version.spec, result.version.version, result.version.rules.map( ( rule ) => rule.id ) ],
            [ "rules", "rules", "1.1.1", [ "RL001", "RL002" ] ] );
        assert.ok( Object.isFrozen( result.version.rules[ 0 ] ) );
    } );

    it( "blocks a workbook without a Rules sheet", () => {
        const result = importRulesWorkbook( { sheets: rulesSheets().filter( ( raw ) => raw.name !== "Rules" ), themeColours: {} } );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.sheet ] ), [ [ "missing-sheet", "Rules" ] ] );
    } );
} );
