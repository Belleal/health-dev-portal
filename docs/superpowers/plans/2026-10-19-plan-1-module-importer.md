# Plan 1 — Repository foundation, spec model and module-workbook importer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read a НЗИС module specification workbook (e.g. e-Prescription) into the specification model, with every
anomaly reported at its sheet, row and cell — runnable as `hdp-import-module --spec <key> <workbook.xlsx>`.

**Architecture:** An npm-workspaces monorepo. `@health-dev-portal/spec-model` is pure (no I/O): kinds, identities, the
anomaly catalogue, structural validation. `@health-dev-portal/importer` reads a workbook with exceljs into plain
"raw" sheets (values plus the formatting that carries meaning), then pure stages turn raw sheets into the model and a
list of anomalies. A thin CLI prints the report and writes the model as JSON.

**Tech Stack:** Node 24, CommonJS, `node --test`, exceljs 4.4.0, ESLint 10, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md)
— §3.5 (layout), §4.1–4.3 (model), §5 (importer), §5.7 (measured exceljs behaviour). Tracking: **HEL-13**.

## Where this plan sits

The design is implemented as a series of plans, each producing working, testable software:

| # | Plan | Builds on |
|---|---|---|
| **1** | **Repository foundation, spec model, module-workbook importer** (this plan) | — |
| 2 | Nomenclatures and rules workbooks (streaming reader), cross-spec linking | 1 |
| 3 | Conditions language: parser, path resolution, model checks, evaluator; importer integration | 1, 2 |
| 4 | XSD import, XSD generation, round-trip drift report | 1–3 |
| 5 | Data layer (SQLite / PostgreSQL), slots, releases, freezing, change detection | 1–4 |
| 6 | ti-engine SQL and file gateways (in `Belleal/ti-engine`) | — |
| 7 | Public site: pages, search, languages, environment status | 5 |
| 8 | Staff area: Entra ID, upload (hardened), approval, go-live, status form | 5, 7 |
| 9 | Message tester in the browser, XSD-equivalence corpus in CI | 3, 4, 7 |
| 10 | Cloudflare deployment | 6–8 |

Each later plan is written when its predecessor is merged, against the code as it then is.

## Global Constraints

- **Node 24** (`.nvmrc` holds `24`); every `package.json` declares `"engines": { "node": ">=24" }`.
- **CommonJS** (`require` / `module.exports`), **four-space indent**, double quotes, semicolons, **spaces inside
  parentheses, brackets and braces**: `foo( a, b )`, `[ 1, 2 ]`, `{ key: value }`.
- **JSDoc on everything exported**: prose first, then `@param` / `@returns` / `@throws`, then `@public`.
- **`#alias` imports** inside a package (its `imports` map); **`exports` map** across packages.
- **`spec-model` stays pure**: no `require` of `node:` modules, no I/O.
- **exceljs is pinned exactly: `4.4.0`** — the version §5.7 was measured with.
- **Never commit unpublished specification data.** Fixtures are synthetic (built in code) or public files fetched into
  the git-ignored `.fixtures/` by `npm run fixtures:fetch`.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Identity format** (spec §4.3): tag path joined with `/`; a field adds `@<attribute>` (default `value`); an
  attribute row is its field's path plus `@<attribute>`; polymorphic variants add `#<n>` (1-based); a group is its path.
- **Anomaly levels** (spec §5.3): `blocking` (nothing is written) or `warning` (imported and listed).
- **Look-alike letters are folded only in code columns** (R/C/O, cardinality, references, tags, attributes, fixed and
  default values, message codes) **and only when the result is entirely ASCII** (spec §5.7).
- **Every new `.js` file begins with this block, verbatim.** Code blocks below omit it to save space; the implementer
  adds it to every file they create:

```js
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
```

## Review Focus

Inputs the spec implies but its happy path does not exercise — the ones most likely to bite a person importing a real
workbook. Each has a test in the task that owns the code.

1. **A module other than e-Prescription** — message codes `R001`, conditions `CDR07`. Codes and references must not be
   assumed to start with `P` / `CDP`. → Task 6, "imports a module whose codes are not P/CDP".
2. **A note typed into a message sheet** — a row with a name and nothing else. It must be reported and skipped, not
   read as an element with an invalid requirement that blocks the import. → Task 5, "skips a note row".
3. **A field whose name starts like an END row** — P001, P004, P011 and P018 have a real field "End of Period"
   (tag `end`). Read as a closing row it would silently vanish from the tree. → Task 5, "keeps a field named 'End of
   Period'".
4. **A sheet name with a trailing space** (`"P001 "`) — Excel online allows it and it is invisible. The message must
   still find its sheet. → Task 6, "matches a sheet whose name has stray spaces".
5. **The wrong file** — a valid `.xlsx` that is not a specification. The CLI must exit 1 with a readable report, not a
   stack trace. → Task 7, "refuses a workbook that is not a specification".

## File map

| File | Responsibility |
|---|---|
| `package.json`, `.nvmrc`, `eslint.config.mjs`, `.gitignore` | Workspace root, Node version, lint |
| `CLAUDE.md` | Working agreement |
| `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.coderabbit.yaml` | CI, dependency updates, review config |
| `packages/spec-model/model/kinds.js` | Frozen enumerations: element kinds, requirements, lifecycle, … |
| `packages/spec-model/model/identity.js` | Building element identities |
| `packages/spec-model/model/anomalies.js` | The anomaly catalogue and `createAnomaly` |
| `packages/spec-model/model/freeze.js` | `deepFreeze` |
| `packages/spec-model/model/definitions.types.js` | JSDoc typedefs for the model |
| `packages/spec-model/model/validation.js` | Structural validation of a message tree |
| `packages/importer/read/raw.js` | Raw-sheet helpers (`cellAt`, `columnMap`, `findRow`) |
| `packages/importer/read/colours.js` | Theme parsing, colour resolution, tint |
| `packages/importer/read/workbook-reader.js` | exceljs → raw workbook |
| `packages/importer/interpret/cells.js` | Parsers for R/C/O, cardinality, constraint, references |
| `packages/importer/interpret/scripts.js` | Look-alike folding, mixed-script detection |
| `packages/importer/structure/legend.js` | The template's colour legend |
| `packages/importer/structure/message-tree.js` | Message sheet → element tree |
| `packages/importer/interpret/messages-sheet.js` | "Съобщения" → message index and pairing |
| `packages/importer/interpret/change-notes.js` | "Change Notes" → versions and categorised notes |
| `packages/importer/interpret/side-sheets.js` | "Conditions" (raw text) and "Dictionary" |
| `packages/importer/importer/module-importer.js` | Assembles a module version from a raw workbook |
| `packages/importer/report/format.js` | Text report |
| `packages/importer/bin/import-module.js` | CLI |
| `scripts/fetch-public-fixtures.js` | Downloads pinned public workbooks into `.fixtures/` |

Test helpers live in `packages/importer/test/support/` (not matched by the `test/**/*.test.js` pattern).

---

### Task 1: Repository foundation and the first spec-model module

**Files:**
- Create: `package.json`, `.nvmrc`, `eslint.config.mjs`, `CLAUDE.md`
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.coderabbit.yaml`
- Modify: `.gitignore`
- Create: `packages/spec-model/package.json`, `packages/spec-model/model/kinds.js`,
  `packages/spec-model/model/identity.js`
- Test: `packages/spec-model/test/identity.test.js`
- Generated and committed: `package-lock.json`

**Interfaces:**
- Produces: `@health-dev-portal/spec-model/kinds` → `ELEMENT_KIND`, `REQUIREMENT`, `MESSAGE_LIFECYCLE`,
  `MESSAGE_DIRECTION`, `CHANGE_CATEGORY`, `ANOMALY_LEVEL` (frozen string maps).
- Produces: `@health-dev-portal/spec-model/identity` → `isValidPart( value ): boolean`,
  `joinPath( parentPath: string, tag: string ): string`, `withAttribute( path: string, attribute: string ): string`,
  `withVariant( identity: string, ordinal: number ): string`.

- [ ] **Step 1: Write the root configuration**

`package.json`:

```json
{
    "name": "health-dev-portal",
    "version": "0.0.0",
    "description": "The developer portal of the Bulgarian National Health Information System (НЗИС).",
    "license": "EUPL-1.2",
    "private": true,
    "workspaces": [
        "packages/*"
    ],
    "repository": {
        "type": "git",
        "url": "git+https://github.com/Belleal/health-dev-portal.git"
    },
    "engines": {
        "node": ">=24"
    },
    "devDependencies": {
        "@eslint/js": "^10.0.1",
        "eslint": "^10.12.0",
        "globals": "^17.13.0"
    },
    "scripts": {
        "lint": "eslint .",
        "test": "npm test --workspaces --if-present"
    }
}
```

`.nvmrc`:

```text
24
```

`eslint.config.mjs`:

```js
import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";

export default defineConfig( [ {
    // `.superpowers` holds the design companion's working files and `.fixtures` downloaded public workbooks; neither
    // is source. The mockups under docs/ are HTML fragments, not modules.
    ignores: [ "eslint.config.mjs", ".superpowers/**", ".fixtures/**", "docs/**" ],
}, {
    extends: [ js.configs.recommended ],

    languageOptions: {
        globals: {
            ...globals.node,
        },

        ecmaVersion: "latest",
        sourceType: "commonjs",
    },

    rules: {
        "no-unused-vars": [ "warn", { "args": "after-used" } ]
    },
} ] );
```

Append to `.gitignore`:

```text

# Public workbooks downloaded by `npm run fixtures:fetch` (never committed: see CLAUDE.md, "Data rules")
.fixtures/
```

- [ ] **Step 2: Write the working agreement**

`CLAUDE.md`:

````markdown
# Working agreement — Belleal/health-dev-portal

Read this at session start. The **design record** in `docs/superpowers/specs/` is the authority on what the portal
is; this file is how we work on it. Where they seem to disagree on a fact, the design record wins; on process, this
file.

## Start of session

1. Read the latest design record and the plan being executed (`docs/superpowers/plans/`).
2. Set the commit identity before the first commit:

   ```bash
   git config user.name "Boris Kostadinov"
   git config user.email "kostadinov.boris@gmail.com"
   ```

3. Before touching ti-engine, or deciding whether something belongs there, load the `ti-engine` skill.

## The framework boundary

ti-engine knows nothing of the applications that use it. A generic gap found here (a gateway, an authentication
provider, a rendering helper) is built in `Belleal/ti-engine` under its own CA card and pull request, released to
npm, and only then used here through a version range. Nothing НЗИС-specific goes into ti-engine.

## Code convention

`packages/spec-model` is the reference; match the nearest file.

- The **EUPL header** on every new `.js` file, copied verbatim from a sibling.
- CommonJS; four-space indent; double quotes; semicolons; **spaces inside parentheses, brackets and braces**.
- JSDoc on everything exported: a prose description, then `@param` / `@returns` / `@throws`, and `@public` or
  `@private`. Shared shapes are `@typedef`s in `packages/spec-model/model/definitions.types.js`.
- `#alias` imports inside a package, the `exports` map across packages; never a relative path that crosses a
  directory.
- `spec-model` stays pure — no I/O and no Node-only API — because the message tester runs it in the browser.
- Comments say why. Where a line prevents a specific defect, name the defect, the measurement or the HEL card.

## Data rules

- **Never commit unpublished specification data**: no development-version workbook, XSD or extract, in any form,
  test fixtures included. The repository is public. Fixtures are synthetic and built in code, or public files fetched
  by `npm run fixtures:fetch` into the git-ignored `.fixtures/`.
- Never commit `.env`, secrets, or the spec team's workbooks.
- Never write a model identifier into a file, commit message or pull-request body.

## Commits

Conventional Commits scoped to the package: `feat(importer)`, `fix(spec-model)`, `docs(design)`, `build(deps)`, `ci`,
`test(importer)`. The HEL card goes in the subject: `feat(importer): … (HEL-13)`.

Bundle thematically: one commit per plan task is the normal size, never one per TDD step. The body says what was
missing or wrong, why, what changed, and the evidence — test counts, measured values, the reproduction.

End every commit with the co-author trailer the session's attribution instructions give.

## Definition of done

```bash
npm ci
npm run fixtures:fetch
npm run lint
npm test
```

Lint must report 0 errors. Quote the real numbers in the pull request. A behaviour the design record describes
changes only together with the design record, in the same pull request.

## Pull requests

Standing authorization: open the pull request, drive it to green, answer every review comment. Never merge — that is
Boris's.

- Prose that fits the change: what was missing or wrong, why it matters, what changed and what was rejected,
  verification with real numbers, what was deliberately not done.
- **CodeRabbit is a reviewer, not an oracle.** Trigger it with `@coderabbitai review` once the head is final for the
  round — a push during a review cancels it. Verify every finding against the code, fix the real ones, and answer the
  rest with the measurement that settles it.
- Every comment posted to GitHub ends with:

  ```text

  ---
  _Generated by [Claude Code](https://claude.ai/code)_
  ```

## Working method

- **Measure library behaviour; never recall it.** exceljs' theme colours, fills and indentation were decided by
  running it against the real workbooks (design record §5.7) — and an earlier reading through another library was
  wrong.
- Reproduce before fixing; the reproduction becomes the test.
- Do not widen the change. An adjacent defect is named under "not done" and gets its own card.

## Tracking — YouTrack project HEL

Every piece of work is a `HEL-###` card, and **moving cards is the agent's job**. Stages: Backlog → Develop (work
started) → Review (pull request open) → Test → Staging → Done. Log the time spent with each move (`log_work`; say when
it is an estimate), and close a card with a comment naming the pull request, the checks and what shipped. Defects
found in the specifications themselves go under HEL-2.
````

- [ ] **Step 3: Write CI, Dependabot and CodeRabbit configuration**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

# Nothing here writes. `npm ci` runs dependency lifecycle scripts, so the token they could reach is read-only.
permissions:
  contents: read

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      # The Node version is written once, in .nvmrc.
      - name: Set up Node.js
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Unit tests
        run: npm test
```

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  # One root entry: with npm workspaces Dependabot already reaches every packages/*/package.json from the root.
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      minor-and-patch:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

`.coderabbit.yaml`:

```yaml
# CodeRabbit configuration. This file takes precedence over the repository's settings in the CodeRabbit UI.
reviews:
  profile: assertive
  path_filters:
    # Design mockups are HTML fragments for the design companion, kept as a record, not shipped.
    - "!docs/superpowers/specs/mockups/**"
  finishing_touches:
    # Tests are written with the code they cover, against `node --test`, not generated onto a branch.
    unit_tests:
      enabled: false
```

- [ ] **Step 4: Create the spec-model package and write the failing identity test**

`packages/spec-model/package.json`:

```json
{
    "name": "@health-dev-portal/spec-model",
    "version": "0.1.0",
    "description": "The НЗИС specification model: element kinds, identities, anomalies and structural validation. Pure: no I/O.",
    "license": "EUPL-1.2",
    "private": true,
    "type": "commonjs",
    "engines": {
        "node": ">=24"
    },
    "exports": {
        "./anomalies": "./model/anomalies.js",
        "./definitions": "./model/definitions.types.js",
        "./freeze": "./model/freeze.js",
        "./identity": "./model/identity.js",
        "./kinds": "./model/kinds.js",
        "./validation": "./model/validation.js"
    },
    "imports": {
        "#anomalies": "./model/anomalies.js",
        "#freeze": "./model/freeze.js",
        "#identity": "./model/identity.js",
        "#kinds": "./model/kinds.js"
    },
    "scripts": {
        "test": "node --test \"test/**/*.test.js\""
    }
}
```

`packages/spec-model/test/identity.test.js` (EUPL header first):

```js
/*
 * Element identities (design record §4.3). The importer, version comparison and changelog generation all key on these
 * strings, so their exact shape is pinned here.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { isValidPart, joinPath, withAttribute, withVariant } = require( "@health-dev-portal/spec-model/identity" );

describe( "identity", () => {

    it( "joins tags into a path", () => {
        assert.equal( joinPath( "", "header" ), "header" );
        assert.equal( joinPath( "contents/prescription", "lrn" ), "contents/prescription/lrn" );
    } );

    it( "adds an attribute to a path", () => {
        assert.equal( withAttribute( "contents/prescription/lrn", "value" ), "contents/prescription/lrn@value" );
        assert.equal( withAttribute( "contents/prescription/group/medication/medicationCode", "name" ),
            "contents/prescription/group/medication/medicationCode@name" );
    } );

    it( "numbers polymorphic variants from 1", () => {
        assert.equal( withVariant( "a/doseQuantityCode@value", 2 ), "a/doseQuantityCode@value#2" );
    } );

    it( "refuses parts that would make two identities print alike", () => {
        for ( const bad of [ "", "a/b", "a@b", "a#b", "a b", null, 7 ] ) {
            assert.equal( isValidPart( bad ), false, JSON.stringify( bad ) );
            assert.throws( () => joinPath( "x", bad ), TypeError );
        }
        assert.throws( () => withAttribute( "", "value" ), TypeError );
        assert.throws( () => withAttribute( "x", "a b" ), TypeError );
        assert.throws( () => withVariant( "x@value", 0 ), TypeError );
        assert.throws( () => withVariant( "x@value", 1.5 ), TypeError );
        assert.equal( isValidPart( "medicationCode" ), true );
    } );
} );
```

- [ ] **Step 5: Install and run the test to verify it fails**

Run: `npm install` (creates `package-lock.json`), then `npm test`
Expected: FAIL — `Cannot find module '…/model/identity.js'`.

- [ ] **Step 6: Implement `kinds.js` and `identity.js`**

`packages/spec-model/model/kinds.js`:

```js
/**
 * The kinds of element a message tree is built from (design record §4.3).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.ELEMENT_KIND = Object.freeze( {
    GROUP: "group",
    FIELD: "field",
    POLYMORPHIC: "polymorphic",
    ATTRIBUTE: "attribute"
} );

/**
 * Whether an element must, may under conditions, or may appear.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.REQUIREMENT = Object.freeze( {
    REQUIRED: "R",
    CONDITIONAL: "C",
    OPTIONAL: "O"
} );

/**
 * Where a message stands in its life (design record §4.2), read from the workbook's tab colour.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.MESSAGE_LIFECYCLE = Object.freeze( {
    ACTIVE: "active",
    IN_DEVELOPMENT: "in-development",
    WITHDRAWN: "withdrawn"
} );

/**
 * Whether a message is sent to NHIS or returned by it.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.MESSAGE_DIRECTION = Object.freeze( {
    REQUEST: "request",
    RESPONSE: "response"
} );

/**
 * The category of a change note (design record §4.7).
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.CHANGE_CATEGORY = Object.freeze( {
    BREAKING: "breaking",
    DROPPED_PLAN: "dropped-plan",
    NON_BREAKING: "non-breaking"
} );

/**
 * How serious an import anomaly is (design record §5.3): a blocking one stops the import.
 *
 * @readonly
 * @enum {string}
 * @public
 */
module.exports.ANOMALY_LEVEL = Object.freeze( {
    BLOCKING: "blocking",
    WARNING: "warning"
} );
```

`packages/spec-model/model/identity.js`:

```js
// A tag or attribute holding one of these would let two different elements print the same identity.
const RESERVED = /[/@#\s]/;

/**
 * Tells whether a string can be one tag or attribute of an identity.
 *
 * @method
 * @param {*} value
 * @returns {boolean}
 * @public
 */
module.exports.isValidPart = ( value ) => typeof value === "string" && value !== "" && !RESERVED.test( value );

const requirePart = ( value, what ) => {
    if ( !module.exports.isValidPart( value ) ) {
        throw new TypeError( `${ what } must be a non-empty string without "/", "@", "#" or whitespace; got ${ JSON.stringify( value ) }.` );
    }
};

/**
 * Appends a tag to a tag path.
 *
 * @method
 * @param {string} parentPath The parent's path, or an empty string at the root.
 * @param {string} tag
 * @returns {string}
 * @throws {TypeError} When the tag is not a valid part.
 * @public
 */
module.exports.joinPath = ( parentPath, tag ) => {
    requirePart( tag, "A tag" );
    return parentPath ? `${ parentPath }/${ tag }` : tag;
};

/**
 * Makes the identity of a field or attribute from its path and XML attribute.
 *
 * @method
 * @param {string} path
 * @param {string} attribute
 * @returns {string}
 * @throws {TypeError} When the path is empty or the attribute is not a valid part.
 * @public
 */
module.exports.withAttribute = ( path, attribute ) => {
    if ( typeof path !== "string" || path === "" ) {
        throw new TypeError( `A path must be a non-empty string; got ${ JSON.stringify( path ) }.` );
    }
    requirePart( attribute, "An attribute" );
    return `${ path }@${ attribute }`;
};

/**
 * Makes the identity of a polymorphic element's variant: its variants share a tag and attribute, so their order tells
 * them apart.
 *
 * @method
 * @param {string} identity The variant's identity before numbering.
 * @param {number} ordinal 1-based position among the variants.
 * @returns {string}
 * @throws {TypeError} When the ordinal is not a positive integer.
 * @public
 */
module.exports.withVariant = ( identity, ordinal ) => {
    if ( !Number.isInteger( ordinal ) || ordinal < 1 ) {
        throw new TypeError( `A variant ordinal must be a positive integer; got ${ JSON.stringify( ordinal ) }.` );
    }
    return `${ identity }#${ ordinal }`;
};
```

- [ ] **Step 7: Run the tests and lint to verify they pass**

Run: `npm test` then `npm run lint`
Expected: `# pass 4`, `# fail 0`; lint prints no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .nvmrc eslint.config.mjs .gitignore CLAUDE.md .github .coderabbit.yaml packages/spec-model
git commit -m "build: repository foundation and the spec model's identities (HEL-13)"
```

The body states: workspaces, Node 24, lint, CI with pinned actions, Dependabot, CodeRabbit config, working agreement;
`spec-model` kinds and identities with the 4 tests; the lockfile is committed because this is an application, so
`npm ci` installs exactly what was tested.

---

### Task 2: Anomaly catalogue, deep freeze, model typedefs and tree validation

**Files:**
- Create: `packages/spec-model/model/anomalies.js`, `packages/spec-model/model/freeze.js`,
  `packages/spec-model/model/definitions.types.js`, `packages/spec-model/model/validation.js`
- Test: `packages/spec-model/test/anomalies.test.js`, `packages/spec-model/test/freeze.test.js`,
  `packages/spec-model/test/validation.test.js`

**Interfaces:**
- Consumes: `ELEMENT_KIND`, `REQUIREMENT`, `ANOMALY_LEVEL` from Task 1.
- Produces: `@health-dev-portal/spec-model/anomalies` → `ANOMALY_TYPES` (frozen map type → `{ level, text }`),
  `createAnomaly( type: string, source?: { sheet?, row?, column? }, details?: object ): Anomaly`,
  `hasBlocking( anomalies: Anomaly[] ): boolean`.
- Produces: `@health-dev-portal/spec-model/freeze` → `deepFreeze( value ): value`.
- Produces: `@health-dev-portal/spec-model/validation` → `validateMessageTree( elements: ElementNode[] ): Anomaly[]`.
- `Anomaly` = `{ type, level, message, sheet, row, column, details }` (frozen).

- [ ] **Step 1: Write the failing tests**

`packages/spec-model/test/anomalies.test.js`:

```js
/*
 * The anomaly catalogue (design record §5.3). Every anomaly the importer can raise is declared once, with its level,
 * so no code path can invent a level or forget one.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { ANOMALY_TYPES, createAnomaly, hasBlocking } = require( "@health-dev-portal/spec-model/anomalies" );

describe( "anomalies", () => {

    it( "creates an anomaly with its catalogue level and a rendered message", () => {
        const anomaly = createAnomaly( "duplicate-identity", { sheet: "P001", row: 40 }, { identity: "a@value", firstRow: 12, row: 40 } );
        assert.equal( anomaly.level, "blocking" );
        assert.equal( anomaly.type, "duplicate-identity" );
        assert.equal( anomaly.sheet, "P001" );
        assert.equal( anomaly.row, 40 );
        assert.equal( anomaly.column, null );
        assert.match( anomaly.message, /a@value/ );
        assert.match( anomaly.message, /12/ );
        assert.ok( Object.isFrozen( anomaly ) && Object.isFrozen( anomaly.details ) );
    } );

    it( "leaves an unfilled placeholder visible rather than printing undefined", () => {
        assert.match( createAnomaly( "invalid-requirement" ).message, /\{value\}/ );
    } );

    it( "refuses an unknown type", () => {
        assert.throws( () => createAnomaly( "no-such-thing" ), TypeError );
    } );

    it( "declares a valid level for every type", () => {
        for ( const [ type, definition ] of Object.entries( ANOMALY_TYPES ) ) {
            assert.ok( [ "blocking", "warning" ].includes( definition.level ), type );
            assert.equal( typeof definition.text, "string", type );
        }
    } );

    it( "tells whether any anomaly blocks", () => {
        assert.equal( hasBlocking( [] ), false );
        assert.equal( hasBlocking( [ createAnomaly( "unknown-fill", {}, { colour: "ABCDEF" } ) ] ), false );
        assert.equal( hasBlocking( [ createAnomaly( "missing-tag" ) ] ), true );
    } );
} );
```

`packages/spec-model/test/freeze.test.js`:

```js
/*
 * deepFreeze: an imported model is handed to several consumers and must not change under any of them.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );

describe( "deepFreeze", () => {

    it( "freezes nested objects and arrays", () => {
        const value = deepFreeze( { a: { b: [ { c: 1 } ] } } );
        assert.ok( Object.isFrozen( value.a.b[ 0 ] ) );
        assert.throws( () => {
            "use strict";
            value.a.b.push( 2 );
        }, TypeError );
    } );

    it( "freezes children of an object that was already frozen shallowly", () => {
        const inner = { x: 1 };
        const outer = Object.freeze( { inner: inner } );
        deepFreeze( outer );
        assert.ok( Object.isFrozen( inner ) );
    } );

    it( "survives a cycle and passes primitives through", () => {
        const a = { };
        a.self = a;
        assert.equal( deepFreeze( a ), a );
        assert.equal( deepFreeze( 3 ), 3 );
        assert.equal( deepFreeze( null ), null );
    } );
} );
```

`packages/spec-model/test/validation.test.js`:

```js
/*
 * Structural validation of a message tree (design record §5.3): the checks that need the whole tree rather than one
 * row.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { validateMessageTree } = require( "@health-dev-portal/spec-model/validation" );

const node = ( overrides = {} ) => ( {
    identity: "contents/x@value",
    kind: "field",
    name: { bg: null, en: "X" },
    requirement: "R",
    cardinality: { min: 1, max: 1 },
    conditions: [],
    children: [],
    source: { sheet: "P001", row: 5 },
    ...overrides
} );

const types = ( anomalies ) => anomalies.map( ( anomaly ) => anomaly.type );

describe( "validateMessageTree", () => {

    it( "accepts a sound tree", () => {
        const tree = [ node( { identity: "contents", kind: "group", children: [ node() ] } ) ];
        assert.deepEqual( validateMessageTree( tree ), [] );
    } );

    it( "blocks two elements with one identity, naming both rows", () => {
        const tree = [ node( { identity: "contents", kind: "group", children: [
            node( { source: { sheet: "P001", row: 5 } } ),
            node( { source: { sheet: "P001", row: 9 } } )
        ] } ) ];
        const [ anomaly ] = validateMessageTree( tree );
        assert.equal( anomaly.type, "duplicate-identity" );
        assert.equal( anomaly.level, "blocking" );
        assert.equal( anomaly.details.firstRow, 5 );
        assert.equal( anomaly.row, 9 );
    } );

    it( "blocks a cardinality whose minimum exceeds its maximum", () => {
        assert.deepEqual( types( validateMessageTree( [ node( { cardinality: { min: 2, max: 1 } } ) ] ) ), [ "invalid-cardinality-range" ] );
    } );

    it( "warns about a conditional element that names no condition", () => {
        assert.deepEqual( types( validateMessageTree( [ node( { requirement: "C", cardinality: { min: 0, max: 1 } } ) ] ) ),
            [ "conditional-without-condition" ] );
        assert.deepEqual( validateMessageTree( [ node( { requirement: "C", cardinality: { min: 0, max: 1 }, conditions: [ "CDP01" ] } ) ] ), [] );
    } );

    it( "warns about a required element whose cardinality allows none", () => {
        assert.deepEqual( types( validateMessageTree( [ node( { cardinality: { min: 0, max: 1 } } ) ] ) ), [ "required-with-zero-minimum" ] );
    } );

    it( "warns about an empty group and a polymorphic element with fewer than two variants", () => {
        const tree = [
            node( { identity: "g", kind: "group" } ),
            node( { identity: "p@value", kind: "polymorphic", children: [ node( { identity: "p@value#1" } ) ] } )
        ];
        assert.deepEqual( types( validateMessageTree( tree ) ), [ "empty-group", "single-variant" ] );
    } );

    it( "skips checks that need a value the row did not have", () => {
        assert.deepEqual( validateMessageTree( [ node( { identity: null, cardinality: null } ) ] ), [] );
    } );
} );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace @health-dev-portal/spec-model`
Expected: FAIL — `Cannot find module '…/model/anomalies.js'` (and freeze, validation).

- [ ] **Step 3: Implement**

`packages/spec-model/model/anomalies.js`:

```js
const { ANOMALY_LEVEL } = require( "#kinds" );

const BLOCKING = ANOMALY_LEVEL.BLOCKING;
const WARNING = ANOMALY_LEVEL.WARNING;

/**
 * Every anomaly the importer can report, with its level and an English message template. `{name}` placeholders are
 * filled from the anomaly's details.
 *
 * @readonly
 * @type {Readonly<Object<string, {level: string, text: string}>>}
 * @public
 */
module.exports.ANOMALY_TYPES = Object.freeze( {
    // The workbook as a whole
    "missing-sheet": { level: BLOCKING, text: "The workbook has no sheet named \"{sheet}\"." },
    "missing-header-row": { level: BLOCKING, text: "No header row was found in the first rows of the sheet." },
    "missing-column": { level: BLOCKING, text: "No column is headed \"{column}\"." },
    "missing-version": { level: BLOCKING, text: "The change notes name no version, so the workbook's version is unknown." },
    "version-mismatch": { level: WARNING, text: "The file name says {fileVersion}, the change notes say {version}." },
    "notes-before-version": { level: WARNING, text: "A change note appears before any \"Версия\" heading." },
    // Messages
    "message-without-sheet": { level: BLOCKING, text: "Message {code} is listed but has no sheet." },
    "sheet-without-message": { level: WARNING, text: "Sheet {sheet} is not listed among the messages." },
    "unknown-tab-colour": { level: WARNING, text: "Tab colour {colour} is not in the legend, so the message's status is unknown." },
    "unknown-direction": { level: WARNING, text: "\"{value}\" is neither Request nor Response." },
    "unpaired-message": { level: WARNING, text: "Message {code} has no request/response partner." },
    // Rows of a message sheet
    "depth-jump": { level: BLOCKING, text: "Indentation {depth} under a parent at {parentDepth}: the row cannot be placed in the tree." },
    "invalid-requirement": { level: BLOCKING, text: "\"{value}\" is not R, C or O." },
    "invalid-cardinality": { level: BLOCKING, text: "\"{value}\" is not a cardinality such as 1..1, 0..1 or 1..*." },
    "missing-tag": { level: BLOCKING, text: "The element has no XML tag." },
    "invalid-tag": { level: BLOCKING, text: "\"{tag}\" cannot be part of an element's identity." },
    "attribute-without-field": { level: BLOCKING, text: "An attribute row must sit directly under the field it belongs to." },
    "note-row": { level: WARNING, text: "\"{text}\" has a name and nothing else; it is read as a note, not an element." },
    "look-alike-letter": { level: WARNING, text: "\"{value}\" contains Cyrillic letters that look Latin ({letters}); read as \"{folded}\"." },
    "mixed-script-word": { level: WARNING, text: "\"{word}\" mixes Latin and Cyrillic letters." },
    "unknown-fill": { level: WARNING, text: "Fill colour {colour} is not in the legend; the row is read as a field." },
    "end-fill-on-data-row": { level: WARNING, text: "A data row has the grey fill reserved for END rows; the row is read as a field." },
    "asterisks-disagree": { level: WARNING, text: "{stars} leading asterisk(s) on a row indented {depth}." },
    "unexpected-end-row": { level: WARNING, text: "\"END of {name}\" closes no open group." },
    "unparsed-constraint": { level: WARNING, text: "Constraint \"{token}\" is not understood and is kept as text." },
    "invalid-reference": { level: WARNING, text: "\"{value}\" is not a valid {kind} reference." },
    "multiple-code-lists": { level: WARNING, text: "One element names several code lists ({values}); the first is used." },
    "attribute-tag-mismatch": { level: WARNING, text: "The attribute row's tag \"{tag}\" differs from its field's tag \"{fieldTag}\"." },
    // The tree as a whole
    "duplicate-identity": { level: BLOCKING, text: "Two elements share the identity {identity} (rows {firstRow} and {row})." },
    "invalid-cardinality-range": { level: BLOCKING, text: "Cardinality {value} has a minimum above its maximum." },
    "conditional-without-condition": { level: WARNING, text: "Conditional element {identity} names no condition." },
    "required-with-zero-minimum": { level: WARNING, text: "Required element {identity} has cardinality {value}." },
    "empty-group": { level: WARNING, text: "Group {identity} has no elements." },
    "single-variant": { level: WARNING, text: "Polymorphic element {identity} has {count} variant(s); it needs at least two." },
    // Side sheets
    "empty-condition": { level: WARNING, text: "Condition {id} has no text." }
} );

/**
 * Creates a frozen anomaly of a catalogued type.
 *
 * @method
 * @param {string} type A key of `ANOMALY_TYPES`.
 * @param {{sheet?: string, row?: number, column?: number}} [source] Where in the workbook it was found.
 * @param {Object} [details] Values for the message template, kept on the anomaly.
 * @returns {import( "#definitions" ).Anomaly}
 * @throws {TypeError} When the type is not catalogued.
 * @public
 */
module.exports.createAnomaly = ( type, source = {}, details = {} ) => {
    const definition = module.exports.ANOMALY_TYPES[ type ];
    if ( !definition ) {
        // An uncatalogued type would surface with no level, and no report would ever count it as blocking.
        throw new TypeError( `Unknown anomaly type "${ type }".` );
    }
    return Object.freeze( {
        type: type,
        level: definition.level,
        message: definition.text.replace( /\{(\w+)\}/g, ( placeholder, key ) => ( key in details ? String( details[ key ] ) : placeholder ) ),
        sheet: source.sheet ?? null,
        row: source.row ?? null,
        column: source.column ?? null,
        details: Object.freeze( { ...details } )
    } );
};

/**
 * Tells whether any of the anomalies blocks an import.
 *
 * @method
 * @param {import( "#definitions" ).Anomaly[]} anomalies
 * @returns {boolean}
 * @public
 */
module.exports.hasBlocking = ( anomalies ) => anomalies.some( ( anomaly ) => anomaly.level === BLOCKING );
```

Add `"#definitions": "./model/definitions.types.js"` to the `imports` map of `packages/spec-model/package.json`.

`packages/spec-model/model/freeze.js`:

```js
/**
 * Freezes a value and everything reachable from it.
 *
 * Children are visited even when the object itself is already frozen: an object frozen shallowly elsewhere would
 * otherwise shelter mutable children.
 *
 * @method
 * @param {*} value
 * @param {WeakSet} [seen]
 * @returns {*} The same value.
 * @public
 */
module.exports.deepFreeze = ( value, seen = new WeakSet() ) => {
    if ( value === null || typeof value !== "object" || seen.has( value ) ) {
        return value;
    }
    seen.add( value );
    for ( const key of Object.keys( value ) ) {
        module.exports.deepFreeze( value[ key ], seen );
    }
    return Object.freeze( value );
};
```

`packages/spec-model/model/definitions.types.js`:

```js
/**
 * @typedef {Object} SourceRef Where a value was read from in a workbook.
 * @property {string} sheet
 * @property {number} row
 * @property {number} [column] 1-based.
 */

/**
 * @typedef {Object} LocalText Text in both languages; a missing translation is `null`, never the other language.
 * @property {string|null} bg
 * @property {string|null} en
 */

/**
 * @typedef {Object} Cardinality
 * @property {number} min
 * @property {number|null} max `null` means unbounded (`*`).
 */

/**
 * @typedef {Object} Constraint A workbook constraint split into its parts; `raw` keeps the original text.
 * @property {string} raw
 * @property {number} [minLength]
 * @property {number} [maxLength]
 * @property {number} [minValue] On numeric types the bounds are values, not lengths.
 * @property {number} [maxValue]
 * @property {string} [charset] e.g. `an` (alphanumeric).
 * @property {string} [format] `date`, `date-time`, `yymmdd` or `boolean`.
 */

/**
 * @typedef {Object} ElementNode One element of a message tree (design record §4.3).
 * @property {string|null} identity `null` when it could not be formed (an anomaly says why).
 * @property {string|null} path The tag path, without attribute or variant number.
 * @property {number} depth
 * @property {string} kind One of `ELEMENT_KIND`.
 * @property {LocalText} name
 * @property {string|null} requirement One of `REQUIREMENT`.
 * @property {Cardinality|null} cardinality
 * @property {string|null} dataType
 * @property {Constraint|null} constraint
 * @property {string|null} fixedValue
 * @property {string|null} defaultValue
 * @property {string[]} rules
 * @property {string[]} conditions
 * @property {string|null} codeList
 * @property {string|null} tag
 * @property {string|null} attribute
 * @property {LocalText} description
 * @property {SourceRef} source
 * @property {ElementNode[]} children
 */

/**
 * @typedef {Object} Message
 * @property {string} code e.g. `P001`.
 * @property {LocalText} title Bulgarian title and English classification.
 * @property {string|null} address The endpoint, e.g. `/v4/eprescription/doctor/issue`; `null` for a response.
 * @property {string|null} direction One of `MESSAGE_DIRECTION`.
 * @property {string|null} sender
 * @property {string|null} recipient
 * @property {string|null} pairedWith The code of its request or response.
 * @property {string|null} lifecycle One of `MESSAGE_LIFECYCLE`, from the tab colour.
 * @property {boolean|null} changedInVersion The tab colour's claim, kept as a cross-check.
 * @property {ElementNode[]} elements
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ChangeNote
 * @property {string} category One of `CHANGE_CATEGORY`.
 * @property {string} text
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ChangeVersion
 * @property {string} version e.g. `1.5.1`.
 * @property {ChangeNote[]} notes
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ConditionText A condition as written in the workbook; plan 3 parses it.
 * @property {string} id e.g. `CDP01`.
 * @property {string} text The lines joined with newlines.
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} DictionaryEntry
 * @property {string} abbreviation
 * @property {LocalText} name
 * @property {LocalText} description
 * @property {SourceRef} source
 */

/**
 * @typedef {Object} ModuleVersion One version of a module specification, as imported.
 * @property {string} spec The spec's key, e.g. `e-prescription`.
 * @property {string|null} version
 * @property {Message[]} messages
 * @property {ConditionText[]} conditions
 * @property {DictionaryEntry[]} dictionary
 * @property {ChangeVersion[]} changeNotes Oldest first.
 */

/**
 * @typedef {Object} Anomaly
 * @property {string} type A key of `ANOMALY_TYPES`.
 * @property {string} level One of `ANOMALY_LEVEL`.
 * @property {string} message
 * @property {string|null} sheet
 * @property {number|null} row
 * @property {number|null} column
 * @property {Object} details
 */

module.exports = {};
```

`packages/spec-model/model/validation.js`:

```js
const { createAnomaly } = require( "#anomalies" );
const { ELEMENT_KIND, REQUIREMENT } = require( "#kinds" );

const showCardinality = ( cardinality ) => `${ cardinality.min }..${ cardinality.max === null ? "*" : cardinality.max }`;

/**
 * Checks what only the whole tree can show: unique identities, cardinality ranges, conditional elements without a
 * condition, empty groups and polymorphic elements without variants.
 *
 * @method
 * @param {import( "#definitions" ).ElementNode[]} elements The message's top-level elements.
 * @returns {import( "#definitions" ).Anomaly[]}
 * @public
 */
module.exports.validateMessageTree = ( elements ) => {
    const anomalies = [];
    const firstRows = new Map();
    const visit = ( node ) => {
        if ( node.identity ) {
            if ( firstRows.has( node.identity ) ) {
                anomalies.push( createAnomaly( "duplicate-identity", node.source,
                    { identity: node.identity, firstRow: firstRows.get( node.identity ), row: node.source.row } ) );
            } else {
                firstRows.set( node.identity, node.source.row );
            }
        }
        const cardinality = node.cardinality;
        if ( cardinality && cardinality.max !== null && cardinality.min > cardinality.max ) {
            anomalies.push( createAnomaly( "invalid-cardinality-range", node.source, { value: showCardinality( cardinality ) } ) );
        }
        if ( node.requirement === REQUIREMENT.CONDITIONAL && node.conditions.length === 0 ) {
            anomalies.push( createAnomaly( "conditional-without-condition", node.source, { identity: node.identity } ) );
        }
        if ( node.requirement === REQUIREMENT.REQUIRED && cardinality && cardinality.min === 0 ) {
            anomalies.push( createAnomaly( "required-with-zero-minimum", node.source, { identity: node.identity, value: showCardinality( cardinality ) } ) );
        }
        if ( node.kind === ELEMENT_KIND.GROUP && node.children.length === 0 ) {
            anomalies.push( createAnomaly( "empty-group", node.source, { identity: node.identity } ) );
        }
        if ( node.kind === ELEMENT_KIND.POLYMORPHIC && node.children.length < 2 ) {
            anomalies.push( createAnomaly( "single-variant", node.source, { identity: node.identity || node.name.en, count: node.children.length } ) );
        }
        node.children.forEach( visit );
    };
    elements.forEach( visit );
    return anomalies;
};
```

- [ ] **Step 4: Run the tests and lint**

Run: `npm test --workspace @health-dev-portal/spec-model` then `npm run lint`
Expected: all spec-model tests pass (4 + 5 + 3 + 7 = 19); lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/spec-model
git commit -m "feat(spec-model): anomaly catalogue, deep freeze, model typedefs and tree validation (HEL-13)"
```

---

### Task 3: Importer package, colour resolution and the workbook reader

**Files:**
- Create: `packages/importer/package.json`, `packages/importer/read/raw.js`, `packages/importer/read/colours.js`,
  `packages/importer/read/workbook-reader.js`
- Test: `packages/importer/test/colours.test.js`, `packages/importer/test/workbook-reader.test.js`
- Modify: `package-lock.json` (by `npm install`)

**Interfaces:**
- Produces: `#raw` → `EMPTY_CELL`, `cellAt( row: RawRow, column: number|null ): RawCell`,
  `columnMap( headerRow: RawRow ): Map<string, number>`, `findRow( sheet: RawSheet, predicate, withinRows = 10 ): RawRow|null`.
- Produces: `#colours` → `parseThemeColours( themeXml: string ): Object<string, string>`,
  `resolveColour( colour: object|null|undefined, themeColours: object ): string|null` (six upper-case hex digits).
- Produces: `#workbook-reader` (also exported as `@health-dev-portal/importer/reader`) →
  `readWorkbook( source: string|Buffer ): Promise<RawWorkbook>`.
- Raw shapes: `RawWorkbook = { sheets: RawSheet[], themeColours }`; `RawSheet = { name, tabColour: hex|null, rows: RawRow[] }`;
  `RawRow = { number, cells: RawCell[] }` (index 0 = column A; only non-empty rows); `RawCell = { text, fill: hex|null,
  fontColour: hex|null, indent: number }`. All frozen. Text is trimmed.

- [ ] **Step 1: Create the package**

`packages/importer/package.json`:

```json
{
    "name": "@health-dev-portal/importer",
    "version": "0.1.0",
    "description": "Reads the НЗИС specification workbooks into the specification model and reports every anomaly.",
    "license": "EUPL-1.2",
    "private": true,
    "type": "commonjs",
    "engines": {
        "node": ">=24"
    },
    "bin": {
        "hdp-import-module": "./bin/import-module.js"
    },
    "exports": {
        "./module": "./importer/module-importer.js",
        "./reader": "./read/workbook-reader.js",
        "./report": "./report/format.js"
    },
    "imports": {
        "#cells": "./interpret/cells.js",
        "#change-notes": "./interpret/change-notes.js",
        "#colours": "./read/colours.js",
        "#legend": "./structure/legend.js",
        "#message-tree": "./structure/message-tree.js",
        "#messages-sheet": "./interpret/messages-sheet.js",
        "#module-importer": "./importer/module-importer.js",
        "#raw": "./read/raw.js",
        "#report": "./report/format.js",
        "#scripts": "./interpret/scripts.js",
        "#side-sheets": "./interpret/side-sheets.js",
        "#workbook-reader": "./read/workbook-reader.js"
    },
    "dependencies": {
        "@health-dev-portal/spec-model": "*",
        "exceljs": "4.4.0"
    },
    "scripts": {
        "test": "node --test \"test/**/*.test.js\""
    }
}
```

Run: `npm install` — Expected: exceljs 4.4.0 installed, `package-lock.json` updated.

- [ ] **Step 2: Write the failing tests**

`packages/importer/test/colours.test.js`:

```js
/*
 * Colour resolution. Tab colours in the real workbooks are often theme colours ({ theme: 9 }) that only the workbook's
 * own theme part turns into a value; openpyxl could not, and its reading wrongly found most tabs uncoloured (design
 * record §5.1).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { parseThemeColours, resolveColour } = require( "#colours" );

// The colour scheme of e-Prescription 1.5.1's theme part, as measured on 2026-10-19.
const THEME_XML = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements><a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="5B9BD5"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>
<a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme></a:themeElements></a:theme>`;

const theme = parseThemeColours( THEME_XML );

const channels = ( hex ) => [ 0, 2, 4 ].map( ( index ) => parseInt( hex.slice( index, index + 2 ), 16 ) );

describe( "colours", () => {

    it( "reads the scheme, system colours included", () => {
        assert.equal( theme.dk1, "000000" );
        assert.equal( theme.lt1, "FFFFFF" );
        assert.equal( theme.accent6, "70AD47" );
        assert.equal( theme.folHlink, "954F72" );
    } );

    it( "resolves theme indices in SpreadsheetML order, where 0 is lt1 and 1 is dk1", () => {
        // Measured: the default font colour is { theme: 1 } and renders black — only true if index 1 is dk1.
        assert.equal( resolveColour( { theme: 1 }, theme ), "000000" );
        assert.equal( resolveColour( { theme: 0 }, theme ), "FFFFFF" );
        // The real tabs: { theme: 9 } is green ("working, unchanged"), { theme: 5 } orange ("not yet working").
        assert.equal( resolveColour( { theme: 9 }, theme ), "70AD47" );
        assert.equal( resolveColour( { theme: 5 }, theme ), "ED7D31" );
    } );

    it( "applies a negative tint by darkening", () => {
        // The real "Change Notes" tab: white darkened 15% is Excel's D9D9D9.
        assert.equal( resolveColour( { theme: 0, tint: -0.1499984740745262 }, theme ), "D9D9D9" );
    } );

    it( "applies a positive tint by lightening, within one step per channel of Excel's value", () => {
        // The real "Легенда" tab: accent1 lightened 80% is Excel's DDEBF7. Excel rounds through 0–255 integers.
        const got = channels( resolveColour( { theme: 4, tint: 0.7999816888943144 }, theme ) );
        channels( "DDEBF7" ).forEach( ( expected, index ) => assert.ok( Math.abs( got[ index ] - expected ) <= 1, `${ got } vs DDEBF7` ) );
    } );

    it( "resolves direct colours and drops the alpha byte", () => {
        assert.equal( resolveColour( { argb: "FFC65911" }, theme ), "C65911" );
        assert.equal( resolveColour( { argb: "ff70ad47" }, theme ), "70AD47" );
    } );

    it( "returns null for what it cannot resolve", () => {
        assert.equal( resolveColour( null, theme ), null );
        assert.equal( resolveColour( undefined, theme ), null );
        assert.equal( resolveColour( { indexed: 64 }, theme ), null );
        assert.equal( resolveColour( { theme: 42 }, theme ), null );
        assert.equal( resolveColour( { theme: 9 }, {} ), null );
        assert.deepEqual( parseThemeColours( undefined ), {} );
        assert.deepEqual( parseThemeColours( "<not-a-theme/>" ), {} );
    } );
} );
```

`packages/importer/test/workbook-reader.test.js`:

```js
/*
 * The workbook reader: exceljs in, plain frozen raw sheets out, with the formatting the importer depends on — fill,
 * indentation, font colour, tab colour — and every cell as trimmed text.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const ExcelJS = require( "exceljs" );
const { readWorkbook } = require( "#workbook-reader" );
const { cellAt, columnMap, findRow } = require( "#raw" );

async function sampleBuffer() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet( "P001", { properties: { tabColor: { argb: "FF70AD47" } } } );
    sheet.getCell( "A1" ).value = "Name";
    sheet.getCell( "B1" ).value = "Изпращач ";
    const group = sheet.getCell( "A3" );
    group.value = "Header";
    group.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBDD7EE" } };
    const field = sheet.getCell( "A4" );
    field.value = "Type of sender";
    field.alignment = { indent: 1 };
    sheet.getCell( "A5" ).value = { richText: [ { text: "Rich " }, { text: "text" } ] };
    const note = sheet.getCell( "A6" );
    note.value = "Breaking change";
    note.font = { color: { argb: "FFC65911" } };
    sheet.getCell( "F7" ).value = 4;
    sheet.getCell( "A8" ).value = { formula: "1+1", result: 2 };
    workbook.addWorksheet( "Change Notes" ).getCell( "A1" ).value = "Версия 1.0.0";
    return workbook.xlsx.writeBuffer();
}

describe( "readWorkbook", () => {
    let workbook;

    before( async () => {
        workbook = await readWorkbook( Buffer.from( await sampleBuffer() ) );
    } );

    it( "lists the sheets in order with their tab colours", () => {
        assert.deepEqual( workbook.sheets.map( ( sheet ) => sheet.name ), [ "P001", "Change Notes" ] );
        assert.equal( workbook.sheets[ 0 ].tabColour, "70AD47" );
        assert.equal( workbook.sheets[ 1 ].tabColour, null );
    } );

    it( "keeps fills and indentation, and only non-empty rows, numbered as in Excel", () => {
        const sheet = workbook.sheets[ 0 ];
        assert.deepEqual( sheet.rows.map( ( row ) => row.number ), [ 1, 3, 4, 5, 6, 7, 8 ] );
        const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === "Header" );
        assert.equal( cellAt( header, 1 ).fill, "BDD7EE" );
        assert.equal( cellAt( header, 1 ).indent, 0 );
        assert.equal( cellAt( findRow( sheet, ( row ) => row.number === 4 ), 1 ).indent, 1 );
        assert.equal( cellAt( findRow( sheet, ( row ) => row.number === 4 ), 1 ).fill, null );
    } );

    it( "turns every value into trimmed text without evaluating formulas", () => {
        const sheet = workbook.sheets[ 0 ];
        const byNumber = ( number ) => sheet.rows.find( ( row ) => row.number === number );
        assert.equal( columnMap( byNumber( 1 ) ).get( "Изпращач" ), 2 );
        assert.equal( cellAt( byNumber( 5 ), 1 ).text, "Rich text" );
        assert.equal( cellAt( byNumber( 7 ), 6 ).text, "4" );
        assert.equal( cellAt( byNumber( 8 ), 1 ).text, "2" );
    } );

    it( "keeps font colours", () => {
        const row = workbook.sheets[ 0 ].rows.find( ( candidate ) => candidate.number === 6 );
        assert.equal( cellAt( row, 1 ).fontColour, "C65911" );
    } );

    it( "returns empty cells for columns a row does not have", () => {
        const row = workbook.sheets[ 0 ].rows[ 0 ];
        assert.deepEqual( cellAt( row, 40 ), { text: "", fill: null, fontColour: null, indent: 0 } );
        assert.deepEqual( cellAt( row, null ).text, "" );
    } );

    it( "freezes what it returns", () => {
        assert.ok( Object.isFrozen( workbook.sheets ) );
        assert.ok( Object.isFrozen( workbook.sheets[ 0 ].rows[ 0 ].cells[ 0 ] ) );
    } );

    it( "reads a file path as well as a buffer", async () => {
        const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "hdp-reader-" ) ), "sample.xlsx" );
        fs.writeFileSync( file, Buffer.from( await sampleBuffer() ) );
        const fromFile = await readWorkbook( file );
        assert.equal( fromFile.sheets[ 0 ].tabColour, "70AD47" );
    } );
} );
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --workspace @health-dev-portal/importer`
Expected: FAIL — `Cannot find module '…/read/colours.js'`.

- [ ] **Step 4: Implement**

`packages/importer/read/raw.js`:

```js
/**
 * The cell a missing column reads as.
 *
 * @type {Readonly<import( "#workbook-reader" ).RawCell>}
 * @public
 */
const EMPTY_CELL = Object.freeze( { text: "", fill: null, fontColour: null, indent: 0 } );
module.exports.EMPTY_CELL = EMPTY_CELL;

/**
 * Returns a row's cell at a 1-based column, or an empty cell.
 *
 * @method
 * @param {{cells: Object[]}} row
 * @param {number|null|undefined} column
 * @returns {{text: string, fill: string|null, fontColour: string|null, indent: number}}
 * @public
 */
module.exports.cellAt = ( row, column ) => ( column && row.cells[ column - 1 ] ) || EMPTY_CELL;

/**
 * Maps each non-empty header text of a row to its 1-based column; the first occurrence of a text wins.
 *
 * @method
 * @param {{cells: Object[]}} headerRow
 * @returns {Map<string, number>}
 * @public
 */
module.exports.columnMap = ( headerRow ) => {
    const map = new Map();
    headerRow.cells.forEach( ( cell, index ) => {
        if ( cell.text && !map.has( cell.text ) ) {
            map.set( cell.text, index + 1 );
        }
    } );
    return map;
};

/**
 * Finds the first row among a sheet's first rows that satisfies a predicate — a header row is not always row 1.
 *
 * @method
 * @param {{rows: Object[]}} sheet
 * @param {function( Object ): boolean} predicate
 * @param {number} [withinRows]
 * @returns {Object|null}
 * @public
 */
module.exports.findRow = ( sheet, predicate, withinRows = 10 ) => sheet.rows.find( ( row ) => row.number <= withinRows && predicate( row ) ) || null;
```

`packages/importer/read/colours.js`:

```js
// SpreadsheetML numbers theme colours in this order — not the order the scheme is written in the theme part, where dk1
// comes first. Measured on e-Prescription 1.5.1: the default font colour is { theme: 1 } and renders black, which only
// holds if index 1 is dk1.
const THEME_ORDER = Object.freeze( [ "lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink" ] );

/**
 * Reads the colour scheme of a workbook's theme part.
 *
 * @method
 * @param {string|undefined} themeXml The raw XML of `xl/theme/theme1.xml`.
 * @returns {Object<string, string>} Slot name (`dk1`, `accent6`, …) to six upper-case hex digits.
 * @public
 */
module.exports.parseThemeColours = ( themeXml ) => {
    const colours = {};
    if ( typeof themeXml !== "string" ) {
        return colours;
    }
    const scheme = themeXml.match( /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/ );
    if ( !scheme ) {
        return colours;
    }
    for ( const slot of THEME_ORDER ) {
        const element = scheme[ 0 ].match( new RegExp( `<a:${ slot }>([\\s\\S]*?)</a:${ slot }>` ) );
        if ( !element ) {
            continue;
        }
        // A system colour (windowText, window) carries its rendered value as lastClr.
        const value = element[ 1 ].match( /srgbClr val="([0-9A-Fa-f]{6})"/ ) || element[ 1 ].match( /lastClr="([0-9A-Fa-f]{6})"/ );
        if ( value ) {
            colours[ slot ] = value[ 1 ].toUpperCase();
        }
    }
    return colours;
};

const toHex = ( unit ) => Math.round( Math.min( 1, Math.max( 0, unit ) ) * 255 ).toString( 16 ).padStart( 2, "0" ).toUpperCase();

function hueToChannel( p, q, t ) {
    if ( t < 0 ) t += 1;
    if ( t > 1 ) t -= 1;
    if ( t < 1 / 6 ) return p + ( q - p ) * 6 * t;
    if ( t < 1 / 2 ) return q;
    if ( t < 2 / 3 ) return p + ( q - p ) * ( 2 / 3 - t ) * 6;
    return p;
}

// SpreadsheetML's tint works on HSL luminance: a negative tint darkens by that fraction, a positive one moves the
// luminance that fraction of the way to white.
function applyTint( hex, tint ) {
    if ( !tint ) {
        return hex;
    }
    const [ r, g, b ] = [ 0, 2, 4 ].map( ( index ) => parseInt( hex.slice( index, index + 2 ), 16 ) / 255 );
    const max = Math.max( r, g, b );
    const min = Math.min( r, g, b );
    let hue = 0;
    let saturation = 0;
    let luminance = ( max + min ) / 2;
    if ( max !== min ) {
        const delta = max - min;
        saturation = luminance > 0.5 ? delta / ( 2 - max - min ) : delta / ( max + min );
        hue = max === r ? ( g - b ) / delta + ( g < b ? 6 : 0 ) : max === g ? ( b - r ) / delta + 2 : ( r - g ) / delta + 4;
        hue /= 6;
    }
    luminance = tint < 0 ? luminance * ( 1 + tint ) : luminance * ( 1 - tint ) + tint;
    if ( saturation === 0 ) {
        return toHex( luminance ).repeat( 3 );
    }
    const q = luminance < 0.5 ? luminance * ( 1 + saturation ) : luminance + saturation - luminance * saturation;
    const p = 2 * luminance - q;
    return toHex( hueToChannel( p, q, hue + 1 / 3 ) ) + toHex( hueToChannel( p, q, hue ) ) + toHex( hueToChannel( p, q, hue - 1 / 3 ) );
}

/**
 * Resolves an exceljs colour object to six upper-case hex digits.
 *
 * @method
 * @param {{argb?: string, theme?: number, tint?: number, indexed?: number}|null|undefined} colour
 * @param {Object<string, string>} themeColours From `parseThemeColours`.
 * @returns {string|null} `null` when there is no colour or it cannot be resolved (indexed palette, unknown theme slot).
 * @public
 */
module.exports.resolveColour = ( colour, themeColours ) => {
    if ( !colour ) {
        return null;
    }
    if ( typeof colour.argb === "string" && /^[0-9A-Fa-f]{8}$/.test( colour.argb ) ) {
        return applyTint( colour.argb.slice( 2 ).toUpperCase(), colour.tint );
    }
    if ( Number.isInteger( colour.theme ) ) {
        const base = themeColours[ THEME_ORDER[ colour.theme ] ];
        return base ? applyTint( base, colour.tint ) : null;
    }
    return null;
};
```

`packages/importer/read/workbook-reader.js`:

```js
const ExcelJS = require( "exceljs" );
const { EMPTY_CELL } = require( "#raw" );
const { parseThemeColours, resolveColour } = require( "#colours" );

/**
 * @typedef {Object} RawCell
 * @property {string} text The value as trimmed text; a formula's cached result, never evaluated.
 * @property {string|null} fill Six hex digits of a pattern fill, or `null`.
 * @property {string|null} fontColour
 * @property {number} indent
 */

/**
 * @typedef {Object} RawRow
 * @property {number} number The Excel row number.
 * @property {RawCell[]} cells Index 0 is column A.
 */

/**
 * @typedef {Object} RawSheet
 * @property {string} name
 * @property {string|null} tabColour
 * @property {RawRow[]} rows Only rows with values.
 */

/**
 * @typedef {Object} RawWorkbook
 * @property {RawSheet[]} sheets
 * @property {Object<string, string>} themeColours
 */

function cellText( value ) {
    if ( value === null || value === undefined ) {
        return "";
    }
    if ( typeof value === "string" ) {
        return value.replace( /\r\n?/g, "\n" ).trim();
    }
    if ( typeof value === "number" || typeof value === "boolean" ) {
        return String( value );
    }
    if ( value instanceof Date ) {
        return value.toISOString().slice( 0, 10 );
    }
    if ( Array.isArray( value.richText ) ) {
        return cellText( value.richText.map( ( part ) => part.text ).join( "" ) );
    }
    if ( "result" in value ) {
        // A formula: its cached result. Nothing in an uploaded workbook is ever evaluated.
        return cellText( value.result );
    }
    if ( "text" in value ) {
        return cellText( value.text );
    }
    return "";
}

function toRawCell( cell, themeColours ) {
    const patterned = cell.fill && cell.fill.type === "pattern" && cell.fill.pattern !== "none";
    return Object.freeze( {
        text: cellText( cell.value ),
        fill: patterned ? resolveColour( cell.fill.fgColor, themeColours ) : null,
        fontColour: cell.font && cell.font.color ? resolveColour( cell.font.color, themeColours ) : null,
        indent: cell.alignment && Number.isInteger( cell.alignment.indent ) ? cell.alignment.indent : 0
    } );
}

function toRawSheet( worksheet, themeColours ) {
    const rows = [];
    worksheet.eachRow( { includeEmpty: false }, ( row, number ) => {
        const cells = [];
        row.eachCell( { includeEmpty: true }, ( cell, column ) => {
            cells[ column - 1 ] = toRawCell( cell, themeColours );
        } );
        rows.push( Object.freeze( { number: number, cells: Object.freeze( Array.from( cells, ( cell ) => cell || EMPTY_CELL ) ) } ) );
    } );
    return Object.freeze( {
        name: worksheet.name,
        tabColour: resolveColour( worksheet.properties.tabColor, themeColours ),
        rows: Object.freeze( rows )
    } );
}

/**
 * Reads a workbook into raw sheets: values as text plus the formatting that carries meaning in the specification
 * template (design record §5.1, §5.7).
 *
 * @method
 * @param {string|Buffer} source A file path or the file's bytes.
 * @returns {Promise<RawWorkbook>}
 * @throws {Error} When the file cannot be read as a workbook.
 * @public
 */
module.exports.readWorkbook = async ( source ) => {
    const workbook = new ExcelJS.Workbook();
    if ( Buffer.isBuffer( source ) ) {
        await workbook.xlsx.load( source );
    } else {
        await workbook.xlsx.readFile( source );
    }
    // exceljs keeps the theme part only as raw XML on this field; it is the only way theme-indexed colours resolve.
    const themeColours = Object.freeze( parseThemeColours( workbook._themes && workbook._themes.theme1 ) );
    return Object.freeze( {
        sheets: Object.freeze( workbook.worksheets.map( ( worksheet ) => toRawSheet( worksheet, themeColours ) ) ),
        themeColours: themeColours
    } );
};
```

- [ ] **Step 5: Run the tests and lint**

Run: `npm test` then `npm run lint`
Expected: importer 13 tests pass (6 colours + 7 reader); spec-model still 19; lint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add package-lock.json packages/importer
git commit -m "feat(importer): read workbooks into raw sheets, resolving theme colours and tints (HEL-13)"
```

The body records the measured facts the tests pin: theme index order (1 = dk1), `D9D9D9` for the darkened tab, the
one-step tolerance on positive tints.

---

### Task 4: Cell parsers and script checks

**Files:**
- Create: `packages/importer/interpret/cells.js`, `packages/importer/interpret/scripts.js`
- Test: `packages/importer/test/cells.test.js`, `packages/importer/test/scripts.test.js`

**Interfaces:**
- Produces: `#cells` → `isNone( text ): boolean`, `noneToNull( text ): string|null`,
  `parseRequirement( text ): "R"|"C"|"O"|null`, `parseCardinality( text ): {min, max}|null`,
  `parseConstraint( text, dataType ): { constraint: Constraint|null, unparsed: string[] }`,
  `parseReferenceList( text, kind: "rule"|"condition"|"codeList" ): { values: string[], invalid: string[] }`.
- Produces: `#scripts` → `foldLookAlikes( text ): { folded: string, letters: string[] }`,
  `findMixedScriptWords( text ): string[]`.

- [ ] **Step 1: Write the failing tests**

`packages/importer/test/cells.test.js`:

```js
/*
 * Parsers for the cell formats of the specification template, with the formats measured in e-Prescription 1.5.1.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { isNone, noneToNull, parseCardinality, parseConstraint, parseReferenceList, parseRequirement } = require( "#cells" );

describe( "cells", () => {

    it( "treats an empty cell and a run of dashes as no value", () => {
        for ( const text of [ "", "-", "---" ] ) {
            assert.equal( isNone( text ), true, text );
            assert.equal( noneToNull( text ), null, text );
        }
        assert.equal( noneToNull( "lrn" ), "lrn" );
    } );

    it( "parses R, C and O and nothing else", () => {
        assert.equal( parseRequirement( "R" ), "R" );
        assert.equal( parseRequirement( "C" ), "C" );
        assert.equal( parseRequirement( "O" ), "O" );
        // Folding a Cyrillic О is the caller's job (and its warning); the parser sees only Latin.
        assert.equal( parseRequirement( "О" ), null );
        assert.equal( parseRequirement( "" ), null );
        assert.equal( parseRequirement( "r" ), null );
    } );

    it( "parses cardinalities, with * as unbounded", () => {
        assert.deepEqual( parseCardinality( "1..1" ), { min: 1, max: 1 } );
        assert.deepEqual( parseCardinality( "0..1" ), { min: 0, max: 1 } );
        assert.deepEqual( parseCardinality( "1..*" ), { min: 1, max: null } );
        assert.deepEqual( parseCardinality( "1..3" ), { min: 1, max: 3 } );
        assert.equal( parseCardinality( "1-1" ), null );
        assert.equal( parseCardinality( "" ), null );
    } );

    it( "splits a text constraint into lengths, character set and format", () => {
        assert.deepEqual( parseConstraint( "min=1, max=255, chars=an", "String" ),
            { constraint: { raw: "min=1, max=255, chars=an", minLength: 1, maxLength: 255, charset: "an" }, unparsed: [] } );
        assert.equal( parseConstraint( "YYYY-MM-DD", "Date" ).constraint.format, "date" );
        assert.equal( parseConstraint( "ISO 8601", "Date and Time" ).constraint.format, "date-time" );
        assert.equal( parseConstraint( "true/false", "Boolean" ).constraint.format, "boolean" );
        // YYMMDD is the expiry-date format of P005 and P011 (design record §5.7).
        assert.equal( parseConstraint( "YYMMDD", "String" ).constraint.format, "yymmdd" );
    } );

    it( "reads bounds on a numeric type as values, not lengths", () => {
        // P001 allowedRepeatsNumber: Unsigned Int, "max=1" — the value 1, not one digit.
        assert.deepEqual( parseConstraint( "max=1", "Unsigned Int" ).constraint, { raw: "max=1", maxValue: 1 } );
        assert.deepEqual( parseConstraint( "min=1", "Positive Int" ).constraint, { raw: "min=1", minValue: 1 } );
    } );

    it( "keeps what it does not understand, and reports it", () => {
        assert.deepEqual( parseConstraint( "max=36, odd one", "String" ),
            { constraint: { raw: "max=36, odd one", maxLength: 36 }, unparsed: [ "odd one" ] } );
        assert.deepEqual( parseConstraint( "---", "String" ), { constraint: null, unparsed: [] } );
        assert.deepEqual( parseConstraint( "", null ), { constraint: null, unparsed: [] } );
    } );

    it( "splits reference lists and separates the invalid entries", () => {
        assert.deepEqual( parseReferenceList( "RL026,RL059,RL067", "rule" ), { values: [ "RL026", "RL059", "RL067" ], invalid: [] } );
        assert.deepEqual( parseReferenceList( "CDP11, CDP30 CDP31", "condition" ), { values: [ "CDP11", "CDP30", "CDP31" ], invalid: [] } );
        // Other modules use other prefixes: e-Referral's conditions are CDR… (Review Focus 1).
        assert.deepEqual( parseReferenceList( "CDR07", "condition" ), { values: [ "CDR07" ], invalid: [] } );
        assert.deepEqual( parseReferenceList( "CLS02", "codeList" ), { values: [ "CLS02" ], invalid: [] } );
        assert.deepEqual( parseReferenceList( "CL007 see note", "codeList" ), { values: [ "CL007" ], invalid: [ "see", "note" ] } );
        assert.deepEqual( parseReferenceList( "---", "rule" ), { values: [], invalid: [] } );
        assert.throws( () => parseReferenceList( "X", "nope" ), TypeError );
    } );
} );
```

`packages/importer/test/scripts.test.js`:

```js
/*
 * Look-alike letters. A Cyrillic letter that looks Latin has already broken three things in the published
 * specifications: CDP08's 'Т3' (HEL-3), CL999's 'Е003' (HEL-4) and 30 requirement cells holding 'О' (HEL-12).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { findMixedScriptWords, foldLookAlikes } = require( "#scripts" );

describe( "scripts", () => {

    it( "folds look-alikes in a code and names each folded letter", () => {
        assert.deepEqual( foldLookAlikes( "О" ), { folded: "O", letters: [ "О U+041E" ] } );
        assert.deepEqual( foldLookAlikes( "Т3" ).folded, "T3" );
        assert.deepEqual( foldLookAlikes( "Е003" ).folded, "E003" );
    } );

    it( "leaves a value alone when folding would not make it entirely Latin", () => {
        // A genuine Bulgarian word in a fixed value must never be rewritten.
        assert.deepEqual( foldLookAlikes( "Обща" ), { folded: "Обща", letters: [] } );
        assert.deepEqual( foldLookAlikes( "P001" ), { folded: "P001", letters: [] } );
        assert.deepEqual( foldLookAlikes( "" ), { folded: "", letters: [] } );
    } );

    it( "finds words that mix Latin and Cyrillic letters", () => {
        // HEL-10: a Latin E before Cyrillic letters, invisible on screen.
        assert.deepEqual( findMixedScriptWords( "Потвърждение за успешно създаване на E-рецепта" ), [ "E-рецепта" ] );
        // P001 row 16: a Cyrillic Е before Latin letters.
        assert.deepEqual( findMixedScriptWords( "Е-prescription LRN" ), [ "Е-prescription" ] );
        assert.deepEqual( findMixedScriptWords( "ePrescription Issue Request" ), [] );
        assert.deepEqual( findMixedScriptWords( "Заявка за създаване на Е-рецепта" ), [] );
        assert.deepEqual( findMixedScriptWords( "" ), [] );
    } );
} );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace @health-dev-portal/importer`
Expected: FAIL — `Cannot find module '…/interpret/cells.js'`.

- [ ] **Step 3: Implement**

`packages/importer/interpret/cells.js`:

```js
const NONE = /^-+$/;

const NUMERIC_TYPES = new Set( [ "Unsigned Int", "Positive Int", "Decimal", "Integer" ] );

const FORMATS = Object.freeze( {
    "YYYY-MM-DD": "date",
    "ISO 8601": "date-time",
    "YYMMDD": "yymmdd",
    "true/false": "boolean"
} );

const REFERENCE_PATTERNS = Object.freeze( {
    rule: /^RL\d+$/,
    // CDP… in e-Prescription, CDR… in e-Referral: the module letter varies.
    condition: /^CD[A-Z]+\d+$/,
    codeList: /^CL[A-Z0-9]+$/
} );

/**
 * Tells whether a cell holds no value: empty, or the template's "---".
 *
 * @method
 * @param {string} text
 * @returns {boolean}
 * @public
 */
module.exports.isNone = ( text ) => text === "" || NONE.test( text );

/**
 * Returns the text, or `null` when it holds no value.
 *
 * @method
 * @param {string} text
 * @returns {string|null}
 * @public
 */
module.exports.noneToNull = ( text ) => ( module.exports.isNone( text ) ? null : text );

/**
 * Parses an R/C/O cell.
 *
 * @method
 * @param {string} text Already folded to Latin by the caller.
 * @returns {"R"|"C"|"O"|null}
 * @public
 */
module.exports.parseRequirement = ( text ) => ( [ "R", "C", "O" ].includes( text ) ? text : null );

/**
 * Parses a cardinality such as `0..1` or `1..*`.
 *
 * @method
 * @param {string} text
 * @returns {{min: number, max: number|null}|null}
 * @public
 */
module.exports.parseCardinality = ( text ) => {
    const match = /^(\d+)\.\.(\d+|\*)$/.exec( text );
    if ( !match ) {
        return null;
    }
    return { min: Number( match[ 1 ] ), max: match[ 2 ] === "*" ? null : Number( match[ 2 ] ) };
};

/**
 * Splits a constraint cell into its parts.
 *
 * @method
 * @param {string} text e.g. `min=1, max=255, chars=an`.
 * @param {string|null} dataType On a numeric type, `min`/`max` bound the value rather than the length.
 * @returns {{constraint: import( "@health-dev-portal/spec-model/definitions" ).Constraint|null, unparsed: string[]}}
 * @public
 */
module.exports.parseConstraint = ( text, dataType ) => {
    if ( module.exports.isNone( text ) ) {
        return { constraint: null, unparsed: [] };
    }
    const numeric = NUMERIC_TYPES.has( dataType );
    const constraint = { raw: text };
    const unparsed = [];
    for ( const token of text.split( "," ).map( ( part ) => part.trim() ).filter( Boolean ) ) {
        const bound = /^(min|max)=(\d+)$/.exec( token );
        const charset = /^chars=(\w+)$/.exec( token );
        if ( bound ) {
            constraint[ bound[ 1 ] + ( numeric ? "Value" : "Length" ) ] = Number( bound[ 2 ] );
        } else if ( charset ) {
            constraint.charset = charset[ 1 ];
        } else if ( Object.hasOwn( FORMATS, token ) ) {
            constraint.format = FORMATS[ token ];
        } else {
            unparsed.push( token );
        }
    }
    return { constraint: Object.freeze( constraint ), unparsed: unparsed };
};

/**
 * Splits a list of references (rules, conditions or code lists) on commas, semicolons and whitespace.
 *
 * @method
 * @param {string} text Already folded to Latin by the caller.
 * @param {"rule"|"condition"|"codeList"} kind
 * @returns {{values: string[], invalid: string[]}}
 * @throws {TypeError} When the kind is unknown.
 * @public
 */
module.exports.parseReferenceList = ( text, kind ) => {
    const pattern = REFERENCE_PATTERNS[ kind ];
    if ( !pattern ) {
        throw new TypeError( `Unknown reference kind "${ kind }".` );
    }
    const values = [];
    const invalid = [];
    if ( module.exports.isNone( text ) ) {
        return { values: values, invalid: invalid };
    }
    for ( const token of text.split( /[\s,;]+/ ).filter( ( part ) => part && !NONE.test( part ) ) ) {
        ( pattern.test( token ) ? values : invalid ).push( token );
    }
    return { values: values, invalid: invalid };
};
```

`packages/importer/interpret/scripts.js`:

```js
// Cyrillic letters with a Latin twin in common fonts. Folding is safe only in code columns, where Latin is the only
// valid script, and only when the result is entirely Latin (design record §5.7).
const LOOK_ALIKES = Object.freeze( {
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s"
} );

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const NOT_ASCII = /[^\x20-\x7E]/;

const describeLetter = ( letter ) => `${ letter } U+${ letter.codePointAt( 0 ).toString( 16 ).toUpperCase().padStart( 4, "0" ) }`;

/**
 * Replaces Cyrillic look-alikes with their Latin twins, if that leaves the text entirely ASCII.
 *
 * @method
 * @param {string} text
 * @returns {{folded: string, letters: string[]}} `letters` names each folded letter; empty when nothing was folded.
 * @public
 */
module.exports.foldLookAlikes = ( text ) => {
    const letters = [];
    const folded = Array.from( text, ( letter ) => {
        if ( Object.hasOwn( LOOK_ALIKES, letter ) ) {
            letters.push( describeLetter( letter ) );
            return LOOK_ALIKES[ letter ];
        }
        return letter;
    } ).join( "" );
    if ( letters.length === 0 || NOT_ASCII.test( folded ) ) {
        return { folded: text, letters: [] };
    }
    return { folded: folded, letters: letters };
};

/**
 * Finds words that mix Latin and Cyrillic letters — a slip that is invisible on screen and breaks search and matching.
 *
 * @method
 * @param {string} text
 * @returns {string[]}
 * @public
 */
module.exports.findMixedScriptWords = ( text ) => ( text.match( /[\p{L}\p{N}_-]+/gu ) || [] )
    .filter( ( word ) => LATIN.test( word ) && CYRILLIC.test( word ) );
```

- [ ] **Step 4: Run the tests and lint**

Run: `npm test` then `npm run lint`
Expected: importer 23 tests pass (13 + 7 cells + 3 scripts); lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/importer
git commit -m "feat(importer): cell parsers and look-alike letter checks (HEL-13)"
```

---

### Task 5: The template legend and the message tree

**Files:**
- Create: `packages/importer/structure/legend.js`, `packages/importer/structure/message-tree.js`
- Create: `packages/importer/test/support/raw-builders.js`, `packages/importer/test/support/fixtures.js`
- Test: `packages/importer/test/message-tree.test.js`

**Interfaces:**
- Consumes: `#raw`, `#cells`, `#scripts`; spec-model `anomalies`, `freeze`, `identity`, `kinds`, `validation`.
- Produces: `#legend` → `ROW_FILLS` (hex → kind), `NEUTRAL_FILLS` (string[]), `END_FILL` (string),
  `TAB_STATUS` (hex → `{ lifecycle, changed }`), `NOTE_FONTS` (hex → category).
- Produces: `#message-tree` → `buildMessageTree( sheet: RawSheet ): { elements: ElementNode[], anomalies: Anomaly[] }`.
- Produces (test support): `raw-builders.js` → `cell`, `row`, `sheet`, `element( number, depth, kind, values )`,
  `endRow( number, depth, name )`, `messageSheet( name, rows, tabColour = "70AD47" )`, `MESSAGE_HEADER`;
  `fixtures.js` → `prescriptionRows()`, `confirmationRows()`.

- [ ] **Step 1: Write the test support**

`packages/importer/test/support/raw-builders.js`:

```js
/*
 * Builders for raw sheets, the reader's output, so the pure stages are tested without writing .xlsx files.
 */

const MESSAGE_HEADER = Object.freeze( [ "Name", "R/C/O", "Cardinality", "Data types", "Constraint", "Fixed Value", "Default Value",
    "Rules", "Conditions", "Code Lists", "Field Name / Tag", "Attribute", "Описание на значението на елемента" ] );

// The keys `element()` accepts, in the template's column order.
const ELEMENT_KEYS = Object.freeze( [ "name", "req", "card", "type", "constraint", "fixed", "default", "rules", "conditions",
    "codeList", "tag", "attribute", "description" ] );

const KIND_FILLS = Object.freeze( { group: "BDD7EE", field: null, polymorphic: "FCE4D6", attribute: "FFF2CC", end: "F2F2F2" } );

const cell = ( text, style = {} ) => Object.freeze( {
    text: text === null || text === undefined ? "" : String( text ),
    fill: style.fill || null,
    fontColour: style.fontColour || null,
    indent: style.indent || 0
} );

// The style applies to the first cell only: the template carries fill and indentation in column A.
const row = ( number, values, firstCellStyle = {} ) => Object.freeze( {
    number: number,
    cells: Object.freeze( values.map( ( value, index ) => cell( value, index === 0 ? firstCellStyle : {} ) ) )
} );

const sheet = ( name, rows, tabColour = null ) => Object.freeze( { name: name, tabColour: tabColour, rows: Object.freeze( rows ) } );

const element = ( number, depth, kind, values ) => row( number, ELEMENT_KEYS.map( ( key ) => values[ key ] ), { fill: KIND_FILLS[ kind ], indent: depth } );

const endRow = ( number, depth, name ) => row( number, [ `END of ${ name }` ], { fill: KIND_FILLS.end, indent: depth } );

const messageSheet = ( name, rows, tabColour = "70AD47" ) => sheet( name, [ row( 1, MESSAGE_HEADER ), ...rows ], tabColour );

module.exports = { MESSAGE_HEADER, cell, row, sheet, element, endRow, messageSheet };
```

`packages/importer/test/support/fixtures.js`:

```js
/*
 * Synthetic message trees shaped like e-Prescription P001 and P002 (values from the public 1.5.1 workbook), small
 * enough to reason about: every element kind, an attribute row, a polymorphic element and an END row.
 */

const { element, endRow } = require( "./raw-builders" );

const prescriptionRows = () => [
    element( 3, 0, "group", { name: "Header", req: "R", card: "1..1", tag: "header" } ),
    element( 4, 1, "field", { name: "Type of sender", req: "R", card: "1..1", type: "Codeable Concept", codeList: "CL018", tag: "sender", attribute: "value", description: "Тип изпращач на съобщението" } ),
    endRow( 5, 0, "Header" ),
    element( 6, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
    element( 7, 1, "group", { name: "*Prescription", req: "R", card: "1..1", tag: "prescription" } ),
    element( 8, 2, "field", { name: "Prescription LRN", req: "R", card: "1..1", type: "String", constraint: "max=36, chars=an", tag: "lrn", attribute: "value", description: "Уникален номер" } ),
    element( 9, 2, "field", { name: "Is Prescription Protocol Based", req: "C", card: "0..1", type: "Boolean", constraint: "true/false", default: "false", conditions: "CDP01", tag: "isProtocolBased", attribute: "value" } ),
    element( 10, 2, "group", { name: "**Medication Group", req: "R", card: "1..*", conditions: "CDP19", tag: "group" } ),
    element( 11, 3, "group", { name: "***Medication", req: "R", card: "1..*", rules: "RL083", conditions: "CDP29", tag: "medication" } ),
    element( 12, 4, "field", { name: "Medication Identifier", req: "R", card: "1..1", type: "Codeable Concept", rules: "RL026,RL059", codeList: "CL009", tag: "medicationCode", attribute: "value" } ),
    element( 13, 5, "attribute", { name: "Medication Name and Details", req: "O", card: "0..1", type: "Codeable Concept", rules: "RL023", codeList: "CL009", tag: "medicationCode", attribute: "name" } ),
    element( 14, 4, "polymorphic", { name: "Dose Quantity Unit", req: "R", card: "1..1", type: "---", tag: "---" } ),
    element( 15, 5, "field", { name: "Dose Quantity Unit - as UCUM Entry", req: "R", card: "1..1", type: "String", rules: "RL027", tag: "doseQuantityCode", attribute: "value" } ),
    element( 16, 5, "field", { name: "Dose Quantity Unit - as Medication Form", req: "R", card: "1..1", type: "Codeable Concept", codeList: "CL035", tag: "doseQuantityCode", attribute: "value" } ),
    element( 17, 2, "field", { name: "Number of Repeats Allowed", req: "C", card: "0..1", type: "Unsigned Int", constraint: "max=1", conditions: "CDP21", tag: "allowedRepeatsNumber", attribute: "value" } )
];

const confirmationRows = () => [
    element( 3, 0, "group", { name: "Header", req: "R", card: "1..1", tag: "header" } ),
    element( 4, 1, "field", { name: "Message ID", req: "R", card: "1..1", type: "String", constraint: "min=36, max=36", tag: "messageId", attribute: "value" } ),
    element( 5, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
    element( 6, 1, "field", { name: "Prescription NRN", req: "R", card: "1..1", type: "String", constraint: "min=12, max=12, chars=an", tag: "nrnPrescription", attribute: "value" } )
];

module.exports = { prescriptionRows, confirmationRows };
```

- [ ] **Step 2: Write the failing test**

`packages/importer/test/message-tree.test.js`:

```js
/*
 * A message sheet into an element tree (design record §5.3, "Structure" and "Interpret"): depth from indentation,
 * kind from fill, identities from tags, and every anomaly at its row.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildMessageTree } = require( "#message-tree" );
const { element, endRow, messageSheet, row, sheet, MESSAGE_HEADER } = require( "./support/raw-builders" );
const { prescriptionRows } = require( "./support/fixtures" );

const flatten = ( elements ) => elements.flatMap( ( node ) => [ node, ...flatten( node.children ) ] );
const find = ( tree, identity ) => flatten( tree.elements ).find( ( node ) => node.identity === identity );
const types = ( tree ) => tree.anomalies.map( ( anomaly ) => anomaly.type );

describe( "buildMessageTree", () => {

    it( "builds the tree and gives every element its identity", () => {
        const tree = buildMessageTree( messageSheet( "P001", prescriptionRows() ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.deepEqual( flatten( tree.elements ).map( ( node ) => node.identity ), [
            "header",
            "header/sender@value",
            "contents",
            "contents/prescription",
            "contents/prescription/lrn@value",
            "contents/prescription/isProtocolBased@value",
            "contents/prescription/group",
            "contents/prescription/group/medication",
            "contents/prescription/group/medication/medicationCode@value",
            "contents/prescription/group/medication/medicationCode@name",
            "contents/prescription/group/medication/doseQuantityCode@value",
            "contents/prescription/group/medication/doseQuantityCode@value#1",
            "contents/prescription/group/medication/doseQuantityCode@value#2",
            "contents/prescription/allowedRepeatsNumber@value"
        ] );
    } );

    it( "reads each column of a row", () => {
        const tree = buildMessageTree( messageSheet( "P001", prescriptionRows() ) );
        const lrn = find( tree, "contents/prescription/lrn@value" );
        assert.equal( lrn.kind, "field" );
        assert.deepEqual( lrn.name, { bg: null, en: "Prescription LRN" } );
        assert.equal( lrn.requirement, "R" );
        assert.deepEqual( lrn.cardinality, { min: 1, max: 1 } );
        assert.equal( lrn.dataType, "String" );
        assert.deepEqual( lrn.constraint, { raw: "max=36, chars=an", maxLength: 36, charset: "an" } );
        assert.deepEqual( lrn.description, { bg: "Уникален номер", en: null } );
        assert.deepEqual( lrn.source, { sheet: "P001", row: 8 } );
        const name = find( tree, "contents/prescription/group/medication/medicationCode@name" );
        assert.equal( name.kind, "attribute" );
        assert.equal( name.codeList, "CL009" );
        assert.deepEqual( name.rules, [ "RL023" ] );
        const medication = find( tree, "contents/prescription/group/medication" );
        assert.deepEqual( medication.cardinality, { min: 1, max: null } );
        assert.deepEqual( medication.conditions, [ "CDP29" ] );
        assert.equal( find( tree, "contents/prescription/allowedRepeatsNumber@value" ).constraint.maxValue, 1 );
        assert.equal( find( tree, "contents/prescription/isProtocolBased@value" ).defaultValue, "false" );
        const polymorphic = find( tree, "contents/prescription/group/medication/doseQuantityCode@value" );
        assert.equal( polymorphic.kind, "polymorphic" );
        assert.equal( polymorphic.children.length, 2 );
        assert.equal( polymorphic.tag, null );
    } );

    it( "freezes the tree", () => {
        const tree = buildMessageTree( messageSheet( "P001", prescriptionRows() ) );
        assert.ok( Object.isFrozen( tree.elements[ 0 ].children ) );
    } );

    it( "blocks a row indented two levels below its parent", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 2, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "depth-jump" ] );
        assert.equal( tree.anomalies[ 0 ].level, "blocking" );
        assert.equal( tree.anomalies[ 0 ].row, 4 );
    } );

    it( "folds a Cyrillic О in R/C/O with a warning, and the row still counts as optional", () => {
        // HEL-12: 30 rows of e-Prescription 1.5.1 hold U+041E here.
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Note", req: "О", card: "0..1", tag: "note", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "look-alike-letter" ] );
        assert.equal( tree.anomalies[ 0 ].level, "warning" );
        assert.equal( tree.anomalies[ 0 ].column, 2 );
        assert.equal( find( tree, "contents/note@value" ).requirement, "O" );
    } );

    it( "warns about a mixed-script name", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Е-prescription LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "mixed-script-word" ] );
    } );

    it( "reads a white fill as a field and warns about an unknown fill", () => {
        const rows = [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            row( 4, [ "Plain", "R", "1..1", "", "", "", "", "", "", "", "plain", "value" ], { fill: "FFFFFF", indent: 1 } ),
            row( 5, [ "Odd", "R", "1..1", "", "", "", "", "", "", "", "odd", "value" ], { fill: "123456", indent: 1 } ),
            row( 6, [ "Grey", "R", "1..1", "", "", "", "", "", "", "", "grey", "value" ], { fill: "F2F2F2", indent: 1 } )
        ];
        const tree = buildMessageTree( messageSheet( "P001", rows ) );
        assert.deepEqual( types( tree ), [ "unknown-fill", "end-fill-on-data-row" ] );
        assert.equal( find( tree, "contents/plain@value" ).kind, "field" );
        assert.equal( find( tree, "contents/odd@value" ).kind, "field" );
    } );

    it( "warns when asterisks disagree with indentation or appear on a field", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "group", { name: "**Prescription", req: "R", card: "1..1", tag: "prescription" } ),
            element( 5, 2, "field", { name: "*LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "asterisks-disagree", "asterisks-disagree" ] );
        assert.equal( find( tree, "contents/prescription" ).name.en, "Prescription" );
    } );

    it( "warns about an END row that closes no open group", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } ),
            endRow( 5, 0, "Header" )
        ] ) );
        assert.deepEqual( types( tree ), [ "unexpected-end-row" ] );
    } );

    it( "keeps a field named 'End of Period' (Review Focus 3)", () => {
        // P001 rows 44–47 of e-Prescription 1.5.1: the field sits inside the group its END row then closes.
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "group", { name: "*Effective Dose Period", req: "O", card: "0..1", tag: "effectiveDosePeriod" } ),
            element( 5, 2, "field", { name: "Start of Period", req: "R", card: "1..1", type: "Date", constraint: "YYYY-MM-DD", tag: "start", attribute: "value" } ),
            element( 6, 2, "field", { name: "End of Period", req: "R", card: "1..1", type: "Date", constraint: "YYYY-MM-DD", tag: "end", attribute: "value" } ),
            endRow( 7, 1, "Effective Dose Period" )
        ] ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.ok( find( tree, "contents/effectiveDosePeriod/end@value" ) );
    } );

    it( "blocks two elements with one identity", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } ),
            element( 5, 1, "field", { name: "LRN again", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "duplicate-identity" ] );
    } );

    it( "blocks invalid R/C/O, cardinality and tags, and an attribute outside a field", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "A", req: "X", card: "1..1", tag: "a", attribute: "value" } ),
            element( 5, 1, "field", { name: "B", req: "R", card: "one", tag: "b", attribute: "value" } ),
            element( 6, 1, "field", { name: "C", req: "R", card: "1..1", tag: "---", attribute: "value" } ),
            element( 7, 1, "field", { name: "D", req: "R", card: "1..1", tag: "d e", attribute: "value" } ),
            element( 8, 1, "attribute", { name: "E", req: "O", card: "0..1", tag: "e", attribute: "name" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "invalid-requirement", "invalid-cardinality", "missing-tag", "invalid-tag", "attribute-without-field" ] );
        assert.ok( tree.anomalies.every( ( anomaly ) => anomaly.level === "blocking" ) );
    } );

    it( "warns about unparsed constraints, invalid references and several code lists", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "A", req: "R", card: "1..1", type: "String", constraint: "max=5, weird", rules: "RL1, R2", codeList: "CL001,CL002", tag: "a", attribute: "value" } )
        ] ) );
        assert.deepEqual( types( tree ), [ "unparsed-constraint", "invalid-reference", "multiple-code-lists" ] );
        assert.equal( find( tree, "contents/a@value" ).codeList, "CL001" );
    } );

    it( "skips a note row (Review Focus 2)", () => {
        const tree = buildMessageTree( messageSheet( "P001", [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } ),
            row( 9, [ "Забележка: полето lrn е уникално за УИН." ] )
        ] ) );
        assert.deepEqual( types( tree ), [ "note-row" ] );
        assert.equal( tree.anomalies[ 0 ].level, "warning" );
        assert.equal( flatten( tree.elements ).length, 2 );
    } );

    it( "finds a header row below a title (Review Focus 3)", () => {
        const tree = buildMessageTree( sheet( "P001", [
            row( 1, [ "Заявка за създаване на Е-рецепта" ] ),
            row( 3, MESSAGE_HEADER ),
            element( 4, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 5, 1, "field", { name: "LRN", req: "R", card: "1..1", tag: "lrn", attribute: "value" } )
        ], "70AD47" ) );
        assert.deepEqual( tree.anomalies, [] );
        assert.ok( find( tree, "contents/lrn@value" ) );
    } );

    it( "blocks a sheet without the header or with a column missing", () => {
        assert.deepEqual( types( buildMessageTree( sheet( "P001", [ row( 1, [ "Something else" ] ) ] ) ) ), [ "missing-header-row" ] );
        const missing = buildMessageTree( sheet( "P001", [ row( 1, MESSAGE_HEADER.filter( ( title ) => title !== "Cardinality" ) ) ] ) );
        assert.deepEqual( types( missing ), [ "missing-column" ] );
        assert.equal( missing.anomalies[ 0 ].details.column, "Cardinality" );
        assert.deepEqual( missing.elements, [] );
    } );
} );
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test --workspace @health-dev-portal/importer`
Expected: FAIL — `Cannot find module '…/structure/message-tree.js'`.

- [ ] **Step 4: Implement**

`packages/importer/structure/legend.js`:

```js
const { CHANGE_CATEGORY, ELEMENT_KIND, MESSAGE_LIFECYCLE } = require( "@health-dev-portal/spec-model/kinds" );

/**
 * Row fills of the specification template's legend sheet ("Легенда"), measured on e-Prescription 1.5.1.
 *
 * @type {Readonly<Object<string, string>>}
 * @public
 */
module.exports.ROW_FILLS = Object.freeze( {
    "BDD7EE": ELEMENT_KIND.GROUP,
    "FCE4D6": ELEMENT_KIND.POLYMORPHIC,
    "FFF2CC": ELEMENT_KIND.ATTRIBUTE
} );

/**
 * Fills that mean "no fill": 40 field rows of e-Prescription 1.5.1 are filled white.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
module.exports.NEUTRAL_FILLS = Object.freeze( [ "FFFFFF" ] );

/**
 * The grey of "END of …" rows.
 *
 * @type {string}
 * @public
 */
module.exports.END_FILL = "F2F2F2";

/**
 * Tab colours of the legend: the message's lifecycle and whether the tab claims it changed in this version.
 *
 * @type {Readonly<Object<string, {lifecycle: string, changed: boolean}>>}
 * @public
 */
module.exports.TAB_STATUS = Object.freeze( {
    "70AD47": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.ACTIVE, changed: false } ),
    "FFC000": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.ACTIVE, changed: true } ),
    "ED7D31": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.IN_DEVELOPMENT, changed: true } ),
    "C00000": Object.freeze( { lifecycle: MESSAGE_LIFECYCLE.WITHDRAWN, changed: true } )
} );

/**
 * Font colours of change notes; any other colour is a non-breaking change.
 *
 * @type {Readonly<Object<string, string>>}
 * @public
 */
module.exports.NOTE_FONTS = Object.freeze( {
    "C65911": CHANGE_CATEGORY.BREAKING,
    "C00000": CHANGE_CATEGORY.DROPPED_PLAN
} );
```

`packages/importer/structure/message-tree.js`:

```js
const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );
const { isValidPart, joinPath, withAttribute, withVariant } = require( "@health-dev-portal/spec-model/identity" );
const { ELEMENT_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { validateMessageTree } = require( "@health-dev-portal/spec-model/validation" );
const { cellAt, columnMap, findRow } = require( "#raw" );
const { isNone, noneToNull, parseCardinality, parseConstraint, parseReferenceList, parseRequirement } = require( "#cells" );
const { findMixedScriptWords, foldLookAlikes } = require( "#scripts" );
const { END_FILL, NEUTRAL_FILLS, ROW_FILLS } = require( "#legend" );

const COLUMNS = Object.freeze( {
    name: "Name",
    requirement: "R/C/O",
    cardinality: "Cardinality",
    dataType: "Data types",
    constraint: "Constraint",
    fixedValue: "Fixed Value",
    defaultValue: "Default Value",
    rules: "Rules",
    conditions: "Conditions",
    codeList: "Code Lists",
    tag: "Field Name / Tag",
    attribute: "Attribute"
} );

const DESCRIPTION_HEADER = /^Описание/;
// Case-sensitive on purpose: "End of Period" is a real field in P001, P004, P011 and P018 (Review Focus 3).
const END_ROW = /^END of\s+(.+)$/;
const LEADING_STARS = /^\*+/;
const DEFAULT_ATTRIBUTE = "value";

function mapColumns( header, sheetName, anomalies ) {
    const titles = columnMap( header );
    const columns = {};
    let complete = true;
    for ( const [ key, title ] of Object.entries( COLUMNS ) ) {
        if ( titles.has( title ) ) {
            columns[ key ] = titles.get( title );
        } else {
            complete = false;
            anomalies.push( createAnomaly( "missing-column", { sheet: sheetName, row: header.number }, { column: title } ) );
        }
    }
    const description = [ ...titles.entries() ].find( ( [ title ] ) => DESCRIPTION_HEADER.test( title ) );
    columns.description = description ? description[ 1 ] : null;
    return complete ? columns : null;
}

function kindOf( fill, source, anomalies ) {
    if ( fill === null || NEUTRAL_FILLS.includes( fill ) ) {
        return ELEMENT_KIND.FIELD;
    }
    if ( Object.hasOwn( ROW_FILLS, fill ) ) {
        return ROW_FILLS[ fill ];
    }
    anomalies.push( createAnomaly( fill === END_FILL ? "end-fill-on-data-row" : "unknown-fill", source, { colour: fill } ) );
    return ELEMENT_KIND.FIELD;
}

function readRow( row, columns, source, anomalies ) {
    const at = ( key ) => ( { ...source, column: columns[ key ] } );
    const text = ( key ) => cellAt( row, columns[ key ] ).text;
    // Code columns only: a look-alike letter is folded, and the fold is reported (HEL-12).
    const code = ( key ) => {
        const { folded, letters } = foldLookAlikes( text( key ) );
        if ( letters.length ) {
            anomalies.push( createAnomaly( "look-alike-letter", at( key ), { value: text( key ), letters: letters.join( ", " ), folded: folded } ) );
        }
        return folded;
    };
    const requirementText = code( "requirement" );
    const cardinalityText = code( "cardinality" );
    const tagText = code( "tag" );
    // A name and nothing else is a note typed into the sheet, not an element; reading it as one would block the import
    // on an invalid requirement (Review Focus 2).
    if ( !requirementText && !cardinalityText && isNone( tagText ) ) {
        anomalies.push( createAnomaly( "note-row", at( "name" ), { text: text( "name" ) } ) );
        return null;
    }

    const nameCell = cellAt( row, columns.name );
    const kind = kindOf( nameCell.fill, at( "name" ), anomalies );
    const stars = LEADING_STARS.exec( nameCell.text );
    if ( stars && ( kind !== ELEMENT_KIND.GROUP || stars[ 0 ].length !== nameCell.indent ) ) {
        anomalies.push( createAnomaly( "asterisks-disagree", at( "name" ), { stars: stars[ 0 ].length, depth: nameCell.indent } ) );
    }
    const name = nameCell.text.replace( LEADING_STARS, "" ).trim();
    for ( const word of findMixedScriptWords( name ) ) {
        anomalies.push( createAnomaly( "mixed-script-word", at( "name" ), { word: word } ) );
    }

    const requirement = parseRequirement( requirementText );
    if ( requirement === null ) {
        anomalies.push( createAnomaly( "invalid-requirement", at( "requirement" ), { value: requirementText } ) );
    }
    const cardinality = parseCardinality( cardinalityText );
    if ( cardinality === null ) {
        anomalies.push( createAnomaly( "invalid-cardinality", at( "cardinality" ), { value: cardinalityText } ) );
    }
    const dataType = noneToNull( text( "dataType" ) );
    const { constraint, unparsed } = parseConstraint( text( "constraint" ), dataType );
    for ( const token of unparsed ) {
        anomalies.push( createAnomaly( "unparsed-constraint", at( "constraint" ), { token: token } ) );
    }
    const references = ( key, kindName ) => {
        const { values, invalid } = parseReferenceList( code( key ), kindName );
        for ( const value of invalid ) {
            anomalies.push( createAnomaly( "invalid-reference", at( key ), { value: value, kind: kindName } ) );
        }
        return values;
    };
    const fixedValue = noneToNull( code( "fixedValue" ) );
    const defaultValue = noneToNull( code( "defaultValue" ) );
    const rules = references( "rules", "rule" );
    const conditions = references( "conditions", "condition" );
    const codeLists = references( "codeList", "codeList" );
    if ( codeLists.length > 1 ) {
        anomalies.push( createAnomaly( "multiple-code-lists", at( "codeList" ), { values: codeLists.join( ", " ) } ) );
    }

    return {
        identity: null,
        path: null,
        depth: nameCell.indent,
        kind: kind,
        name: { bg: null, en: name },
        requirement: requirement,
        cardinality: cardinality,
        dataType: dataType,
        constraint: constraint,
        fixedValue: fixedValue,
        defaultValue: defaultValue,
        rules: rules,
        conditions: conditions,
        codeList: codeLists[ 0 ] || null,
        tag: noneToNull( tagText ),
        attribute: noneToNull( code( "attribute" ) ),
        description: { bg: columns.description ? noneToNull( cellAt( row, columns.description ).text ) : null, en: null },
        source: source,
        children: []
    };
}

// Indentation decides placement; a row deeper than its parent plus one cannot be placed and blocks the import.
function place( node, roots, open, source, anomalies ) {
    while ( open.length && open[ open.length - 1 ].depth >= node.depth ) {
        open.pop();
    }
    const parent = open[ open.length - 1 ] || null;
    if ( node.depth === 0 ) {
        roots.push( node );
    } else if ( parent && parent.depth === node.depth - 1 ) {
        parent.children.push( node );
    } else {
        anomalies.push( createAnomaly( "depth-jump", source, { depth: node.depth, parentDepth: parent ? parent.depth : "none" } ) );
        ( parent ? parent.children : roots ).push( node );
    }
    open.push( node );
}

// END rows only confirm what indentation already decided; not every group has one, and many shorten the group's name
// ("END of Verification" closes "Verification Code" in P005) — so a mismatch is a warning and changes nothing.
function closeGroup( open, name, source, anomalies ) {
    const target = name.replace( LEADING_STARS, "" ).trim().toLowerCase();
    for ( let index = open.length - 1; index >= 0; index-- ) {
        if ( open[ index ].kind === ELEMENT_KIND.GROUP && open[ index ].name.en.toLowerCase() === target ) {
            open.length = index;
            return;
        }
    }
    anomalies.push( createAnomaly( "unexpected-end-row", source, { name: name } ) );
}

function identify( nodes, parentPath, parentField, anomalies ) {
    for ( const node of nodes ) {
        if ( node.kind === ELEMENT_KIND.POLYMORPHIC ) {
            // Variants are fields at the polymorphic element's own level; they share a tag, so they are numbered.
            identify( node.children, parentPath, null, anomalies );
            node.children.forEach( ( variant, index ) => {
                if ( variant.identity ) {
                    variant.identity = withVariant( variant.identity, index + 1 );
                }
            } );
            const first = node.children.find( ( variant ) => variant.path );
            node.path = first ? first.path : null;
            node.identity = first ? withAttribute( first.path, first.attribute || DEFAULT_ATTRIBUTE ) : null;
            continue;
        }
        if ( node.kind === ELEMENT_KIND.ATTRIBUTE ) {
            if ( !parentField ) {
                anomalies.push( createAnomaly( "attribute-without-field", node.source ) );
                continue;
            }
            if ( node.tag && node.tag !== parentField.tag ) {
                anomalies.push( createAnomaly( "attribute-tag-mismatch", node.source, { tag: node.tag, fieldTag: parentField.tag } ) );
            }
            const attribute = node.attribute || DEFAULT_ATTRIBUTE;
            if ( !isValidPart( attribute ) ) {
                anomalies.push( createAnomaly( "invalid-tag", node.source, { tag: attribute } ) );
                continue;
            }
            node.path = parentField.path;
            node.identity = withAttribute( parentField.path, attribute );
            continue;
        }
        if ( !node.tag ) {
            anomalies.push( createAnomaly( "missing-tag", node.source ) );
            continue;
        }
        if ( !isValidPart( node.tag ) ) {
            anomalies.push( createAnomaly( "invalid-tag", node.source, { tag: node.tag } ) );
            continue;
        }
        node.path = joinPath( parentPath, node.tag );
        if ( node.kind === ELEMENT_KIND.GROUP ) {
            node.identity = node.path;
            identify( node.children, node.path, null, anomalies );
            continue;
        }
        const attribute = node.attribute || DEFAULT_ATTRIBUTE;
        if ( !isValidPart( attribute ) ) {
            anomalies.push( createAnomaly( "invalid-tag", node.source, { tag: attribute } ) );
            continue;
        }
        node.identity = withAttribute( node.path, attribute );
        identify( node.children, node.path, node, anomalies );
    }
}

/**
 * Builds a message's element tree from its sheet and reports every anomaly at its row (design record §5.3).
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{elements: import( "@health-dev-portal/spec-model/definitions" ).ElementNode[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.buildMessageTree = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === COLUMNS.name );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { elements: [], anomalies: anomalies };
    }
    const columns = mapColumns( header, sheet.name, anomalies );
    if ( !columns ) {
        return { elements: [], anomalies: anomalies };
    }

    const roots = [];
    const open = [];
    for ( const row of sheet.rows ) {
        if ( row.number <= header.number ) {
            continue;
        }
        const name = cellAt( row, columns.name ).text;
        if ( !name ) {
            continue;
        }
        const source = { sheet: sheet.name, row: row.number };
        // An END row is the capitalised marker with nothing else on the row; a field always has R/C/O and a tag.
        const end = END_ROW.exec( name );
        if ( end && !cellAt( row, columns.requirement ).text && isNone( cellAt( row, columns.tag ).text ) ) {
            closeGroup( open, end[ 1 ], source, anomalies );
            continue;
        }
        const node = readRow( row, columns, source, anomalies );
        if ( node ) {
            place( node, roots, open, source, anomalies );
        }
    }
    identify( roots, "", null, anomalies );
    anomalies.push( ...validateMessageTree( roots ) );
    return { elements: deepFreeze( roots ), anomalies: anomalies };
};
```

- [ ] **Step 5: Run the tests and lint**

Run: `npm test` then `npm run lint`
Expected: importer 39 tests pass (23 + 16 message-tree); lint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/importer
git commit -m "feat(importer): build message trees from message sheets, with identities and anomalies (HEL-13)"
```

---

### Task 6: Message index, change notes, side sheets and module assembly

**Files:**
- Create: `packages/importer/interpret/messages-sheet.js`, `packages/importer/interpret/change-notes.js`,
  `packages/importer/interpret/side-sheets.js`, `packages/importer/importer/module-importer.js`
- Modify: `packages/importer/test/support/fixtures.js` (add `moduleSheets()`)
- Test: `packages/importer/test/messages-sheet.test.js`, `packages/importer/test/change-notes.test.js`,
  `packages/importer/test/side-sheets.test.js`, `packages/importer/test/module-importer.test.js`

**Interfaces:**
- Consumes: Task 5's `buildMessageTree`, `TAB_STATUS`, `NOTE_FONTS`; `#raw`, `#cells`, `#scripts`.
- Produces: `#messages-sheet` → `readMessageIndex( sheet ): { messages: MessageEntry[], anomalies }`, where
  `MessageEntry = { code, title: LocalText, address, direction, sender, recipient, pairedWith, source }`.
- Produces: `#change-notes` → `readChangeNotes( sheet ): { versions: ChangeVersion[], anomalies }`.
- Produces: `#side-sheets` → `readConditions( sheet ): { conditions: ConditionText[], anomalies }`,
  `readDictionary( sheet ): { entries: DictionaryEntry[], anomalies }`.
- Produces: `#module-importer` (exported as `@health-dev-portal/importer/module`) →
  `importModuleWorkbook( workbook: RawWorkbook, options: { spec: string, fileName?: string } ): { version: ModuleVersion, anomalies: Anomaly[] }` (frozen).
- Produces (test support): `fixtures.js` → `moduleSheets(): RawSheet[]`.

- [ ] **Step 1: Add the module fixture**

Append to `packages/importer/test/support/fixtures.js` (before `module.exports`, and extend the export):

```js
const { messageSheet, row, sheet } = require( "./raw-builders" );

const MESSAGES_HEADER = [ "Съобщение", "Име*", "Класификация", "Адрес", "Тип", "Налично в Release**", "Изпращач", "Получател" ];

// A whole module workbook shaped like e-Prescription's: index, three messages, change notes, conditions, dictionary.
// It imports with no anomaly at all, so any test that adds one defect sees exactly that defect.
const moduleSheets = () => [
    sheet( "Съобщения", [
        row( 1, [ "Услуги, предоставяни от НЗИС за външни софтуерни системи" ] ),
        row( 3, MESSAGES_HEADER ),
        row( 4, [ "Заявка за създаване на Е-рецепта", "P001", "ePrescription Issue Request", "/v4/eprescription/doctor/issue", "Request", "1.2", "външна система", "НЗИС" ] ),
        row( 5, [ "Потвърждение за създаване на Е-рецепта", "P002", "ePrescription Issue Confirmation", "---", "Response", "1.2", "НЗИС", "външна система" ] ),
        row( 6, [ "Съобщение за грешка", "P099", "ePrescription Error", "---", "Response", "1.0", "НЗИС", "външна система" ] ),
        // The real sheet ends with a footnote merged across every column, so its text appears in the code column too.
        row( 8, Array( 8 ).fill( "** \"Налично в Release\" специфицира версията на API софтуера." ) )
    ] ),
    messageSheet( "P001", prescriptionRows() ),
    messageSheet( "P002", confirmationRows() ),
    messageSheet( "P099", confirmationRows() ),
    sheet( "Change Notes", [
        row( 1, [ "Версия 1.0.0" ] ),
        row( 2, [ "Създадени съобщения P001, P002 и P099" ] ),
        row( 3, [ "Версия 1.1.0" ] ),
        row( 4, [ "Добавено поле \"allowedRepeatsNumber\" в P001" ], { fontColour: "C65911" } ),
        row( 5, [ "Отпаднало поле \"note\"" ], { fontColour: "C00000" } )
    ] ),
    sheet( "Conditions", [
        row( 1, [ "Condition ID", "Condition Logic" ] ),
        row( 3, [ "CDP01", "IF 'prescription.category'.value = 'T2' OR 'T3'" ] ),
        row( 4, [ null, "THEN 'prescription.isProtocolBased'.required = 'R'" ] ),
        row( 5, [ null, "ELSE 'prescription.isProtocolBased'.required = 'O'" ] ),
        row( 7, [ "CDP19", "IF 'prescription.category'.value = 'T3'" ] ),
        row( 8, [ null, "THEN 'prescription.group'.cardinality = '1..3'" ] ),
        row( 10, [ "CDP21", "IF 'prescription.dispensationType'.value = '2'" ] ),
        row( 11, [ null, "THEN 'prescription.allowedRepeatsNumber'.required = 'R'" ] ),
        row( 13, [ "CDP29", "IF 'prescription.category'.value = 'T2' OR 'T3'" ] ),
        row( 14, [ null, "THEN 'prescription.group.medication'.cardinality = '1..3'" ] )
    ] ),
    sheet( "Dictionary", [
        row( 1, [ "Abbreviation", "Name", "Описание" ] ),
        row( 2, [ "PMI", "Personal Medical Identifier", "УИН на лекар" ] )
    ] )
];
```

and change the last line to `module.exports = { prescriptionRows, confirmationRows, moduleSheets };`.

- [ ] **Step 2: Write the failing tests**

`packages/importer/test/messages-sheet.test.js`:

```js
/*
 * The message index ("Съобщения"): codes, endpoints, directions, and the request/response pairing.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readMessageIndex } = require( "#messages-sheet" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

const index = () => moduleSheets()[ 0 ];
const types = ( result ) => result.anomalies.map( ( anomaly ) => anomaly.type );

describe( "readMessageIndex", () => {

    it( "lists the messages and stops at the footnote", () => {
        const result = readMessageIndex( index() );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.messages.map( ( message ) => message.code ), [ "P001", "P002", "P099" ] );
        const [ request ] = result.messages;
        assert.deepEqual( request.title, { bg: "Заявка за създаване на Е-рецепта", en: "ePrescription Issue Request" } );
        assert.equal( request.address, "/v4/eprescription/doctor/issue" );
        assert.equal( request.direction, "request" );
        assert.equal( request.sender, "външна система" );
        assert.equal( request.recipient, "НЗИС" );
        assert.equal( result.messages[ 1 ].address, null );
        assert.deepEqual( request.source, { sheet: "Съобщения", row: 4 } );
    } );

    it( "pairs each request with the response after it, and leaves the x99 error message unpaired without a warning", () => {
        const [ request, response, error ] = readMessageIndex( index() ).messages;
        assert.equal( request.pairedWith, "P002" );
        assert.equal( response.pairedWith, "P001" );
        assert.equal( error.pairedWith, null );
    } );

    it( "warns about an unpaired message, an unknown direction and a mixed-script title", () => {
        const header = index().rows[ 1 ];
        const result = readMessageIndex( sheet( "Съобщения", [
            header,
            row( 4, [ "Заявка", "P001", "Issue", "/v4/x", "Request", "", "", "" ] ),
            row( 5, [ "Заявка", "P003", "Fetch", "/v4/y", "Request", "", "", "" ] ),
            row( 6, [ "Отговор на E-рецепта", "P004", "Result", "---", "Answer", "", "", "" ] )
        ] ) );
        assert.deepEqual( types( result ), [ "mixed-script-word", "unknown-direction", "unpaired-message", "unpaired-message", "unpaired-message" ] );
    } );

    it( "blocks a sheet without its header or a column", () => {
        assert.deepEqual( types( readMessageIndex( sheet( "Съобщения", [ row( 1, [ "Нещо друго" ] ) ] ) ) ), [ "missing-header-row" ] );
        const result = readMessageIndex( sheet( "Съобщения", [ row( 3, [ "Съобщение", "Име*", "Класификация", "Адрес", "Тип", "Изпращач" ] ) ] ) );
        assert.deepEqual( types( result ), [ "missing-column" ] );
        assert.equal( result.anomalies[ 0 ].details.column, "Получател" );
    } );
} );
```

`packages/importer/test/change-notes.test.js`:

```js
/*
 * Change notes: versions in order, each note's category from its font colour (design record §5.1).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readChangeNotes } = require( "#change-notes" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

describe( "readChangeNotes", () => {

    it( "reads versions oldest first, with categorised notes", () => {
        const result = readChangeNotes( moduleSheets().find( ( candidate ) => candidate.name === "Change Notes" ) );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.versions.map( ( version ) => version.version ), [ "1.0.0", "1.1.0" ] );
        assert.deepEqual( result.versions[ 1 ].notes.map( ( note ) => note.category ), [ "breaking", "dropped-plan" ] );
        assert.equal( result.versions[ 0 ].notes[ 0 ].category, "non-breaking" );
        assert.deepEqual( result.versions[ 1 ].notes[ 0 ].source, { sheet: "Change Notes", row: 4 } );
    } );

    it( "treats black and theme-black notes as non-breaking", () => {
        const result = readChangeNotes( sheet( "Change Notes", [ row( 1, [ "Версия 2.0.0" ] ), row( 2, [ "Note" ], { fontColour: "000000" } ) ] ) );
        assert.equal( result.versions[ 0 ].notes[ 0 ].category, "non-breaking" );
    } );

    it( "warns about a note before any version heading", () => {
        const result = readChangeNotes( sheet( "Change Notes", [ row( 1, [ "Stray note" ] ), row( 2, [ "Версия 1.0.0" ] ) ] ) );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "notes-before-version" ] );
        assert.equal( result.versions.length, 1 );
    } );
} );
```

`packages/importer/test/side-sheets.test.js`:

```js
/*
 * Side sheets: conditions are kept as written (plan 3 parses them); the dictionary is read as is.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { readConditions, readDictionary } = require( "#side-sheets" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

const named = ( name ) => moduleSheets().find( ( candidate ) => candidate.name === name );

describe( "side sheets", () => {

    it( "joins each condition's lines and keeps where it starts", () => {
        const result = readConditions( named( "Conditions" ) );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.conditions.map( ( condition ) => condition.id ), [ "CDP01", "CDP19", "CDP21", "CDP29" ] );
        assert.equal( result.conditions[ 0 ].text, [
            "IF 'prescription.category'.value = 'T2' OR 'T3'",
            "THEN 'prescription.isProtocolBased'.required = 'R'",
            "ELSE 'prescription.isProtocolBased'.required = 'O'"
        ].join( "\n" ) );
        assert.deepEqual( result.conditions[ 0 ].source, { sheet: "Conditions", row: 3 } );
    } );

    it( "warns about an empty condition", () => {
        // CDP09 and CDP36 of e-Prescription 1.5.1 are empty (HEL-5).
        const result = readConditions( sheet( "Conditions", [ row( 1, [ "Condition ID", "Condition Logic" ] ), row( 3, [ "CDP09" ] ) ] ) );
        assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "empty-condition" ] );
        assert.equal( result.conditions[ 0 ].text, "" );
    } );

    it( "reads the dictionary", () => {
        const result = readDictionary( named( "Dictionary" ) );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.entries[ 0 ], {
            abbreviation: "PMI",
            name: { bg: null, en: "Personal Medical Identifier" },
            description: { bg: "УИН на лекар", en: null },
            source: { sheet: "Dictionary", row: 2 }
        } );
    } );

    it( "blocks a side sheet without its header", () => {
        assert.deepEqual( readConditions( sheet( "Conditions", [ row( 1, [ "x" ] ) ] ) ).anomalies.map( ( anomaly ) => anomaly.type ), [ "missing-header-row" ] );
        assert.deepEqual( readDictionary( sheet( "Dictionary", [ row( 1, [ "x" ] ) ] ) ).anomalies.map( ( anomaly ) => anomaly.type ), [ "missing-header-row" ] );
    } );
} );
```

`packages/importer/test/module-importer.test.js`:

```js
/*
 * A whole module workbook into one module version: messages with their trees and statuses, conditions, dictionary,
 * change history — and every anomaly from every sheet.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { importModuleWorkbook } = require( "#module-importer" );
const { element, messageSheet, row, sheet } = require( "./support/raw-builders" );
const { confirmationRows, moduleSheets } = require( "./support/fixtures" );

const workbook = ( sheets ) => ( { sheets: sheets, themeColours: {} } );
const types = ( result ) => result.anomalies.map( ( anomaly ) => anomaly.type );
const replace = ( sheets, name, replacement ) => sheets.map( ( candidate ) => ( candidate.name === name ? replacement : candidate ) );

describe( "importModuleWorkbook", () => {

    it( "imports a sound module with no anomaly", () => {
        const result = importModuleWorkbook( workbook( moduleSheets() ), { spec: "e-prescription" } );
        assert.deepEqual( result.anomalies, [] );
        const { version } = result;
        assert.equal( version.spec, "e-prescription" );
        assert.equal( version.version, "1.1.0" );
        assert.deepEqual( version.messages.map( ( message ) => [ message.code, message.lifecycle, message.changedInVersion ] ),
            [ [ "P001", "active", false ], [ "P002", "active", false ], [ "P099", "active", false ] ] );
        assert.ok( version.messages[ 0 ].elements.length > 0 );
        assert.equal( version.conditions.length, 4 );
        assert.equal( version.dictionary.length, 1 );
        assert.equal( version.changeNotes.length, 2 );
        assert.ok( Object.isFrozen( version.messages[ 0 ] ) );
    } );

    it( "takes each message's lifecycle from its tab colour", () => {
        const sheets = replace( replace( moduleSheets(),
            "P002", messageSheet( "P002", confirmationRows(), "ED7D31" ) ),
            "P099", messageSheet( "P099", confirmationRows(), "C00000" ) );
        const [ , confirmation, error ] = importModuleWorkbook( workbook( sheets ), { spec: "e-prescription" } ).version.messages;
        assert.equal( confirmation.lifecycle, "in-development" );
        assert.equal( error.lifecycle, "withdrawn" );
    } );

    it( "warns about an unknown or missing tab colour", () => {
        const result = importModuleWorkbook( workbook( replace( moduleSheets(), "P002", messageSheet( "P002", confirmationRows(), null ) ) ), { spec: "e" } );
        assert.deepEqual( types( result ), [ "unknown-tab-colour" ] );
        assert.equal( result.version.messages[ 1 ].lifecycle, null );
    } );

    it( "blocks a listed message without a sheet and a workbook without a required sheet", () => {
        assert.deepEqual( types( importModuleWorkbook( workbook( moduleSheets().filter( ( candidate ) => candidate.name !== "P002" ) ), { spec: "e" } ) ),
            [ "message-without-sheet" ] );
        assert.deepEqual( types( importModuleWorkbook( workbook( moduleSheets().filter( ( candidate ) => candidate.name !== "Съобщения" ) ), { spec: "e" } ) ),
            [ "missing-sheet", "sheet-without-message", "sheet-without-message", "sheet-without-message" ] );
    } );

    it( "warns about a message sheet the index does not list", () => {
        const result = importModuleWorkbook( workbook( [ ...moduleSheets(), messageSheet( "P005", confirmationRows() ) ] ), { spec: "e" } );
        assert.deepEqual( types( result ), [ "sheet-without-message" ] );
    } );

    it( "matches a sheet whose name has stray spaces (Review Focus 4)", () => {
        const result = importModuleWorkbook( workbook( replace( moduleSheets(), "P002", messageSheet( "P002 ", confirmationRows() ) ) ), { spec: "e" } );
        assert.deepEqual( result.anomalies, [] );
        assert.ok( result.version.messages[ 1 ].elements.length > 0 );
    } );

    it( "blocks a workbook whose change notes name no version, and warns when the file name disagrees", () => {
        const noVersion = replace( moduleSheets(), "Change Notes", sheet( "Change Notes", [] ) );
        assert.deepEqual( types( importModuleWorkbook( workbook( noVersion ), { spec: "e" } ) ), [ "missing-version" ] );
        const mismatch = importModuleWorkbook( workbook( moduleSheets() ), { spec: "e", fileName: "НЗИС Е-Рецепта - API Спецификация v1.0.9.xlsx" } );
        assert.deepEqual( types( mismatch ), [ "version-mismatch" ] );
        assert.deepEqual( mismatch.anomalies[ 0 ].details, { fileVersion: "1.0.9", version: "1.1.0" } );
    } );

    it( "imports a module whose codes are not P/CDP (Review Focus 1)", () => {
        const header = moduleSheets()[ 0 ].rows[ 1 ];
        const referralRows = [
            element( 3, 0, "group", { name: "Contents", req: "R", card: "1..1", tag: "contents" } ),
            element( 4, 1, "field", { name: "Patient Country", req: "C", card: "0..1", conditions: "CDR07", codeList: "CL005", tag: "country", attribute: "value" } )
        ];
        const sheets = [
            sheet( "Съобщения", [
                header,
                row( 4, [ "Заявка за създаване на Е-направление", "R001", "eReferral Issue Request", "/v1/ereferral/doctor/issue", "Request", "", "", "" ] ),
                row( 5, [ "Потвърждение", "R002", "eReferral Issue Confirmation", "---", "Response", "", "", "" ] )
            ] ),
            messageSheet( "R001", referralRows ),
            messageSheet( "R002", confirmationRows() ),
            sheet( "Change Notes", [ row( 1, [ "Версия 1.4.4" ] ) ] ),
            sheet( "Conditions", [ row( 1, [ "Condition ID", "Condition Logic" ] ), row( 3, [ "CDR07", "IF 'x'.value = '1'" ] ) ] )
        ];
        const result = importModuleWorkbook( workbook( sheets ), { spec: "e-referral" } );
        assert.deepEqual( result.anomalies, [] );
        assert.deepEqual( result.version.messages.map( ( message ) => message.pairedWith ), [ "R002", "R001" ] );
    } );

    it( "requires a spec key", () => {
        assert.throws( () => importModuleWorkbook( workbook( moduleSheets() ), {} ), TypeError );
    } );
} );
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --workspace @health-dev-portal/importer`
Expected: FAIL — `Cannot find module '…/interpret/messages-sheet.js'`.

- [ ] **Step 4: Implement**

`packages/importer/interpret/messages-sheet.js`:

```js
const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { MESSAGE_DIRECTION } = require( "@health-dev-portal/spec-model/kinds" );
const { cellAt, columnMap, findRow } = require( "#raw" );
const { noneToNull } = require( "#cells" );
const { findMixedScriptWords, foldLookAlikes } = require( "#scripts" );

const COLUMNS = Object.freeze( {
    title: "Съобщение",
    code: "Име*",
    name: "Класификация",
    address: "Адрес",
    direction: "Тип",
    sender: "Изпращач",
    recipient: "Получател"
} );

// P001 in e-Prescription, R001 in e-Referral: one letter and three digits (Review Focus 1).
const MESSAGE_CODE = /^[A-Z]\d{3}$/;

const DIRECTIONS = Object.freeze( { Request: MESSAGE_DIRECTION.REQUEST, Response: MESSAGE_DIRECTION.RESPONSE } );

function pair( messages, anomalies ) {
    messages.forEach( ( message, index ) => {
        const next = messages[ index + 1 ];
        if ( message.direction === MESSAGE_DIRECTION.REQUEST && next && next.direction === MESSAGE_DIRECTION.RESPONSE ) {
            message.pairedWith = next.code;
            next.pairedWith = message.code;
        }
    } );
    for ( const message of messages ) {
        // The x99 response is the module's error message: it answers every request and pairs with none.
        const errorMessage = message.direction === MESSAGE_DIRECTION.RESPONSE && message.code.endsWith( "99" );
        if ( !message.pairedWith && !errorMessage ) {
            anomalies.push( createAnomaly( "unpaired-message", message.source, { code: message.code } ) );
        }
    }
}

/**
 * Reads the message index sheet ("Съобщения"): one entry per message, paired request with response.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{messages: Object[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readMessageIndex = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => row.cells.some( ( cell ) => cell.text === COLUMNS.code ) );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { messages: [], anomalies: anomalies };
    }
    const titles = columnMap( header );
    const columns = {};
    for ( const [ key, title ] of Object.entries( COLUMNS ) ) {
        if ( !titles.has( title ) ) {
            anomalies.push( createAnomaly( "missing-column", { sheet: sheet.name, row: header.number }, { column: title } ) );
        }
        columns[ key ] = titles.get( title );
    }
    if ( anomalies.length ) {
        return { messages: [], anomalies: anomalies };
    }

    const messages = [];
    for ( const row of sheet.rows ) {
        if ( row.number <= header.number ) {
            continue;
        }
        const source = { sheet: sheet.name, row: row.number };
        const codeText = cellAt( row, columns.code ).text;
        const code = foldLookAlikes( codeText );
        // Rows below the list — the "Налично в Release" footnote, merged across every column — carry no code.
        if ( !MESSAGE_CODE.test( code.folded ) ) {
            continue;
        }
        if ( code.letters.length ) {
            anomalies.push( createAnomaly( "look-alike-letter", { ...source, column: columns.code }, { value: codeText, letters: code.letters.join( ", " ), folded: code.folded } ) );
        }
        const title = cellAt( row, columns.title ).text;
        for ( const word of findMixedScriptWords( title ) ) {
            anomalies.push( createAnomaly( "mixed-script-word", { ...source, column: columns.title }, { word: word } ) );
        }
        const directionText = cellAt( row, columns.direction ).text;
        const direction = Object.hasOwn( DIRECTIONS, directionText ) ? DIRECTIONS[ directionText ] : null;
        if ( !direction ) {
            anomalies.push( createAnomaly( "unknown-direction", { ...source, column: columns.direction }, { value: directionText } ) );
        }
        messages.push( {
            code: code.folded,
            title: { bg: title || null, en: noneToNull( cellAt( row, columns.name ).text ) },
            address: noneToNull( cellAt( row, columns.address ).text ),
            direction: direction,
            sender: noneToNull( cellAt( row, columns.sender ).text ),
            recipient: noneToNull( cellAt( row, columns.recipient ).text ),
            pairedWith: null,
            source: source
        } );
    }
    pair( messages, anomalies );
    return { messages: messages, anomalies: anomalies };
};
```

`packages/importer/interpret/change-notes.js`:

```js
const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { CHANGE_CATEGORY } = require( "@health-dev-portal/spec-model/kinds" );
const { cellAt } = require( "#raw" );
const { NOTE_FONTS } = require( "#legend" );

const VERSION_HEADING = /^Версия\s+(\d+\.\d+\.\d+)/;

/**
 * Reads the "Change Notes" sheet: version headings in order, each note categorised by its font colour.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{versions: import( "@health-dev-portal/spec-model/definitions" ).ChangeVersion[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readChangeNotes = ( sheet ) => {
    const anomalies = [];
    const versions = [];
    let current = null;
    for ( const row of sheet.rows ) {
        const cell = cellAt( row, 1 );
        if ( !cell.text ) {
            continue;
        }
        const source = { sheet: sheet.name, row: row.number };
        const heading = VERSION_HEADING.exec( cell.text );
        if ( heading ) {
            current = { version: heading[ 1 ], notes: [], source: source };
            versions.push( current );
            continue;
        }
        if ( !current ) {
            anomalies.push( createAnomaly( "notes-before-version", source ) );
            continue;
        }
        const category = cell.fontColour && Object.hasOwn( NOTE_FONTS, cell.fontColour ) ? NOTE_FONTS[ cell.fontColour ] : CHANGE_CATEGORY.NON_BREAKING;
        current.notes.push( { category: category, text: cell.text, source: source } );
    }
    return { versions: versions, anomalies: anomalies };
};
```

`packages/importer/interpret/side-sheets.js`:

```js
const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { cellAt, findRow } = require( "#raw" );
const { noneToNull } = require( "#cells" );

/**
 * Reads the "Conditions" sheet as written: an ID in column A starts a condition, column B carries its lines. Plan 3
 * parses the text into the conditions language.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{conditions: import( "@health-dev-portal/spec-model/definitions" ).ConditionText[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readConditions = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === "Condition ID" );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { conditions: [], anomalies: anomalies };
    }
    const collected = [];
    let current = null;
    for ( const row of sheet.rows ) {
        if ( row.number <= header.number ) {
            continue;
        }
        const id = cellAt( row, 1 ).text;
        const line = cellAt( row, 2 ).text;
        if ( id ) {
            current = { id: id, lines: [], source: { sheet: sheet.name, row: row.number } };
            collected.push( current );
        }
        if ( line && current ) {
            current.lines.push( line );
        }
    }
    for ( const condition of collected ) {
        if ( condition.lines.length === 0 ) {
            anomalies.push( createAnomaly( "empty-condition", condition.source, { id: condition.id } ) );
        }
    }
    return {
        conditions: collected.map( ( condition ) => ( { id: condition.id, text: condition.lines.join( "\n" ), source: condition.source } ) ),
        anomalies: anomalies
    };
};

/**
 * Reads the "Dictionary" sheet of abbreviations.
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{entries: import( "@health-dev-portal/spec-model/definitions" ).DictionaryEntry[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.readDictionary = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === "Abbreviation" );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { entries: [], anomalies: anomalies };
    }
    const entries = sheet.rows
        .filter( ( row ) => row.number > header.number && cellAt( row, 1 ).text )
        .map( ( row ) => ( {
            abbreviation: cellAt( row, 1 ).text,
            name: { bg: null, en: noneToNull( cellAt( row, 2 ).text ) },
            description: { bg: noneToNull( cellAt( row, 3 ).text ), en: null },
            source: { sheet: sheet.name, row: row.number }
        } ) );
    return { entries: entries, anomalies: anomalies };
};
```

`packages/importer/importer/module-importer.js`:

```js
const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );
const { buildMessageTree } = require( "#message-tree" );
const { readMessageIndex } = require( "#messages-sheet" );
const { readChangeNotes } = require( "#change-notes" );
const { readConditions, readDictionary } = require( "#side-sheets" );
const { TAB_STATUS } = require( "#legend" );

const SHEETS = Object.freeze( {
    messages: "Съобщения",
    changeNotes: "Change Notes",
    conditions: "Conditions",
    dictionary: "Dictionary"
} );

const MESSAGE_SHEET = /^[A-Z]\d{3}$/;
const FILE_VERSION = /v(\d+\.\d+\.\d+)/i;

/**
 * Imports one module specification workbook into a module version (design record §4, §5).
 *
 * Sheets are matched by trimmed name: Excel online keeps a trailing space in a tab name, and it is invisible
 * (Review Focus 4).
 *
 * @method
 * @param {import( "#workbook-reader" ).RawWorkbook} workbook
 * @param {{spec: string, fileName?: string}} options `spec` is the module's key, e.g. `e-prescription`; `fileName`,
 *     when given, is checked against the version in the change notes.
 * @returns {{version: import( "@health-dev-portal/spec-model/definitions" ).ModuleVersion, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @throws {TypeError} When no spec key is given.
 * @public
 */
module.exports.importModuleWorkbook = ( workbook, options ) => {
    if ( !options || typeof options.spec !== "string" || options.spec === "" ) {
        throw new TypeError( "importModuleWorkbook needs options.spec, the module's key." );
    }
    const anomalies = [];
    const sheetNamed = ( name ) => workbook.sheets.find( ( candidate ) => candidate.name.trim() === name ) || null;
    const required = ( name ) => {
        const found = sheetNamed( name );
        if ( !found ) {
            anomalies.push( createAnomaly( "missing-sheet", {}, { sheet: name } ) );
        }
        return found;
    };

    const indexSheet = required( SHEETS.messages );
    const index = indexSheet ? readMessageIndex( indexSheet ) : { messages: [], anomalies: [] };
    anomalies.push( ...index.anomalies );

    const messages = index.messages.map( ( entry ) => {
        const messageSheet = sheetNamed( entry.code );
        if ( !messageSheet ) {
            anomalies.push( createAnomaly( "message-without-sheet", entry.source, { code: entry.code } ) );
            return { ...entry, lifecycle: null, changedInVersion: null, elements: [] };
        }
        const status = messageSheet.tabColour && Object.hasOwn( TAB_STATUS, messageSheet.tabColour ) ? TAB_STATUS[ messageSheet.tabColour ] : null;
        if ( !status ) {
            anomalies.push( createAnomaly( "unknown-tab-colour", { sheet: messageSheet.name }, { colour: messageSheet.tabColour || "none" } ) );
        }
        const tree = buildMessageTree( messageSheet );
        anomalies.push( ...tree.anomalies );
        return {
            ...entry,
            lifecycle: status ? status.lifecycle : null,
            changedInVersion: status ? status.changed : null,
            elements: tree.elements
        };
    } );

    for ( const candidate of workbook.sheets ) {
        const name = candidate.name.trim();
        if ( MESSAGE_SHEET.test( name ) && !index.messages.some( ( message ) => message.code === name ) ) {
            anomalies.push( createAnomaly( "sheet-without-message", { sheet: candidate.name }, { sheet: candidate.name } ) );
        }
    }

    const notesSheet = required( SHEETS.changeNotes );
    const notes = notesSheet ? readChangeNotes( notesSheet ) : { versions: [], anomalies: [] };
    anomalies.push( ...notes.anomalies );
    const latest = notes.versions[ notes.versions.length - 1 ] || null;
    if ( !latest ) {
        anomalies.push( createAnomaly( "missing-version", notesSheet ? { sheet: notesSheet.name } : {} ) );
    }
    const fileVersion = FILE_VERSION.exec( options.fileName || "" );
    if ( latest && fileVersion && fileVersion[ 1 ] !== latest.version ) {
        anomalies.push( createAnomaly( "version-mismatch", {}, { fileVersion: fileVersion[ 1 ], version: latest.version } ) );
    }

    const conditionsSheet = required( SHEETS.conditions );
    const conditions = conditionsSheet ? readConditions( conditionsSheet ) : { conditions: [], anomalies: [] };
    anomalies.push( ...conditions.anomalies );

    // Not every module has a dictionary, so its absence is not an anomaly.
    const dictionarySheet = sheetNamed( SHEETS.dictionary );
    const dictionary = dictionarySheet ? readDictionary( dictionarySheet ) : { entries: [], anomalies: [] };
    anomalies.push( ...dictionary.anomalies );

    return deepFreeze( {
        version: {
            spec: options.spec,
            version: latest ? latest.version : null,
            messages: messages,
            conditions: conditions.conditions,
            dictionary: dictionary.entries,
            changeNotes: notes.versions
        },
        anomalies: anomalies
    } );
};
```

- [ ] **Step 5: Run the tests and lint**

Run: `npm test` then `npm run lint`
Expected: importer 59 tests pass (39 + 4 messages + 3 notes + 4 side + 9 module); lint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/importer
git commit -m "feat(importer): assemble a module version from its workbook — index, statuses, notes, conditions (HEL-13)"
```

---

### Task 7: Text report and the command-line tool

**Files:**
- Create: `packages/importer/report/format.js`, `packages/importer/bin/import-module.js`
- Create: `packages/importer/test/support/xlsx-builder.js`
- Test: `packages/importer/test/format.test.js`, `packages/importer/test/cli.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `importModuleWorkbook`, `readWorkbook`, `hasBlocking`.
- Produces: `#report` (exported as `@health-dev-portal/importer/report`) → `cellReference( anomaly ): string`,
  `formatReport( result: { version, anomalies } ): string`.
- Produces: `hdp-import-module --spec <key> [--json <file>] <workbook.xlsx>` — exit 0 accepted, 1 refused or
  unreadable, 2 usage.
- Produces (test support): `xlsx-builder.js` → `writeWorkbook( sheets: RawSheet[] ): Promise<string>` (a temp file).

- [ ] **Step 1: Write the test support**

`packages/importer/test/support/xlsx-builder.js`:

```js
/*
 * Writes raw-sheet descriptions to a real .xlsx file, so the reader and the CLI are exercised end to end.
 */

const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const ExcelJS = require( "exceljs" );

const writeWorkbook = async ( sheets ) => {
    const workbook = new ExcelJS.Workbook();
    for ( const sheet of sheets ) {
        const worksheet = workbook.addWorksheet( sheet.name, sheet.tabColour ? { properties: { tabColor: { argb: "FF" + sheet.tabColour } } } : {} );
        for ( const row of sheet.rows ) {
            row.cells.forEach( ( cell, index ) => {
                if ( !cell.text && !cell.fill ) {
                    return;
                }
                const target = worksheet.getCell( row.number, index + 1 );
                if ( cell.text ) {
                    target.value = cell.text;
                }
                if ( cell.fill ) {
                    target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + cell.fill } };
                }
                if ( cell.indent ) {
                    target.alignment = { indent: cell.indent };
                }
                if ( cell.fontColour ) {
                    target.font = { color: { argb: "FF" + cell.fontColour } };
                }
            } );
        }
    }
    const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), "hdp-cli-" ) ), "workbook.xlsx" );
    await workbook.xlsx.writeFile( file );
    return file;
};

module.exports = { writeWorkbook };
```

- [ ] **Step 2: Write the failing tests**

`packages/importer/test/format.test.js`:

```js
/*
 * The text report a person reads after an import: blocking first, then by sheet, row and column, with Excel cell
 * references.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { cellReference, formatReport } = require( "#report" );

const version = { spec: "e-prescription", version: "1.5.1", messages: [ {}, {} ] };

describe( "report", () => {

    it( "writes Excel cell references", () => {
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001", row: 16, column: 1 } ) ), "P001!A16" );
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001", row: 16, column: 27 } ) ), "P001!AA16" );
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001", row: 16 } ) ), "P001 row 16" );
        assert.equal( cellReference( createAnomaly( "missing-tag", { sheet: "P001" } ) ), "P001" );
        assert.equal( cellReference( createAnomaly( "missing-version" ) ), "(workbook)" );
    } );

    it( "summarises, lists blocking anomalies first, and says the import was accepted", () => {
        const report = formatReport( { version: version, anomalies: [
            createAnomaly( "mixed-script-word", { sheet: "P001", row: 16, column: 1 }, { word: "Е-prescription" } ),
            createAnomaly( "look-alike-letter", { sheet: "P001", row: 3, column: 2 }, { value: "О", letters: "О U+041E", folded: "O" } )
        ] } ).split( "\n" );
        assert.equal( report[ 0 ], "e-prescription 1.5.1: 2 messages, 0 blocking, 2 warnings" );
        assert.match( report[ 1 ], /^\[warning\] P001!B3 look-alike-letter: / );
        assert.match( report[ 2 ], /^\[warning\] P001!A16 mixed-script-word: / );
        assert.equal( report[ 3 ], "Import accepted." );
    } );

    it( "puts blocking anomalies first and says the import was refused", () => {
        const report = formatReport( { version: { ...version, version: null }, anomalies: [
            createAnomaly( "unknown-fill", { sheet: "P001", row: 2 }, { colour: "123456" } ),
            createAnomaly( "missing-version" )
        ] } ).split( "\n" );
        assert.equal( report[ 0 ], "e-prescription (version unknown): 2 messages, 1 blocking, 1 warnings" );
        assert.match( report[ 1 ], /^\[blocking\] \(workbook\) missing-version/ );
        assert.match( report[ report.length - 1 ], /^Import refused/ );
    } );
} );
```

`packages/importer/test/cli.test.js`:

```js
/*
 * The command-line tool, run as a person runs it: a real .xlsx on disk, the exit code, the printed report.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { spawnSync } = require( "node:child_process" );
const { writeWorkbook } = require( "./support/xlsx-builder" );
const { row, sheet } = require( "./support/raw-builders" );
const { moduleSheets } = require( "./support/fixtures" );

const CLI = path.resolve( __dirname, "../bin/import-module.js" );
const run = ( args ) => spawnSync( process.execPath, [ CLI, ...args ], { encoding: "utf8" } );

describe( "hdp-import-module", () => {

    it( "imports a sound workbook, prints the report, writes the model and exits 0", async () => {
        const file = await writeWorkbook( moduleSheets() );
        const out = path.join( path.dirname( file ), "model.json" );
        const result = run( [ "--spec", "e-prescription", "--json", out, file ] );
        assert.equal( result.status, 0, result.stderr );
        assert.match( result.stdout, /^e-prescription 1\.1\.0: 3 messages, 0 blocking, 0 warnings$/m );
        assert.match( result.stdout, /Import accepted\./ );
        const model = JSON.parse( fs.readFileSync( out, "utf8" ) );
        assert.equal( model.version.messages[ 0 ].code, "P001" );
        assert.equal( model.version.messages[ 0 ].elements[ 0 ].identity, "header" );
    } );

    it( "refuses a workbook that is not a specification (Review Focus 5)", async () => {
        const file = await writeWorkbook( [ sheet( "Sheet1", [ row( 1, [ "Budget 2026" ] ) ] ) ] );
        const result = run( [ "--spec", "e-prescription", file ] );
        assert.equal( result.status, 1 );
        assert.match( result.stdout, /\[blocking\] \(workbook\) missing-sheet: The workbook has no sheet named "Съобщения"\./ );
        assert.match( result.stdout, /Import refused/ );
        assert.equal( result.stderr, "" );
    } );

    it( "exits 1 with a message, not a stack trace, when the file cannot be read", () => {
        const result = run( [ "--spec", "e-prescription", path.join( __dirname, "no-such-file.xlsx" ) ] );
        assert.equal( result.status, 1 );
        assert.match( result.stderr, /no-such-file\.xlsx/ );
        assert.doesNotMatch( result.stderr, /\n\s+at / );
    } );

    it( "exits 2 with the usage when an argument is missing or unknown", () => {
        for ( const args of [ [], [ "--spec", "e" ], [ "book.xlsx" ], [ "--nope", "x", "book.xlsx" ] ] ) {
            const result = run( args );
            assert.equal( result.status, 2, JSON.stringify( args ) );
            assert.match( result.stderr, /Usage: hdp-import-module/ );
        }
    } );
} );
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --workspace @health-dev-portal/importer`
Expected: FAIL — `Cannot find module '…/report/format.js'`; the CLI tests fail on the missing `bin/import-module.js`.

- [ ] **Step 4: Implement**

`packages/importer/report/format.js`:

```js
const { ANOMALY_LEVEL } = require( "@health-dev-portal/spec-model/kinds" );

const LEVEL_ORDER = Object.freeze( { [ ANOMALY_LEVEL.BLOCKING ]: 0, [ ANOMALY_LEVEL.WARNING ]: 1 } );

function columnLetters( column ) {
    let letters = "";
    for ( let remaining = column; remaining > 0; remaining = Math.floor( ( remaining - 1 ) / 26 ) ) {
        letters = String.fromCharCode( 65 + ( ( remaining - 1 ) % 26 ) ) + letters;
    }
    return letters;
}

/**
 * Writes where an anomaly was found the way Excel names it: `P001!B3`, or less when less is known.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Anomaly} anomaly
 * @returns {string}
 * @public
 */
module.exports.cellReference = ( anomaly ) => {
    if ( !anomaly.sheet ) {
        return "(workbook)";
    }
    if ( !anomaly.row ) {
        return anomaly.sheet;
    }
    if ( !anomaly.column ) {
        return `${ anomaly.sheet } row ${ anomaly.row }`;
    }
    return `${ anomaly.sheet }!${ columnLetters( anomaly.column ) }${ anomaly.row }`;
};

/**
 * Formats an import result as the text report a person reads: a summary line, each anomaly (blocking first, then by
 * sheet, row and column), and whether the import was accepted.
 *
 * @method
 * @param {{version: import( "@health-dev-portal/spec-model/definitions" ).ModuleVersion, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}} result
 * @returns {string}
 * @public
 */
module.exports.formatReport = ( result ) => {
    const { version, anomalies } = result;
    const sorted = [ ...anomalies ].sort( ( a, b ) =>
        LEVEL_ORDER[ a.level ] - LEVEL_ORDER[ b.level ]
        || String( a.sheet || "" ).localeCompare( String( b.sheet || "" ) )
        || ( a.row || 0 ) - ( b.row || 0 )
        || ( a.column || 0 ) - ( b.column || 0 ) );
    const blocking = anomalies.filter( ( anomaly ) => anomaly.level === ANOMALY_LEVEL.BLOCKING ).length;
    const lines = [ `${ version.spec } ${ version.version || "(version unknown)" }: ${ version.messages.length } messages, ${ blocking } blocking, ${ anomalies.length - blocking } warnings` ];
    for ( const anomaly of sorted ) {
        lines.push( `[${ anomaly.level }] ${ module.exports.cellReference( anomaly ) } ${ anomaly.type }: ${ anomaly.message }` );
    }
    lines.push( blocking ? "Import refused: fix the blocking anomalies in the source workbook and import it again." : "Import accepted." );
    return lines.join( "\n" );
};
```

`packages/importer/bin/import-module.js` (EUPL header after the shebang line):

```js
#!/usr/bin/env node

const fs = require( "node:fs" );
const path = require( "node:path" );
const { parseArgs } = require( "node:util" );
const { hasBlocking } = require( "@health-dev-portal/spec-model/anomalies" );
const { readWorkbook } = require( "#workbook-reader" );
const { importModuleWorkbook } = require( "#module-importer" );
const { formatReport } = require( "#report" );

const USAGE = "Usage: hdp-import-module --spec <key> [--json <model.json>] <workbook.xlsx>";

async function main( argv ) {
    let parsed;
    try {
        parsed = parseArgs( { args: argv, options: { spec: { type: "string" }, json: { type: "string" } }, allowPositionals: true } );
    } catch ( error ) {
        console.error( error.message );
        console.error( USAGE );
        return 2;
    }
    const { values, positionals } = parsed;
    if ( !values.spec || positionals.length !== 1 ) {
        console.error( USAGE );
        return 2;
    }
    const file = positionals[ 0 ];
    const workbook = await readWorkbook( file );
    const result = importModuleWorkbook( workbook, { spec: values.spec, fileName: path.basename( file ) } );
    console.log( formatReport( result ) );
    if ( values.json ) {
        fs.writeFileSync( values.json, JSON.stringify( result, null, 2 ) );
    }
    return hasBlocking( result.anomalies ) ? 1 : 0;
}

// A person reads this output: an unreadable file is one line naming it, never a stack trace.
main( process.argv.slice( 2 ) ).then( ( code ) => {
    process.exitCode = code;
}, ( error ) => {
    console.error( `Cannot import: ${ error.message }` );
    process.exitCode = 1;
} );
```

For the unreadable-file test to see the file name, `readWorkbook`'s error must carry it: exceljs' `readFile` raises
`File not found: <path>` for a missing file. If the measured message differs, wrap the call in `readWorkbook`:
`throw new Error( \`${ source }: ${ error.message }\` )` — only for the `readFile` branch.

Append to `README.md`:

````markdown

## Development

Requires Node 24 (`.nvmrc`).

```bash
npm ci
npm run lint
npm test
```

### Importing a module workbook

```bash
npx hdp-import-module --spec e-prescription --json model.json "path/to/НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx"
```

The report lists every anomaly with its sheet and cell. Exit code 0: accepted; 1: refused (a blocking anomaly) or the
file could not be read; 2: wrong arguments.
````

- [ ] **Step 5: Run the tests and lint**

Run: `npm test` then `npm run lint`
Expected: importer 66 tests pass (59 + 3 format + 4 CLI); lint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/importer README.md
git commit -m "feat(importer): text report and the hdp-import-module command (HEL-13)"
```

---

### Task 8: Public fixture and the e-Prescription regression test

**Files:**
- Create: `scripts/fetch-public-fixtures.js`
- Test: `packages/importer/test/public-eprescription.test.js`
- Modify: `package.json` (script `fixtures:fetch`), `.github/workflows/ci.yml` (fetch step), `README.md` (one line)

**Interfaces:**
- Consumes: `readWorkbook`, `importModuleWorkbook`.
- Produces: `npm run fixtures:fetch` → `.fixtures/public/eprescription-1.5.1.xlsx`, verified by SHA-256.

- [ ] **Step 1: Write the fetch script**

`scripts/fetch-public-fixtures.js`:

```js
/*
 * Downloads the public workbooks the regression tests read into the git-ignored .fixtures/public/. They are never
 * committed: they are published by the Ministry of Health on his.bg, not by this project.
 *
 * Each file is pinned by its SHA-256, so a test never silently runs against a different file than the one its
 * assertions were measured on. If his.bg replaces a file, this fails and the assertions are re-measured.
 */

const crypto = require( "node:crypto" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const DIRECTORY = path.resolve( __dirname, "..", ".fixtures", "public" );

const FIXTURES = Object.freeze( [ {
    file: "eprescription-1.5.1.xlsx",
    // The production e-Prescription workbook listed on https://his.bg/bg/dev/specifications, measured on 2026-10-13.
    url: "https://his.bg/upload/523/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%A0%D0%B5%D1%86%D0%B5%D0%BF%D1%82%D0%B0+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.5.1.xlsx",
    sha256: "6b53e64b01526ee4cee9ba47e4a6be1a6854115ecc7b9a378f35ca66a1a4b7ed"
} ] );

const digest = ( buffer ) => crypto.createHash( "sha256" ).update( buffer ).digest( "hex" );

async function fetchFixture( fixture ) {
    const target = path.join( DIRECTORY, fixture.file );
    if ( fs.existsSync( target ) && digest( fs.readFileSync( target ) ) === fixture.sha256 ) {
        console.log( `${ fixture.file }: present` );
        return;
    }
    const response = await fetch( fixture.url );
    if ( !response.ok ) {
        throw new Error( `${ fixture.file }: HTTP ${ response.status } from ${ fixture.url }` );
    }
    const buffer = Buffer.from( await response.arrayBuffer() );
    const actual = digest( buffer );
    if ( actual !== fixture.sha256 ) {
        throw new Error( `${ fixture.file }: his.bg now serves a different file (SHA-256 ${ actual }); re-measure the regression test before updating the pin.` );
    }
    fs.writeFileSync( target, buffer );
    console.log( `${ fixture.file }: downloaded, ${ buffer.length } bytes` );
}

( async () => {
    fs.mkdirSync( DIRECTORY, { recursive: true } );
    for ( const fixture of FIXTURES ) {
        await fetchFixture( fixture );
    }
} )().catch( ( error ) => {
    console.error( error.message );
    process.exitCode = 1;
} );
```

Add to the root `package.json` `scripts`: `"fixtures:fetch": "node scripts/fetch-public-fixtures.js"`.

In `README.md`, in the Development block Task 7 added, insert after `npm ci`:

```bash
npm run fixtures:fetch   # downloads the public e-Prescription workbook used by the regression test
```

Run: `npm run fixtures:fetch`
Expected: `eprescription-1.5.1.xlsx: downloaded, 179267 bytes`; a second run prints `present`.

- [ ] **Step 2: Write the regression test**

`packages/importer/test/public-eprescription.test.js`:

```js
/*
 * The real e-Prescription 1.5.1 workbook, as published. Every expected value here was measured on 2026-10-19 with a
 * prototype independent of this code (design record §5.7); a failure means the importer and the measurement disagree.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { readWorkbook } = require( "#workbook-reader" );
const { importModuleWorkbook } = require( "#module-importer" );

const FIXTURE = path.resolve( __dirname, "../../../.fixtures/public/eprescription-1.5.1.xlsx" );
const PRESENT = fs.existsSync( FIXTURE );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "The public fixture is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

const flatten = ( elements ) => elements.flatMap( ( node ) => [ node, ...flatten( node.children ) ] );

describe( "e-Prescription 1.5.1, the published workbook", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let result;
    const message = ( code ) => result.version.messages.find( ( candidate ) => candidate.code === code );
    const element = ( code, identity ) => flatten( message( code ).elements ).find( ( node ) => node.identity === identity );

    before( async () => {
        result = importModuleWorkbook( await readWorkbook( FIXTURE ), { spec: "e-prescription", fileName: "НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx" } );
    } );

    it( "imports with no blocking anomaly", () => {
        assert.deepEqual( result.anomalies.filter( ( anomaly ) => anomaly.level === "blocking" ), [] );
    } );

    it( "reads the version and the whole change history", () => {
        assert.equal( result.version.version, "1.5.1" );
        const versions = result.version.changeNotes;
        assert.equal( versions.length, 28 );
        assert.equal( versions[ 0 ].version, "1.0.2" );
        const notes = versions.flatMap( ( version ) => version.notes );
        assert.equal( notes.filter( ( note ) => note.category === "breaking" ).length, 30 );
        assert.equal( notes.filter( ( note ) => note.category === "dropped-plan" ).length, 0 );
    } );

    it( "lists the 23 messages with their status from the tab colours", () => {
        const byLifecycle = ( lifecycle ) => result.version.messages.filter( ( candidate ) => candidate.lifecycle === lifecycle ).map( ( candidate ) => candidate.code );
        assert.equal( result.version.messages.length, 23 );
        assert.deepEqual( byLifecycle( "withdrawn" ), [ "P011", "P012" ] );
        assert.deepEqual( byLifecycle( "in-development" ), [ "P021", "P022" ] );
        assert.equal( byLifecycle( "active" ).length, 19 );
    } );

    it( "pairs requests with responses and keeps P099 as the error message", () => {
        assert.equal( message( "P001" ).address, "/v4/eprescription/doctor/issue" );
        assert.equal( message( "P001" ).pairedWith, "P002" );
        assert.equal( message( "P099" ).pairedWith, null );
    } );

    it( "builds P001's tree", () => {
        assert.equal( flatten( message( "P001" ).elements ).length, 95 );
        const lrn = element( "P001", "contents/prescription/lrn@value" );
        assert.equal( lrn.requirement, "R" );
        assert.deepEqual( lrn.cardinality, { min: 1, max: 1 } );
        assert.equal( lrn.constraint.maxLength, 36 );
        assert.equal( lrn.constraint.charset, "an" );
        const name = element( "P001", "contents/prescription/group/medication/medicationCode@name" );
        assert.equal( name.kind, "attribute" );
        assert.equal( name.codeList, "CL009" );
        assert.deepEqual( name.rules, [ "RL023" ] );
        const unit = element( "P001", "contents/prescription/group/medication/dosageInstruction/doseQuantityCode@value" );
        assert.equal( unit.kind, "polymorphic" );
        assert.deepEqual( unit.children.map( ( variant ) => variant.dataType ), [ "String", "Codeable Concept" ] );
        assert.equal( unit.children[ 1 ].codeList, "CL035" );
        assert.equal( element( "P001", "contents/prescription/allowedRepeatsNumber@value" ).constraint.maxValue, 1 );
    } );

    it( "reports the known source defects as warnings", () => {
        const warnings = result.anomalies.filter( ( anomaly ) => anomaly.level === "warning" );
        // HEL-10: nine message titles spell "E-рецепта" with a Latin E.
        assert.equal( warnings.filter( ( anomaly ) => anomaly.type === "mixed-script-word" && anomaly.sheet === "Съобщения" ).length, 9 );
        // P001 row 16: "Е-prescription LRN" starts with a Cyrillic Е.
        assert.ok( warnings.some( ( anomaly ) => anomaly.type === "mixed-script-word" && anomaly.sheet === "P001" && anomaly.row === 16 ) );
        // HEL-12: 30 requirement cells hold a Cyrillic О.
        assert.equal( warnings.filter( ( anomaly ) => anomaly.type === "look-alike-letter" && anomaly.column === 2 ).length, 30 );
        // HEL-5: CDP09 and CDP36 are empty.
        assert.deepEqual( warnings.filter( ( anomaly ) => anomaly.type === "empty-condition" ).map( ( anomaly ) => anomaly.details.id ), [ "CDP09", "CDP36" ] );
    } );
} );
```

- [ ] **Step 3: Run the regression test**

Run: `npm test --workspace @health-dev-portal/importer`
Expected: PASS — 72 importer tests (66 + 6). If an assertion fails, do not change the expected value to match: the
values were measured independently. Find which side is wrong — the importer or the measurement — and say which in the
commit body.

- [ ] **Step 4: Make CI fetch the fixture**

In `.github/workflows/ci.yml`, insert before `- name: Unit tests`:

```yaml
      # The regression test reads the published e-Prescription workbook; in CI a missing fixture fails the run.
      - name: Fetch public fixtures
        run: npm run fixtures:fetch
```

- [ ] **Step 5: Run everything as CI will**

Run: `npm ci && npm run fixtures:fetch && npm run lint && CI=true npm test`
Expected: lint 0 errors; spec-model 19 and importer 72 tests pass, 0 skipped.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json README.md .github/workflows/ci.yml packages/importer/test/public-eprescription.test.js
git commit -m "test(importer): regression test against the published e-Prescription 1.5.1 workbook (HEL-13)"
```

The body records the measured values the test asserts and where they come from (§5.7), and the SHA-256 pin.

---

## After the last task

Open one pull request from the branch for HEL-13, move HEL-13 to Review, and write the body per CLAUDE.md: what the
importer does now, the measured numbers (tests per package, the regression facts), and what is deliberately not done
(nomenclatures, conditions language, XSDs, persistence — plans 2–5).
