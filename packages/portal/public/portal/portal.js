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
 * The portal's one script (plan 8a, decision 6; design record §8.5). Every page is whole without it: the tree is
 * rendered fully expanded, an element is selected by its link, and a filter is a GET form. It adds two things only, to
 * markup a page renders hidden, because without the script those controls would do nothing:
 *
 * - "Copy link": a `<button class="copy" data-copy="<address>" data-copied="<text>" hidden>`. It copies the address,
 *   made absolute against the page's, and says `data-copied` for a moment.
 * - Collapsing: in a tree, each row is `<tr data-depth="<n>">`, and a row with nested rows holds
 *   `<button class="twisty" data-toggle aria-expanded="true" aria-label="…" hidden>`, which hides or shows them.
 */

"use strict";

( () => {
    for ( const button of document.querySelectorAll( "button[data-copy]" ) ) {
        button.hidden = false;
        button.addEventListener( "click", () => {
            const address = new URL( button.dataset.copy || window.location.href, window.location.href ).href;
            const said = button.textContent;
            navigator.clipboard.writeText( address ).then( () => {
                button.textContent = button.dataset.copied || said;
                window.setTimeout( () => {
                    button.textContent = said;
                }, 2000 );
            } ).catch( () => {
                // Refused, as on a page not served over HTTPS: the address bar still holds the same address.
            } );
        } );
    }

    const depthOf = ( row ) => Number( row.dataset.depth );

    for ( const button of document.querySelectorAll( "button[data-toggle]" ) ) {
        const row = button.closest( "tr[data-depth]" );
        if ( !row ) {
            continue;
        }
        button.hidden = false;
        button.addEventListener( "click", () => {
            const expanding = button.getAttribute( "aria-expanded" ) === "false";
            button.setAttribute( "aria-expanded", String( expanding ) );
            // Collapsing hides every nested row. Expanding shows them again, except those under a nested row that is
            // itself still collapsed, which stay hidden until it is expanded.
            let hiddenBelow = Infinity;
            for ( let next = row.nextElementSibling; next && depthOf( next ) > depthOf( row ); next = next.nextElementSibling ) {
                if ( !expanding ) {
                    next.hidden = true;
                    continue;
                }
                if ( depthOf( next ) > hiddenBelow ) {
                    continue;
                }
                next.hidden = false;
                const nested = next.querySelector( "button[data-toggle]" );
                hiddenBelow = nested && nested.getAttribute( "aria-expanded" ) === "false" ? depthOf( next ) : Infinity;
            }
        } );
    }
} )();
