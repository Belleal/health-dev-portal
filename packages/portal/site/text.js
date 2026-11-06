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
 * A model's texts on a page (plan 8a, decision 5; design record §4.9, §8.4). The model keeps a missing translation as
 * `null`, never as the other language, so the page decides what a reader sees instead.
 */

const { html } = require( "@ti-engine/web-content/html" );
const { label, otherLanguage } = require( "#labels" );

const DASH = "—";

// A blank text is as missing as a null one: an empty cell in a workbook must not show as an empty cell on a page.
const present = ( text ) => typeof text === "string" && text.trim() !== "";

/**
 * A model text in the page's language. When that is missing, the other language's text in `<span lang="…">`, so a
 * screen reader reads it in its own language, with a visible "not yet translated" in the page's language, in both
 * directions; "—" when neither is there.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).LocalText|null} value
 * @param {string} lang
 * @returns {import( "@ti-engine/web-content/html" ).SafeString} Escaped.
 * @throws {RangeError} For a language the site does not have.
 * @public
 */
module.exports.localText = ( value, lang ) => {
    const other = otherLanguage( lang );
    if ( value && present( value[ lang ] ) ) {
        return html`${ value[ lang ] }`;
    }
    if ( value && present( value[ other ] ) ) {
        return html`<span lang="${ other }">${ value[ other ] }</span> <span class="untranslated">${ label( lang, "untranslated" ) }</span>`;
    }
    return html`${ DASH }`;
};

/**
 * A model text in one column of a bilingual table, such as a list's description in Bulgarian beside its description in
 * English: the column's own language, or "—", with no marker, since the other column is right beside it.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).LocalText|null} value
 * @param {string} lang The column's language.
 * @returns {import( "@ti-engine/web-content/html" ).SafeString} Escaped.
 * @throws {RangeError} For a language the site does not have.
 * @public
 */
module.exports.columnText = ( value, lang ) => {
    otherLanguage( lang );
    return html`${ value && present( value[ lang ] ) ? value[ lang ] : DASH }`;
};
