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
 * The studio's context (plan 9a): the database and the file store the portal server opened, which the studio's handlers
 * reach without the server passing them through every call. The server attaches them when it starts and detaches them
 * when it stops.
 */

/**
 * Holds what the studio's handlers share. A getter with nothing attached throws, so a handler that runs before the
 * server has started fails with its cause rather than with a property read on `undefined`.
 *
 * @class StudioContext
 * @public
 */
class StudioContext {

    #db = null;
    #store = null;

    /**
     * Attaches the database and the file store.
     *
     * @method
     * @param {Object} parts
     * @param {Object} parts.db The portal's database.
     * @param {Object} parts.store The portal's file store.
     * @returns {void}
     * @public
     */
    attach( { db, store } ) {
        this.#db = db;
        this.#store = store;
    }

    /**
     * Lets go of both, as the server stops.
     *
     * @method
     * @returns {void}
     * @public
     */
    detach() {
        this.#db = null;
        this.#store = null;
    }

    /**
     * @returns {Object} The attached database.
     * @throws {Error} When nothing is attached.
     * @public
     */
    get db() {
        if ( this.#db === null ) {
            throw new Error( "The studio's context is not attached: the portal server has not started, or has stopped." );
        }
        return this.#db;
    }

    /**
     * @returns {Object} The attached file store.
     * @throws {Error} When nothing is attached.
     * @public
     */
    get store() {
        if ( this.#store === null ) {
            throw new Error( "The studio's context is not attached: the portal server has not started, or has stopped." );
        }
        return this.#store;
    }
}

/**
 * The studio's one context.
 *
 * @type {StudioContext}
 * @public
 */
module.exports.instance = Object.freeze( new StudioContext() );
