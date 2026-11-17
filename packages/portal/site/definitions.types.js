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
 * @property {Content} content The guides and the questions, read at start (plan 8c).
 * @property {function( string|null ): Promise<SearchResults>} search The server's search (`search.createSearch`), on this
 *     request's database.
 * @property {string|null} lang The page's language; `null` for a download, which has none.
 * @property {Object} request Express's.
 * @property {Object} response Express's; a page sends through responses.js.
 * @property {string} nonce The response's CSP nonce, for `layout.page`.
 * @property {string} today The date in Sofia when the request came, `yyyy-mm-dd` (design record §7.12).
 */

/**
 * @typedef {Object} Address An address as `paths.parseAddress` reads it: the page and its parameters.
 * @property {string|null} lang `null` for a download or a schema file.
 * @property {string} page `language` (`/bg`, which redirects to `/bg/`), `home`, `specs`, `spec`, `conditions`,
 *     `dictionary`, `message`, `lists`, `list`, `download`, `schema-file`, `spec-download`, `errors`, `changes`,
 *     `compare` or `feed`.
 * @property {string} [name] A schema file's name: `NHIS-{code}.xsd` or `xmldsig-core-schema.xsd`.
 * @property {string} [spec] A module's key, `rules`, or — under changes — a code list's ID; `null` for the changes index
 *     and the feed of everything.
 * @property {string} [at] A public stage slug or a number, as written: `paths.parseAt` reads it.
 * @property {string} [code] A message's code.
 * @property {string} [tab] `elements`, `conditions` or `changes`.
 * @property {string|null} [slug] The selected element's slug, as `paths.elementSlugs` gives it.
 * @property {string} [id] A code list's ID.
 * @property {{q: string|null, expired?: boolean, page?: number}} [query] A list's filter, expired entries and page.
 * @property {string} [ext] A download's format: `json` or `csv` for a code list; `zip`, `json` or, for a sample, `xml`
 *     for a module version.
 * @property {boolean} [testing] Whether the errors page is testing's.
 * @property {string} [from] The comparison's older number.
 * @property {string} [to] The comparison's newer number.
 */

/**
 * @typedef {Object} ShownVersion The spec version an address names, as its page shows it (`pages/version.findShown`).
 * @property {import( "@health-dev-portal/data/definitions" ).PublishedVersion & {content: Object}} version Public, not
 *     retired, with its content.
 * @property {boolean} fixed Whether the address names it by number: its fixed address (decision 3).
 * @property {string} cache Its `Cache-Control`: a minute, at a fixed address as at a stage's, since the page links each
 *     list as it is now and names the stages around it (design record §10.3).
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

/**
 * @typedef {Object} ContentSource An old document a guide was written from, or the one a planned guide links meanwhile.
 * @property {string} title
 * @property {string} version
 * @property {string} url An https:// address.
 */

/**
 * @typedef {Object} GuideText A guide in one language (plan 8c, decision 2).
 * @property {string} title
 * @property {string} summary
 * @property {string} updated `yyyy-mm-dd`.
 * @property {import( "@ti-engine/web-content/html" ).SafeString} html The body, rendered.
 * @property {Array<{id: string, title: string}>} contents Its level-two headings, in order, each with its id.
 * @property {string} plain The body's Markdown without the heading ids' marks, for search.
 */

/**
 * @typedef {Object} Guide A guide in the register, with its text in each language.
 * @property {string} slug
 * @property {boolean} aiAssisted
 * @property {string|null} reviewed The date the solution architect reviewed it, `yyyy-mm-dd`; `null` for a draft.
 * @property {ContentSource[]} sources
 * @property {{bg: GuideText, en: GuideText|null}} texts
 */

/**
 * @typedef {Object} PlannedGuide A guide not yet written (plan 8c, decision 4).
 * @property {string} slug
 * @property {import( "@health-dev-portal/spec-model/definitions" ).LocalText} title
 * @property {ContentSource|null} legacy The old his.bg document that covers it meanwhile.
 */

/**
 * @typedef {Object} FaqEntry A question and its answer, in each language (plan 8c, decision 5).
 * @property {string} slug Its anchor on the FAQ page.
 * @property {{bg: {question: string, html: import( "@ti-engine/web-content/html" ).SafeString, plain: string},
 *     en: {question: string, html: import( "@ti-engine/web-content/html" ).SafeString, plain: string}|null}} texts
 */

/**
 * @typedef {Object} FaqCategory
 * @property {string} key
 * @property {import( "@health-dev-portal/spec-model/definitions" ).LocalText} name
 * @property {FaqEntry[]} questions In the register's order.
 */

/**
 * @typedef {Object} Content Everything `content/` holds, as `content.loadContent` reads it.
 * @property {Guide[]} guides In the register's order.
 * @property {PlannedGuide[]} planned
 * @property {{source: string, retrieved: string, categories: FaqCategory[]}} faq Where the questions came from, when.
 */

/**
 * @typedef {Object} SearchEntry One thing the site's search can find (plan 8c, decision 7), with what its link is made of.
 * @property {string} kind One of `search.KINDS`.
 * @property {string|null} spec A spec's key or a code list's ID; `null` for a guide or a question.
 * @property {string|null} stage `testing` or `production`, the stage it was indexed at.
 * @property {string|null} code A message's code (an element's message's too), a condition's or a rule's ID, a list's ID,
 *     or an error's key.
 * @property {string|null} slug A guide's or a question's slug, or an element's.
 * @property {import( "@health-dev-portal/spec-model/definitions" ).LocalText} title A language may be `null`.
 * @property {import( "@health-dev-portal/spec-model/definitions" ).LocalText|null} text
 * @property {string} terms What is the same in both languages: an element's path, a condition's text.
 * @property {string} folded Everything above that is searched, folded.
 * @property {string} foldedTitle The code and the title, folded.
 * @property {string|null} foldedCode
 */

/**
 * @typedef {Object} SearchResults
 * @property {string} query The query as searched: trimmed, its spaces collapsed.
 * @property {string} state `empty`, `short`, `long` or `done`.
 * @property {Array<{kind: string, total: number, entries: SearchEntry[]}>} groups In `search.KINDS` order, each with 20
 *     entries at most.
 */

module.exports = {};
