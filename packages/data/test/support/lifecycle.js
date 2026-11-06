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
 * The people, the moment and the versions the lifecycle's tests share (design record §7). Nothing here is
 * specification data: the versions are the synthetic models of ./models.
 */

const crypto = require( "node:crypto" );
const { checkContent } = require( "@health-dev-portal/importer/check" );
const { approvedStatements, ensureSpec, storeVersion } = require( "#versions" );
const { moduleVersion } = require( "./models" );

/**
 * An editor and an approver, as the staff area will name them; opaque to the data layer.
 *
 * @type {string}
 */
module.exports.ACTOR = "editor@example.test";
module.exports.APPROVER = "approver@example.test";

/**
 * The moment the tests act at: Thursday 5 November 2026, noon in Sofia.
 *
 * @type {Date}
 */
module.exports.NOW = new Date( "2026-11-05T10:00:00Z" );

/**
 * What an editor's edits are made with.
 *
 * @type {{actor: string, now: Date}}
 */
module.exports.BY_EDITOR = Object.freeze( { actor: module.exports.ACTOR, now: module.exports.NOW } );

/**
 * A module as the importer stores it: its derived parts as checkContent makes them, against nothing.
 *
 * @param {string} spec
 * @param {string|null} number
 * @returns {Object}
 */
module.exports.imported = ( spec, number ) => ( { ...checkContent( "module", moduleVersion( number ), { codeLists: [], rules: null, catalogue: null } ).content,
    spec: spec } );

/**
 * A module with no blocking anomaly, which a submission lets through: every element named, the second
 * `contents/note@value` (HEL-19) gone, and no list or rule named, since none is stored. The model, which keeps those
 * defects on purpose, would be refused.
 *
 * @param {string} spec
 * @param {string|null} number
 * @returns {Object}
 */
module.exports.cleanModule = ( spec, number ) => {
    const content = { ...moduleVersion( number ), spec: spec };
    const tidy = ( node ) => {
        node.name = { bg: node.name.bg || "Поле", en: node.name.en || node.tag || "Field" };
        node.codeList = null;
        node.rules = [];
        node.children.forEach( tidy );
    };
    content.messages.forEach( ( message ) => message.elements.forEach( tidy ) );
    content.messages[ 0 ].elements[ 0 ].children.pop();
    return checkContent( "module", content, { codeLists: [], rules: null, catalogue: null } ).content;
};

/**
 * A version in implementation, as an approval leaves it: numbered, with its approved copy taken. Plan 6b's approval
 * makes such a version through review; the tests of what comes before it make one directly.
 *
 * @param {Function} db
 * @param {{spec: string, kind?: string, number: string, content: Object, base?: string}} input
 * @returns {Promise<string>} Its ID.
 */
module.exports.inImplementation = async ( db, input ) => {
    await ensureSpec( db(), input.spec, input.kind || "module" );
    const id = await storeVersion( db(), { spec: input.spec, kind: input.kind || "module", number: input.number, stage: "implementation", content: input.content,
        base: input.base } );
    await db().batch( approvedStatements( id ) );
    return id;
};

/**
 * Puts a version under review in a release of its own, as a submission does.
 *
 * @param {Function} db
 * @param {string} versionId
 * @returns {Promise<string>} The release's ID.
 */
module.exports.putUnderReview = async ( db, versionId ) => {
    const release = crypto.randomUUID();
    await db().run( "INSERT INTO releases ( id, status, created_at ) VALUES ( ?, 'review', ? )", [ release, module.exports.NOW.toISOString() ] );
    await db().run( "UPDATE versions SET release_id = ? WHERE id = ?", [ release, versionId ] );
    return release;
};
