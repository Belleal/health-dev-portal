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
 * The studio's own words (plan 9a), laid under the application's labels with the framework's catalogue call. It is
 * required for its effect, before the manager answers anything: the portal's start configures one labels path, and the
 * studio's texts are not in it.
 */

const localization = require( "@ti-engine/core/localization" );
const catalogue = require( "./labels.json" );

localization.addCatalogue( catalogue );

/**
 * The catalogue that was added: leaves are `{ bg, en }`, under `studio` and the topbar's title of the landing screen.
 *
 * @type {Object}
 * @public
 */
module.exports = catalogue;
