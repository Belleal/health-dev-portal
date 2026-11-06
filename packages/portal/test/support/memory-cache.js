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
 * The cache a portal test runs on instead of Redis (plan 8a, decision 12). ti-engine exports no stand-in, and a path
 * past its exports map is not allowed, so this replaces core's exported `cache.instance`, which every part of the
 * framework reads through, before the web server is required.
 *
 * It holds exactly what the portal's server was measured to ask of it (task 3, measurement (a)): the instance's start
 * initializes it, its stop shuts it down, and nothing else touches it — an anonymous GET carries no session cookie, so
 * the session store is never read, and with the message exchange, the health check and the jobs timer off nothing else
 * runs. Any other member throws, naming itself: a framework release that starts to need one fails a test plainly
 * instead of passing on a stand-in that pretends.
 */

// The members the server was measured to use, and nothing more.
const members = () => ( {
    isOperational: true,
    initialize: async () => {},
    shutDown: async () => {}
} );

/**
 * Replaces core's cache with the stand-in, for the rest of the process. Call it before anything requires the web
 * server, which reads `cache.instance` when it is used, not when it is loaded.
 *
 * @method
 * @returns {{calls: string[]}} The name of every member read, in order: the measurement, kept for any test to read.
 * @public
 */
module.exports.installMemoryCache = () => {
    const cache = require( "@ti-engine/core/cache" );
    const calls = [];
    const stand = new Proxy( members(), {
        get: ( target, name ) => {
            // A symbol is the runtime looking (inspection, iteration); `then` is a promise check. Neither is a use.
            if ( typeof name === "symbol" || name === "then" ) {
                return undefined;
            }
            calls.push( name );
            if ( Object.hasOwn( target, name ) ) {
                return target[ name ];
            }
            return () => {
                throw new Error( `The portal's test cache has no "${ name }": the server was measured to need only ${ Object.keys( target ).join( ", " ) }. `
                    + "A framework release that needs more is a change to measure, then to add here." );
            };
        }
    } );
    Object.defineProperty( cache, "instance", { value: stand, configurable: true, writable: true, enumerable: true } );
    return { calls: calls };
};
