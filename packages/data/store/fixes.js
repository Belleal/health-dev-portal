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

const { sofiaDate } = require( "@health-dev-portal/spec-model/dates" );
const { RELEASE_EVENT, STAGE } = require( "@health-dev-portal/spec-model/kinds" );
const { acceptsNumber, proposeNumber } = require( "@health-dev-portal/spec-model/numbers" );
const { ConstraintError } = require( "#database" );
const { authorOf } = require( "#editing" );
const { PromotionRefusedError } = require( "#moves" );
const { eventStatement } = require( "#releases" );
const { findVersion, loadAnomalies, loadVersion, storeVersion } = require( "#versions" );

const busy = ( version ) => new PromotionRefusedError( [ { version: version.id, spec: version.spec, rule: "one-line",
    message: `${ version.spec } already has a version in implementation; a fix waits for it (§7.1).` } ] );

/**
 * Creates a fix of a version in testing (design record §7.1): a new version in implementation, in the same release
 * (§7.3), with the testing version's content and anomalies, that version as its base and as the one it replaces, and
 * the number the approver gave or the next proposed. Its content is its approved copy, so the editors' changes to it
 * are pending until a round of the release approves them. The testing version stays in testing until the fix is
 * promoted, which retires it.
 *
 * @method
 * @param {import( "#definitions" ).Database} db
 * @param {import( "#definitions" ).FileStore} store Where the blueprint catalogue is.
 * @param {string} testingVersionId
 * @param {{number?: string, actor: string, now: Date}} input
 * @returns {Promise<string>} The fix's ID.
 * @throws {PromotionRefusedError} With `one-line` while the spec has a version in implementation, or `number` for a
 *     number the spec cannot take.
 * @throws {TypeError} For a version not in testing, or no author.
 * @public
 */
module.exports.createFix = async ( db, store, testingVersionId, input ) => {
    const author = authorOf( input );
    const testing = await loadVersion( db, testingVersionId );
    if ( !testing || testing.stage !== STAGE.TESTING ) {
        throw new TypeError( `Version ${ testingVersionId } is not in testing: only a version in testing is fixed (§7.1).` );
    }
    if ( await findVersion( db, testing.spec, { stage: STAGE.IMPLEMENTATION } ) ) {
        throw busy( testing );
    }
    const used = ( await db.all( "SELECT number FROM versions WHERE spec_id = ? AND number IS NOT NULL", [ testing.spec ] ) ).map( ( row ) => row.number );
    const number = input.number !== undefined ? input.number : proposeNumber( used );
    if ( !acceptsNumber( number, used ) ) {
        throw new PromotionRefusedError( [ { version: testing.id, spec: testing.spec, rule: "number", message: `${ number } is not above every number ${ testing.spec } has used (§7.2).` } ] );
    }
    try {
        return await storeVersion( db, { spec: testing.spec, kind: testing.kind, number: number, stage: STAGE.IMPLEMENTATION, content: { ...testing.content, version: number },
            anomalies: await loadAnomalies( db, testing.id ), release: testing.release, base: testing.id, replaces: testing.id, approved: true,
            stages: [ { stage: STAGE.IMPLEMENTATION, enteredOn: sofiaDate( author.now ) } ],
            also: ( id ) => [ eventStatement( { release: testing.release, version: id, event: RELEASE_EVENT.FIX_CREATED, author: author,
                details: { number: number, replaces: testing.id } } ) ] } );
    } catch ( error ) {
        // Two fixes at once: the one-per-stage index lets one through, and the other is told so as if it had come second.
        if ( error instanceof ConstraintError && await findVersion( db, testing.spec, { stage: STAGE.IMPLEMENTATION } ) ) {
            throw busy( testing );
        }
        throw error;
    }
};
