# Plan 5 — Data layer and migration: one SQL subset on two databases, the stored model, and today's specs loaded

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A data layer that runs one SQL subset on SQLite and on PostgreSQL, with the same tests on both.
- The stored model:
  - specs, with one spec per code list;
  - versions in stages, whose content is stored item by item;
  - anomalies, changelog entries and resolution records;
  - files by content hash.
- Today's published workbooks loaded into it once, as published, defects included.
- A whole database copied from one driver to the other.

**Architecture:**
- **A new package, `packages/data`.**
  - `db/` holds one asynchronous `Database` interface and its two drivers, `node:sqlite` and `pg`. Their only atomic
    unit is a **batch** of statements, so the D1 gateway of plan 7 can be a third driver without changing a caller.
  - `store/` holds the schema and the stores: versions, changelog, files, resolution and copy. A version's content is
    stored as **items**, one row per message, element, condition, entry or rule. Each item keeps its identity, so
    plan 6 can edit and compare identity by identity (§7.5).
  - `load/` holds the migration. It reads a manifest, imports each stage's workbooks with the importer, and stores the
    results.
- **`spec-model`** stays pure. It gains:
  - the stages and their resolution order;
  - the split of the combined nomenclatures into one version per list;
  - the references a module makes.

**Tech Stack:** Node 24 (`node:sqlite`; the bundled SQLite is 3.53.1, measured with Node 26.3.1), CommonJS, `node --test`.
- **`pg` 8.23.1** is the one new dependency, of `packages/data`. It is MIT-licensed, published 2026-09-30, and its
  `pg-*` helpers come with it. **It needs Boris's approval at review.**
- PostgreSQL 18 runs in Docker for tests, locally and as a CI service container.

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md),
as amended for HEL-28:
- §1.1, the order of work;
- **§3.2** data layer;
- §3.3 files;
- **§4.1** specs, versions and stages;
- **§4.6** each code list a spec;
- §4.7 change records;
- **§4.8** references;
- §5.3 and §5.4;
- §7.1, §7.2 and §7.7;
- **§7.11** migration;
- §10.1 and §11.

Builds on plans 1–4. Tracking: **HEL-29**; design amendment **HEL-28**. Defects carried in as published: HEL-15
(CL096, CL127), HEL-19 (e-Examination) and HEL-20 (condition values).

## Decisions this plan takes

The design record fixes the what. These are the how. They were measured on 2026-11-04 and are recorded in §3.2 where
they constrain later plans. Reject any of them at review, before Task 1.

1. **`packages/data`, depending on `spec-model` and the importer.** The migration reads workbooks, so the data package
   uses the importer; nothing uses the data package yet.
2. **Batches, not transactions.**
   - D1 over HTTP has no interactive transaction, and plan 7's gateway runs statements and batches.
   - So every driver offers `all`, `get`, `run` and `batch`, and a batch is all-or-nothing.
   - No caller reads and then writes inside one transaction. A precondition rides in the batch as a **guard**
     (decision 7).
3. **The SQL subset.**
   - **Placeholders.** `?` everywhere. The PostgreSQL driver rewrites it to `$n`, skipping quoted text.
   - **Column types.** `TEXT` and `INTEGER` only.
     - Booleans are `0`/`1`.
     - Dates and times are ISO text.
     - JSON is text, parsed in JavaScript, and never queried in SQL.
   - **Statements.** Upsert is `INSERT … ON CONFLICT ( … ) DO …`, which both databases read alike. `RETURNING` is
     allowed.
   - **Ordering.** Never by text, since PostgreSQL's collation orders text differently from SQLite. Rows are ordered by
     an integer `position` or `item_no`.
   - **Forbidden:** `LIKE`, whose case rules differ, and the reserved words `row`, `column` and `position`. Use
     `row_number`, `column_number` and `position_no`.
   - **At most 100 bound parameters per statement.** That is D1's limit, the strictest of the three.
     `insertStatements` splits a multi-row insert to fit.
   - PostgreSQL's `int8` — every `COUNT(*)` — is parsed as a number.
4. **Identifiers are made by the application** (`crypto.randomUUID()`), except a spec's, which is its key
   (`e-prescription`, `rules`, `CL009`, `nomenclatures`). A copied database keeps every identity.
5. **Content is stored as items.**
   - Each item is one row: `( version_id, item_no, kind, identity, parent_no, position_no, data, hash )`.
     - `data` is the model object's own fields as JSON, without its children.
     - `identity` is its key within the version.
   - **Identity is indexed, not unique.** e-Examination 1.3.10 repeats identities, and is loaded as published (HEL-19).
   - **Item kinds**, with the identity each has:

     | Version | Kinds, in stored order | Identity |
     |---|---|---|
     | module | `message`, its `element`s depth-first after it; then `condition`, `dictionary`, `condition-binding`, `blueprint-binding` | code; the element's identity (may be `null`); ID; abbreviation; `message element condition`; `message element` |
     | code list | `list`, `column`, `entry` | list ID; title; key |
     | rules | `rule` | ID |

   - `loadVersion` returns exactly what was stored. The only difference is that history (`changeNotes`) lives in the
     changelog, not in the content.
6. **A version's content hash** is the SHA-256 of the JSON of its items, as `[ kind, identity, parent_no,
   position_no, data ]` in item order. Storing the same import twice gives the same hash.
7. **A frozen version refuses writes, atomically.**
   - The table `write_guards ( reason TEXT, CONSTRAINT write_guard CHECK ( reason IS NULL ) )` is always empty.
   - A content write starts its batch with
     `INSERT INTO write_guards ( reason ) SELECT 'frozen' FROM versions WHERE id = ? AND frozen = 1`. If the version is
     frozen, the check fails and the whole batch rolls back.
   - Both drivers report a broken named `CHECK` as `ConstraintError` with `constraint === "write_guard"`. The store
     turns that into `FrozenVersionError`.
   - A `UNIQUE` violation is a `ConstraintError` too, but its `constraint` is not portable: SQLite names the columns,
     PostgreSQL the index. Tests check its class only.
8. **History.**
   - Every version number in a workbook's change notes becomes a version of the spec. It is the loaded version if the
     numbers match, and otherwise a `retired` version holding only its changelog (§4.1; §2, "the full changelog is
     kept").
   - Notes are changelog entries with origin **`imported`**, a fourth origin beside §4.7's three. Their text goes in
     `text_bg`, with `text_en` left `null`: all 241 notes of e-Prescription 1.5.1 are in Cyrillic (measured), and
     §4.9 records a missing translation as missing.
   - A published version's history comes from the most advanced *published* workbook of its spec. A development
     workbook contributes only its own newest version's notes, since its copy of older notes may be mid-edit.
9. **The code-list split** (§4.6).
   - A note names a list when it contains `CL` followed by three digits, as a whole word, and that is the ID of a list
     in the workbook.
   - **Measured on 1.5.33:**
     - 819 notes in 87 versions;
     - 902 list entries over 476 (list, version) pairs, for 177 lists; 3 of the pairs are at 1.5.33;
     - 100 notes name several lists, at most 4;
     - 21 notes in 8 versions name none and stay with the combined spec `nomenclatures`;
     - one note's `CL50` (1.5.6) is no list ID.
   - The combined spec keeps only retired versions. Its 1.5.33 also carries the workbook-level anomalies (decision 11).
10. **The migration imports per stage.**
    - For each stage it runs `importSet` on that stage's workbooks. The nomenclatures and rules are taken from the
      stage itself or, failing that, from the nearest stage further on (§4.8), so linking matches resolution.
    - Only the workbooks *at* a stage are stored there.
    - **Development workbooks** become development versions:
      - with no number (§7.2);
      - with a base, the spec's most advanced version (§7.5);
      - holding the notes of their own newest version.
    - **Testing versions** become one release each, with an empty notice period and planned date (§7.11).
11. **Anomalies go to the version they concern.**
    - A module's or the rules' anomalies go to that version.
    - A nomenclatures anomaly goes to the list whose ID is its sheet. On 1.5.33 that is 997 of 1,001. The other 4 —
      CLS01, CLS02 and two on the change notes — go to the combined spec's version of the workbook's number.
    - Each anomaly is mapped to the item whose `source` has the same sheet and row, or else to none.
12. **Files by content hash.**
    - Plan 5 has a directory store and a memory store; S3/R2 comes with plan 7.
    - The blueprint catalogue is stored as a file. The setting `blueprint-catalogue` holds its hash, which settles
      plan 4's "storing it is plan 5's".
    - No generated file is made or frozen: files are made on first publication (§7.7).
13. **Tests on two databases.**
    - SQLite in memory, always.
    - PostgreSQL when `HDP_TEST_POSTGRES_URL` is set. CI sets it for a `postgres:18` service container, pinned by
      digest, with `POSTGRES_HOST_AUTH_METHOD: trust`, so there is no password at all.
    - Each PostgreSQL suite runs in its own schema, dropped afterwards.
    - In CI a missing URL is a failure, never a skip, as with the fixtures.

## Global Constraints

- **Node 24.** Every `package.json` declares `"engines": { "node": ">=24" }`.
- **House style.**
  - CommonJS; four-space indent; double quotes; semicolons.
  - **Spaces inside parentheses, brackets and braces**: `foo( a, b )`, `[ 1, 2 ]`, `{ key: value }`.
- **JSDoc on everything exported**: prose first, then `@method` / `@param` / `@returns` / `@throws`, then `@public`.
  - Model shapes are `@typedef`s in `packages/spec-model/model/definitions.types.js`.
  - The data layer's own shapes (`Database`, `Statement`, `StoredVersion`, `ItemRow`, `Manifest`, …) go in
    `packages/data/store/definitions.types.js`.
- **Imports.** `#alias` inside a package; the `exports` map across packages.
- **`spec-model` stays pure.** No `require` of `node:` modules, no I/O and no dependencies, not even in its tests.
- **Dependencies, exact versions.** `pg` `8.23.1` (data `dependencies`), and the workspace packages. Nothing else.
- **The SQL subset of decision 3, in every statement.** The full rules are in the decision; in brief:
  - `?` placeholders;
  - `TEXT` and `INTEGER` columns only;
  - no ordering by text, no `LIKE`, no JSON functions;
  - at most 100 parameters per statement.
- **Secrets.**
  - A database URL is given by `--database` or `HDP_DATABASE_URL` and is never written to a file, a log or any
    output; a URL may carry a password.
  - Test databases are local or CI containers without a password.
- **Data.**
  - Never commit unpublished specification data. A development workbook is loaded from the spec team's folder, never
    from the repository.
  - Fixtures are fetched into the git-ignored `.fixtures/`.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Every new `.js` file begins with the EUPL block** of `packages/importer/read/raw.js`, lines 1–16, verbatim.
- **Code with backslashes or regular expressions is written with the Write and Edit tools**, never through a shell
  heredoc.

## Review Focus

These are inputs the spec implies but the happy path never exercises. Each has a test in the task that owns the code.

1. **Keys whose text order differs between the databases** (`b`, `A`, `a`, `10`, `9`, `Б`, `б`).
   - Expected: entries come back in workbook order on both databases.
   - → Task 5, "returns entries in stored order on both databases".
2. **A list as large as CL011** (39,005 entries).
   - Expected: stored in one call within the 100-parameter limit, and loaded back whole.
   - → Task 5, "stores and loads a list of 39,005 entries".
3. **A value holding `?`, `$1` or a quote, and SQL with a literal `'?'`.**
   - Expected: values are bound, never read as placeholders; the literal stays a literal.
   - → Task 2, "binds a value holding ? and $1 without reading it as a placeholder".
4. **A write to a frozen version.**
   - Expected: refused with `FrozenVersionError`, and nothing written — not even the part of the batch before the
     failure.
   - → Task 5, "refuses to change a frozen version and writes nothing".
5. **The same version number migrated again with different content.**
   - Expected: `MigrationConflictError` naming the spec and the number; the stored version is untouched.
   - → Task 9, "refuses a published number whose content changed".

## File map

| File | Responsibility |
|---|---|
| `packages/spec-model/model/kinds.js` | `STAGE`, `CHANGE_ORIGIN`; `SPEC_KIND.CODE_LIST` |
| `packages/spec-model/model/stages.js` | `resolutionOrder` |
| `packages/spec-model/model/code-lists.js` | `splitNomenclatures`, `namedLists` |
| `packages/spec-model/model/references.js` | `referencedSpecs` |
| `packages/spec-model/model/definitions.types.js` | `CodeListVersion`, `NomenclaturesSplit` |
| `packages/data/package.json` | Exports, imports, bins, `pg` |
| `packages/data/store/definitions.types.js` | The data layer's typedefs |
| `packages/data/db/database.js` | `openDatabase`, `ConstraintError`, `insertStatements`, `MAX_PARAMETERS` |
| `packages/data/db/sqlite-driver.js` | `node:sqlite` driver |
| `packages/data/db/postgres-driver.js` | `pg` driver, placeholder rewrite, schema isolation |
| `packages/data/store/schema.js` | `migrateSchema`, `TABLES`, the DDL |
| `packages/data/store/items.js` | `encodeContent`, `decodeContent` |
| `packages/data/store/versions.js` | `ensureSpec`, `storeVersion`, `storeContent`, `freezeVersion`, `findVersion`, `loadVersion`, `loadAnomalies`, `FrozenVersionError` |
| `packages/data/store/changelog.js` | `storeHistory`, `loadChangelog`, `compareNumbers` |
| `packages/data/store/files.js` | `memoryStore`, `directoryStore`, `storeFile`, `readSetting`, `writeSetting`, `storeCatalogue`, `loadCatalogue` |
| `packages/data/store/resolution.js` | `resolveVersion`, `recordResolution` |
| `packages/data/store/copy.js` | `copyDatabase`, `copyFiles` |
| `packages/data/load/manifest.js` | `readManifest` |
| `packages/data/load/migration.js` | `migrate`, `migrateImported`, `MigrationConflictError`, `formatMigrationReport` |
| `packages/data/bin/migrate.js`, `packages/data/bin/copy.js` | `hdp-migrate`, `hdp-copy` |
| `packages/data/test/support/databases.js` | `eachDatabase` |
| `packages/data/test/support/models.js` | Synthetic module, code-list and rules versions |
| `.github/workflows/ci.yml` | The PostgreSQL service and `HDP_TEST_POSTGRES_URL` |
| `README.md` | The data package, PostgreSQL tests, `hdp-migrate`, `hdp-copy` |

---

### Task 1: Stages, code lists as specs, and the references a module makes

**Files:**
- Create:
  - `packages/spec-model/model/stages.js`;
  - `packages/spec-model/model/code-lists.js`;
  - `packages/spec-model/model/references.js`;
  - tests: `stages.test.js`, `code-lists.test.js` and `references.test.js` in `packages/spec-model/test/`.
- Modify:
  - `packages/spec-model/model/kinds.js`;
  - `packages/spec-model/test/kinds.test.js`;
  - `packages/spec-model/model/definitions.types.js`;
  - `packages/spec-model/package.json`: export `./stages`, `./code-lists` and `./references`, with matching imports;
  - `packages/importer/test/public-nomenclatures.test.js`.

**Interfaces:**
- **Produces:**
  - `STAGE`: `{ DEVELOPMENT: "development", IMPLEMENTATION: "implementation", TESTING: "testing", PRODUCTION:
    "production", PREVIOUS_PRODUCTION: "previous-production", RETIRED: "retired" }`.
  - `CHANGE_ORIGIN`: `{ DETECTED: "detected", EDITOR: "editor", EDITED: "edited", IMPORTED: "imported" }`.
  - `SPEC_KIND`: `{ MODULE: "module", RULES: "rules", CODE_LIST: "code-list", NOMENCLATURES: "nomenclatures" }`.
    `NOMENCLATURES` is now the workbook and the combined spec's history only (§4.1).
  - `resolutionOrder( stage: string ): string[]`:
    - development → `[ development, implementation, testing, production ]`;
    - implementation → the last three;
    - testing → the last two;
    - production → `[ production ]`;
    - anything else throws a `RangeError`, since a previous-production or retired version is frozen and never resolved
      again.
  - Typedef `CodeListVersion { kind: "code-list", spec: string, version: string|null, list: CodeList,
    changeNotes: ChangeVersion[] }`.
  - Typedef `NomenclaturesSplit { lists: CodeListVersion[], combined: ChangeVersion[] }`.
  - `namedLists( text: string, ids: Set<string> ): string[]`: the IDs `/\bCL\d{3}\b/g` finds that are in `ids`, in
    order of first appearance, without repeats.
  - `splitNomenclatures( version: NomenclaturesVersion ): NomenclaturesSplit`.
    - One `CodeListVersion` per list, in the version's list order, numbered `version.version`.
    - Each list's `changeNotes` hold, oldest first, only the versions with a note naming it, and only those notes.
      Each note is the same object, so its `source` and category stay.
    - `combined` holds the versions with a note naming no list, and only those notes.
    - Dates are kept on every split version.
  - `referencedSpecs( module: ModuleVersion ): { codeLists: string[], rules: boolean }`.
    - `codeLists` is every element's `codeList`, plus every list a parsed condition names in an `IN CLxxx['…']` set
      (through `testsOf`), sorted by ID, without repeats.
    - `rules` is `true` when any element names a rule.

- [ ] **Step 1: Write the failing tests**

```js
// kinds.test.js
assert.deepEqual( Object.values( kinds.SPEC_KIND ), [ "module", "rules", "code-list", "nomenclatures" ] );
assert.deepEqual( Object.values( kinds.STAGE ), [ "development", "implementation", "testing", "production", "previous-production", "retired" ] );
assert.deepEqual( Object.values( kinds.CHANGE_ORIGIN ), [ "detected", "editor", "edited", "imported" ] );

// stages.test.js
it( "reads a stage, then the stages further on (design record §4.8)", () => {
    assert.deepEqual( resolutionOrder( STAGE.DEVELOPMENT ), [ "development", "implementation", "testing", "production" ] );
    assert.deepEqual( resolutionOrder( STAGE.IMPLEMENTATION ), [ "implementation", "testing", "production" ] );
    assert.deepEqual( resolutionOrder( STAGE.TESTING ), [ "testing", "production" ] );
    assert.deepEqual( resolutionOrder( STAGE.PRODUCTION ), [ "production" ] );
} );
it( "never resolves a frozen-for-good stage", () => {
    for ( const stage of [ STAGE.PREVIOUS_PRODUCTION, STAGE.RETIRED, "staging" ] ) {
        assert.throws( () => resolutionOrder( stage ), { name: "RangeError" }, stage );
    }
} );

// code-lists.test.js — note( text ) builds { category: "non-breaking", text, source: { sheet: "Change Notes", row } }
it( "names a list by its ID, only when the workbook has it", () => {
    const ids = new Set( [ "CL037", "CL038", "CL011" ] );
    assert.deepEqual( namedLists( "Номенклатура CL038 - релации към CL037 и CL037", ids ), [ "CL038", "CL037" ] );
    assert.deepEqual( namedLists( "CL50 и CL999X и XCL011", ids ), [] );
} );
it( "makes one version per list, numbered as the combined version", () => {
    const split = splitNomenclatures( nomenclatures( "1.5.33", [ "CL009", "CL011" ], [] ) );
    assert.deepEqual( split.lists.map( ( v ) => [ v.kind, v.spec, v.version, v.list.id ] ),
        [ [ "code-list", "CL009", "1.5.33", "CL009" ], [ "code-list", "CL011", "1.5.33", "CL011" ] ] );
} );
it( "gives a note to every list it names, and keeps the rest as the combined history", () => {
    const split = splitNomenclatures( nomenclatures( "1.5.33", [ "CL009", "CL011", "CL038" ], [
        change( "1.5.32", "2026-09-01", "2026-09-08", [ note( "Номенклатура CL011 - добавяне", 5 ), note( "CL038 - релации към CL037", 6 ), note( "Отключени съобщенията", 7 ) ] ),
        change( "1.5.33", "2026-10-07", null, [ note( "CL009 и CL011 - корекции", 9 ), note( "CL50 - грешен номер", 10 ) ] )
    ] ) );
    const of = ( id ) => split.lists.find( ( v ) => v.spec === id ).changeNotes;
    assert.deepEqual( of( "CL011" ).map( ( c ) => [ c.version, c.notes.map( ( n ) => n.source.row ) ] ), [ [ "1.5.32", [ 5 ] ], [ "1.5.33", [ 9 ] ] ] );
    assert.deepEqual( of( "CL009" ).map( ( c ) => [ c.version, c.stagingDate, c.productionDate ] ), [ [ "1.5.33", "2026-10-07", null ] ] );
    assert.deepEqual( of( "CL038" ).map( ( c ) => c.version ), [ "1.5.32" ] );
    assert.deepEqual( split.combined.map( ( c ) => [ c.version, c.notes.map( ( n ) => n.text ) ] ),
        [ [ "1.5.32", [ "Отключени съобщенията" ] ], [ "1.5.33", [ "CL50 - грешен номер" ] ] ] );
} );

// references.test.js
it( "lists the code lists a module names, by elements and by condition sets, once each and sorted", () => {
    assert.deepEqual( referencedSpecs( moduleNaming( { elementLists: [ "CL035", "CL009", "CL009" ], setLists: [ "CL006" ], rules: [] } ) ),
        { codeLists: [ "CL006", "CL009", "CL035" ], rules: false } );
    assert.equal( referencedSpecs( moduleNaming( { elementLists: [], setLists: [], rules: [ "RL023" ] } ) ).rules, true );
} );

// public-nomenclatures.test.js
it( "splits into 182 list versions and the measured history (design record §4.6)", () => {
    const split = splitNomenclatures( result.version );
    const notes = ( versions ) => versions.reduce( ( sum, version ) => sum + version.notes.length, 0 );
    assert.equal( split.lists.length, 182 );
    assert.equal( split.lists.reduce( ( sum, version ) => sum + notes( version.changeNotes ), 0 ), 902 );
    assert.equal( split.lists.reduce( ( sum, version ) => sum + version.changeNotes.length, 0 ), 476 );
    assert.equal( split.lists.filter( ( version ) => version.changeNotes.length > 0 ).length, 177 );
    assert.deepEqual( [ notes( split.combined ), split.combined.length ], [ 21, 8 ] );
    const of = ( id ) => split.lists.find( ( version ) => version.spec === id ).changeNotes;
    assert.deepEqual( [ of( "CL009" ).length, notes( of( "CL011" ) ), of( "CL011" ).length ], [ 6, 64, 12 ] );
} );
```

`nomenclatures( version, ids, changeNotes )`, `change( version, stagingDate, productionDate, notes )` and
`note( text, row )` are builders local to `code-lists.test.js`. A list from `nomenclatures` has no entries and key
type `string`.

`moduleNaming` is a small builder local to `references.test.js`. Its condition set is a parsed `IN CL006['NHIF Code']`
comparison, bound to one element.

- [ ] **Step 2: Run them**

Run: `npm test --workspace packages/spec-model && npm test --workspace packages/importer`
Expected: FAIL. The new exports are missing, and `SPEC_KIND` has three values.

- [ ] **Step 3: Implement `STAGE`, `CHANGE_ORIGIN`, `SPEC_KIND.CODE_LIST`, `resolutionOrder`, `namedLists`, `splitNomenclatures` and `referencedSpecs`, and add the two typedefs**

- [ ] **Step 4: Run them**

Run: `npm test`
Expected: PASS. No earlier test changes; nothing reads `SPEC_KIND` by position.

- [ ] **Step 5: Commit**

```bash
git add packages/spec-model packages/importer/test/public-nomenclatures.test.js
git commit -m "feat(spec-model): stages, one spec per code list, and the references a module makes (HEL-29)"
```

---

### Task 2: The data package and the SQLite driver

**Files:**
- Create:
  - `packages/data/package.json`;
  - `packages/data/store/definitions.types.js`;
  - `packages/data/db/database.js`;
  - `packages/data/db/sqlite-driver.js`;
  - `packages/data/test/support/databases.js`;
  - `packages/data/test/database.test.js`.
- Modify: `package-lock.json`, through `npm install`.

**Interfaces:**
- **Produces, typedefs:**
  - `Statement { sql: string, params: Array<string|number|null> }`.
  - `Database`:
    - `{ dialect: "sqlite"|"postgres" }`;
    - `all( sql, params? ): Promise<Object[]>`;
    - `get( sql, params? ): Promise<Object|null>`;
    - `run( sql, params? ): Promise<{changes: number}>`;
    - `batch( statements: Statement[] ): Promise<Array<{changes: number}>>`, all-or-nothing;
    - `close(): Promise<void>`.

    Rows are plain objects, not null-prototype ones, so `deepEqual` holds.
- **Produces, in `#database`:**
  - `openDatabase( url: string, options?: {schema?: string} ): Promise<Database>`:
    - `sqlite::memory:` and `sqlite:<path>` open SQLite with `PRAGMA foreign_keys = ON`;
    - `postgres://` and `postgresql://` arrive in Task 3;
    - anything else throws a `TypeError` that names the scheme and never the URL.
  - `class ConstraintError extends Error { constraint: string|null }`. `constraint` is a named `CHECK`'s name;
    otherwise it is not portable (decision 7).
  - `MAX_PARAMETERS = 100`.
  - `insertStatements( table: string, columns: string[], rows: Array<Array> ): Statement[]`. Multi-row inserts, each
    with at most `MAX_PARAMETERS` parameters.
- **Produces, in `test/support/databases.js`:**
  - `eachDatabase( title: string, body: ( db: () => Database ) => void )`.
    - It runs `describe( "<title> (sqlite)", … )` on a fresh in-memory database.
    - It runs `describe( "<title> (postgres)", … )` when `HDP_TEST_POSTGRES_URL` is set (Task 3).
    - It opens the database before the suite and closes it after.
    - Under `CI`, a missing `HDP_TEST_POSTGRES_URL` throws. A skipped PostgreSQL suite looks exactly like a passing one.

The package follows `packages/importer/package.json`'s shape:
- `"name": "@health-dev-portal/data"`, `"version": "0.1.0"`, `"license": "EUPL-1.2"`, `"private": true`;
- the test script is `node --test "test/**/*.test.js"`;
- it depends on `@health-dev-portal/spec-model` `*` and `@health-dev-portal/importer` `*`.

The SQLite driver wraps `DatabaseSync`. Its `batch` is `BEGIN`, the statements, then `COMMIT`, with `ROLLBACK` on any
error. It turns SQLite's `CHECK constraint failed: <name>` and `UNIQUE constraint failed: …` into `ConstraintError`.

- [ ] **Step 1: Write the failing tests**

```js
eachDatabase( "Database", ( db ) => {
    before( async () => db().run( "CREATE TABLE t ( a INTEGER PRIMARY KEY, b TEXT, CONSTRAINT positive CHECK ( a > 0 ) )" ) );
    beforeEach( async () => db().run( "DELETE FROM t" ) );

    it( "runs a statement and reads rows back", async () => {
        assert.deepEqual( await db().run( "INSERT INTO t ( a, b ) VALUES ( ?, ? )", [ 1, "x" ] ), { changes: 1 } );
        assert.deepEqual( await db().all( "SELECT a, b FROM t" ), [ { a: 1, b: "x" } ] );
        assert.deepEqual( await db().get( "SELECT b FROM t WHERE a = ?", [ 1 ] ), { b: "x" } );
        assert.equal( await db().get( "SELECT b FROM t WHERE a = ?", [ 2 ] ), null );
    } );
    it( "binds a value holding ? and $1 without reading it as a placeholder", async () => {
        await db().run( "INSERT INTO t ( a, b ) VALUES ( ?, ? )", [ 1, "a?b $1 'c' \"d\"" ] );
        assert.deepEqual( await db().get( "SELECT a, '?' AS q FROM t WHERE b = ?", [ "a?b $1 'c' \"d\"" ] ), { a: 1, q: "?" } );
    } );
    it( "counts as a number, and keeps null as null", async () => {
        await db().batch( [ { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 1, null ] }, { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 2, "y" ] } ] );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM t" ), { n: 2 } );
        assert.deepEqual( await db().get( "SELECT b FROM t WHERE a = 1" ), { b: null } );
    } );
    it( "runs a batch all or nothing", async () => {
        await assert.rejects( db().batch( [
            { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 1, "x" ] },
            { sql: "INSERT INTO t ( a, b ) VALUES ( ?, ? )", params: [ 1, "again" ] }
        ] ), { name: "ConstraintError" } );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM t" ), { n: 0 } );
    } );
    it( "names the CHECK constraint a statement broke", async () => {
        await assert.rejects( db().run( "INSERT INTO t ( a, b ) VALUES ( ?, ? )", [ -1, "x" ] ), { name: "ConstraintError", constraint: "positive" } );
    } );
} );

describe( "insertStatements", () => {
    it( "keeps every statement within 100 parameters", () => {
        const rows = Array.from( { length: 40 }, ( _, i ) => [ i, `k${ i }`, null ] );
        assert.deepEqual( insertStatements( "t", [ "a", "b", "c" ], rows ).map( ( statement ) => statement.params.length ), [ 99, 21 ] );
        assert.match( insertStatements( "t", [ "a" ], [ [ 1 ], [ 2 ] ] )[ 0 ].sql, /^INSERT INTO t \( a \) VALUES \( \? \), \( \? \)$/ );
    } );
} );

describe( "openDatabase", () => {
    it( "refuses a scheme it does not know, without repeating the URL", async () => {
        await assert.rejects( openDatabase( "mysql://user:secret@host/db" ), ( error ) => error instanceof TypeError && /mysql/.test( error.message ) && !/secret/.test( error.message ) );
    } );
} );
```

- [ ] **Step 2: Run them**

Run: `npm install && npm test --workspace packages/data`
Expected: FAIL. `#database` does not exist.

- [ ] **Step 3: Implement the package, the typedefs, `#database` and the SQLite driver**

- [ ] **Step 4: Run them**

Run: `npm test --workspace packages/data && npm run lint`
Expected: PASS on SQLite; 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add package-lock.json packages/data
git commit -m "feat(data): one asynchronous database interface, and its SQLite driver (HEL-29)"
```

---

### Task 3: The PostgreSQL driver, locally and in CI

**Files:**
- Create: `packages/data/db/postgres-driver.js`; test `packages/data/test/postgres-driver.test.js`.
- Modify:
  - `packages/data/db/database.js`, which now opens `postgres://` and `postgresql://`;
  - `packages/data/package.json`: `"pg": "8.23.1"`;
  - `packages/data/test/support/databases.js`;
  - `.github/workflows/ci.yml`;
  - `README.md`;
  - `package-lock.json`.

**Interfaces:**
- **Consumes:** `Database`, `ConstraintError` and `eachDatabase` (Task 2).
- **Produces:**
  - `openDatabase( "postgres://…", { schema } )`. It uses a `pg.Pool` whose connections all run with
    `search_path` set to `schema`. The schema is created if it is missing.
  - `rewritePlaceholders( sql: string ): string`, exported for its test. Each `?` outside single-quoted text and
    double-quoted identifiers becomes `$1`, `$2`, …; a doubled quote inside quoted text stays quoted.
  - **Error mapping.** `23514` becomes `ConstraintError` with `constraint` set to the constraint's name. `23505` and
    `23503` become `ConstraintError` too.
  - **Types.** `int8` (OID 20) is parsed as a number on the driver's own type set, never globally.
  - **Batches.** `batch` runs on one client, between `BEGIN` and `COMMIT`, with `ROLLBACK` on any error.
  - **Test support.** For PostgreSQL, `eachDatabase` opens `HDP_TEST_POSTGRES_URL` with the schema
    `test_<random hex>`, and runs `DROP SCHEMA … CASCADE` after the suite.

**CI.** Add a `postgres` service to the `lint-and-test` job:
- image `postgres:18@sha256:<digest>`, with the digest measured by `docker buildx imagetools inspect postgres:18`
  when this task runs;
- `env: POSTGRES_HOST_AUTH_METHOD: trust`;
- `ports: [ "5432:5432" ]`;
- a `pg_isready` health check;
- and on the job, `HDP_TEST_POSTGRES_URL: postgres://postgres@localhost:5432/postgres`.

**README.** Add the local equivalent:
`docker run --rm -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:18`, then
`HDP_TEST_POSTGRES_URL=postgres://postgres@localhost:5432/postgres npm test`.

- [ ] **Step 1: Write the failing tests**

```js
describe( "rewritePlaceholders", () => {
    it( "numbers placeholders, and leaves quoted text alone", () => {
        assert.equal( rewritePlaceholders( "SELECT ?, '?', 'it''s ?', \"a?\" FROM t WHERE a = ?" ), "SELECT $1, '?', 'it''s ?', \"a?\" FROM t WHERE a = $2" );
    } );
} );
eachDatabase( "Schema isolation", ( db ) => {
    it( "sees only its own tables", async () => {
        await db().run( "CREATE TABLE only_here ( a INTEGER )" );
        assert.deepEqual( await db().get( "SELECT COUNT(*) AS n FROM only_here" ), { n: 0 } );
    } );
} );
```

The whole of `database.test.js` from Task 2 now runs on PostgreSQL too.

- [ ] **Step 2: Run them against a local PostgreSQL**

Run: `docker run -d --rm --name hdp-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:18`, then
`HDP_TEST_POSTGRES_URL=postgres://postgres@localhost:5432/postgres npm test --workspace packages/data`
Expected: FAIL. `openDatabase` refuses `postgres://`, and `rewritePlaceholders` is missing.

- [ ] **Step 3: Implement the driver, the support change, the CI service and the README lines**

- [ ] **Step 4: Run them on both databases**

Run: `HDP_TEST_POSTGRES_URL=postgres://postgres@localhost:5432/postgres npm test --workspace packages/data`
Expected: PASS. Every `Database` test passes twice: `(sqlite)` and `(postgres)`.

- [ ] **Step 5: Commit**

```bash
git add package-lock.json packages/data .github/workflows/ci.yml README.md
git commit -m "feat(data): the PostgreSQL driver, and the same suite on both databases in CI (HEL-29)"
```

---

### Task 4: The schema

**Files:**
- Create: `packages/data/store/schema.js`; test `packages/data/test/schema.test.js`.

**Interfaces:**
- **Consumes:** `Database`, `ConstraintError` (Task 2).
- **Produces:**
  - `migrateSchema( db: Database ): Promise<string[]>`. It applies the migrations not yet recorded in
    `schema_migrations`, each in one batch together with its record, and returns their IDs.
  - `TABLES: string[]`, the tables a copy carries, in order: `specs`, `releases`, `versions`, `version_stages`,
    `items`, `anomalies`, `changelog_entries`, `resolutions`, `files`, `settings`.
  - `GUARD_SQL`: the guard statement of decision 7, with one parameter, the version ID.

**Migration `0001-initial`**, in the subset of decision 3:

| Table | Columns and keys |
|---|---|
| `schema_migrations` | `id TEXT PRIMARY KEY`, `applied_at TEXT NOT NULL` |
| `write_guards` | `reason TEXT`, `CONSTRAINT write_guard CHECK ( reason IS NULL )` |
| `specs` | `id TEXT PRIMARY KEY`, `kind TEXT NOT NULL` checked against `SPEC_KIND` |
| `releases` | `id TEXT PRIMARY KEY`, `summary_bg TEXT`, `summary_en TEXT`, `notice_days INTEGER`, `planned_on TEXT`, `created_at TEXT NOT NULL` |
| `versions` | `id TEXT PRIMARY KEY`, `spec_id TEXT NOT NULL REFERENCES specs`, `number TEXT`, `stage TEXT NOT NULL` checked against `STAGE`, `frozen INTEGER NOT NULL DEFAULT 0` checked to be `0` or `1`, `base_id TEXT REFERENCES versions`, `release_id TEXT REFERENCES releases`, `content_hash TEXT`, `expires_on TEXT`, `created_at TEXT NOT NULL`, and `CONSTRAINT numbered CHECK ( ( stage = 'development' ) = ( number IS NULL ) )` |
| `version_stages` | `version_id TEXT NOT NULL REFERENCES versions`, `stage TEXT NOT NULL`, `entered_on TEXT`; key `( version_id, stage )` |
| `items` | `version_id TEXT NOT NULL REFERENCES versions`, `item_no INTEGER NOT NULL`, `kind TEXT NOT NULL`, `identity TEXT`, `parent_no INTEGER`, `position_no INTEGER NOT NULL`, `data TEXT NOT NULL`, `hash TEXT NOT NULL`, `revision INTEGER NOT NULL DEFAULT 1`; key `( version_id, item_no )` |
| `anomalies` | `version_id TEXT NOT NULL REFERENCES versions`, `anomaly_no INTEGER NOT NULL`, `item_no INTEGER`, `type TEXT NOT NULL`, `level TEXT NOT NULL`, `message TEXT NOT NULL`, `sheet TEXT`, `row_number INTEGER`, `column_number INTEGER`, `details TEXT NOT NULL`; key `( version_id, anomaly_no )` |
| `changelog_entries` | `id TEXT PRIMARY KEY`, `version_id TEXT NOT NULL REFERENCES versions`, `position_no INTEGER NOT NULL`, `category TEXT NOT NULL`, `origin TEXT NOT NULL` checked against `CHANGE_ORIGIN`, `target_kind TEXT`, `target_identity TEXT`, `before_value TEXT`, `after_value TEXT`, `text_bg TEXT`, `text_en TEXT`, `dropped INTEGER NOT NULL DEFAULT 0`, `source TEXT` |
| `resolutions` | `version_id TEXT NOT NULL REFERENCES versions`, `spec_id TEXT NOT NULL REFERENCES specs`, `resolved_id TEXT NOT NULL REFERENCES versions`, `number TEXT` (`NULL` when the version read is in development), `key_type TEXT`; key `( version_id, spec_id )` |
| `files` | `hash TEXT PRIMARY KEY`, `size INTEGER NOT NULL`, `content_type TEXT NOT NULL`, `created_at TEXT NOT NULL` |
| `settings` | `key TEXT PRIMARY KEY`, `value TEXT NOT NULL` |

**Indexes:**
- `versions_one_per_stage UNIQUE ( spec_id, stage ) WHERE stage <> 'retired'`;
- `versions_number UNIQUE ( spec_id, number ) WHERE number IS NOT NULL`;
- `items_identity ( version_id, kind, identity )`;
- `changelog_version ( version_id, position_no )`.

The enum checks are written from `spec-model`'s `kinds`, so a new stage or kind changes the schema through a new
migration.

- [ ] **Step 1: Write the failing tests**

```js
eachDatabase( "Schema", ( db ) => {
    before( async () => migrateSchema( db() ) );
    const version = ( id, stage, number ) => db().run( "INSERT INTO versions ( id, spec_id, number, stage, created_at ) VALUES ( ?, 'e-prescription', ?, ?, '2026-11-04' )", [ id, number, stage ] );

    it( "applies each migration once", async () => {
        assert.deepEqual( await migrateSchema( db() ), [] );
        assert.deepEqual( ( await db().all( "SELECT id FROM schema_migrations" ) ).map( ( row ) => row.id ), [ "0001-initial" ] );
    } );
    it( "keeps one version of a spec in each stage, and any number retired", async () => {
        await db().run( "INSERT INTO specs ( id, kind ) VALUES ( 'e-prescription', 'module' )" );
        await version( "a", "production", "1.5.1" );
        await assert.rejects( version( "b", "production", "1.5.2" ), { name: "ConstraintError" } );
        await version( "c", "retired", "1.5.0" );
        await version( "d", "retired", "1.4.9" );
        await assert.rejects( version( "e", "retired", "1.5.0" ), { name: "ConstraintError" } );
    } );
    it( "numbers every version but a development one", async () => {
        await assert.rejects( version( "f", "development", "1.6.0" ), { name: "ConstraintError", constraint: "numbered" } );
        await assert.rejects( version( "g", "testing", null ), { name: "ConstraintError", constraint: "numbered" } );
        await version( "h", "development", null );
    } );
    it( "refuses a guarded batch on a frozen version, and writes none of it", async () => {
        await db().run( "UPDATE versions SET frozen = 1 WHERE id = 'a'" );
        await assert.rejects( db().batch( [ { sql: GUARD_SQL, params: [ "a" ] }, { sql: "UPDATE versions SET content_hash = 'x' WHERE id = 'a'", params: [] } ] ),
            { name: "ConstraintError", constraint: "write_guard" } );
        assert.deepEqual( await db().get( "SELECT content_hash FROM versions WHERE id = 'a'" ), { content_hash: null } );
        await db().batch( [ { sql: GUARD_SQL, params: [ "h" ] }, { sql: "UPDATE versions SET content_hash = 'y' WHERE id = 'h'", params: [] } ] );
    } );
} );
```

- [ ] **Step 2: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: FAIL. `#schema` does not exist.

- [ ] **Step 3: Implement `#schema`**

- [ ] **Step 4: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: PASS on both databases.

- [ ] **Step 5: Commit**

```bash
git add packages/data
git commit -m "feat(data): the schema — specs, versions in stages, items, anomalies, changelog, resolutions, files (HEL-29)"
```

---

### Task 5: Storing and loading a version

**Files:**
- Create:
  - `packages/data/store/items.js`;
  - `packages/data/store/versions.js`;
  - `packages/data/test/support/models.js`;
  - tests `packages/data/test/items.test.js` and `packages/data/test/versions.test.js`.

**Interfaces:**
- **Consumes:** `migrateSchema`, `GUARD_SQL` (Task 4); `insertStatements`, `ConstraintError` (Task 2).
- **Produces, typedefs:**
  - `ItemRow { item_no: number, kind: string, identity: string|null, parent_no: number|null, position_no: number,
    data: string, hash: string }`.
  - `VersionContent`: the model object of decision 5 — a `ModuleVersion`, `CodeListVersion` or `RulesVersion` —
    without `changeNotes`.
  - `StoredVersion { id, spec, kind, number, stage, frozen: boolean, release: string|null, base: string|null,
    contentHash: string|null, content?: VersionContent }`.
- **Produces, in `#items`:**
  - `encodeContent( kind: string, content: VersionContent ): { items: ItemRow[], hash: string }`;
  - `decodeContent( kind: string, spec: string, number: string|null, items: ItemRow[] ): VersionContent`. The rows
    are in `item_no` order. Decoding restores every `children`, `messages`, `elements` and `entries` array, and sets
    `kind`, `spec` and `version` from the arguments.
- **Produces, in `#versions`:**
  - `ensureSpec( db, id: string, kind: string ): Promise<void>`. It throws a `TypeError` when `id` exists with
    another kind.
  - `storeVersion( db, input ): Promise<string>`. `input` is `{ spec, kind, number, stage, content?, anomalies?,
    release?, base?, stages?: Array<{stage, enteredOn}> }`.
    - One batch writes the version row, its stages, its items and its anomalies, and returns the new ID.
    - A version stored without `content` (a retired history version) has no items and no hash.
  - `storeContent( db, versionId, content, anomalies ): Promise<void>`. It replaces an unfrozen version's items,
    anomalies and hash, in one batch that starts with the guard.
  - `freezeVersion( db, versionId ): Promise<void>`.
  - `findVersion( db, spec: string, by: {stage?: string, number?: string} ): Promise<StoredVersion|null>`, without
    content.
  - `loadVersion( db, versionId ): Promise<StoredVersion|null>`, with content.
  - `loadAnomalies( db, versionId ): Promise<Array<Anomaly & {item: number|null}>>`, in stored order.
  - `class FrozenVersionError extends Error { version: string }`.

**Anomalies are mapped to items.** Each anomaly maps to the first item whose `data.source` has the anomaly's `sheet`
and `row`; one that matches none maps to `null`.

**`test/support/models.js`** builds synthetic versions in code:
- `moduleVersion()`: two messages; a group with a polymorphic element and its variants; a field with attributes; two
  elements with one identity, as in HEL-19; a condition; a dictionary entry; one condition binding and one blueprint
  binding.
- `codeListVersion( id, keys )`.
- `rulesVersion( ids )`.

Every object carries a `source`, as the importer's do.

- [ ] **Step 1: Write the failing tests**

```js
// items.test.js
it( "gives the same hash to the same content, and another to a change", () => {
    const content = moduleVersion();
    assert.equal( encodeContent( "module", content ).hash, encodeContent( "module", moduleVersion() ).hash );
    content.messages[ 0 ].elements[ 0 ].description.bg = "друго";
    assert.notEqual( encodeContent( "module", content ).hash, encodeContent( "module", moduleVersion() ).hash );
} );
it( "decodes what it encoded, for each kind", () => {
    for ( const [ kind, content ] of [ [ "module", moduleVersion() ], [ "code-list", codeListVersion( "CL009", [ "1", "2" ] ) ], [ "rules", rulesVersion( [ "RL001" ] ) ] ] ) {
        assert.deepEqual( decodeContent( kind, content.spec, content.version, encodeContent( kind, content ).items ), content, kind );
    }
} );

// versions.test.js
eachDatabase( "Versions", ( db ) => {
    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "e-prescription", "module" );
        await ensureSpec( db(), "CL011", "code-list" );
    } );

    it( "loads a module exactly as stored, two elements with one identity included", async () => {
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.5.1", stage: "production", content: moduleVersion() } );
        assert.deepEqual( ( await loadVersion( db(), id ) ).content, moduleVersion() );
    } );
    it( "returns entries in stored order on both databases", async () => {
        const keys = [ "b", "A", "a", "10", "9", "Б", "б" ];
        const id = await storeVersion( db(), { spec: "CL011", kind: "code-list", number: "1.5.32", stage: "retired", content: codeListVersion( "CL011", keys ) } );
        assert.deepEqual( ( await loadVersion( db(), id ) ).content.list.entries.map( ( entry ) => entry.key ), keys );
    } );
    it( "stores and loads a list of 39,005 entries", async () => {
        const keys = Array.from( { length: 39005 }, ( _, i ) => `A${ String( i ).padStart( 5, "0" ) }.1` );
        const id = await storeVersion( db(), { spec: "CL011", kind: "code-list", number: "1.5.33", stage: "production", content: codeListVersion( "CL011", keys ) } );
        const entries = ( await loadVersion( db(), id ) ).content.list.entries;
        assert.deepEqual( [ entries.length, entries[ 0 ].key, entries[ 39004 ].key ], [ 39005, "A00000.1", "A39004.1" ] );
    } );
    it( "maps an anomaly to the item it was found on", async () => {
        const content = moduleVersion();
        const row = content.messages[ 0 ].elements[ 0 ].source.row;
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.4.0", stage: "retired", content: content, anomalies: [
            { type: "look-alike-letter", level: "warning", message: "…", sheet: "P001", row: row, column: 3, details: {} },
            { type: "missing-sheet", level: "blocking", message: "…", sheet: "Съобщения", row: null, column: null, details: { sheet: "Съобщения" } }
        ] } );
        const anomalies = await loadAnomalies( db(), id );
        assert.equal( typeof anomalies[ 0 ].item, "number" );
        assert.equal( anomalies[ 1 ].item, null );
        assert.deepEqual( anomalies[ 1 ].details, { sheet: "Съобщения" } );
    } );
    it( "refuses to change a frozen version and writes nothing", async () => {
        const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: "1.3.0", stage: "retired", content: moduleVersion() } );
        await freezeVersion( db(), id );
        const changed = moduleVersion();
        changed.messages.pop();
        await assert.rejects( storeContent( db(), id, changed, [] ), { name: "FrozenVersionError", version: id } );
        assert.deepEqual( ( await loadVersion( db(), id ) ).content, moduleVersion() );
    } );
    it( "refuses a spec of another kind under a known key", async () => {
        await assert.rejects( ensureSpec( db(), "CL011", "module" ), { name: "TypeError" } );
    } );
} );
```

- [ ] **Step 2: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: FAIL. `#items` and `#versions` do not exist.

- [ ] **Step 3: Implement `#items` and `#versions`, and the test models**

- [ ] **Step 4: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: PASS on both databases. The 39,005-entry test passes on each, within the default test timeout.

- [ ] **Step 5: Commit**

```bash
git add packages/data
git commit -m "feat(data): versions stored item by item, frozen versions refusing writes, anomalies on their items (HEL-29)"
```

---

### Task 6: The changelog and history

**Files:**
- Create: `packages/data/store/changelog.js`; test `packages/data/test/changelog.test.js`.

**Interfaces:**
- **Consumes:** `storeVersion`, `findVersion` (Task 5); `CHANGE_ORIGIN` (Task 1).
- **Produces:**
  - `compareNumbers( a: string, b: string ): number`. It compares dotted numbers part by part as integers, so 1.5.10
    comes after 1.5.9.
  - `storeHistory( db, spec: string, kind: string, history: ChangeVersion[], attach?: {number: string,
    version: string} ): Promise<{retired: number, entries: number}>`.
    - **Where notes go.** Each change version's notes become entries of the spec's version with that number. If
      `attach.number` matches, they go to `attach.version` instead: a development version that has no number yet.
      If no version has the number, a `retired` one is created first, with no content.
    - **Entries.** Origin `imported`. `text_bg` is the note, `text_en` is `null`, and `source` is the note's
      `SourceRef` as JSON. `position_no` follows the note order.
    - **Idempotent.** A version that already has imported entries gets none again.
    - **Dates.** A retired version's `version_stages` take the change version's dates: `stagingDate` as `testing`,
      `productionDate` as `production`, and `retired` with no date.
  - `loadChangelog( db, spec: string ): Promise<Array<{version: string, number: string|null, stage: string,
    entries: Object[]}>>`. Newest first: a development version, then by `compareNumbers`, descending. Entries are in
    `position_no` order.

- [ ] **Step 1: Write the failing tests**

```js
eachDatabase( "Changelog", ( db ) => {
    let production;
    before( async () => {
        await migrateSchema( db() );
        await ensureSpec( db(), "rules", "rules" );
        production = await storeVersion( db(), { spec: "rules", kind: "rules", number: "1.1.1", stage: "production", content: rulesVersion( [ "RL001" ] ) } );
    } );
    const history = [
        change( "1.0.9", "2025-01-10", "2025-02-01", [ note( "Добавено бизнес правило RL001", "non-breaking", 3 ) ] ),
        change( "1.0.10", null, null, [ note( "Коригирано RL001", "breaking", 5 ) ] ),
        change( "1.1.1", null, null, [ note( "Добавено RL095", "non-breaking", 7 ), note( "Отпаднал план", "dropped-plan", 8 ) ] )
    ];

    it( "keeps every version's notes, retiring the versions it does not have", async () => {
        assert.deepEqual( await storeHistory( db(), "rules", "rules", history ), { retired: 2, entries: 4 } );
        const log = await loadChangelog( db(), "rules" );
        assert.deepEqual( log.map( ( version ) => [ version.number, version.stage ] ), [ [ "1.1.1", "production" ], [ "1.0.10", "retired" ], [ "1.0.9", "retired" ] ] );
        assert.equal( log[ 0 ].version, production );
        assert.deepEqual( log[ 0 ].entries.map( ( entry ) => [ entry.category, entry.origin, entry.text_bg, entry.text_en ] ),
            [ [ "non-breaking", "imported", "Добавено RL095", null ], [ "dropped-plan", "imported", "Отпаднал план", null ] ] );
    } );
    it( "changes nothing the second time", async () => {
        assert.deepEqual( await storeHistory( db(), "rules", "rules", history ), { retired: 0, entries: 0 } );
    } );
    it( "records a retired version's dates", async () => {
        const retired = await findVersion( db(), "rules", { number: "1.0.9" } );
        const rows = await db().all( "SELECT stage, entered_on FROM version_stages WHERE version_id = ?", [ retired.id ] );
        assert.deepEqual( Object.fromEntries( rows.map( ( row ) => [ row.stage, row.entered_on ] ) ),
            { retired: null, testing: "2025-01-10", production: "2025-02-01" } );
    } );
    it( "attaches the newest notes of a development workbook to its unnumbered version", async () => {
        const development = await storeVersion( db(), { spec: "rules", kind: "rules", number: null, stage: "development", content: rulesVersion( [ "RL001", "RL096" ] ) } );
        await storeHistory( db(), "rules", "rules", [ change( "1.2.0", null, null, [ note( "Добавено RL096", "non-breaking", 9 ) ] ) ], { number: "1.2.0", version: development } );
        assert.deepEqual( ( await loadChangelog( db(), "rules" ) )[ 0 ].entries.map( ( entry ) => entry.text_bg ), [ "Добавено RL096" ] );
        assert.equal( await findVersion( db(), "rules", { number: "1.2.0" } ), null );
    } );
} );
```

`change( version, stagingDate, productionDate, notes )` and `note( text, category, row )` are local builders of
`ChangeVersion` and `ChangeNote`, with sheet `Change Notes`.

The dates test reads the rows as a map, not in SQL order: `ORDER BY` puts `NULL` first on SQLite and last on
PostgreSQL.

- [ ] **Step 2: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: FAIL. `#changelog` does not exist.

- [ ] **Step 3: Implement `#changelog`**

- [ ] **Step 4: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: PASS on both databases.

- [ ] **Step 5: Commit**

```bash
git add packages/data
git commit -m "feat(data): history as changelog entries, retired versions keeping only their notes (HEL-29)"
```

---

### Task 7: Files by content hash, and the catalogue

**Files:**
- Create: `packages/data/store/files.js`; test `packages/data/test/files.test.js`.

**Interfaces:**
- **Consumes:** `migrateSchema` (Task 4).
- **Produces:**
  - `FileStore { put( bytes: Uint8Array ): Promise<string>, get( hash: string ): Promise<Buffer|null>,
    has( hash: string ): Promise<boolean> }`.
    - The hash is the lower-case hex SHA-256 of the bytes.
    - `get` and `has` throw a `TypeError` for anything that is not 64 hex digits. A hash is never trusted as a path.
  - `memoryStore(): FileStore`.
  - `directoryStore( root: string ): FileStore`.
    - A file lives at `<root>/<hash 0–1>/<hash>`.
    - It is written to a temporary name in the same directory and then renamed, so a reader never sees half a file.
    - A hash already present is not written again.
  - `storeFile( db, store, bytes, contentType: string ): Promise<string>`. It puts the bytes in the store, then upserts
    the `files` row with `ON CONFLICT ( hash ) DO NOTHING`.
  - `readSetting( db, key ): Promise<string|null>` and `writeSetting( db, key, value ): Promise<void>`.
  - `storeCatalogue( db, store, catalogue: BlueprintCatalogue ): Promise<string>`. It stores the catalogue as
    `application/json` and sets `blueprint-catalogue` to its hash.
  - `loadCatalogue( db, store ): Promise<BlueprintCatalogue|null>`.

- [ ] **Step 1: Write the failing tests**

```js
for ( const [ name, open ] of [ [ "memory", () => memoryStore() ], [ "directory", () => directoryStore( fs.mkdtempSync( path.join( os.tmpdir(), "hdp-files-" ) ) ) ] ] ) {
    describe( `FileStore (${ name })`, () => {
        it( "names a file by the SHA-256 of its bytes, and stores it once", async () => {
            const store = open();
            const hash = await store.put( Buffer.from( "hello" ) );
            assert.equal( hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" );
            assert.equal( await store.put( Buffer.from( "hello" ) ), hash );
            assert.equal( ( await store.get( hash ) ).toString(), "hello" );
            assert.equal( await store.get( "0".repeat( 64 ) ), null );
        } );
        it( "refuses anything but a hash as a name", async () => {
            for ( const name of [ "../etc/passwd", "AB".repeat( 32 ), "a".repeat( 63 ) ] ) {
                await assert.rejects( open().get( name ), { name: "TypeError" }, name );
            }
        } );
    } );
}
it( "keeps a directory store's files across a reopening", async () => {
    const root = fs.mkdtempSync( path.join( os.tmpdir(), "hdp-files-" ) );
    const hash = await directoryStore( root ).put( Buffer.from( "x" ) );
    assert.equal( ( await directoryStore( root ).get( hash ) ).toString(), "x" );
} );
eachDatabase( "Catalogue", ( db ) => {
    before( async () => migrateSchema( db() ) );
    it( "stores the blueprint catalogue as a file and finds it again", async () => {
        const store = memoryStore();
        const catalogue = { blueprints: [ { key: "patient", types: [ "patient" ] } ], types: { patient: "patient" } };
        const hash = await storeCatalogue( db(), store, catalogue );
        assert.equal( await readSetting( db(), "blueprint-catalogue" ), hash );
        assert.deepEqual( await loadCatalogue( db(), store ), catalogue );
        assert.deepEqual( await db().get( "SELECT content_type FROM files WHERE hash = ?", [ hash ] ), { content_type: "application/json" } );
    } );
} );
```

- [ ] **Step 2: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: FAIL. `#files` does not exist.

- [ ] **Step 3: Implement `#files`**

- [ ] **Step 4: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/data
git commit -m "feat(data): files by content hash, and the blueprint catalogue stored as one (HEL-29)"
```

---

### Task 8: Resolution records

**Files:**
- Create: `packages/data/store/resolution.js`; test `packages/data/test/resolution.test.js`.

**Interfaces:**
- **Consumes:**
  - `resolutionOrder`, `referencedSpecs` (Task 1);
  - `findVersion`, `loadVersion`, `storeVersion`, `freezeVersion` (Task 5);
  - `GUARD_SQL` (Task 4).
- **Produces:**
  - `Resolution { spec: string, version: string, number: string|null, keyType: string|null }`. `number` is `null`
    when the version read is in development.
  - `resolveVersion( db, versionId ): Promise<Resolution[]>`.
    - A module version resolves each code list of `referencedSpecs`, and the `rules` spec if it names a rule.
    - Each resolves to the first version found in `resolutionOrder( stage )`. A spec with none there is left out;
      linking reports it.
    - `keyType` is the code list's `list.keyType`, and `null` for the rules.
    - Results are sorted by spec ID.
    - A frozen version returns its recorded resolutions instead, unchanged.
  - `recordResolution( db, versionId ): Promise<Resolution[]>`. In one batch that starts with the guard, it replaces
    the version's `resolutions` rows with `resolveVersion`'s result. A frozen version raises `FrozenVersionError`.

- [ ] **Step 1: Write the failing tests**

```js
eachDatabase( "Resolution", ( db ) => {
    // Lists: CL009 in production 1.5.33 and development; CL011 in production only. The module names CL009, CL011 and RL001.
    let developmentModule, productionModule;
    before( async () => { /* migrateSchema; specs; CL009 1.5.33 production + CL009 development; CL011 1.5.33 production;
                            rules 1.1.1 production; module development and module 1.5.1 production naming CL009, CL011, RL001 */ } );

    it( "reads each list in the module's stage, else further on", async () => {
        assert.deepEqual( ( await resolveVersion( db(), developmentModule ) ).map( ( r ) => [ r.spec, r.number, r.keyType ] ),
            [ [ "CL009", null, "integer" ], [ "CL011", "1.5.33", "string" ], [ "rules", "1.1.1", null ] ] );
        assert.deepEqual( ( await resolveVersion( db(), productionModule ) ).map( ( r ) => [ r.spec, r.number ] ),
            [ [ "CL009", "1.5.33" ], [ "CL011", "1.5.33" ], [ "rules", "1.1.1" ] ] );
    } );
    it( "keeps a frozen version's record when what it read moves on", async () => {
        await recordResolution( db(), productionModule );
        await freezeVersion( db(), productionModule );
        // CL009 1.5.33 retires; CL009 1.5.34 enters production.
        assert.deepEqual( ( await resolveVersion( db(), productionModule ) ).map( ( r ) => [ r.spec, r.number ] ),
            [ [ "CL009", "1.5.33" ], [ "CL011", "1.5.33" ], [ "rules", "1.1.1" ] ] );
        await assert.rejects( recordResolution( db(), productionModule ), { name: "FrozenVersionError" } );
    } );
} );
```

- [ ] **Step 2: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: FAIL. `#resolution` does not exist.

- [ ] **Step 3: Implement `#resolution`**

- [ ] **Step 4: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/data
git commit -m "feat(data): each module version records the list and rules versions it reads (HEL-29)"
```

---

### Task 9: The migration, and `hdp-migrate`

**Files:**
- Create:
  - `packages/data/load/manifest.js`;
  - `packages/data/load/migration.js`;
  - `packages/data/bin/migrate.js`;
  - tests: `manifest.test.js`, `migration.test.js`, `public-migration.test.js` and `cli-migrate.test.js` in
    `packages/data/test/`.
- Modify: `packages/data/package.json`, with the bin `hdp-migrate`; `README.md`.

**Interfaces:**
- **Consumes:**
  - Tasks 1 and 4–8;
  - `importSet` (`@health-dev-portal/importer/set`);
  - `importXsdSet` (`@health-dev-portal/importer/xsd`).
- **Produces, typedefs:**
  - `Manifest`:
    - `{ xsd?: string, nomenclatures: ManifestEntry[], rules: ManifestEntry[], modules: Array<ManifestEntry & {spec: string}> }`;
    - `ManifestEntry { file: string, stage: "production"|"testing"|"development" }`. Paths are resolved against the
      manifest's directory.
  - `StageImport { nomenclatures: Result|null, rules: Result|null, modules: Result[] }`, where `Result` is
    `importSet`'s `{ version, anomalies }`. It holds only the workbooks *at* that stage.
  - `MigrationReport { stored: Array<{spec, number, stage}>, skipped: Array<{spec, number, stage}>, retired: number,
    entries: number, anomalies: {blocking: number, warning: number} }`.
- **Produces, functions:**
  - `readManifest( file: string ): Manifest`. It throws a `TypeError` naming the entry for:
    - a stage outside the three;
    - two workbooks of one spec in one stage;
    - no production nomenclatures;
    - a missing file.
  - `migrate( db, store, manifest ): Promise<MigrationReport>`.
    1. It stores the catalogue first, when `xsd` is given.
    2. It then runs `importSet` once per stage that has a workbook, in the order production, testing, development.
       Nomenclatures and rules are taken from the stage itself, or else from the nearest stage further on
       (decision 10).
    3. It passes `migrateImported` only the workbooks at each stage.
  - `migrateImported( db, store, stages: {production?: StageImport, testing?: StageImport, development?: StageImport} ): Promise<MigrationReport>`.
    Per stage, in that order, it stores code lists, then rules, then modules:
    1. **Specs.** `ensureSpec` for each spec.
    2. **Code lists.** Nomenclatures are split (`splitNomenclatures`). A testing nomenclatures stores only the lists
       whose content hash differs from the list's production version.
    3. **Versions.**
       - Published stages are stored unfrozen, then their resolution is recorded, then their history, then they are
         frozen.
       - Development versions are stored without a number, with the spec's most advanced version as `base`, and are
         not frozen.
       - A version whose spec and number exist with the same content hash is skipped. A different hash throws
         `MigrationConflictError`, before anything of that version is written.
    4. **Releases.** One release per stored testing version, with `notice_days` and `planned_on` left `null`.
    5. **Stage dates.** From the version's own change version: `stagingDate` as `testing`, `productionDate` as
       `production`, plus the current stage with no date.
    6. **History.** From the most advanced published workbook of each spec, as decision 8 says. For code lists that is
       the split. The combined spec `nomenclatures` gets its retired versions from `split.combined`, plus the
       workbook's own number, which carries the anomalies of decision 11.
    7. **Anomalies,** as decision 11 says.
  - `class MigrationConflictError extends Error { spec: string, number: string }`. Its message reads "<spec> <number>
    is already stored with other content; a published version is never replaced (design record §7.11)".
  - `formatMigrationReport( report ): string`, one line in this format: `Stored <n> versions of <s> specs
    (<k> skipped); <r> retired versions of history with <e> entries; anomalies: <b> blocking, <w> warnings.`
    Numbers are grouped by thousands with a comma.
- **Produces, CLI:** `hdp-migrate --manifest <file> [--database <url>] [--files <directory>]`.
  - The database comes from `--database` or `HDP_DATABASE_URL`. Without either, it prints the usage and exits 2.
  - `--files` defaults to `.files/`, next to the manifest.
  - It applies `migrateSchema`, runs `migrate`, and prints `formatMigrationReport`.
  - Exit codes: 0 on success; 1 on `MigrationConflictError` or an unreadable workbook, with one line naming it; 2 on
    usage.
  - The URL is never printed.

- [ ] **Step 1: Write the failing tests**

`test/support/models.js` gains `stageImports()`. It returns a fresh `{ production, testing, development }` of
`StageImport`s, built from the Task 5 models, as the comments below describe. The nomenclatures results carry two
anomalies:
- a blocking `duplicate-key` on sheet `CL011`;
- a `sheet-not-listed` on sheet `CLS01`.

```js
// migration.test.js
eachDatabase( "Migration", ( db ) => {
    // production: nomenclatures 1.5.33 { CL009, CL011 }, rules 1.1.1, e-prescription 1.5.1
    // testing: nomenclatures 1.5.34 { CL009 changed, CL011 unchanged }, e-prescription 1.6.0
    // development: e-prescription workbook claiming 1.7.0
    // before(): migrateSchema, then migrateImported( db(), store, stageImports() )
    it( "stores each workbook at its stage, frozen when published", async () => { /* … */
        assert.deepEqual( await stagesOf( "e-prescription" ), [ [ "1.5.1", "production", true ], [ "1.6.0", "testing", true ], [ null, "development", false ] ] );
    } );
    it( "stores a testing list only where it differs from production", async () => {
        assert.deepEqual( await stagesOf( "CL009" ), [ [ "1.5.33", "production", true ], [ "1.5.34", "testing", true ] ] );
        assert.deepEqual( await stagesOf( "CL011" ), [ [ "1.5.33", "production", true ] ] );
    } );
    it( "starts a development version from the spec's most advanced one", async () => {
        const development = await findVersion( db(), "e-prescription", { stage: "development" } );
        assert.equal( development.base, ( await findVersion( db(), "e-prescription", { stage: "testing" } ) ).id );
    } );
    it( "gives each testing version a release of its own, with no dates yet", async () => {
        const releases = await db().all( "SELECT r.notice_days, r.planned_on FROM versions v JOIN releases r ON r.id = v.release_id WHERE v.stage = 'testing'" );
        assert.deepEqual( releases, [ { notice_days: null, planned_on: null }, { notice_days: null, planned_on: null } ] );
    } );
    it( "loads published defects as published, and records them", async () => {
        // The production CL011 carries a blocking duplicate-key anomaly on sheet CL011; the combined 1.5.33 carries sheet-not-listed.
        assert.equal( ( await loadAnomalies( db(), ( await findVersion( db(), "CL011", { stage: "production" } ) ).id ) )[ 0 ].level, "blocking" );
        assert.equal( ( await loadAnomalies( db(), ( await findVersion( db(), "nomenclatures", { number: "1.5.33" } ) ).id ) )[ 0 ].type, "sheet-not-listed" );
    } );
    it( "changes nothing when run again", async () => {
        const report = await migrateImported( db(), store, stageImports() );
        assert.deepEqual( [ report.stored.length, report.retired, report.entries ], [ 0, 0, 0 ] );
    } );
    it( "refuses a published number whose content changed", async () => {
        const changed = stageImports();
        changed.production.rules.version.rules[ 0 ].definition.bg = "друго";
        await assert.rejects( migrateImported( db(), store, changed ), { name: "MigrationConflictError", spec: "rules", number: "1.1.1" } );
        assert.notEqual( ( await loadVersion( db(), ( await findVersion( db(), "rules", { number: "1.1.1" } ) ).id ) ).content.rules[ 0 ].definition.bg, "друго" );
    } );
} );

// public-migration.test.js — skipped without the fixtures, a failure under CI
eachDatabase( "Migrating the production set", ( db ) => {
    // manifest: xsd .fixtures/public/api-v1, nomenclatures 1.5.33, rules 1.1.1, e-prescription 1.5.1, all production
    it( "stores 185 specs and their measured history", async () => {
        assert.equal( ( await db().get( "SELECT COUNT(*) AS n FROM specs" ) ).n, 185 );
        assert.deepEqual( await countBy( "SELECT s.kind, v.stage, COUNT(*) AS n FROM versions v JOIN specs s ON s.id = v.spec_id GROUP BY s.kind, v.stage" ), {
            "code-list production": 182, "code-list retired": 473, "nomenclatures retired": 9,
            "rules production": 1, "rules retired": 16, "module production": 1, "module retired": 27
        } );
        assert.deepEqual( [ report.stored.length, report.retired, report.entries ], [ 184, 525, 1289 ] );
        assert.equal( report.anomalies.blocking + report.anomalies.warning, totalAnomalies( imported ) );
    } );
    it( "loads e-Prescription 1.5.1 exactly as the importer reads it", async () => {
        const loaded = await loadVersion( db(), ( await findVersion( db(), "e-prescription", { stage: "production" } ) ).id );
        assert.deepEqual( loaded.content, withoutNotes( imported.modules[ 0 ].version ) );
        assert.deepEqual( [ loaded.content.messages.length, loaded.content.conditions.length ], [ 23, 38 ] );
    } );
    it( "keeps CL011 whole, and the duplicate keys of CL096 and CL127 as blocking anomalies", async () => {
        assert.equal( ( await loadVersion( db(), ( await findVersion( db(), "CL011", { stage: "production" } ) ).id ) ).content.list.entries.length, 39005 );
        assert.deepEqual( [ await blocking( "CL096" ), await blocking( "CL127" ) ], [ 1, 16 ] );
    } );
    it( "stores the catalogue it bound the module with", async () => {
        assert.match( await readSetting( db(), "blueprint-catalogue" ), /^[0-9a-f]{64}$/ );
    } );
} );
```

**Where the public counts come from**, as measured on 2026-11-04:
- **Code-list production, 182:** one per list.
- **Code-list retired, 473:** 476 (list, version) pairs, less the 3 at 1.5.33, which land on the production versions.
- **Nomenclatures retired, 9:**
  - 8 are the combined spec's versions with a note naming no list: 1.0.3, 1.0.8, 1.0.10, 1.0.13, 1.1.0, 1.2.0,
    1.3.12 and 1.4.12.
  - The ninth is 1.5.33, created to carry the workbook's 4 anomalies that sit on no list's sheet (decision 11).
- **Rules retired, 16:** 17 change versions, less 1.1.1.
- **Module retired, 27:** e-Prescription's 28 change versions, less 1.5.1.
- **Stored, 184:** 182 lists, the rules and e-Prescription.
- **Retired in all, 525:** 473 + 9 + 16 + 27.
- **Entries, 1,289:** 902 for lists, 21 for the combined spec, 125 for the rules and 241 for e-Prescription.

`cli-migrate.test.js`:
- usage without `--manifest`, or without a database, exits 2;
- with the public manifest and `--database sqlite:<tmp>/portal.db`, it exits 0 and prints a line starting
  `Stored 184 versions of 185 specs (0 skipped)`;
- run again, it prints `Stored 0 versions of 185 specs (184 skipped)`;
- the output never contains the database URL.

- [ ] **Step 2: Run them**

Run: `npm run fixtures:fetch && npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: FAIL. `#manifest` and `#migration` do not exist.

- [ ] **Step 3: Implement `#manifest`, `#migration` and `hdp-migrate`, and add the README section "Migrating the published specifications"**

- [ ] **Step 4: Run them**

Run: `npm test`, with `HDP_TEST_POSTGRES_URL` set.
Expected: PASS on both databases, the public migration included.

- [ ] **Step 5: Commit**

```bash
git add packages/data README.md
git commit -m "feat(data): migrate today's published workbooks as published, defects recorded — hdp-migrate (HEL-29)"
```

---

### Task 10: Copying a database, and `hdp-copy`

**Files:**
- Create: `packages/data/store/copy.js`; `packages/data/bin/copy.js`; tests `packages/data/test/copy.test.js` and
  `packages/data/test/cli-copy.test.js`.
- Modify: `packages/data/package.json`, with the bin `hdp-copy`; `README.md`.

**Interfaces:**
- **Consumes:**
  - `openDatabase`, `insertStatements` (Task 2);
  - `TABLES`, `migrateSchema` (Task 4);
  - `FileStore`, `memoryStore`, `storeFile` (Task 7);
  - `migrateImported`, and `stageImports` from the test support (Task 9).
- **Produces:**
  - `copyDatabase( source: Database, target: Database ): Promise<Object<string, number>>`. It returns the rows copied
    per table.
    - It applies `migrateSchema` to the target, then refuses with `CopyTargetError` if either is true:
      - the target's `schema_migrations` differ from the source's;
      - any of `TABLES` already has a row in the target.
    - It copies `TABLES` in order, reading the source in pages of 1,000 rows ordered by primary key, and writing
      batches of `insertStatements`.
    - `versions.base_id` is written `NULL` first and set in a second pass, so a version may precede its base.
  - `class CopyTargetError extends Error {}`.
  - `copyFiles( db, from: FileStore, to: FileStore ): Promise<number>`. It copies every hash in `files` that `to` lacks,
    and returns how many.
- **Produces, CLI:** `hdp-copy --from <url> --to <url> [--files-from <directory> --files-to <directory>]`.
  - It prints `Copied <n> rows in <t> tables; <f> files.`
  - Exit codes: 1 on `CopyTargetError`, with its message; 2 on usage.
  - It never prints either URL.

- [ ] **Step 1: Write the failing tests**

```js
eachDatabase( "Copy", ( target ) => {
    it( "copies every table from SQLite, identities and bases included", async () => {
        const source = await openDatabase( "sqlite::memory:" );
        await migrateSchema( source );
        await migrateImported( source, memoryStore(), stageImports() );
        const counts = await copyDatabase( source, target() );
        for ( const table of TABLES ) {
            assert.deepEqual( await rows( target(), table ), await rows( source, table ), table );
        }
        assert.ok( counts.items > 0 );
    } );
    it( "refuses a target that already holds data", async () => {
        // The first test filled the target.
        const source = await openDatabase( "sqlite::memory:" );
        await migrateSchema( source );
        await assert.rejects( copyDatabase( source, target() ), { name: "CopyTargetError" } );
    } );
} );
it( "copies the files a database names, and only the missing ones", async () => {
    const db = await openDatabase( "sqlite::memory:" );
    await migrateSchema( db );
    const from = memoryStore();
    const to = memoryStore();
    await storeFile( db, from, Buffer.from( "a" ), "text/plain" );
    const shared = await storeFile( db, from, Buffer.from( "b" ), "text/plain" );
    await to.put( Buffer.from( "b" ) );
    assert.equal( await copyFiles( db, from, to ), 1 );
    assert.equal( await to.has( shared ), true );
} );
```

`rows( db, table )` reads every column and sorts the rows in JavaScript by their primary key. A copy is equal when the
rows are equal, whatever order a database returns them in.

`cli-copy.test.js` covers three cases:
- SQLite file to SQLite file exits 0;
- a non-empty target exits 1;
- the output contains neither URL.

- [ ] **Step 2: Run them**

Run: `npm test --workspace packages/data`, with `HDP_TEST_POSTGRES_URL` set.
Expected: FAIL. `#copy` does not exist.

- [ ] **Step 3: Implement `#copy` and `hdp-copy`, and add the README section "Copying a database"**

- [ ] **Step 4: Run the whole suite**

Run: `npm ci && npm run fixtures:fetch && npm run lint && npm test`, with `HDP_TEST_POSTGRES_URL` set.
Expected: PASS on both databases; 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/data README.md
git commit -m "feat(data): copy a whole database from one driver to the other — hdp-copy (HEL-29)"
```

---

## Deliberately not in this plan

- **Editing, review, releases beyond the migrated ones, promotion, the changelog written while editing, and approved
  changes reaching development.** These are plan 6. The schema already has what they need: items with revisions,
  changelog origins, releases and bases.
- **The workbook route into development** (§7.11), which replaces a development version's content. `storeContent` is
  its storage primitive; the route, with its changelog, is plan 6.
- **D1 and R2/S3.** These are plan 7's gateways, and they arrive as a third driver and a third file store.
- **Generated files** (§7.9). They are made on first publication (§7.7), so no XSD is stored here.
- **A combined test version ahead of production.** On the day this was measured, 1.5.33 was in both (HEL-7). The
  per-list comparison of decision 10 covers that case anyway.
