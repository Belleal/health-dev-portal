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
 * How the studio refuses a request (plan 9a): a 422 whose `details` is a label key, which the framework's notification
 * looks up in the person's language and shows as the second line. A raw English sentence there reaches a Bulgarian screen
 * as English, so every refusal the studio raises goes through here.
 */

const exceptions = require( "@ti-engine/core/exceptions" );

// What a data-layer `RangeError` says, by label key. The data layer's sentences are read by `hdp-status` and other
// scripts, so they stay as they are and are recognised here; a sentence not listed passes through as the raw text, which
// is still a reason, only in English, rather than being hidden.
const STORE_REASONS = Object.freeze( [
    [ /^A status message is given in both languages/, "studio.refused.message-both-languages" ],
    [ /ends after it starts/, "studio.refused.window-ends-first" ],
    [ /is not an environment/, "studio.refused.unknown-environment" ],
    [ /is not a state/, "studio.refused.unknown-state" ],
    [ /is not a time\.$/, "studio.refused.time-invalid" ],
    [ /is not a role/, "studio.refused.unknown-role" ],
    [ /holds for every spec/, "studio.refused.role-every-spec" ],
    [ /is not a spec\.$/, "studio.refused.unknown-spec" ],
    [ /holds every spec or named ones/, "studio.refused.editor-both" ],
    [ /is not a person who has signed in/, "studio.refused.unknown-person" ],
    [ /A set of grants is a list/, "studio.refused.grants-not-list" ],
    [ /records who made it/, "studio.refused.no-author" ]
] );

/**
 * A 422 for a request the studio refuses.
 *
 * @method
 * @param {string} details A label key under `studio.refused`, or text with no key.
 * @returns {Error} To throw.
 * @public
 */
module.exports.refuse = ( details ) => exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_BODY, { details: details }, exceptions.httpCode.C_422 );

/**
 * The refusal for a `RangeError` the data layer or `sofiaInstant` raised; any other error is returned as it is.
 *
 * @method
 * @param {Error} error
 * @returns {Error} To throw: a 422 whose `details` is the reason's label key when it is known (an error's own `reason`
 *     first, then the data layer's sentence), and the raw sentence when it is not.
 * @public
 */
module.exports.refusalOf = ( error ) => {
    if ( !( error instanceof RangeError ) ) {
        return error;
    }
    if ( typeof error.reason === "string" ) {
        return module.exports.refuse( error.reason );
    }
    const known = STORE_REASONS.find( ( [ pattern ] ) => pattern.test( error.message ) );
    return module.exports.refuse( known ? known[ 1 ] : error.message );
};
