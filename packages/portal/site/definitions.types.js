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
 * @typedef {Object} PageContext What every page is given (plan 8a, ruling P3).
 * @property {import( "@health-dev-portal/data/definitions" ).Database} db
 * @property {import( "@health-dev-portal/data/definitions" ).FileStore} store
 * @property {string|null} lang The page's language; `null` for a download, which has none.
 * @property {Object} request Express's.
 * @property {Object} response Express's; a page sends through responses.js.
 * @property {string} nonce The response's CSP nonce, for `layout.page`.
 * @property {string} today The date in Sofia when the request came, `yyyy-mm-dd` (design record §7.12).
 */

/**
 * @typedef {Object} Address An address as `paths.parseAddress` reads it: the page and its parameters.
 * @property {string|null} lang `null` for a download.
 * @property {string} page `home`, `specs`, `spec`, `conditions`, `dictionary`, `message`, `lists`, `list`, `download`,
 *     `errors`, `changes`, `compare` or `feed`.
 * @property {string} [spec] A module's key, `rules`, or — under changes — a code list's ID; `null` for the changes index
 *     and the feed of everything.
 * @property {string} [at] A public stage slug or a number, as written: `paths.parseAt` reads it.
 * @property {string} [code] A message's code.
 * @property {string} [tab] `elements`, `conditions` or `changes`.
 * @property {string|null} [slug] The selected element's slug, as `paths.elementSlugs` gives it.
 * @property {string} [id] A code list's ID.
 * @property {{q: string|null, expired?: boolean, page?: number}} [query] A list's filter, expired entries and page.
 * @property {string} [ext] A download's format, `json` or `csv`.
 * @property {boolean} [testing] Whether the errors page is testing's.
 * @property {string} [from] The comparison's older number.
 * @property {string} [to] The comparison's newer number.
 */

/**
 * @typedef {Object} ShownVersion The spec version an address names, as its page shows it (`pages/version.findShown`).
 * @property {import( "@health-dev-portal/data/definitions" ).PublishedVersion & {content: Object}} version Public, not
 *     retired, with its content.
 * @property {boolean} fixed Whether the address names it by number: its fixed address (decision 3).
 * @property {string} cache Its `Cache-Control`: a day at a fixed address, a minute at a stage's (decision 4).
 */

/**
 * @typedef {Object} ElementMarkers How a message differs from production's, element by element (decision 7; design
 *     record §8.3), as `pages/message-tree.elementMarkers` gives it.
 * @property {Map<Object, string>} marks Each current element that differs: `new` or `changed`.
 * @property {Map<string, Array<{key: string, node: Object}>>} removed The elements production has and this version does
 *     not, by the item key of their former parent, in production's document order.
 * @property {Map<Object, string>} keys Each current element's item key, as `itemKeys` names it.
 * @property {string} root The message's own key: the former parent of a removed top-level element.
 * @property {import( "@health-dev-portal/spec-model/definitions" ).Difference[]} differences The message's differences
 *     from production's, in `compareContents`' order.
 */

module.exports = {};
