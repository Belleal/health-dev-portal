# Plan 2 — Nomenclatures and business-rules workbooks, streaming reader, cross-spec linking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the nomenclatures workbook (all code lists) and the business-rules workbook into the specification
model. Link a module's code-list and rule references against them. All of it runs as
`hdp-import-set --nomenclatures <file> --rules <file> --module <spec>=<file>`.

**Architecture:**
- **Reading.** The nomenclatures workbook is read by a new **streaming reader**. It yields the same `RawSheet` shape
  as plan 1's full reader, one sheet at a time, so the pure stages and their test builders are shared. The rules
  workbook is small (30 KB) and keeps the full reader, which sees merges.
- **Linking** is a pure function in `spec-model` over imported versions.
- **The set command** reads each workbook, imports it, links the modules and prints one report per workbook.

**Tech Stack:** Node 24, CommonJS, `node --test`, exceljs 4.4.0 (full and streaming reader), jszip 3.10.2 (theme part
only).

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md):
- §4.1 spec kinds;
- §4.6 code lists, with the 1.5.33 measurements;
- §4.6.1 business rules;
- §4.8 references between specs;
- §5.3 the Link stage and its levels;
- §5.7 the streaming reader as measured.

Builds on plan 1 (`2026-10-19-plan-1-module-importer.md`), merged as #3 and #4. Tracking: **HEL-14**. The source
defects these workbooks still carry are **HEL-15** (nomenclatures) and **HEL-16** (rules).

## Decisions this plan takes

Each one changes what a reviewer would otherwise expect. Reject any of them at review, before Task 1.

1. **A repeated key blocks.**
   - Consequence: the published 1.5.33 is refused today. CL096 repeats `416`; CL127 repeats 16 keys of a scoring
     table typed under the list (HEL-15).
   - Rejected: keeping the first entry with a warning. That silently drops an entry the source still publishes, and
     plan 5's primary key `(list, key)` would refuse it anyway.
2. **Look-alike letters in keys are folded to Latin, with a warning** (§5.7 names `Е003`).
   - Affects 35 keys: 17 in CL022, 17 in CL024 and 1 in CL999.
   - Which spelling the backend holds is an open item (§15, HEL-15).
3. **Rows without a usable key are one warning per sheet, not one per row.** Such rows are blank, a placeholder
   (`...`, `---`), or text with a space (a footnote). One per row would add 3,323 lines for CL122 alone.
4. **A sheet the index does not list is not imported.** That means CLS01 and CLS02, which are relation tables.
   - Its own anomalies are dropped in favour of one `sheet-not-listed` warning.
   - Rejected: reading every `CL…` sheet as a code list, which reports CLS01's missing `Key` header as blocking.
5. **A reference to a rule that does not exist blocks**, like one to a code list or condition (§5.3, amended here).
   A reference to a removed list or a withdrawn rule is a warning.
6. **`MESSAGE_LIFECYCLE` becomes `LIFECYCLE`.** Rules carry the same status colours as message tabs (§4.6.1). One
   enumeration named for messages would be wrong on every rule. The values are unchanged; the name is used in
   seven places.
7. **jszip becomes a direct dependency, pinned to the 3.10.2 already in the tree**, to read the theme part the
   streaming reader skips.
   - Rejected: unzipper, which exceljs uses only internally, and a hand-written zip reader.

## Global Constraints

- **Node 24.** Every `package.json` declares `"engines": { "node": ">=24" }`.
- **House style.** CommonJS; four-space indent; double quotes; semicolons; **spaces inside parentheses, brackets and
  braces**: `foo( a, b )`, `[ 1, 2 ]`, `{ key: value }`.
- **JSDoc on everything exported**: prose first, then `@method` / `@param` / `@returns` / `@throws`, then `@public`.
- **Imports.** `#alias` inside a package (its `imports` map); the `exports` map across packages.
- **`spec-model` stays pure:** no `require` of `node:` modules, no I/O.
- **Exact pins:** exceljs **`4.4.0`** and jszip **`3.10.2`**, exactly.
- **Data.** Never commit unpublished specification data. Fixtures are synthetic or fetched into the git-ignored
  `.fixtures/` by `npm run fixtures:fetch`.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Anomaly levels** (§5.3): `blocking` (nothing is written) or `warning` (imported and listed).
- **Look-alike letters are folded only in code columns**, and only when the result is entirely ASCII (§5.7). In this
  plan the code columns are:
  - code-list keys;
  - index IDs;
  - rule IDs;
  - error codes.

  Descriptions, display values and list-specific columns are never folded.
- **Versions are stored without the `v`**: `"1.5.28"`. That is how plan 1 stores change-note versions.
- **Every new `.js` file begins with the EUPL block of any existing file**, e.g. lines 1–16 of
  `packages/importer/read/raw.js`, copied verbatim. Code blocks below omit it.
- **Tests use plan 1's builders:** `sheet`, `row` and `cell` from `test/support/raw-builders.js`, and `writeWorkbook`
  from `test/support/xlsx-builder.js`. `row( number, values, style )` styles column A only.

## Review Focus

These are inputs the spec implies but the happy path never exercises — the ones most likely to bite a person
importing a real workbook. Each has a test in the task that owns the code.

1. **Sheets arriving out of tab order.**
   - The streaming reader yields zip order: 1.5.33 gives CL178 first and the index sheet late.
   - A list read before the index must still get its status, and the result must not depend on order.
   - → Task 5, "imports the same lists whatever order the sheets arrive in".
2. **Something other than a key in the Key column.**
   - Seen in 1.5.33: a footnote (`* За лекари, завършили…`), a placeholder (`...`, `---`), the keyless second row of
     a merged key (CL006).
   - None may become an entry, and two `---` must not block as a duplicate.
   - → Task 4, "skips rows without a usable key, once per sheet".
3. **A date where a version belongs** (`Since` = `10.10.2023`, 124 cells).
   - A prototype for this plan read it as version 10.10.2023.
   - It must be a warning and `null`.
   - → Task 2, "tells a date from a version".
4. **The 63 header layouts.**
   - `Description` / `Language EN`; `Display Value (English)`; `Display value BG` against `Display Value BG`.
   - A list-specific `Description` beside `Description BG` (CL007).
   - → Task 4, "maps every measured header layout".
5. **The wrong workbook for an option** — the rules workbook given as `--nomenclatures`, or a file that is not a
   workbook.
   - Expected: a readable refusal naming the file, exit 1, no stack trace.
   - → Task 7, "refuses the wrong workbook for an option", and "names the file it cannot read".

## File map

| File | Responsibility |
|---|---|
| `packages/spec-model/model/kinds.js` | `LIFECYCLE` (renamed), `SPEC_KIND`, `CODE_LIST_STATUS` |
| `packages/spec-model/model/definitions.types.js` | Typedefs for code lists, rules, dated change versions |
| `packages/spec-model/model/anomalies.js` | 21 new anomaly types |
| `packages/spec-model/model/links.js` | `linkModule`, `linkRules` |
| `packages/importer/interpret/cells.js` | `parseVersionCell`, `compareVersions` (moved here) |
| `packages/importer/interpret/change-notes.js` | Header row and staging/production dates |
| `packages/importer/read/raw-cell.js` | Cell and row conversion shared by both readers (moved) |
| `packages/importer/read/stream-reader.js` | `streamSheets` |
| `packages/importer/interpret/code-list-sheet.js` | One `CL…` sheet → code list |
| `packages/importer/interpret/nomenclature-index.js` | "Номенклатури" → list metadata |
| `packages/importer/importer/workbook-checks.js` | Ambiguous sheet names, workbook version (moved) |
| `packages/importer/importer/nomenclatures-importer.js` | Assembles a nomenclatures version from streamed sheets |
| `packages/importer/interpret/rules-sheet.js` | "Rules" → rules |
| `packages/importer/importer/rules-importer.js` | Assembles a rules version |
| `packages/importer/importer/set-importer.js` | Reads, imports and links a set of workbooks |
| `packages/importer/report/format.js` | Summary by kind, tally by type, set report |
| `packages/importer/bin/import-set.js` | CLI |
| `scripts/fetch-public-fixtures.js` | Two more pinned public workbooks |

---

### Task 1: The model's vocabulary for code lists, rules and links

**Files:**
- Modify: `packages/spec-model/model/kinds.js`
- Modify: `packages/spec-model/model/definitions.types.js`
- Modify: `packages/spec-model/model/anomalies.js`
- Modify: `packages/importer/structure/legend.js` (the rename)
- Create: `packages/spec-model/model/links.js`
- Modify: `packages/spec-model/package.json`, which adds `exports["./links"]`
- Test: `packages/spec-model/test/links.test.js`, `packages/spec-model/test/kinds.test.js`

**Interfaces:**
- **Produces, in `@health-dev-portal/spec-model/kinds`:**
  - `LIFECYCLE`: `{ ACTIVE: "active", IN_DEVELOPMENT: "in-development", WITHDRAWN: "withdrawn" }`. It replaces
    `MESSAGE_LIFECYCLE`, and no alias is kept.
  - `SPEC_KIND`: `{ MODULE: "module", RULES: "rules", NOMENCLATURES: "nomenclatures", COMMON_SCHEMA: "common-schema" }`.
  - `CODE_LIST_STATUS`: `{ IN_USE: "in-use", REMOVED: "removed", UNDER_REVISION: "under-revision",
    RESERVED: "reserved", IN_DEVELOPMENT: "in-development", INCOMPLETE: "incomplete" }`.
- **Produces, typedefs** (exact property names; later tasks build these objects):
  - `CodeListColumn { title: string, column: number }`.
  - `CodeListEntry`: `{ key: string, description: LocalText, display: LocalText, values: (string|null)[],
    since: string|null, validUntil: string|null, source: SourceRef }`. `values` follows the list's `columns`.
  - `CodeList`: `{ id: string, name: LocalText, status: string|null, dynamic: boolean|null,
    visibility: string|null, remark: string|null, notes: string[], columns: CodeListColumn[],
    entries: CodeListEntry[], source: SourceRef }`.
  - `NomenclaturesVersion`: `{ kind: "nomenclatures", spec: "nomenclatures", version: string|null,
    codeLists: CodeList[], changeNotes: ChangeVersion[] }`.
  - `Rule`: `{ id: string, definition: LocalText, sourceText: string|null, errorCode: string|null,
    since: string|null, lifecycle: string|null, changedInVersion: boolean|null, source: SourceRef }`.
  - `RulesVersion`: `{ kind: "rules", spec: "rules", version: string|null, rules: Rule[], changeNotes: ChangeVersion[] }`.
  - `ChangeVersion` gains `stagingDate: string|null` and `productionDate: string|null`, as ISO `YYYY-MM-DD`.
  - `ModuleVersion` gains `kind: "module"`.
- **Produces, in `@health-dev-portal/spec-model/links`:**
  - `ERROR_CODE_LIST = "CL999"`;
  - `linkModule( module: ModuleVersion, targets: { nomenclatures?: NomenclaturesVersion|null, rules?: RulesVersion|null } ): Anomaly[]`;
  - `linkRules( rules: RulesVersion, nomenclatures: NomenclaturesVersion ): Anomaly[]`.
- **Produces, the anomaly types** — exactly these keys, levels and texts. Tasks 2–7 create them.

| Type | Level | Text |
|---|---|---|
| `duplicate-key` | blocking | `Key {key} appears twice (rows {firstRow} and {row}).` |
| `skipped-rows` | warning | `{count} row(s) have no usable key — blank, a placeholder such as "...", or text with spaces — and are not imported: rows {rows}.` |
| `non-canonical-version` | warning | `"{value}" is read as version {version}; the template writes "v1.2.3".` |
| `date-instead-of-version` | warning | `"{value}" is a date; this column holds a version such as v1.5.28.` |
| `invalid-version` | warning | `"{value}" is not a version such as v1.5.28.` |
| `valid-until-before-since` | warning | `Valid until {validUntil} is earlier than since {since}.` |
| `invalid-date` | warning | `"{value}" is not a date such as 24.08.2026.` |
| `unknown-list-status` | warning | `"{value}" is not a known code-list status.` |
| `invalid-flag` | warning | `"{value}" is neither true nor false.` |
| `duplicate-list` | blocking | `Code list {id} is listed twice (rows {firstRow} and {row}).` |
| `list-without-sheet` | blocking | `Code list {id} is listed as {status} but has no sheet.` |
| `sheet-not-listed` | warning | `Sheet {sheet} is not listed in "Номенклатури" and is not imported.` |
| `malformed-rule-id` | blocking | `"{value}" is not a rule ID such as RL001.` |
| `duplicate-rule` | blocking | `Rule {id} is defined twice (rows {firstRow} and {row}).` |
| `unknown-rule-colour` | warning | `Fill {colour} of rule {id} is not in the legend, so the rule's status is unknown.` |
| `rule-without-definition` | warning | `Active rule {id} has no definition.` |
| `unknown-code-list` | blocking | `{identity} names code list {id}, which the nomenclatures do not define.` |
| `removed-code-list` | warning | `{identity} names code list {id}, which the nomenclatures mark as removed.` |
| `unknown-rule` | blocking | `{identity} names rule {id}, which the rules do not define.` |
| `withdrawn-rule` | warning | `{identity} names rule {id}, which is withdrawn.` |
| `unknown-error-code` | warning | `Rule {id} returns error code {code}, which CL999 does not define.` |

That is 21 types, so the catalogue grows from 47 to 68. Plan 1's types are reused wherever they fit, among them:
- `missing-sheet`, `missing-header-row`, `missing-column`;
- `missing-version`, `version-mismatch`, `ambiguous-sheet`;
- `look-alike-letter`, `mixed-script-word`.

- [ ] **Step 1: Write the failing tests**

`packages/spec-model/test/kinds.test.js` (new):

```js
it( "names spec kinds, code-list statuses and one lifecycle for messages and rules", () => {
    assert.deepEqual( Object.values( SPEC_KIND ), [ "module", "rules", "nomenclatures", "common-schema" ] );
    assert.deepEqual( Object.values( CODE_LIST_STATUS ), [ "in-use", "removed", "under-revision", "reserved", "in-development", "incomplete" ] );
    assert.deepEqual( Object.values( LIFECYCLE ), [ "active", "in-development", "withdrawn" ] );
    assert.equal( require( "@health-dev-portal/spec-model/kinds" ).MESSAGE_LIFECYCLE, undefined );
} );
```

`packages/spec-model/test/links.test.js`. The builders hold only the properties linking reads:

```js
const element = ( overrides = {} ) => ( { identity: "contents/x@value", name: { bg: null, en: "X" }, rules: [], conditions: [],
    codeList: null, children: [], source: { sheet: "P001", row: 5 }, ...overrides } );
const moduleOf = ( ...elements ) => ( { kind: "module", spec: "e-prescription", version: "1.5.1", messages: [ { code: "P001", elements } ] } );
const nomenclaturesOf = ( ...lists ) => ( { kind: "nomenclatures", codeLists: lists.map( ( [ id, status, keys = [] ] ) =>
    ( { id, status, entries: keys.map( ( key ) => ( { key } ) ) } ) ) } );
const rulesOf = ( ...rules ) => ( { kind: "rules", rules: rules.map( ( [ id, lifecycle, errorCode = "E002" ] ) =>
    ( { id, lifecycle, errorCode, source: { sheet: "Rules", row: 4 } } ) ) } );
const types = ( anomalies ) => anomalies.map( ( anomaly ) => anomaly.type );

it( "accepts references that resolve", () => {
    assert.deepEqual( linkModule( moduleOf( element( { codeList: "CL001", rules: [ "RL001" ] } ) ),
        { nomenclatures: nomenclaturesOf( [ "CL001", "in-use" ] ), rules: rulesOf( [ "RL001", "active" ] ) } ), [] );
} );

it( "blocks a code list and a rule that do not exist, at the element's row", () => {
    const anomalies = linkModule( moduleOf( element( { codeList: "CL404", rules: [ "RL404" ] } ) ),
        { nomenclatures: nomenclaturesOf( [ "CL001", "in-use" ] ), rules: rulesOf( [ "RL001", "active" ] ) } );
    assert.deepEqual( types( anomalies ), [ "unknown-code-list", "unknown-rule" ] );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.level, anomaly.sheet, anomaly.row, anomaly.details.id ] ),
        [ [ "blocking", "P001", 5, "CL404" ], [ "blocking", "P001", 5, "RL404" ] ] );
    assert.equal( anomalies[ 0 ].details.identity, "contents/x@value" );
} );

it( "warns about a removed code list and a withdrawn rule", () => {
    assert.deepEqual( types( linkModule( moduleOf( element( { codeList: "CL068", rules: [ "RL019" ] } ) ),
        { nomenclatures: nomenclaturesOf( [ "CL068", "removed" ] ), rules: rulesOf( [ "RL019", "withdrawn" ] ) } ) ),
    [ "removed-code-list", "withdrawn-rule" ] );
} );

it( "checks nested elements, each reference once, and names an element without identity by its name", () => {
    const child = element( { identity: null, rules: [ "RL404", "RL405" ], source: { sheet: "P001", row: 6 } } );
    const anomalies = linkModule( moduleOf( element( { children: [ child ] } ) ), { rules: rulesOf( [ "RL001", "active" ] ) } );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.row, anomaly.details.id, anomaly.details.identity ] ),
        [ [ 6, "RL404", "X" ], [ 6, "RL405", "X" ] ] );
} );

it( "checks nothing of a kind whose spec is not in the set", () => {
    const module = moduleOf( element( { codeList: "CL404", rules: [ "RL404" ] } ) );
    assert.deepEqual( linkModule( module, {} ), [] );
    assert.deepEqual( types( linkModule( module, { rules: rulesOf() } ) ), [ "unknown-rule" ] );
} );

it( "warns about a rule whose error code CL999 does not define, and skips the check without CL999", () => {
    const rules = rulesOf( [ "RL001", "active", "E002" ], [ "RL002", "withdrawn", "E404" ], [ "RL003", "active", null ] );
    const anomalies = linkRules( rules, nomenclaturesOf( [ "CL999", "incomplete", [ "E001", "E002" ] ] ) );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.details.id, anomaly.details.code ] ),
        [ [ "unknown-error-code", "warning", "RL002", "E404" ] ] );
    assert.deepEqual( linkRules( rules, nomenclaturesOf( [ "CL001", "in-use" ] ) ), [] );
} );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/spec-model`
Expected: FAIL — `SPEC_KIND` is undefined, and the module `@health-dev-portal/spec-model/links` is not found.

- [ ] **Step 3: Rename the lifecycle, and add the kinds, typedefs and catalogue entries**

1. Rename `MESSAGE_LIFECYCLE` to `LIFECYCLE` in `kinds.js`, `definitions.types.js` and `legend.js`. Its JSDoc says
   it applies to messages and rules.
2. Add `SPEC_KIND` and `CODE_LIST_STATUS` with JSDoc citing §4.1 and §4.6.
3. Add the typedefs listed under Interfaces.
4. Add the 21 types to `ANOMALY_TYPES` under three new comment headings: `// Code lists and the index`, `// Rules` and
   `// Links between specs`. `invalid-date` goes under the workbook-as-a-whole group.

- [ ] **Step 4: Implement `links.js`**

- **`linkModule`** walks every element of every message, depth first.
  - **Code list:** when `targets.nomenclatures` is given, an element's `codeList` must name a list in `codeLists`.
    Otherwise → `unknown-code-list`; a list with `status === "removed"` → `removed-code-list`.
  - **Rules:** when `targets.rules` is given, each of the element's `rules` must name a rule. Otherwise →
    `unknown-rule`; `lifecycle === "withdrawn"` → `withdrawn-rule`.
  - Each anomaly is created at `node.source` with `{ identity: node.identity || node.name.en, id }`.
- **`linkRules`** finds `ERROR_CODE_LIST` among the code lists, and returns `[]` without it. Otherwise, every rule
  with a non-null `errorCode` that is not a key of that list → `unknown-error-code` at the rule's source, with
  `{ id, code }`.
- Build the lookups once per call: a `Map` of lists and a `Map` of rules. CL011 has 39,000 entries, and e-Prescription
  has 224 code-list references.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. Plan 1's 113 tests still pass after the rename, and the new tests pass as well.

- [ ] **Step 6: Commit**

```bash
git add packages/spec-model packages/importer/structure/legend.js
git commit -m "feat(spec-model): code lists, rules and links between specs (HEL-14)"
```

---

### Task 2: Version cells and dated change notes

**Files:**
- Modify: `packages/importer/interpret/cells.js`, `packages/importer/interpret/change-notes.js`
- Test: `packages/importer/test/cells.test.js`, `packages/importer/test/change-notes.test.js`

**Interfaces:**
- **Produces, in `#cells`:**
  - `parseVersionCell( text: string ): { version: string|null, form: "empty"|"canonical"|"lenient"|"date"|"invalid" }`;
  - `compareVersions( a: string, b: string ): number`, moved out of `change-notes.js` unchanged.
- **Produces:** `readChangeNotes` versions carry `stagingDate` and `productionDate`, as ISO dates or `null`.

The forms are tried in this order. Dates come before the lenient version form, because `10.10.2023` matches both.

| Form | Pattern on the trimmed text | `version` |
|---|---|---|
| `empty` | `isNone( text )` (`""` or `---`) | `null` |
| `canonical` | `^v\d+\.\d+\.\d+$` | digits without the `v` |
| `date` | `^\d{1,2}\.\d{1,2}\.\d{4}$` | `null` |
| `lenient` | `^v?\.?\s*(\d+)\.(\d+)\.(\d+)$` | `"$1.$2.$3"` |
| `invalid` | anything else | `null` |

- **Header row.** A change-notes sheet may begin with a header row. In 1.5.33 that is row 1:
  `Версия / промени | Дата на тестова | Дата на прод`.
  - It is the first row, within the first 10, with a cell after column A matching `^дата на тест` or `^дата на прод`
    (case-insensitive).
  - That row is skipped. Its matching columns are the staging and production date columns.
- **Dates on a heading row.**
  - `^(\d{1,2})\.(\d{1,2})\.(\d{4})$` is read as a calendar date, round-tripped through `Date.UTC` so `31.02.2026`
    fails.
  - `^\d{4}-\d{2}-\d{2}$` is already ISO; that is what `cellText` makes of a date cell.
  - Empty → `null`.
  - Anything else → `invalid-date` at that cell, and `null`.
- A sheet without a header row has both dates `null` on every version.

- [ ] **Step 1: Write the failing tests**

`cells.test.js`:

```js
it( "reads a version cell in the template's form and in the forms the workbooks use", () => {
    assert.deepEqual( parseVersionCell( "v1.5.28" ), { version: "1.5.28", form: "canonical" } );
    assert.deepEqual( parseVersionCell( "v.1.5.21" ), { version: "1.5.21", form: "lenient" } );
    assert.deepEqual( parseVersionCell( "1.5.16" ), { version: "1.5.16", form: "lenient" } );
    assert.deepEqual( parseVersionCell( "" ), { version: null, form: "empty" } );
    assert.deepEqual( parseVersionCell( "---" ), { version: null, form: "empty" } );
} );

it( "tells a date from a version (Review Focus 3)", () => {
    assert.deepEqual( parseVersionCell( "10.10.2023" ), { version: null, form: "date" } );
    assert.deepEqual( parseVersionCell( "1.1.2024" ), { version: null, form: "date" } );
} );

it( "refuses what is neither", () => {
    for ( const text of [ "f1267", "16.07", "v1.2", "v1.2.3.4" ] ) {
        assert.deepEqual( parseVersionCell( text ), { version: null, form: "invalid" }, text );
    }
} );

it( "compares versions part by part, as numbers", () => {
    assert.ok( compareVersions( "1.5.9", "1.5.10" ) < 0 );
    assert.ok( compareVersions( "1.5.21", "1.5.19" ) > 0 );
    assert.equal( compareVersions( "1.0.0", "1.0.0" ), 0 );
} );
```

`change-notes.test.js`:

```js
const dated = ( ...rows ) => sheet( "Change Notes", [ row( 1, [ "Версия / промени", "Дата на тестова", "Дата на прод" ] ), ...rows ] );

it( "reads the staging and production dates of a dated sheet, and not its header as a note", () => {
    const notes = readChangeNotes( dated(
        row( 2, [ "Версия 1.5.29", "24.08.2026", "31.08.2026" ] ),
        row( 3, [ "Добавена номенклатура CL180" ] ),
        row( 4, [ "Версия 1.5.30", "2026-09-23" ] ) ) );
    assert.deepEqual( notes.anomalies, [] );
    assert.deepEqual( notes.versions.map( ( version ) => [ version.version, version.stagingDate, version.productionDate, version.notes.length ] ),
        [ [ "1.5.29", "2026-08-24", "2026-08-31", 1 ], [ "1.5.30", "2026-09-23", null, 0 ] ] );
} );

it( "reports a date it cannot read, at its cell, and keeps the version", () => {
    const notes = readChangeNotes( dated( row( 2, [ "Версия 1.5.29", "31.02.2026" ] ) ) );
    assert.deepEqual( notes.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.row, anomaly.column ] ), [ [ "invalid-date", 2, 2 ] ] );
    assert.equal( notes.versions[ 0 ].stagingDate, null );
} );

it( "leaves both dates null on a sheet without date columns", () => {
    const notes = readChangeNotes( sheet( "Change Notes", [ row( 1, [ "Версия 1.0.0" ] ), row( 2, [ "Добавено правило RL001" ] ) ] ) );
    assert.deepEqual( [ notes.versions[ 0 ].stagingDate, notes.versions[ 0 ].productionDate ], [ null, null ] );
} );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/importer`
Expected: FAIL — `parseVersionCell` is not a function, and the header row is reported as `notes-before-version`.

- [ ] **Step 3: Implement**

In `cells.js`, add `parseVersionCell` per the table and move `compareVersions` in from `change-notes.js`. Then give
`readChangeNotes` the header row and the dates. Its other behaviour is unchanged.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/importer/interpret packages/importer/test
git commit -m "feat(importer): version cells, and staging and production dates on change notes (HEL-14)"
```

---

### Task 3: The streaming reader

**Files:**
- Create: `packages/importer/read/raw-cell.js`, `packages/importer/read/stream-reader.js`
- Modify: `packages/importer/read/workbook-reader.js`, so that it uses `#raw-cell`
- Modify: `packages/importer/package.json`:
  - dependency `"jszip": "3.10.2"`;
  - imports `#raw-cell` and `#stream-reader`;
  - export `./stream-reader`.
- Regenerate: `package-lock.json` (`npm install`)
- Test: `packages/importer/test/stream-reader.test.js`

**Interfaces:**
- **Produces, in `#raw-cell`:** `cellText( value ): string`, `colourOf( colour, themeColours ): string|null` and
  `toRawRow( row, themeColours ): RawRow`. They hold `workbook-reader.js`'s private `cellText`, `colourOf` and
  `toRawCell`, plus the per-row loop of `toRawSheet`, moved verbatim. The typedefs stay in `workbook-reader.js`.
- **Produces:** `streamSheets( source: string|Buffer ): AsyncGenerator<RawSheet>`.
  - Each sheet is yielded whole, and holds only rows where `row.hasValues` is true — the same rows
    `eachRow( { includeEmpty: false } )` gives.
  - `tabColour` is always `null`.
  - Sheets come in zip order.

**Implementation:**
1. Read the bytes once: a path → `fs.promises.readFile`.
2. `JSZip.loadAsync( bytes )`, then `zip.file( "xl/theme/theme1.xml" )`.
   - Present → `parseThemeColours( await file.async( "string" ) )`.
   - Absent → `{}`, so every theme colour reads as `UNRESOLVED`.
3. Run `new ExcelJS.stream.xlsx.WorkbookReader( Readable.from( [ bytes ] ), { worksheets: "emit", sharedStrings: "cache",
   styles: "cache", hyperlinks: "ignore", entries: "ignore" } )`.
4. `for await` each worksheet and `for await` each row.
5. A comment in the file records two facts from §5.7, because both surprise a reader:
   - the reader spools worksheets to temporary files;
   - it ignores merges.

- [ ] **Step 1: Write the failing tests**

```js
const drain = async ( iterable ) => { const sheets = []; for await ( const raw of iterable ) { sheets.push( raw ); } return sheets; };

it( "reads what the full reader reads, sheet for sheet, except the tab colour", async () => {
    const file = await writeWorkbook( [
        sheet( "CL001", [ row( 1, [ "CL001 - Пол" ] ), row( 4, [ "Key", "Description BG" ], { fill: "BDD7EE" } ),
            row( 5, [ "1", "мъж" ], { indent: 2, fontColour: "C65911" } ), row( 7, [ "", "бележка" ] ) ] ),
        sheet( "Change Notes", [ row( 1, [ "Версия 1.0.0" ] ) ], "70AD47" )
    ] );
    const full = await readWorkbook( file );
    const streamed = await drain( streamSheets( file ) );
    assert.deepEqual( streamed.map( ( raw ) => raw.name ).sort(), [ "CL001", "Change Notes" ] );
    for ( const raw of streamed ) {
        assert.deepEqual( raw.rows, full.sheets.find( ( candidate ) => candidate.name === raw.name ).rows, raw.name );
        assert.equal( raw.tabColour, null );
    }
} );

it( "resolves theme colours through the workbook's own theme part", async () => {
    // Written with exceljs directly: plan 1's builder writes only argb colours.
    const workbook = new ExcelJS.Workbook();
    const target = workbook.addWorksheet( "Change Notes" ).getCell( "A1" );
    target.value = "Версия 1.0.0";
    target.font = { color: { theme: 1 } };
    target.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 0 } };
    const [ raw ] = await drain( streamSheets( await workbook.xlsx.writeBuffer() ) );
    assert.deepEqual( [ raw.rows[ 0 ].cells[ 0 ].fontColour, raw.rows[ 0 ].cells[ 0 ].fill ], [ "000000", "FFFFFF" ] );
} );

it( "reads a covered merged cell as empty, as the full reader does", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet( "CL006" );
    worksheet.getCell( "A1" ).value = "1004";
    worksheet.mergeCells( "A1:A2" );
    worksheet.getCell( "B2" ).value = "00";
    const [ raw ] = await drain( streamSheets( Buffer.from( await workbook.xlsx.writeBuffer() ) ) );
    assert.deepEqual( raw.rows.map( ( entry ) => entry.cells.map( ( one ) => one.text ) ), [ [ "1004" ], [ "", "00" ] ] );
} );

it( "rejects bytes that are not a workbook", async () => {
    await assert.rejects( drain( streamSheets( Buffer.from( "not a workbook" ) ) ) );
} );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/importer`
Expected: FAIL — `#stream-reader` cannot be resolved.

- [ ] **Step 3: Move the cell conversion and implement `streamSheets`**

Move the conversion into `raw-cell.js` first. Then run the suite: `workbook-reader.test.js` must pass untouched.
Only then write `stream-reader.js`.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/importer package-lock.json
git commit -m "feat(importer): a streaming workbook reader that yields raw sheets (HEL-14)"
```

---

### Task 4: A code-list sheet, and the index sheet

**Files:**
- Create: `packages/importer/interpret/code-list-sheet.js`, `packages/importer/interpret/nomenclature-index.js`
- Modify: `packages/importer/package.json`, adding imports `#code-list-sheet` and `#nomenclature-index`
- Test: `packages/importer/test/code-list-sheet.test.js`, `packages/importer/test/nomenclature-index.test.js`

**Interfaces:**
- **Consumes:**
  - `parseVersionCell` and `compareVersions` (Task 2);
  - `foldLookAlikes`, `findMixedScriptWords`, `noneToNull`, `cellAt`, `findRow` (plan 1);
  - the Task 1 anomaly types.
- **Produces:** `readCodeListSheet( sheet: RawSheet ): { codeList: CodeList, anomalies: Anomaly[] }`.
  - `status`, `dynamic`, `visibility` and `remark` are `null`; Task 5 fills them from the index.
- **Produces:** `readNomenclatureIndex( sheet: RawSheet ): { lists: IndexEntry[], anomalies: Anomaly[] }`.
  - `IndexEntry { id, name: string|null, status: string|null, dynamic: boolean|null, visibility: string|null,
    remark: string|null, source: SourceRef }`, as a typedef in that file.

**A code-list sheet, row by row:**

1. **The ID** is the trimmed sheet name.
2. **The header** is the first row within the first 10 whose column A is `Key`. None → `missing-header-row`, and an
   empty list.
3. **The title** is the first row above the header whose column A matches `^CL[A-Z0-9]+\s*[-–]\s*(.*)$`. Its group
   gives `name.bg`; an empty group gives `null`. `name.en` is always `null`.
4. **Notes** are the other rows above the header with text in column A alone, in order. The column-group row
   (`Entity | … | Meta Data`) has several cells, so it is not a note.
5. **Column roles** are matched case-insensitively, with runs of whitespace collapsed. For each role the first title
   present wins; a column taken by a role is not list-specific. Every other non-empty header cell is a list-specific
   column, in sheet order. These aliases are exact copy:

   | Role | Titles, in order of preference |
   |---|---|
   | key | `Key` |
   | description.bg | `Description BG`, `Description` |
   | description.en | `Description EN`, `Language EN` |
   | display.bg | `Display value BG`, `Display Value (Bulgarian)` |
   | display.en | `Display value EN`, `Display Value (English)` |
   | since | `Since` |
   | validUntil | `Valid Until` |

6. **Rows below the header:**
   - A row with no text at all is ignored.
   - A row whose key is unusable is skipped and its row number collected. Unusable means empty, `---`, without any
     letter or digit (`\p{L}` or `\p{N}`), or containing whitespace.
   - Otherwise the key is folded (`look-alike-letter` at column 1). A repeat of a folded key →
     `duplicate-key { key, firstRow, row }`. The repeat is still read and checked, so its own anomalies are reported,
     but it is not added.
   - Texts go through `noneToNull`. Description and display values are checked by `findMixedScriptWords`, giving
     `mixed-script-word` at their column.
   - `Since` / `Valid Until` go through `parseVersionCell`:
     - `lenient` → `non-canonical-version { value, version }`;
     - `date` → `date-instead-of-version { value }`;
     - `invalid` → `invalid-version { value }`.

     Each is reported at its cell. When both are versions and `compareVersions( validUntil, since ) < 0` →
     `valid-until-before-since`.
7. **Skipped rows** → one `skipped-rows` per sheet, at the first skipped row.
   - Details are `count`, and `rows` as the first 10 numbers joined by `, ` (plus `, …` when there are more).

**The index sheet:**
- **The header** is the first row within the first 10 with cells `ID` and `Статус`.
  - None → `missing-header-row`.
  - No `ID` column → `missing-column`.
- **Columns** come from `columnMap`: `Номенклатура` (name), `ID`, `Статус`, `Динамична`, `Видимост` and `Забележка`.
  Only `ID` is required.
- **Rows** with an empty ID are ignored. The ID is folded; a repeat → `duplicate-list { id, firstRow, row }`, and the repeat is not added.
- **Status names** are exact copy:

  | Text | Status |
  |---|---|
  | `В УПОТРЕБА` | `in-use` |
  | `ПРЕМАХНАТА` | `removed` |
  | `ЗА РЕВИЗИЯ` | `under-revision` |
  | `РЕЗЕРВИРАНА` | `reserved` |
  | `В РАЗРАБОТКА` | `in-development` |
  | `ЗА ДОПЪЛВАНЕ` | `incomplete` |

  Any other non-empty status → `unknown-list-status`, and `null`.
- **Dynamic** is `true` / `false` in any case; empty → `null`; anything else → `invalid-flag`, and `null`.

- [ ] **Step 1: Write the failing tests**

`code-list-sheet.test.js`:

```js
const HEADER = [ "Key", "Description BG", "Description EN", "Display value BG", "Display value EN", "NHIF Code", "Since", "Valid Until" ];
const list = ( rows, header = HEADER ) => sheet( "CL006", [
    row( 1, [ "CL006 - Код на специалност" ] ), row( 2, [ "Източник: НЗОК" ] ),
    row( 3, [ "Entity", "", "", "", "", "Meta Data", "System Data" ] ), row( 4, header ), ...rows ] );
const types = ( anomalies ) => anomalies.map( ( anomaly ) => anomaly.type );

it( "reads a list: name, notes, its own columns and its entries", () => {
    const { codeList, anomalies } = readCodeListSheet( list( [ row( 5, [ "1002", "Ангиология", "Angiology", "Ангиология", "Angiology", "73", "v1.0.0" ] ) ] ) );
    assert.deepEqual( anomalies, [] );
    assert.deepEqual( [ codeList.id, codeList.name, codeList.notes, codeList.columns ],
        [ "CL006", { bg: "Код на специалност", en: null }, [ "Източник: НЗОК" ], [ { title: "NHIF Code", column: 6 } ] ] );
    assert.deepEqual( codeList.entries, [ { key: "1002", description: { bg: "Ангиология", en: "Angiology" }, display: { bg: "Ангиология", en: "Angiology" },
        values: [ "73" ], since: "1.0.0", validUntil: null, source: { sheet: "CL006", row: 5 } } ] );
} );

it( "maps every measured header layout (Review Focus 4)", () => {
    const read = ( header, values ) => readCodeListSheet( list( [ row( 5, values ) ], header ) ).codeList;
    const old = read( [ "Key", "Description", "Language EN", "Since", "Valid Until" ], [ "1", "Постоянен адрес", "Permanent address", "v1.1.1" ] );
    assert.deepEqual( [ old.entries[ 0 ].description, old.entries[ 0 ].display, old.columns ],
        [ { bg: "Постоянен адрес", en: "Permanent address" }, { bg: null, en: null }, [] ] );
    const capitalised = read( [ "Key", "Description", "Display Value BG", "Display Value EN" ], [ "1", "а", "б", "b" ] );
    assert.deepEqual( capitalised.entries[ 0 ].display, { bg: "б", en: "b" } );
    const errors = read( [ "Key", "Display Value (English)", "Display Value (Bulgarian)" ], [ "E001", "General error", "Обща грешка" ] );
    assert.deepEqual( [ errors.entries[ 0 ].display, errors.entries[ 0 ].since ], [ { bg: "Обща грешка", en: "General error" }, null ] );
    const cl007 = read( [ "Key", "Description BG", "Description EN", "Display value BG", "Display value EN", "NHIF Document", "Description", "Since" ],
        [ "1", "Бяла", "White", "Бяла", "White", "---", "обикновена" ] );
    assert.deepEqual( [ cl007.columns, cl007.entries[ 0 ].values ],
        [ [ { title: "NHIF Document", column: 6 }, { title: "Description", column: 7 } ], [ null, "обикновена" ] ] );
} );

it( "skips rows without a usable key, once per sheet (Review Focus 2)", () => {
    const { codeList, anomalies } = readCodeListSheet( list( [
        row( 5, [ "1004", "Вътрешни болести" ] ), row( 6, [ "", "", "", "", "", "00" ] ), row( 7, [ "..." ] ),
        row( 8, [ "---", "x" ] ), row( 9, [ "---", "y" ] ), row( 10, [ "* За лекари, завършили преди 2007 година" ] ) ] ) );
    assert.deepEqual( codeList.entries.map( ( entry ) => entry.key ), [ "1004" ] );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.row, anomaly.details.count, anomaly.details.rows ] ),
        [ [ "skipped-rows", 6, 5, "6, 7, 8, 9, 10" ] ] );
} );

it( "folds a look-alike key and blocks a key repeated once folded", () => {
    const { codeList, anomalies } = readCodeListSheet( list( [ row( 5, [ "E003" ] ), row( 6, [ "Е003" ] ), row( 7, [ "10-0А0" ] ) ] ) );
    assert.deepEqual( codeList.entries.map( ( entry ) => entry.key ), [ "E003", "10-0A0" ] );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level, anomaly.row, anomaly.column ] ), [
        [ "look-alike-letter", "warning", 6, 1 ], [ "duplicate-key", "blocking", 6, null ], [ "look-alike-letter", "warning", 7, 1 ] ] );
    assert.deepEqual( anomalies[ 1 ].details, { key: "E003", firstRow: 5, row: 6 } );
} );

it( "reads versions and reports the forms it does not expect, at their cells", () => {
    const at = ( since, validUntil ) => readCodeListSheet( list( [ row( 5, [ "1", "", "", "", "", "", since, validUntil ] ) ] ) );
    const late = at( "v.1.5.21", "v1.5.19" );
    assert.deepEqual( [ late.codeList.entries[ 0 ].since, late.codeList.entries[ 0 ].validUntil ], [ "1.5.21", "1.5.19" ] );
    assert.deepEqual( late.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.column ] ), [ [ "non-canonical-version", 7 ], [ "valid-until-before-since", null ] ] );
    assert.deepEqual( types( at( "10.10.2023" ).anomalies ), [ "date-instead-of-version" ] );
    assert.equal( at( "10.10.2023" ).codeList.entries[ 0 ].since, null );
    assert.deepEqual( types( at( "f1267" ).anomalies ), [ "invalid-version" ] );
} );

it( "warns about a word that mixes scripts in a description, and blocks a sheet without a Key header", () => {
    const mixed = readCodeListSheet( list( [ row( 5, [ "1", "E-рецепта" ] ) ] ) );
    assert.deepEqual( mixed.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.column, anomaly.details.word ] ), [ [ "mixed-script-word", 2, "E-рецепта" ] ] );
    assert.deepEqual( types( readCodeListSheet( sheet( "CLS01", [ row( 1, [ "CLS01 - Референтни стойности" ] ), row( 4, [ "CL024 Mapping" ] ) ] ) ).anomalies ),
        [ "missing-header-row" ] );
} );
```

`nomenclature-index.test.js`:

```js
const index = ( ...rows ) => sheet( "Номенклатури", [ row( 1, [ "Номенклатури използвани от НЗИС" ] ),
    row( 5, [ "Номенклатура", "ID", "Статус", "Динамична", "Видимост", "Забележка" ] ), ...rows ] );

it( "reads each list's name, status, flag, visibility and remark", () => {
    const { lists, anomalies } = readNomenclatureIndex( index(
        row( 6, [ "Пол", "CL001", "В УПОТРЕБА", "false" ] ), row( 7, [ "Лекарствен продукт", "CL009", "В УПОТРЕБА", "true" ] ),
        row( 8, [ "", "CL068", "ПРЕМАХНАТА" ] ), row( 9, [ "Употреба на тютюн", "CL104", "РЕЗЕРВИРАНА", "false", "", "Ще се включи в профилактика итерация 2" ] ) ) );
    assert.deepEqual( anomalies, [] );
    assert.deepEqual( lists.map( ( list ) => [ list.id, list.name, list.status, list.dynamic, list.visibility, list.remark, list.source.row ] ), [
        [ "CL001", "Пол", "in-use", false, null, null, 6 ], [ "CL009", "Лекарствен продукт", "in-use", true, null, null, 7 ],
        [ "CL068", null, "removed", null, null, null, 8 ], [ "CL104", "Употреба на тютюн", "reserved", false, null, "Ще се включи в профилактика итерация 2", 9 ] ] );
} );

it( "maps all six statuses", () => {
    const texts = [ "В УПОТРЕБА", "ПРЕМАХНАТА", "ЗА РЕВИЗИЯ", "РЕЗЕРВИРАНА", "В РАЗРАБОТКА", "ЗА ДОПЪЛВАНЕ" ];
    const { lists } = readNomenclatureIndex( index( ...texts.map( ( text, offset ) => row( 6 + offset, [ "x", `CL00${ offset }`, text ] ) ) ) );
    assert.deepEqual( lists.map( ( list ) => list.status ), [ "in-use", "removed", "under-revision", "reserved", "in-development", "incomplete" ] );
} );

it( "warns about an unknown status or flag and keeps the list; blocks a list listed twice", () => {
    const { lists, anomalies } = readNomenclatureIndex( index( row( 6, [ "Пол", "CL001", "АКТИВНА", "да" ] ), row( 7, [ "Пол", "CL001", "В УПОТРЕБА" ] ) ) );
    assert.deepEqual( anomalies.map( ( anomaly ) => anomaly.type ), [ "unknown-list-status", "invalid-flag", "duplicate-list" ] );
    assert.deepEqual( [ lists.length, lists[ 0 ].status, lists[ 0 ].dynamic ], [ 1, null, null ] );
} );

it( "blocks an index without its header row", () => {
    assert.deepEqual( readNomenclatureIndex( sheet( "Номенклатури", [ row( 1, [ "Пол", "CL001" ] ) ] ) ).anomalies.map( ( anomaly ) => anomaly.type ),
        [ "missing-header-row" ] );
} );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/importer`
Expected: FAIL — `#code-list-sheet` cannot be resolved.

- [ ] **Step 3: Implement both readers as specified above**

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/importer
git commit -m "feat(importer): read a code-list sheet and the nomenclatures index (HEL-14)"
```

---

### Task 5: The nomenclatures importer

**Files:**
- Create: `packages/importer/importer/workbook-checks.js`, `packages/importer/importer/nomenclatures-importer.js`
- Modify: `packages/importer/importer/module-importer.js`, which uses `#workbook-checks` and adds `kind: "module"`
- Modify: `packages/importer/package.json`:
  - imports `#workbook-checks` and `#nomenclatures-importer`;
  - export `./nomenclatures`.
- Modify: `packages/importer/test/support/fixtures.js`, adding `nomenclatureSheets( ids? )`
- Test: `packages/importer/test/nomenclatures-importer.test.js`, `packages/importer/test/module-importer.test.js`
  (one assertion)

**Interfaces:**
- **Consumes:** `readCodeListSheet`, `readNomenclatureIndex` (Task 4) and `readChangeNotes` (Task 2).
- **Produces, in `#workbook-checks`:**
  - `ambiguousSheets( names: string[] ): Anomaly[]`;
  - `workbookVersion( notes: { latest: ChangeVersion|null }, notesSheetName: string|null, fileName?: string ): { version: string|null, anomalies: Anomaly[] }`.

  Both are moved out of `module-importer.js` with their comments; the module importer's behaviour is unchanged.
- **Produces:** `importNomenclaturesWorkbook( sheets: Iterable<RawSheet>|AsyncIterable<RawSheet>, options?: { fileName?: string } ): Promise<{ version: NomenclaturesVersion, anomalies: Anomaly[] }>`.
  The result is deep-frozen.
- **Produces, for Task 7:** `nomenclatureSheets( ids = [ "CL001" ] ): RawSheet[]`. It builds a sound workbook,
  which imports with no anomaly:
  - **The index sheet**, listing each ID as `В УПОТРЕБА`, plus CL068 as `ПРЕМАХНАТА`. The name is `Пол` for CL001 and
    `Номенклатура <id>` otherwise.
  - **One sheet per ID:**
    - title `<id> - <name>`;
    - Task 4's `HEADER` on row 4, and entries `1` and `2` from row 5, with `Since` `v1.5.33`.
  - **`Change Notes`:**
    - the dated header row;
    - `Версия 1.5.33 | 07.10.2026`;
    - one note.

**Assembly:**
1. **Routing** by trimmed name, in arrival order:
   - `Номенклатури` → index;
   - `Change Notes` → change notes;
   - a name matching `^CL[A-Z0-9]+$` → `readCodeListSheet`, its result kept by ID;
   - anything else → ignored.

   Keep no reference to a raw sheet once it is read. That is what keeps memory at §5.7's figure.
2. **After the last sheet**, the index decides, list by list:
   - **Listed, with a sheet:** the code list, with `status`, `dynamic`, `visibility` and `remark` from the index, and
     `name.bg` falling back to the index's name.
   - **Listed, no sheet, `removed`:** a code list with no columns or entries, its source the index row.
   - **Listed, no sheet, any other status:** `list-without-sheet { id, status }`. The status reads as its key, or
     `unknown`.
   - **A sheet the index does not list:** `sheet-not-listed { sheet }`. Its own anomalies are dropped.
3. **Order of the output:** `codeLists` by ID; anomalies in the order of the stages above.
4. **Missing sheets:**
   - no `Номенклатури` → `missing-sheet`, and no code list is kept. No `sheet-not-listed` is reported either: the
     missing index says it all;
   - no `Change Notes` → `missing-sheet` plus `workbookVersion`'s `missing-version`.

   `ambiguousSheets` runs over every name seen.

- [ ] **Step 1: Write the failing tests**

```js
const ids = ( result ) => result.version.codeLists.map( ( list ) => list.id );

it( "imports a sound workbook with no anomaly", async () => {
    const result = await importNomenclaturesWorkbook( nomenclatureSheets() );
    assert.deepEqual( result.anomalies, [] );
    assert.deepEqual( [ result.version.kind, result.version.spec, result.version.version, ids( result ) ],
        [ "nomenclatures", "nomenclatures", "1.5.33", [ "CL001", "CL068" ] ] );
    const [ sex, removed ] = result.version.codeLists;
    assert.deepEqual( [ sex.status, sex.entries.length, removed.status, removed.entries ], [ "in-use", 2, "removed", [] ] );
    assert.equal( result.version.changeNotes[ 0 ].stagingDate, "2026-10-07" );
    assert.ok( Object.isFrozen( sex.entries[ 0 ] ) );
} );

it( "imports the same lists whatever order the sheets arrive in (Review Focus 1)", async () => {
    const inOrder = await importNomenclaturesWorkbook( nomenclatureSheets( [ "CL001", "CL002" ] ) );
    const reversed = await importNomenclaturesWorkbook( [ ...nomenclatureSheets( [ "CL001", "CL002" ] ) ].reverse() );
    assert.deepEqual( reversed, inOrder );
} );

it( "reads sheets from an async iterable, as the streaming reader yields them", async () => {
    async function* yieldAll() { yield* nomenclatureSheets(); }
    assert.deepEqual( await importNomenclaturesWorkbook( yieldAll() ), await importNomenclaturesWorkbook( nomenclatureSheets() ) );
} );

it( "does not import a sheet the index does not list, and reports only that", async () => {
    const result = await importNomenclaturesWorkbook( [ ...nomenclatureSheets(), sheet( "CLS01", [ row( 1, [ "CLS01 - Референтни стойности" ] ) ] ) ] );
    assert.deepEqual( result.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.sheet ] ), [ [ "sheet-not-listed", "CLS01" ] ] );
    assert.deepEqual( ids( result ), [ "CL001", "CL068" ] );
} );

it( "blocks a list listed as in use without a sheet, and a workbook without its index or change notes", async () => {
    const withoutSheet = await importNomenclaturesWorkbook( nomenclatureSheets().filter( ( raw ) => raw.name !== "CL001" ) );
    assert.deepEqual( withoutSheet.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.id, anomaly.details.status ] ),
        [ [ "list-without-sheet", "CL001", "in-use" ] ] );
    const bare = await importNomenclaturesWorkbook( nomenclatureSheets().filter( ( raw ) => raw.name.startsWith( "CL" ) ) );
    assert.deepEqual( bare.anomalies.map( ( anomaly ) => anomaly.type ), [ "missing-sheet", "missing-sheet", "missing-version" ] );
} );

it( "takes the index's name when the title row has none, and checks the file name's version", async () => {
    const sheets = nomenclatureSheets().map( ( raw ) => ( raw.name === "CL001"
        ? sheet( "CL001", raw.rows.map( ( entry ) => ( entry.number === 1 ? row( 1, [ "CL001 - " ] ) : entry ) ) ) : raw ) );
    const result = await importNomenclaturesWorkbook( sheets, { fileName: "НЗИС Номенклатури - Спецификация v1.5.32.xlsx" } );
    assert.equal( result.version.codeLists[ 0 ].name.bg, "Пол" );
    assert.deepEqual( result.anomalies.map( ( anomaly ) => anomaly.type ), [ "version-mismatch" ] );
} );
```

In `module-importer.test.js`, add `assert.equal( result.version.kind, "module" );` to the sound-workbook test.

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/importer`
Expected: FAIL — `#nomenclatures-importer` cannot be resolved.

- [ ] **Step 3: Move the checks into `workbook-checks.js`, add `kind`, and implement the importer**

Run the suite after the move and before writing the importer: every plan 1 test must still pass.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/importer
git commit -m "feat(importer): import the nomenclatures workbook from streamed sheets (HEL-14)"
```

---

### Task 6: The rules workbook

**Files:**
- Create: `packages/importer/interpret/rules-sheet.js`, `packages/importer/importer/rules-importer.js`
- Modify: `packages/importer/package.json`:
  - imports `#rules-sheet` and `#rules-importer`;
  - export `./rules`.
- Modify: `packages/importer/test/support/fixtures.js`, adding `rulesSheets( ids? )`
- Test: `packages/importer/test/rules-sheet.test.js`, `packages/importer/test/rules-importer.test.js`

**Interfaces:**
- **Consumes:**
  - `TAB_STATUS` and `matchLegend` (plan 1);
  - `parseVersionCell` (Task 2);
  - `ambiguousSheets` and `workbookVersion` (Task 5).
- **Produces:** `readRulesSheet( sheet: RawSheet ): { rules: Rule[], anomalies: Anomaly[] }`.
- **Produces:** `importRulesWorkbook( workbook: RawWorkbook, options?: { fileName?: string } ): { version: RulesVersion, anomalies: Anomaly[] }`.
  It is synchronous, takes plan 1's full reader's output, and returns a deep-frozen result.
- **Produces, for Task 7:** `rulesSheets( ids = [ "RL001" ] ): RawSheet[]`. It builds a sound workbook: one green rule
  per ID with error code `E002`, and change notes for `Версия 1.1.1`.

**The rules sheet:**
- **The header** is the first row within the first 10 with a cell `Rule ID`. Columns come from `columnMap`.
  - `Rule ID` and `Definition` are required (`missing-column`).
  - `Source`, `Error Code` and `Since` are optional.
- **Rows above the header** are ignored: 1.1.1 has a note on row 1.
- **Rows below the header:**
  - Unusable IDs follow Task 4's rule and give one `skipped-rows`.
  - Otherwise the ID is folded. It must match `^RL\d+$`, or → `malformed-rule-id { value }`, and the row is skipped.
  - A repeat → `duplicate-rule { id, firstRow, row }`.
- **Status:**
  - The status is `matchLegend( ID cell's fill, TAB_STATUS )`, giving `lifecycle` and `changedInVersion`.
  - No match → `unknown-rule-colour { id, colour }`, where `colour` is the fill or `none`; both values are `null`.
- **Definition:**
  - `definition` is `{ bg: text || null, en: null }`, with lines kept.
  - An empty definition on a rule that is not withdrawn → `rule-without-definition`.
  - `findMixedScriptWords` runs on the definition.
- **Other columns:**
  - `sourceText` goes through `noneToNull`.
  - `errorCode` is folded (`look-alike-letter` at its cell), then `noneToNull`.
  - `since` goes through `parseVersionCell`, with Task 4's three anomalies.
- **The importer** finds `Rules` and `Change Notes` by trimmed name. A missing one → `missing-sheet`. Then it runs
  `ambiguousSheets` and `workbookVersion`.

- [ ] **Step 1: Write the failing tests**

`rules-sheet.test.js`:

```js
const rules = ( ...rows ) => sheet( "Rules", [ row( 1, [ "ЗАБЕЛЕЖКА: Ако валидацията на което и да е правило е неуспешна…" ] ),
    row( 3, [ "Rule ID", "Definition", "Source", "Error Code", "Since" ] ), ...rows ] );
const green = { fill: "70AD47" };

it( "reads rules below a header that is not on row 1, lines and all", () => {
    const { rules: read, anomalies } = readRulesSheet( rules( row( 4, [ "RL001", "Идентификаторът ще бъде проверен:\n1. за тип 1 (ЕГН)", "---", "E002", "v1.0.0" ], green ) ) );
    assert.deepEqual( anomalies, [] );
    assert.deepEqual( read, [ { id: "RL001", definition: { bg: "Идентификаторът ще бъде проверен:\n1. за тип 1 (ЕГН)", en: null }, sourceText: null,
        errorCode: "E002", since: "1.0.0", lifecycle: "active", changedInVersion: false, source: { sheet: "Rules", row: 4 } } ] );
} );

it( "reads each rule's status from its ID cell's fill", () => {
    const { rules: read, anomalies } = readRulesSheet( rules(
        row( 4, [ "RL092", "В случай, че прегледа…", "---", "E002", "v1.1.0" ], { fill: "FFC000" } ),
        row( 5, [ "RL019", "", "---", "E002", "v1.0.1" ], { fill: "C00000" } ),
        row( 6, [ "RL098", "Ново правило", "---", "E002", "v1.1.1" ] ) ) );
    assert.deepEqual( read.map( ( rule ) => [ rule.id, rule.lifecycle, rule.changedInVersion ] ),
        [ [ "RL092", "active", true ], [ "RL019", "withdrawn", true ], [ "RL098", null, null ] ] );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.id, anomaly.details.colour ] ), [ [ "unknown-rule-colour", "RL098", "none" ] ] );
} );

it( "warns about an active rule without a definition, and folds a Cyrillic Е in an error code", () => {
    const { rules: read, anomalies } = readRulesSheet( rules( row( 4, [ "RL096", "", "", "", "" ], green ), row( 5, [ "RL033", "Текст", "---", "Е002", "v1.0.2" ], green ) ) );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.row, anomaly.column ] ), [ [ "rule-without-definition", 4, null ], [ "look-alike-letter", 5, 4 ] ] );
    assert.deepEqual( [ read[ 0 ].since, read[ 0 ].errorCode, read[ 1 ].errorCode ], [ null, null, "E002" ] );
} );

it( "blocks a malformed and a repeated rule ID, and a sheet without its required columns", () => {
    const { rules: read, anomalies } = readRulesSheet( rules( row( 4, [ "R001", "x" ], green ), row( 5, [ "RL001", "x" ], green ), row( 6, [ "RL001", "y" ], green ) ) );
    assert.deepEqual( anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.level ] ), [ [ "malformed-rule-id", "blocking" ], [ "duplicate-rule", "blocking" ] ] );
    assert.deepEqual( read.map( ( rule ) => rule.definition.bg ), [ "x" ] );
    assert.deepEqual( readRulesSheet( sheet( "Rules", [ row( 1, [ "Rule ID", "Text" ] ) ] ) ).anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.column ] ),
        [ [ "missing-column", "Definition" ] ] );
} );
```

`rules-importer.test.js`:

```js
it( "imports a rules workbook, its version from the change notes", () => {
    const result = importRulesWorkbook( { sheets: rulesSheets( [ "RL001", "RL002" ] ), themeColours: {} }, { fileName: "НЗИС - API Бизнес Правила - Спецификация v1.1.1.xlsx" } );
    assert.deepEqual( result.anomalies, [] );
    assert.deepEqual( [ result.version.kind, result.version.spec, result.version.version, result.version.rules.map( ( rule ) => rule.id ) ],
        [ "rules", "rules", "1.1.1", [ "RL001", "RL002" ] ] );
    assert.ok( Object.isFrozen( result.version.rules[ 0 ] ) );
} );

it( "blocks a workbook without a Rules sheet", () => {
    const result = importRulesWorkbook( { sheets: rulesSheets().filter( ( raw ) => raw.name !== "Rules" ), themeColours: {} } );
    assert.deepEqual( result.anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.sheet ] ), [ [ "missing-sheet", "Rules" ] ] );
} );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/importer`
Expected: FAIL — `#rules-sheet` cannot be resolved.

- [ ] **Step 3: Implement the sheet reader and the importer as specified above**

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/importer
git commit -m "feat(importer): import the business-rules workbook (HEL-14)"
```

---

### Task 7: The set import, its report and its command

**Files:**
- Create: `packages/importer/importer/set-importer.js`, `packages/importer/bin/import-set.js`
- Modify: `packages/importer/report/format.js`
- Modify: `packages/importer/package.json`:
  - bin `hdp-import-set`;
  - imports `#set-importer`;
  - export `./set`.
- Modify: `README.md`, adding one usage line beside `hdp-import-module`
- Test: `packages/importer/test/format.test.js`, `packages/importer/test/set-importer.test.js`,
  `packages/importer/test/cli-set.test.js`

**Interfaces:**
- **Consumes:**
  - `streamSheets` (Task 3);
  - `readWorkbook` and `importModuleWorkbook` (plan 1);
  - `importNomenclaturesWorkbook` (Task 5);
  - `importRulesWorkbook` (Task 6);
  - `linkModule` and `linkRules` (Task 1).
- **Produces:** `importSet( inputs: { nomenclatures?: Input, rules?: Input, modules?: Array<Input & { spec: string }> } ): Promise<SetResult>`.
  - `Input = { source: string|Buffer, fileName?: string }`. `fileName` defaults to the basename of a path source.
  - `SetResult = { nomenclatures: ImportResult|null, rules: ImportResult|null, modules: ImportResult[] }`.
  - `ImportResult = { version, anomalies }`.
  - Link anomalies are appended to the anomalies of the result they concern: `linkModule` to each module's,
    `linkRules` to the rules'.
  - A workbook that cannot be read rejects with `new Error( \`Cannot read ${ fileName }: ${ cause.message }\`, { cause } )`.
- **Produces:** `formatReport( result )`, changed in two ways.
  - Its summary line depends on `result.version.kind`. The module line is unchanged:
    - `e-prescription 1.5.1: 23 messages, 0 blocking, 78 warnings`;
    - `nomenclatures 1.5.33: 182 code lists, 59343 entries, 17 blocking, … warnings`;
    - `rules 1.1.1: 97 rules, 0 blocking, … warnings`.
  - When there is any anomaly, line 2 is a tally: `By type: duplicate-key 17, look-alike-letter 35, …`. Blocking
    types come first, then by count descending, then by name.
- **Produces:** `formatSetReport( set: SetResult ): string`.
  - Each present result's `formatReport`, separated by a blank line: nomenclatures, then rules, then modules in the
    order given.
  - When there are modules and no nomenclatures: `Code lists were not linked: no nomenclatures workbook was given.`
  - When there are modules and no rules: `Rules were not linked: no rules workbook was given.`
  - Last line: `Set accepted.`, or `Set refused: {n} of {m} workbooks have blocking anomalies.`
- **CLI:** `hdp-import-set [--nomenclatures <file>] [--rules <file>] [--module <spec>=<file>]... [--json <file>]`.
  - It prints `formatSetReport`.
  - `--json` writes the `SetResult`.
  - Exit codes:
    - 0 when accepted;
    - 1 when refused, or when a file cannot be read (its message, no stack trace);
    - 2 for usage: no workbook at all, a `--module` without `<spec>=<file>`, or an unknown option.

- [ ] **Step 1: Write the failing tests**

`format.test.js`, with plan 1's tests updated for the tally line at index 1:

```js
it( "summarises a nomenclatures and a rules import by what they hold", () => {
    const lists = { kind: "nomenclatures", spec: "nomenclatures", version: "1.5.33", codeLists: [ { entries: [ {}, {} ] }, { entries: [] } ] };
    assert.equal( formatReport( { version: lists, anomalies: [] } ).split( "\n" )[ 0 ], "nomenclatures 1.5.33: 2 code lists, 2 entries, 0 blocking, 0 warnings" );
    const rules = { kind: "rules", spec: "rules", version: "1.1.1", rules: [ {} ] };
    assert.equal( formatReport( { version: rules, anomalies: [] } ).split( "\n" )[ 0 ], "rules 1.1.1: 1 rules, 0 blocking, 0 warnings" );
} );

it( "tallies anomalies by type, blocking types first", () => {
    const anomalies = [ createAnomaly( "mixed-script-word", {}, { word: "x" } ), createAnomaly( "look-alike-letter", {}, {} ),
        createAnomaly( "look-alike-letter", {}, {} ), createAnomaly( "duplicate-key", {}, {} ) ];
    const lines = formatReport( { version: { kind: "rules", spec: "rules", version: "1.1.1", rules: [] }, anomalies } ).split( "\n" );
    assert.equal( lines[ 1 ], "By type: duplicate-key 1, look-alike-letter 2, mixed-script-word 1" );
} );
```

`set-importer.test.js`, using `writeWorkbook`, `moduleSheets()` (plan 1), `nomenclatureSheets()` and `rulesSheets()`.
`moduleSheets()` names code lists CL018, CL009 and CL035, and rules RL083, RL026, RL059, RL023 and RL027:

```js
const MODULE_LISTS = [ "CL009", "CL018", "CL035" ];
const MODULE_RULES = [ "RL023", "RL026", "RL027", "RL059", "RL083" ];
const set = async ( { lists = MODULE_LISTS, rules = MODULE_RULES, withNomenclatures = true, withRules = true } = {} ) => importSet( {
    nomenclatures: withNomenclatures ? { source: await writeWorkbook( nomenclatureSheets( lists ) ) } : undefined,
    rules: withRules ? { source: await writeWorkbook( rulesSheets( rules ) ) } : undefined,
    modules: [ { spec: "e-prescription", source: await writeWorkbook( moduleSheets() ) } ] } );

it( "imports a sound set with no anomaly", async () => {
    const result = await set();
    assert.deepEqual( [ result.nomenclatures.anomalies, result.rules.anomalies, result.modules[ 0 ].anomalies ], [ [], [], [] ] );
    assert.match( formatSetReport( result ), /Set accepted\.$/ );
} );

it( "links a module against the set, and refuses the set when a reference is missing", async () => {
    const result = await set( { lists: [ "CL009", "CL018" ], rules: MODULE_RULES.slice( 1 ) } );
    assert.deepEqual( result.modules[ 0 ].anomalies.map( ( anomaly ) => [ anomaly.type, anomaly.details.id ] ).sort(),
        [ [ "unknown-code-list", "CL035" ], [ "unknown-rule", "RL023" ] ] );
    assert.match( formatSetReport( result ), /Set refused: 1 of 3 workbooks have blocking anomalies\.$/ );
} );

it( "links nothing a set does not include, and says so", async () => {
    const result = await set( { withNomenclatures: false, withRules: false } );
    assert.deepEqual( result.modules[ 0 ].anomalies, [] );
    const report = formatSetReport( result );
    assert.match( report, /Code lists were not linked: no nomenclatures workbook was given\./ );
    assert.match( report, /Rules were not linked: no rules workbook was given\./ );
} );

it( "names the file it cannot read (Review Focus 5)", async () => {
    await assert.rejects( importSet( { nomenclatures: { source: Buffer.from( "not a workbook" ), fileName: "broken.xlsx" } } ), /^Error: Cannot read broken\.xlsx: / );
} );
```

`cli-set.test.js` runs `bin/import-set.js` with `spawnSync( process.execPath, … )`, as plan 1's `cli.test.js` does:

```js
it( "imports a set, prints each report, writes the JSON and exits 0", … );
// stdout matches /^nomenclatures 1\.5\.33: /m, /^rules 1\.1\.1: /m, /^e-prescription /m and /Set accepted\./;
// the JSON file parses, and its modules[ 0 ].version.spec is "e-prescription".

it( "refuses the wrong workbook for an option with a readable report (Review Focus 5)", … );
// --nomenclatures given the rules workbook: status 1;
// stdout contains "missing-sheet" and "Номенклатури";
// stderr does not match /\n\s+at /.

it( "exits 1 naming a file that is not a workbook", … );
// stderr matches /^Cannot read broken\.xlsx: /.

it( "exits 2 with the usage for no workbook, a --module without spec=file, or an unknown option", … );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/importer`
Expected: FAIL — `#set-importer` cannot be resolved, and the tally line is missing.

- [ ] **Step 3: Implement `formatReport`'s changes, `formatSetReport`, `importSet` and the CLI**

`importSet` reads:
- the nomenclatures through `streamSheets`;
- the rules and the modules through `readWorkbook`.

Import the nomenclatures and rules first, then each module, then link. The CLI follows `bin/import-module.js`: the same
`main`, error handling and usage output.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/importer README.md
git commit -m "feat(importer): import, link and report a set of workbooks: hdp-import-set (HEL-14)"
```

---

### Task 8: Public fixtures and the regression tests

**Files:**
- Modify: `scripts/fetch-public-fixtures.js`, adding two fixtures
- Modify: `README.md`, where the fixtures line names all three workbooks
- Test: `packages/importer/test/public-nomenclatures.test.js`, `packages/importer/test/public-rules.test.js`,
  `packages/importer/test/public-set.test.js`

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** `npm run fixtures:fetch` also fetches the two files below, each verified by SHA-256.

| File | URL | SHA-256 |
|---|---|---|
| `nomenclatures-1.5.33.xlsx` | `https://his.bg/upload/657/%D0%9D%D0%97%D0%98%D0%A1+%D0%9D%D0%BE%D0%BC%D0%B5%D0%BD%D0%BA%D0%BB%D0%B0%D1%82%D1%83%D1%80%D0%B8+-+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.5.33.xlsx` | `4dd02562329c003f3c038f492bea7d840218fa904dd7274ca8f1d68086cc603e` |
| `rules-1.1.1.xlsx` | `https://his.bg/upload/446/%D0%9D%D0%97%D0%98%D0%A1+-+API+%D0%91%D0%B8%D0%B7%D0%BD%D0%B5%D1%81+%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0+-+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.1.1.xlsx` | `686283df949d30fe19f31d063c460c49eb1d42e5ceed19c5701e0700cda4a75d` |

The rules workbook is the production version, 1.1.1. Version 1.1.2 is in test (§0.1).

**Expected values.** Each test file follows `public-eprescription.test.js`: the skip when absent, the hard failure in
CI, and the file names passed as `fileName`. The figures below were measured on 2026-10-19, with prototypes
independent of this code (§4.6, §4.6.1, §5.7).

**Nomenclatures 1.5.33:**
- **Version:** `1.5.33`, with 87 change-note versions.
  - 1.5.29: staging `2026-08-24`, production `2026-08-31`.
  - 1.5.33: staging `2026-10-07`, production `null`.
- **Lists:** 182 code lists (181 sheets, plus CL068 removed); 59,343 entries (59,360 keyed rows, less the 17 repeats); CL011 holds 39,005.
- **Statuses:**
  - in-use 173;
  - removed 3;
  - under-revision 1;
  - reserved 2;
  - in-development 2;
  - incomplete 1.
- **Blocking:** exactly 17 `duplicate-key` — CL096 once (key `416`, rows 283 and 284) and CL127 16 times.
- **Warnings known in advance:**
  - `skipped-rows` once each on CL006 (3 rows), CL009, CL026, CL038, CL076, CL122 (3,323 rows), CL127 (19), CL131 and
    CL999;
  - `look-alike-letter` 35: CL022 17, CL024 17, CL999 1;
  - `non-canonical-version` 252;
  - `date-instead-of-version` 124;
  - `invalid-version` 2: CL056 rows 45 and 53;
  - `sheet-not-listed` 2: CLS01 and CLS02;
  - `unknown-note-colour` 1: Change Notes row 651;
  - `versions-out-of-order` 1: row 337;
  - `notes-before-version` 0.
- **Two figures were not measured independently:** `valid-until-before-since` and `mixed-script-word`.
  - **`valid-until-before-since`:** the prototype counted 12, but it read dates as versions.
  - **`mixed-script-word`:** the prototype counted 270 cells, not words.

  Pin what the run gives, after checking that CL038 rows 14–16 are among the first and that a sample of ten of the
  second really mix scripts.

**Rules 1.1.1:**
- **Version:** `1.1.1`, with 17 change-note versions and 125 notes.
- **Rules:**
  - 97 rules: 88 active and 9 withdrawn;
  - `changedInVersion` true only on RL092, among active rules;
  - every withdrawn rule has an empty definition.
- **Anomalies:** none blocking; `look-alike-letter` 11; `rule-without-definition` 2 (RL096, RL097). Pin whatever
  else the run gives, after checking it.

**The set** — e-Prescription 1.5.1, nomenclatures 1.5.33 and rules 1.1.1:
- **e-Prescription:** gains no link anomaly. Its 29 lists and 40 rules all resolve and none is removed or withdrawn,
  so its anomalies equal its standalone import's.
- **Rules:** gain no `unknown-error-code` (E002 is in CL999).
- **The set is refused** because of the nomenclatures' 17 blocking anomalies (Decision 1).

- [ ] **Step 1: Add the fixtures and fetch them**

Run: `npm run fixtures:fetch`
Expected: `nomenclatures-1.5.33.xlsx: downloaded, 5158833 bytes` and `rules-1.1.1.xlsx: downloaded, 29693 bytes`.
A second run prints `present` three times.

- [ ] **Step 2: Write the three regression tests with the values above**

```js
// public-nomenclatures.test.js — the shape of each assertion; every figure is listed above.
it( "reads 182 lists and 59,343 entries", () => {
    assert.equal( result.version.codeLists.length, 182 );
    assert.equal( result.version.codeLists.reduce( ( sum, list ) => sum + list.entries.length, 0 ), 59343 );
    assert.equal( list( "CL011" ).entries.length, 39005 );
} );
it( "is refused for exactly the 17 repeated keys of CL096 and CL127 (HEL-15)", () => {
    const blocking = result.anomalies.filter( ( anomaly ) => anomaly.level === "blocking" );
    assert.deepEqual( [ ...new Set( blocking.map( ( anomaly ) => anomaly.type ) ) ], [ "duplicate-key" ] );
    assert.deepEqual( blocking.map( ( anomaly ) => anomaly.sheet ).sort(), [ "CL096", ...Array( 16 ).fill( "CL127" ) ] );
} );
it( "reports the known source defects as warnings", () => { /* the tally above, as a deepEqual of { type: count } */ } );
it( "reads the change notes' dates", () => { /* 1.5.29 and 1.5.33 as above */ } );
```

- [ ] **Step 3: Run them**

Run: `npm test`
Expected: PASS. The nomenclatures test takes about 2–3 s.

- [ ] **Step 4: Run the CLI on the real set, as a person would**

```bash
node packages/importer/bin/import-set.js --nomenclatures .fixtures/public/nomenclatures-1.5.33.xlsx --rules .fixtures/public/rules-1.1.1.xlsx --module e-prescription=.fixtures/public/eprescription-1.5.1.xlsx
```

Expected:
- three reports, with the tally lines as pinned;
- `Set refused: 1 of 3 workbooks have blocking anomalies.`;
- exit code 1.

Quote the summary lines in the pull request.

- [ ] **Step 5: Measure time and peak memory, alone and in the set**

```bash
node -e "const { streamSheets } = require( './packages/importer/read/stream-reader.js' ); ( async () => { const start = Date.now(); let rows = 0; for await ( const raw of streamSheets( process.argv[ 1 ] ) ) { rows += raw.rows.length; } console.log( rows, 'rows', Date.now() - start, 'ms, peak', Math.round( process.resourceUsage().maxRSS / 1024 ), 'MB' ); } )()" .fixtures/public/nomenclatures-1.5.33.xlsx
node -e "const { importSet } = require( './packages/importer/importer/set-importer.js' ); ( async () => { const start = Date.now(); await importSet( { nomenclatures: { source: process.argv[ 1 ] } } ); console.log( Date.now() - start, 'ms, peak', Math.round( process.resourceUsage().maxRSS / 1024 ), 'MB' ); } )()" .fixtures/public/nomenclatures-1.5.33.xlsx
```

Expected: about 2 s each.
- **The reader alone** peaks well below §5.7's 321 MB, because no sheet's rows outlive their yield.
- **The import** peaks near 321 MB, because it keeps the model.

Quote both figures in the pull request. A peak above 400 MB means a raw sheet is being kept; find the reference
before going on.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-public-fixtures.js packages/importer/test README.md
git commit -m "test(importer): regression tests on the published nomenclatures, rules and the linked set (HEL-14)"
```

---

## After the last task

1. **Definition of done:** run `npm ci && npm run fixtures:fetch && npm run lint && npm test`, and quote the counts.
2. **Pull request:** push `feat/plan-2-nomenclatures-rules` and open the pull request against `main`. Then move HEL-14
   to Review and log the time.
3. **The body names:**
   - Decisions 1–7;
   - the measured CLI summary lines;
   - that HEL-15 and HEL-16 hold the source defects.
4. **Deliberately not done:**
   - the prevention workbook (PR001), which is a relation table and waits for its own design (§4.6.1);
   - the CLS relation sheets;
   - the conditions language (plan 3), XSDs (plan 4) and persistence (plan 5);
   - checking each entry's `Since` against the workbook version;
   - plan 1's deferred minors, which stay open on HEL-13.
