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
 * A statement broke a constraint of the schema, on whichever database. `constraint` is the name of a named `CHECK`,
 * which both databases report; for a unique, primary or foreign key it is `null`, since SQLite names the columns and
 * PostgreSQL the index, and no caller may rely on either.
 *
 * @public
 */
class ConstraintError extends Error {

    /**
     * @param {string} message
     * @param {string|null} constraint
     * @param {Error} cause
     */
    constructor( message, constraint, cause ) {
        super( message, { cause: cause } );
        this.name = "ConstraintError";
        this.constraint = constraint;
    }
}

module.exports.ConstraintError = ConstraintError;
