#!/usr/bin/env node

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
 * hdp-status: staff set the environments' status and announce maintenance windows (plan 8c, decision 6; design record
 * §8.7), until the staff area's form replaces it (plan 9). It runs the schema's migrations first, as hdp-copy does for
 * its target, so it works on a database that has not had the status tables yet.
 */

const { parseArgs } = require( "node:util" );
const { carriesPassword, openDatabase } = require( "#database" );
const { migrateSchema } = require( "#schema" );
const { ENVIRONMENTS, STATES, addMaintenance, cancelMaintenance, currentStatus, maintenanceWindows, setStatus } = require( "#status" );

const USAGE = `Usage: hdp-status [--database <url>] <command>
  show
  set --environment <${ ENVIRONMENTS.join( "|" ) }> --state <${ STATES.join( "|" ) }> [--bg <text> --en <text>] --by <who>
  window add --environment <${ ENVIRONMENTS.join( "|" ) }> --from <time> --to <time> [--bg <text> --en <text>] --by <who>
  window cancel --id <id> --by <who>
The database comes from --database or HDP_DATABASE_URL. A time carries its offset, such as 2026-11-20T22:00+02:00.
--by names who makes the change; it is kept for staff and never shown on the site.`;

// A time with its offset, or Z. A bare local time is refused: in Sofia one hour each October happens twice, so it names
// no single moment.
const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

// A refusal the person can act on from its message: printed with the usage's exit code, never as a stack.
class UsageError extends Error {}

const timeOf = ( value, option ) => {
    if ( typeof value !== "string" || !WITH_OFFSET.test( value ) || Number.isNaN( Date.parse( value ) ) ) {
        throw new UsageError( `--${ option } must be a time with its offset, such as 2026-11-20T22:00+02:00, not ${ JSON.stringify( value ?? "" ) }.` );
    }
    return new Date( value );
};

const messageOf = ( values ) => {
    if ( values.bg === undefined && values.en === undefined ) {
        return null;
    }
    if ( values.bg === undefined || values.en === undefined ) {
        throw new UsageError( "Give a message in both languages, --bg and --en, or neither." );
    }
    return { bg: values.bg, en: values.en };
};

const required = ( values, ...names ) => {
    for ( const name of names ) {
        if ( typeof values[ name ] !== "string" || values[ name ].trim() === "" ) {
            throw new UsageError( `--${ name } is required${ name === "by" ? ": who makes the change, kept for staff" : "" }.` );
        }
    }
};

const messageLine = ( message ) => message === null ? "" : ` — ${ message.bg } / ${ message.en }`;

const show = async ( db ) => {
    for ( const one of await currentStatus( db ) ) {
        console.log( one.state === null ? `${ one.environment }: not reported` : `${ one.environment }: ${ one.state } since ${ one.updatedAt }${ messageLine( one.message ) }` );
    }
    const windows = await maintenanceWindows( db, { now: new Date() } );
    console.log( windows.length === 0 ? "No maintenance window to come." : "Maintenance windows:" );
    for ( const one of windows ) {
        console.log( `  ${ one.id }  ${ one.environment } ${ one.startsAt } → ${ one.endsAt }${ messageLine( one.message ) }` );
    }
    return 0;
};

// Each command's options, and what it does with them. A RangeError from the store is a refusal of what was given.
const COMMANDS = Object.freeze( {
    show: { options: {}, act: ( db ) => show( db ) },
    set: {
        options: { environment: { type: "string" }, state: { type: "string" }, bg: { type: "string" }, en: { type: "string" }, by: { type: "string" } },
        act: async ( db, values ) => {
            required( values, "environment", "state", "by" );
            const id = await setStatus( db, { environment: values.environment, state: values.state, message: messageOf( values ), by: values.by } );
            console.log( `Set ${ values.environment } to ${ values.state }: update ${ id }.` );
            return 0;
        }
    },
    "window add": {
        options: { environment: { type: "string" }, from: { type: "string" }, to: { type: "string" }, bg: { type: "string" }, en: { type: "string" },
            by: { type: "string" } },
        act: async ( db, values ) => {
            required( values, "environment", "by" );
            const id = await addMaintenance( db, { environment: values.environment, startsAt: timeOf( values.from, "from" ), endsAt: timeOf( values.to, "to" ),
                message: messageOf( values ), by: values.by } );
            console.log( `Announced window ${ id } for ${ values.environment }.` );
            return 0;
        }
    },
    "window cancel": {
        options: { id: { type: "string" }, by: { type: "string" } },
        act: async ( db, values ) => {
            required( values, "id", "by" );
            if ( !await cancelMaintenance( db, values.id, { by: values.by } ) ) {
                console.error( `No window ${ values.id } to cancel: none has that ID, or it was cancelled already.` );
                return 1;
            }
            console.log( `Cancelled window ${ values.id }.` );
            return 0;
        }
    }
} );

// Every option of every command: the arguments are parsed once with all of them, which tells an option's value from a
// command's word, and then each option given is checked against the command's own.
const OPTIONS = Object.freeze( Object.assign( { database: { type: "string" } }, ...Object.values( COMMANDS ).map( ( one ) => one.options ) ) );

async function main( argv ) {
    let command;
    let values;
    try {
        const parsed = parseArgs( { args: argv, allowPositionals: true, options: OPTIONS } );
        const words = parsed.positionals;
        const name = words[ 0 ] === "window" ? `window ${ words[ 1 ] ?? "" }`.trim() : words[ 0 ];
        if ( name === undefined || !Object.hasOwn( COMMANDS, name ) || words.length > name.split( " " ).length ) {
            throw new UsageError( name === undefined ? "Name a command." : `There is no command "${ words.join( " " ) }".` );
        }
        command = COMMANDS[ name ];
        values = parsed.values;
        const stray = Object.keys( values ).find( ( option ) => option !== "database" && !Object.hasOwn( command.options, option ) );
        if ( stray !== undefined ) {
            throw new UsageError( `--${ stray } does not apply to ${ name }.` );
        }
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    // The URL may carry a password: it is handed to the driver and never printed (design record §10.1). Given as an
    // argument, it shows in process listings and shell history, as hdp-migrate warns.
    if ( values.database && carriesPassword( values.database ) ) {
        console.error( "--database carries a password, which shows in process listings and shell history: pass the URL in HDP_DATABASE_URL instead." );
    }
    const url = values.database || process.env.HDP_DATABASE_URL;
    if ( !url ) {
        console.error( USAGE );
        return 2;
    }
    const db = await openDatabase( url );
    try {
        await migrateSchema( db );
        return await command.act( db, values );
    } catch ( error ) {
        if ( error instanceof UsageError || error instanceof RangeError ) {
            console.error( error.message );
            return 2;
        }
        throw error;
    } finally {
        await db.close();
    }
}

main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    console.error( error.stack );
    process.exitCode = 1;
} );
