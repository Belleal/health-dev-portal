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
 * The studio's web application manager (plan 9a): the staff area the framework serves at `/studio/`, its screens at
 * `/app/:view` and its services at `POST /app/:service`. The portal server names this module in `application.classPath`,
 * and the framework constructs it with no arguments, so it reaches the database through `#studio/context`, never
 * through the server.
 */

const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );

/**
 * The studio. Its screens come with the tasks that build them; until then it is the framework's shell alone, with its
 * sign-in screen.
 *
 * @class StudioManager
 * @extends TiWebAppManager
 * @public
 */
class StudioManager extends TiWebAppManager {

    /**
     * @constructor
     */
    constructor() {
        super( "studio" );
    }
}

module.exports = StudioManager;
