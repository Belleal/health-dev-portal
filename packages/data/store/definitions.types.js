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

module.exports = {};
