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
 * It holds exactly what the portal's server was measured to ask of it. The instance's start initializes it and its stop
 * shuts it down (plan 8a, task 3, measurement (a)). Since the studio (plan 9a), the local sign-in keeps its users as a
 * document, read and written whole at the root, and the session store keeps each session as a field of a hash, with an
 * expiry, and a sign-out's "ended" mark as a value that expires (web-framework 1.63.0, CA-587). An anonymous GET of a
 * public page carries no session cookie, so it still touches none of it. Any other member throws, naming itself: a
 * framework release that starts to need one fails a test plainly instead of passing on a stand-in that pretends.
 */

// What the real store keeps is what it was given when it was given it, never the caller's live object.
const copy = ( value ) => value === undefined || value === null ? value : JSON.parse( JSON.stringify( value ) );

// The members the server was measured to use, and nothing more. `clock.now()` is the time every expiry is measured
// against.
const members = ( clock ) => {
    const documents = new Map();
    // A value and each field of a hash as `{ value, expiresAt }`, `expiresAt` in milliseconds or `null` for never.
    const values = new Map();
    const hashes = new Map();

    const at = ( seconds ) => clock.now() + seconds * 1000;
    // An entry whose time has come is gone, as the store would have dropped it: removed when it is next looked at.
    const live = ( entries, key ) => {
        const entry = entries.get( key );
        if ( entry !== undefined && entry.expiresAt !== null && entry.expiresAt <= clock.now() ) {
            entries.delete( key );
            return undefined;
        }
        return entry;
    };
    const fieldsOf = ( key ) => hashes.get( key ) || new Map();

    // A document at its root only: the one path the framework was measured to use. Any other would be a branch of a
    // document, which this does not model, so it is refused rather than answered as if it were the root.
    const atRoot = ( name, path ) => {
        if ( path !== undefined && path !== "$" ) {
            throw new Error( `The portal's test cache keeps documents at their root, "$", only; ${ name } was asked for ${ JSON.stringify( path ) }.` );
        }
    };

    return {
        isOperational: true,
        initialize: async () => {},
        shutDown: async () => {},
        // As RedisJSON answers a query at the root: the document in a list of one, and `null` for no document.
        getJSON: async ( key, path ) => {
            atRoot( "getJSON", path );
            return documents.has( key ) ? [ copy( documents.get( key ) ) ] : null;
        },
        setJSON: async ( key, value, path, overrideMode ) => {
            atRoot( "setJSON", path );
            if ( overrideMode !== undefined && overrideMode !== 0 ) {
                throw new Error( `The portal's test cache replaces a document whole; setJSON was asked for override mode ${ overrideMode }.` );
            }
            documents.set( key, copy( value ) );
        },
        // As both real stores do: a falsy value is not written, and the value given is what the call resolves with.
        setValue: async ( key, value, expiration ) => {
            if ( value ) {
                values.set( key, { value: copy( value ), expiresAt: expiration ? at( expiration ) : null } );
            }
            return value;
        },
        // `undefined` for no value, as both real stores answer.
        getValue: async ( key ) => copy( live( values, key )?.value ),
        // A field written anew holds no expiry until it is given one: the session store gives it one after each write.
        hashSetField: async ( key, field, value ) => {
            hashes.set( key, fieldsOf( key ).set( field, { value: copy( value ), expiresAt: null } ) );
        },
        // `null` for no field, as Redis's provider answers.
        hashGetField: async ( key, field ) => {
            const entry = live( fieldsOf( key ), field );
            return entry === undefined ? null : copy( entry.value );
        },
        // 1 for a field that was there, 0 for none, an expired one included.
        hashDeleteField: async ( key, field ) => {
            const fields = fieldsOf( key );
            const existed = live( fields, field ) !== undefined;
            fields.delete( field );
            return existed ? 1 : 0;
        },
        // A value's expiry, or with `name` the expiry of the field `key` of the hash `name`, as core's contract has it;
        // resolved with the seconds given, as Redis's provider resolves.
        expireValue: async ( key, seconds, name ) => {
            const entries = name ? fieldsOf( name ) : values;
            const entry = live( entries, key );
            if ( entry !== undefined ) {
                entry.expiresAt = at( seconds );
            }
            return seconds;
        }
    };
};

/**
 * Replaces core's cache with the stand-in, for the rest of the process. Call it before anything requires the web
 * server, which reads `cache.instance` when it is used, not when it is loaded.
 *
 * @method
 * @returns {{calls: string[], now: function(): number}} `calls` names every member read, in order: the measurement, kept
 *     for any test to read. `now` is the clock the stand-in's expiries are measured against, in milliseconds; a test
 *     replaces it to move time on.
 * @public
 */
module.exports.installMemoryCache = () => {
    const cache = require( "@ti-engine/core/cache" );
    const calls = [];
    const handle = { calls: calls, now: () => Date.now() };
    const stand = new Proxy( members( { now: () => handle.now() } ), {
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
    return handle;
};
