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

/**
 * @typedef {Object} Statement One parameterised SQL statement, written in the subset of design record §3.2.
 * @property {string} sql With `?` placeholders.
 * @property {Array<string|number|null>} params
 */

/**
 * @typedef {Object} Database What every driver offers (design record §3.2). There is no transaction a caller can hold
 *     open: the only atomic unit is a batch, as with D1 over HTTP. Rows are plain objects.
 * @property {string} dialect `sqlite` or `postgres`.
 * @property {function( string, Array=): Promise<Object[]>} all
 * @property {function( string, Array=): Promise<Object|null>} get The first row, or `null`.
 * @property {function( string, Array=): Promise<{changes: number}>} run
 * @property {function( Statement[] ): Promise<Array<{changes: number}>>} batch All or nothing.
 * @property {function(): Promise<void>} close
 */

/**
 * @typedef {Object} FileStore Files named by the lower-case hex SHA-256 of their bytes (design record §3.3).
 * @property {function( Uint8Array ): Promise<string>} put Stores the bytes once, and returns their hash.
 * @property {function( string ): Promise<Buffer|null>} get `null` for a hash it does not have.
 * @property {function( string ): Promise<boolean>} has
 */

/**
 * @typedef {Object} ManifestEntry One workbook of a migration (design record §7.11).
 * @property {string} file Resolved against the manifest's directory.
 * @property {string} stage `production`, `testing` or `development`.
 */

/**
 * @typedef {Object} Manifest Which workbook goes to which spec and stage.
 * @property {string|null} xsd The published XSD set's directory, for the blueprints.
 * @property {ManifestEntry[]} nomenclatures One at production at least.
 * @property {ManifestEntry[]} rules
 * @property {Array<ManifestEntry & {spec: string}>} modules
 */

/**
 * @typedef {Object} StageImport What `importSet` gave for one stage, holding only the workbooks at that stage; each is
 *     `{ version, anomalies }`.
 * @property {Object|null} nomenclatures
 * @property {Object|null} rules
 * @property {Object[]} modules
 */

/**
 * @typedef {Object} MigrationReport What a migration did.
 * @property {Array<{spec: string, number: string|null, stage: string}>} stored
 * @property {Array<{spec: string, number: string|null, stage: string}>} skipped Already stored with the same content.
 * @property {number} specs The specs the run covered.
 * @property {number} retired Retired versions of history created.
 * @property {number} entries Changelog entries kept.
 * @property {{blocking: number, warning: number}} anomalies Those stored now.
 */

/**
 * @typedef {Object} ItemRow One item of a version's content, as stored (design record §3.2).
 * @property {number} item_no From 1, in document order when stored; an item inserted later takes the version's
 *     `next_item_no`, never a number used before, and keeps it however it moves (plan 6a, decision 3).
 * @property {string} kind `message`, `element`, `condition`, `dictionary`, `condition-binding`, `blueprint-binding`, `list`,
 *     `column`, `entry` or `rule`.
 * @property {string|null} identity Its key within the version; indexed, not unique (HEL-19).
 * @property {number|null} parent_no
 * @property {number} position_no Among its siblings, from 0.
 * @property {string} data The model object's own fields as JSON, without its children.
 * @property {string} hash SHA-256 of `data`.
 * @property {number} [revision] From 1, raised by one each time its data changes, and each time an editor's edit names it
 *     — a `move` included (design record §7.4). A place changed by anything else — a sibling's insert, removal or move, a
 *     carried change, a workbook — is not content, and keeps it (plan 6a, decision 3). Present when loaded with
 *     `loadItems`.
 */

/**
 * @typedef {Object} Edit One change an editor makes to one item (plan 6a, decision 2).
 * @property {string} op `update`, `insert`, `remove` or `move`.
 * @property {number} [item] The item changed; not for an insert.
 * @property {number} [revision] The revision the editor saw; not for an insert.
 * @property {string} [kind] What an insert adds: `message`, `element`, `condition`, `dictionary`, `column`, `entry` or
 *     `rule`.
 * @property {number|null} [parent] Where an insert or a move goes; `null` at the top.
 * @property {number} [position] Its place among its siblings, from 0.
 * @property {Object} [data] An update's or an insert's own fields; any children it carries are left out.
 */

/**
 * @typedef {Object} Conflict An approved change upstream to an item the development version had also changed (design
 *     record §7.8, plan 6a decision 10). Each data is the item's own fields, or `null` where it was not there.
 * @property {string} id
 * @property {string} version The development version's ID.
 * @property {string} key The item's key.
 * @property {Object|null} base Before the approved change.
 * @property {Object|null} upstream After it.
 * @property {Object|null} current In development, when the change came.
 * @property {number|null} revision The development item's revision now, which a choice is made against; `null` when
 *     development does not have it.
 */

/**
 * @typedef {Object} Round One submission of a release and its decision (design record §7.4).
 * @property {string} id
 * @property {number} number From 1.
 * @property {string} submittedBy
 * @property {string} submittedAt ISO time.
 * @property {string|null} decision `approved` or `returned`; `null` while under review.
 * @property {string|null} decidedBy
 * @property {string|null} decidedAt
 * @property {Array<{version: string, contentHash: string|null, changelog: Object[]}>} versions Each version's changelog
 *     as submitted.
 * @property {Array<{id: string, number: number, version: string|null, target: string|null, text: string, author: string,
 *     at: string}>} comments `version` and `target` are `null` for the release as a whole; `target` is an item key or
 *     `changelog:<entry id>`.
 */

/**
 * @typedef {Object} Release A package of spec versions that move through the stages together (design record §7.3).
 * @property {string} id
 * @property {string} status `review`, `returned`, `accepted` or `abandoned`.
 * @property {{bg: string|null, en: string|null}} summary
 * @property {number|null} noticeDays
 * @property {string|null} plannedOn The planned production date, `yyyy-mm-dd` in Sofia.
 * @property {string} createdAt
 * @property {Array<{id: string, spec: string, kind: string, number: string|null, stage: string, frozen: boolean,
 *     base: string|null, anomalies: Object[], pending: Object[]|null}>} versions `pending` is the difference from a version
 *     in implementation's approved content to its current one, which a round there is reviewed by; `null` elsewhere.
 * @property {Round[]} rounds
 * @property {Array<{number: number, event: string, actor: string, at: string, version: string|null, details: Object}>} events
 */

/**
 * @typedef {Object} ReleaseSummary A release in a queue (design record §7.4).
 * @property {string} id
 * @property {string} status
 * @property {{bg: string|null, en: string|null}} summary
 * @property {string|null} plannedOn
 * @property {{number: number, submittedBy: string, submittedAt: string, decision: string|null}|null} round The last.
 * @property {Array<{id: string, spec: string, number: string|null, stage: string}>} versions
 */

/**
 * @typedef {Object} Move A version moving to its next stage (design record §7.1).
 * @property {string} version The version's ID.
 * @property {string} to The stage it moves to.
 * @property {string} [replaces] For a fix moving to testing, the testing version it replaces, which retires.
 */

/**
 * @typedef {Object} Refusal Why a move is refused (design record §7.3: the refusal says which version and which rule).
 * @property {string} version The version's ID.
 * @property {string} spec
 * @property {string} rule `skip`, `one-per-stage`, `one-line`, `link` or `key-type` from the move check; `number`,
 *     `pending`, `waiting`, `date` or `previous` from an approval or a promotion.
 * @property {string} message
 * @property {import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]} [anomalies] For `link`, those the move
 *     would introduce.
 */

/**
 * @typedef {Object} Warning A module that will read a moving list and names something the list no longer has (design
 *     record §4.8); it is shown and does not refuse.
 * @property {string} version The moving list version's ID.
 * @property {string} spec The list.
 * @property {string} reader The module version's ID.
 * @property {import( "@health-dev-portal/spec-model/definitions" ).Anomaly} anomaly
 */

/**
 * @typedef {Object} EditResult What a batch of edits did.
 * @property {Object<number, number>} revisions Each kept item whose revision went up, by number: those edited, and those
 *     whose derived fields the check changed.
 * @property {number[]} inserted The numbers the inserts took, in edit order.
 * @property {import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]} anomalies The version's anomalies now.
 */

/**
 * @typedef {Object} VersionContent A version's content: a `ModuleVersion`, `CodeListVersion` or `RulesVersion` without
 *     `changeNotes`, which the changelog keeps (design record §4.7). Its `version` is the stored number.
 */

/**
 * @typedef {Object} StoredVersion A version as the database holds it.
 * @property {string} id
 * @property {string} spec
 * @property {string} kind One of `SPEC_KIND`.
 * @property {string|null} number `null` in development (design record §7.2).
 * @property {string} stage One of `STAGE`.
 * @property {boolean} frozen
 * @property {string|null} release
 * @property {string|null} base The version a development version started from (§7.5).
 * @property {string|null} contentHash `null` for a version kept only for its changelog.
 * @property {VersionContent|null} [content] Present when loaded with `loadVersion`.
 */

/**
 * @typedef {Object} PublishedVersion A public version as the site shows it (plan 8a, decision 2): no actor, author,
 *     submitter, decider, anomaly or staff comment is ever part of it.
 * @property {string} id
 * @property {string} spec
 * @property {string} kind One of `SPEC_KIND`.
 * @property {string} number
 * @property {string} stage `testing`, `production`, `previous-production` or `retired`.
 * @property {boolean} frozen
 * @property {string|null} expiresOn For previous production, the date its backward compatibility ends.
 * @property {string|null} enteredOn The date it entered its stage, `yyyy-mm-dd` in Sofia, when that was recorded.
 * @property {boolean} retired
 * @property {string|null} replacedBy The number of the public fix that replaced it.
 */

/**
 * @typedef {Object} PublishedSpec A spec's public versions.
 * @property {string} spec
 * @property {string} kind
 * @property {PublishedVersion|null} testing
 * @property {PublishedVersion|null} production
 * @property {PublishedVersion|null} previousProduction
 */

/**
 * @typedef {Object} PublishedEntry A changelog entry as the site shows it; `before` and `after` are parsed.
 * @property {string} origin One of `CHANGE_ORIGIN`.
 * @property {{kind: string, identity: string|null}|null} target
 * @property {string|null} aspect For a detected entry, what changed: `added`, `removed`, `moved` or a field name; `null` for one written by hand or imported.
 * @property {*} before
 * @property {*} after
 * @property {{bg: string|null, en: string|null}} text
 */

/**
 * @typedef {Object} PublishedChangelogVersion One public version in a spec's changelog.
 * @property {string} number
 * @property {string} stage
 * @property {string|null} enteredTesting
 * @property {string|null} enteredProduction
 * @property {string|null} replacedBy
 * @property {boolean} abandoned Whether its release was abandoned after it reached testing.
 * @property {{breaking: PublishedEntry[], "dropped-plan": PublishedEntry[], "non-breaking": PublishedEntry[]}} entries
 *     Without the entries an editor dropped.
 */

module.exports = {};
