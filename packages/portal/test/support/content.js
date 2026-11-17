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
 * Content folders built in code (plan 8c, decision 9): a test writes exactly the files it is about, so no broken file —
 * and no front matter that is code — is ever committed.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );

const folders = [];

/**
 * A new temporary content folder holding exactly these files.
 *
 * @method
 * @param {Object<string, string>} files Each file's text, by its path under the folder, such as `faq/one.bg.md`.
 * @returns {string} The folder.
 * @public
 */
module.exports.contentFolder = ( files ) => {
    const root = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-content-" ) );
    folders.push( root );
    for ( const [ name, text ] of Object.entries( files ) ) {
        fs.mkdirSync( path.dirname( path.join( root, name ) ), { recursive: true } );
        fs.writeFileSync( path.join( root, name ), text );
    }
    return root;
};

/**
 * Removes every folder `contentFolder` made, for a test file's `after`.
 *
 * @method
 * @returns {void}
 * @public
 */
module.exports.removeContentFolders = () => {
    for ( const root of folders.splice( 0 ) ) {
        fs.rmSync( root, { recursive: true, force: true } );
    }
};

/**
 * A front matter that would run code if it were parsed (plan 8c, decision 3): it sets `globalThis.__contentRan`.
 *
 * @type {string}
 * @public
 */
module.exports.CODE_FRONT_MATTER = "---js\n{ question: ( globalThis.__contentRan = true, \"x\" ) }\n---\nОтговор.";

/**
 * A small register and the files it names: one guide in Bulgarian only, and one question.
 *
 * @type {Object<string, string>}
 * @public
 */
module.exports.SMALL_CONTENT = Object.freeze( {
    "content.yml": `guides:
  - slug: only-bulgarian
    aiAssisted: false
    sources: []
planned: []
faq:
  source: "https://www.his.bg/bg/dev/faq"
  retrieved: "2026-11-17"
  categories:
    - key: general
      name: { bg: "Общи", en: "General" }
      questions: [ one ]
`,
    "guides/only-bulgarian.bg.md": "---\ntitle: Само на български\nsummary: Кратко.\nupdated: 2026-11-17\n---\n## Раздел {#part}\n\nТекст.\n",
    "faq/one.bg.md": "---\nquestion: Въпрос?\n---\nОтговор.\n"
} );
