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

const { SPEC_KIND } = require( "#kinds" );

// A list ID as a whole word. Measured on 1.5.33: "CL50" (1.5.6) is no ID, and a note names at most four lists.
const LIST_ID = /\bCL\d{3}\b/g;

/**
 * The code lists a change note names: the IDs it contains that are lists of the workbook, in order of first
 * appearance, each once. An ID of a list the workbook does not have names nothing, so a typo cannot create a spec.
 *
 * @method
 * @param {string} text
 * @param {Set<string>} ids The workbook's list IDs.
 * @returns {string[]}
 * @public
 */
module.exports.namedLists = ( text, ids ) => [ ...new Set( text.match( LIST_ID ) || [] ) ].filter( ( id ) => ids.has( id ) );

// A change version holding only the given notes; its dates and source stay, so each list keeps when the change shipped.
const keeping = ( change, notes ) => ( { ...change, notes: notes } );

/**
 * Splits the combined nomenclatures into one version per code list (design record §4.6, Boris 2026-11-03). Each list's
 * version takes the combined number, and its history holds only the change versions with a note naming it, and only
 * those notes. A note naming several lists goes to each. Notes naming none stay with the combined spec's history.
 *
 * Lists and notes are the workbook's own objects, not copies: a note's category and source stay as read.
 *
 * @method
 * @param {import( "#definitions" ).NomenclaturesVersion} version
 * @returns {import( "#definitions" ).NomenclaturesSplit}
 * @public
 */
module.exports.splitNomenclatures = ( version ) => {
    const ids = new Set( version.codeLists.map( ( list ) => list.id ) );
    const history = new Map( version.codeLists.map( ( list ) => [ list.id, [] ] ) );
    const combined = [];
    for ( const change of version.changeNotes ) {
        const perList = new Map();
        const unnamed = [];
        for ( const note of change.notes ) {
            const lists = module.exports.namedLists( note.text, ids );
            if ( lists.length === 0 ) {
                unnamed.push( note );
            }
            for ( const id of lists ) {
                perList.set( id, [ ...( perList.get( id ) || [] ), note ] );
            }
        }
        for ( const [ id, notes ] of perList ) {
            history.get( id ).push( keeping( change, notes ) );
        }
        if ( unnamed.length ) {
            combined.push( keeping( change, unnamed ) );
        }
    }
    return {
        lists: version.codeLists.map( ( list ) => ( { kind: SPEC_KIND.CODE_LIST, spec: list.id, version: version.version, list: list, changeNotes: history.get( list.id ) } ) ),
        combined: combined
    };
};
