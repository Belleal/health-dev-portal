# Plan 6a — Editing a development version, the changelog written while editing, and approved changes reaching development

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an editor can change a development version item by item, the portal checks every change and writes the
changelog as it goes, and an approved change in implementation reaches the development version — the first half of the
lifecycle (design record §7). Plan 6b adds review, releases, promotion and pending changes in implementation.

**Architecture:**
- **Items are the unit of editing.** Plan 5 stores a version's content one item per message, element, condition,
  entry or rule. An edit names an item by its number and the revision it was made against, and changes that item
  alone; every other item keeps its number and revision. A whole new content (the workbook route) is matched to the
  stored items by identity, so it too changes only what differs.
- **Derived content is recomputed after every edit, by the importer's own code.** Conditions are parsed and bound,
  blueprints bound, key types inferred, and every check that applies to content (not to a workbook's layout) runs again.
  `checkContent` in the importer becomes the one place these happen; the module importer calls it too.
- **The changelog is a difference.** `compareContents` in `spec-model` compares a version with its base identity by
  identity and proposes a category for each difference. The data layer keeps one detected entry per difference and
  carries the editor's corrections by the difference's key.
- **Approved changes reach development** as differences between an implementation version's content before and after:
  each is applied where the development version has not touched that item since its base, and recorded as a conflict
  where it has.

**Tech Stack:** Node 24, CommonJS, `node --test`; SQLite and PostgreSQL as in plan 5. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md):
§3.2; §4.3 (identity); §4.7; §5.3–§5.4 (checks on every edit); **§7.1** (a next version starts at any time);
**§7.4** (two people editing one version); **§7.5** (the changelog); **§7.8** (approved changes reach development);
§7.11 (defects inherited, the workbook route).

Builds on plan 5 (HEL-29). Tracking: **HEL-30**.

## Decisions this plan takes

Reject any at review, before Task 1.

1. **Only development versions are edited in plan 6a.** `applyEdits` refuses any other stage. Changes in implementation
   are kept apart from the approved content until approved (§7.4); that overlay is plan 6b's, with the review rounds it
   belongs to.
2. **An edit is one of four operations on an item**, each carrying the revision it was made against:
   - `{ op: "update", item, revision, data }` replaces the item's own fields (never its children);
   - `{ op: "insert", kind, parent, position, data }` adds an item under `parent` (`null` at the top) at `position`;
   - `{ op: "remove", item, revision }` removes the item and everything under it;
   - `{ op: "move", item, revision, parent, position }`.

   A batch of edits is all or nothing. An edit whose revision is not the stored one is refused with `EditConflictError`
   naming the item, and nothing of the batch is written (§7.4: "nothing is overwritten unseen"). An edited item's
   revision goes up by one; a moved item is edited, its shifted siblings are not.

   Bindings are derived and never edited. A code list's own item is updated, never added, removed or moved. A column
   keeps its place while the list has entries: each entry's values follow the columns by place, so a column added,
   removed or moved shifted every value under another title (final review). Moving the values with a column is the
   editing screens' (plan 10).
3. **Item numbers are stable.** An inserted item takes the version's next number, `versions.next_item_no`, never one
   used before: taken from the highest left, a number a removal freed went to the next insert at revision 1, and an edit
   made against the removed item landed on the new one (final review). Order comes from
   `position_no` (plan 5's decoder already sorts by it). Siblings after an insert, remove or move get new positions, not
   new numbers, and their revisions stay — a position is not content.
4. **An item's key** identifies it across versions and across a content replacement:

   | Kind | Key |
   |---|---|
   | message | `message:<code>` |
   | element | `element:<message code>:<identity>#<occurrence>`; with no identity, `element:<parent key>@<position>` |
   | condition, dictionary, rule | `<kind>:<id or abbreviation>` |
   | list, column, entry | `list:<id>`, `column:<title>`, `entry:<key>#<occurrence>` |

   `occurrence` counts from 1 among items of that kind and identity in that scope, in document order, so the two
   `contents/note@value` of e-Examination 1.3.10 (HEL-19) are `#1` and `#2`. A repeated code, ID, abbreviation or
   title keeps the plain key for its first and takes `#2`, `#3`… after: a repeat is reported and loaded as published, and
   under one key a Map kept only the last, so a save that changed nothing deleted the first (found in Task 5). Bindings
   are derived and have no key in a difference; stored, they are matched by their identity and occurrence like any item,
   so an unchanged save churns none (Task 3).
5. **`checkContent( kind, content, targets )` in the importer** returns the content with its derived parts recomputed
   and the model's anomalies:
   - **module:** `validateMessageTree` per message; unknown, duplicate and empty conditions; each condition parsed,
     printed, bound and type-checked (`importConditions`); blueprints bound and their fields checked when a catalogue is
     given; `linkModule` and `linkConditions` against `targets.codeLists` and `targets.rules`; and what the sheet readers
     check as they read a row — tags (missing, invalid, non-Latin), names, message codes and pairing;
   - **code list:** duplicate keys; an entry valid until before its since; `keyType` recomputed;
   - **rules:** duplicate rules and a malformed rule ID; an active rule without a definition; `linkRules` against CL999
     when a target has it.

   The row checks use the readers' own predicates, and a test compares `checkContent` with the importer on all 12
   published workbooks, type by type and row by row (final review: eight row checks were missing, and the comparison
   found a ninth, the empty condition). `importModuleWorkbook` shares the stage after the trees are built
   (`checkModuleLanguage`), so a workbook and an edit are checked by the same code.
6. **An edited version's anomalies are the model's.** A version started from a defective one inherits its anomalies
   (§7.11). The first check after an edit replaces them with `checkContent`'s, so anomalies that describe the source
   workbook's layout — fills, indentation, sheets — go, and the model's — a repeated identity or key, a value that is no
   key — stay until fixed. Each anomaly is mapped to an item by its source as in plan 5, or else by the identity, key or
   ID in its details.
7. **Targets are resolved as the version resolves** (§4.8): each code list it names and the rules, in its stage or
   further on, and the stored catalogue. A frozen list version is cached in memory by its ID — it never changes — so
   CL011's 39,005 entries are read once per process, not once per edit.
8. **Differences** (`compareContents( kind, base, current )` in `spec-model`) are one per item key and aspect. The
   aspect is `added`, `removed`, `moved`, or the name of a field that changed. Each has before and after values, and a
   proposed category (§7.5; *dropped-plan* is never proposed):

   | Target | Breaking | Non-breaking |
   |---|---|---|
   | message | removed; `address`, `direction`, `sender`, `recipient` or `pairedWith` changed; `lifecycle` to `withdrawn` | added; `title`; any other lifecycle |
   | element | removed; added when required (`R` with minimum above 0); minimum raised or maximum lowered; requirement to `R`; `dataType`, `tag`, `attribute` or `codeList` changed; `constraint` narrowed (a length tightened or added, a charset or format added or changed); `fixedValue` added or changed; a rule or condition added; moved | added when optional; `name`, `description`, `defaultValue`; anything widened or removed not listed as breaking |
   | condition | added; text changed | removed |
   | entry | removed; `validUntil` set | added; any other field |
   | column / list | column removed; `keyType` changed; status to `removed` | column added; any other field |
   | rule | added; removed; definition or `errorCode` changed | `lifecycle` to `withdrawn` |
   | dictionary | — | everything |

   §7.5 names a removed rule breaking; a new rule constrains senders and is proposed breaking too, as a plan call the
   editor corrects at will. A moved element is breaking (Boris, 2026-11-05): the XSDs are sequences in workbook row
   order (§4.10), so a move changes what a valid message is. "Moved" is a changed parent, or a place outside the longest
   run of siblings kept in their old order, so an insertion moves no one and a swap of two moves one.

   **Never compared:**
   - `source`, `depth` and `path`, which say where an item was read or sits, not what it says;
   - a message's `changedInVersion`, the tab colour's claim;
   - a condition's `parsed` and `printed`, which are derived from its `text` — conditions are compared by `text`.

   Within one item, aspects follow the order of the item's own fields.
9. **The changelog store** keeps one `detected` entry per difference, keyed `<item key>|<aspect>` (`difference_key`,
   new column). After every change it is reconciled (§7.5):
   - a new difference adds a detected entry;
   - a difference that changed updates the entry's before and after, keeping the editor's text and category;
   - a difference that is gone removes a `detected` entry, but only flags (`flagged = 1`) an entry the editor wrote or
     edited;
   - an editor's change makes the entry `edited`; a dropped entry stays, `dropped = 1`.
10. **Conflicts are rows** (`conflicts`, new table): the development version, the item key, the base's, the upstream's
    and the development's data. Plan 6b refuses submission while a version has one.
11. **Migration `0002-editing`.**
    - **New columns:** `changelog_entries.difference_key` and `changelog_entries.flagged`, and
      `versions.next_item_no` (decision 3, set from the stored rows), added with `ALTER TABLE … ADD COLUMN`, which
      SQLite and PostgreSQL read alike. `difference_key` is unique per version, in a partial index, so two refreshes of
      one content cannot both enter a difference.
    - **New table:** `conflicts`, which `TABLES` gains.
    - **`write_guards` recreated** with a third check, `edit_guard`. SQLite cannot add a constraint to an existing
      table, and the table is always empty, so dropping and recreating it loses nothing.
12. **This plan closes plan 5's "Minor 16".** `storeContent` stops renumbering items and resetting revisions, so §7.4's
    revision check survives the workbook route.

## Global Constraints

- **Node 24**, CommonJS, `node --test`.
- **House style:** four-space indent, double quotes, semicolons, spaces inside brackets; JSDoc on everything exported;
  model shapes in `packages/spec-model/model/definitions.types.js`, data-layer shapes in
  `packages/data/store/definitions.types.js`; `#alias` inside a package, the `exports` map across.
- **`spec-model` stays pure:** no `node:` module, no I/O, no dependency.
- **The SQL subset of design record §3.2:**
  - `?` placeholders;
  - `TEXT` and `INTEGER` columns;
  - never ordering by text;
  - at most 100 parameters per statement;
  - batches, not transactions;
  - a write computed from content read before its batch carries the lock, the frozen guard and the stale guard.
- **Every test of the data layer runs on SQLite and PostgreSQL** (`eachDatabase`).
- **No new dependency.**
- **Never commit unpublished specification data.** Fixtures are synthetic or fetched public files.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Every new `.js` file begins with the EUPL block** of `packages/importer/read/raw.js`, lines 1–16, verbatim.
- **Code with backslashes or regular expressions is written with the Write and Edit tools.**

## Review Focus

1. **Two editors change one element at once.**
   - Expected: the second edit is refused with `EditConflictError`, and nothing of its batch is written.
   - → Task 5, "refuses an edit made against an older revision, writing nothing".
2. **An element inserted in the middle of a message.**
   - Expected: every other item keeps its number and revision, and the order holds on both databases.
   - → Task 5, "inserts in place, renumbering nothing".
3. **An edit undone, and an explanation the editor wrote for it.**
   - Expected: the detected entry goes; an entry the editor wrote or edited stays, flagged.
   - → Task 6, "removes a detected entry whose difference is gone, and flags an edited one".
4. **Repeated identities (HEL-19) and an element without identity, in a replacement and in a carried change.**
   - Expected: matched by occurrence and by position; nothing throws.
   - → Task 3, "matches repeated identities by occurrence".
5. **An approved upstream change to an element the development version also changed.**
   - Expected: a conflict with all three versions of the data; the development item untouched; untouched items
     updated.
   - → Task 8, "applies a change the development version has not touched, and records a conflict where it has".

## File map

| File | Responsibility |
|---|---|
| `packages/spec-model/model/differences.js` | `itemKeys`, `compareContents` |
| `packages/spec-model/model/definitions.types.js` | `Difference` |
| `packages/importer/importer/check-content.js` | `checkContent` |
| `packages/importer/importer/module-importer.js` | Uses `checkContent` after the trees |
| `packages/data/store/schema.js` | Migration `0002-editing`; `TABLES` gains `conflicts` |
| `packages/data/store/item-diff.js` | `keyRows`, `diffRows` |
| `packages/data/store/versions.js` | `storeContent` replaced by identity; `loadItems` |
| `packages/data/store/targets.js` | `loadTargets` |
| `packages/data/store/editing.js` | `applyEdits`, `recheckVersion`, `EditConflictError` |
| `packages/data/store/changelog.js` | `refreshChangelog`, `editChangelogEntry`, `dropChangelogEntry`, `addChangelogEntry` |
| `packages/data/store/development.js` | `startDevelopment`, `loadIntoDevelopment` |
| `packages/data/store/carry.js` | `carryChange`, `listConflicts`, `resolveConflict` |

---

### Task 1: Differences and their proposed categories

**Files:**
- Create: `packages/spec-model/model/differences.js`; test `packages/spec-model/test/differences.test.js`.
- Modify: `packages/spec-model/model/definitions.types.js`; `packages/spec-model/package.json` (export and import
  `differences`).

**Interfaces:**
- **Produces:**
  - Typedef `Difference { key: string, target: string, identity: string|null, aspect: string, before: *, after: *,
    category: string }`. `target` is the item kind, and `key` is the item key of decision 4 plus `|<aspect>`.
  - `itemKeys( kind: string, content: Object ): Map<string, {kind, identity, data, parent: string|null, position}>`:
    every keyed item of a content, keyed as in decision 4. `data` is the item's own fields, without children.
  - `compareContents( kind: string, base: Object|null, current: Object ): Difference[]`, in the current content's
    document order, and then removals in the base's. With no base, every item is `added`.

- [ ] **Step 1: Write the failing tests**

```js
const keys = ( differences ) => differences.map( ( d ) => [ d.key, d.category ] );

it( "keys repeated identities by occurrence, and an element without one by its place", () => {
    const content = moduleWith( [ field( "contents/note@value" ), field( "contents/note@value" ), field( null ) ] );
    assert.deepEqual( [ ...itemKeys( "module", content ).keys() ].filter( ( key ) => key.startsWith( "element:" ) ),
        [ "element:P001:contents#1", "element:P001:contents/note@value#1", "element:P001:contents/note@value#2", "element:element:P001:contents#1@2" ] );
} );
it( "proposes breaking for a raised minimum and non-breaking for a new description", () => {
    const base = moduleWith( [ field( "contents/lrn@value", { cardinality: { min: 0, max: 1 }, requirement: "O" } ) ] );
    const current = moduleWith( [ field( "contents/lrn@value", { cardinality: { min: 1, max: 1 }, requirement: "R", description: { bg: "ново", en: null } } ) ] );
    assert.deepEqual( keys( compareContents( "module", base, current ) ), [
        [ "element:P001:contents/lrn@value#1|requirement", "breaking" ],
        [ "element:P001:contents/lrn@value#1|cardinality", "breaking" ],
        [ "element:P001:contents/lrn@value#1|description", "non-breaking" ]
    ] );
} );
it( "proposes an optional addition non-breaking, a required one and a removal breaking", () => {
    const base = moduleWith( [ field( "contents/a@value" ) ] );
    const current = moduleWith( [ field( "contents/b@value", { requirement: "O", cardinality: { min: 0, max: 1 } } ), field( "contents/c@value" ) ] );
    assert.deepEqual( keys( compareContents( "module", base, current ) ), [
        [ "element:P001:contents/b@value#1|added", "non-breaking" ],
        [ "element:P001:contents/c@value#1|added", "breaking" ],
        [ "element:P001:contents/a@value#1|removed", "breaking" ]
    ] );
} );
it( "judges a constraint by whether it narrows", () => {
    const at = ( constraint ) => moduleWith( [ field( "contents/x@value", { constraint } ) ] );
    const one = ( a, b ) => compareContents( "module", at( a ), at( b ) )[ 0 ].category;
    assert.equal( one( { raw: "max=36", maxLength: 36 }, { raw: "max=20", maxLength: 20 } ), "breaking" );
    assert.equal( one( { raw: "max=20", maxLength: 20 }, { raw: "max=36", maxLength: 36 } ), "non-breaking" );
    assert.equal( one( null, { raw: "chars=n", charset: "n" } ), "breaking" );
    assert.equal( one( { raw: "chars=n", charset: "n" }, null ), "non-breaking" );
} );
it( "compares code lists entry by entry, and a withdrawn entry is breaking", () => {
    const base = listWith( [ entry( "1" ), entry( "2" ) ] );
    const current = listWith( [ entry( "1", { validUntil: "1.5.34" } ), entry( "3" ) ] );
    assert.deepEqual( keys( compareContents( "code-list", base, current ) ), [
        [ "entry:1#1|validUntil", "breaking" ], [ "entry:3#1|added", "non-breaking" ], [ "entry:2#1|removed", "breaking" ]
    ] );
} );
it( "compares rules, and proposes an added rule breaking", () => {
    assert.deepEqual( keys( compareContents( "rules", rulesWith( [ "RL001" ] ), rulesWith( [ "RL001", "RL002" ] ) ) ), [ [ "rule:RL002|added", "breaking" ] ] );
} );
it( "finds nothing between equal contents, and never proposes dropped-plan", () => {
    assert.deepEqual( compareContents( "module", moduleWith( [ field( "contents/a@value" ) ] ), moduleWith( [ field( "contents/a@value" ) ] ) ), [] );
} );
```

`moduleWith`, `field`, `listWith`, `entry` and `rulesWith` are builders local to the test. `field( identity, extra )`
is an `R 1..1` String field under a `contents` group of message P001.

- [ ] **Step 2: Run them.** Run: `npm test --workspace packages/spec-model`. Expected: FAIL, `./differences` is not
  exported.
- [ ] **Step 3: Implement `itemKeys` and `compareContents` with the rules of decision 8, and the typedef.**
  A field compared is a top-level property of the item's own fields, by deep equality. `cardinality`, `requirement`
  and `constraint` are judged as the table says; any other field takes its row's category.
- [ ] **Step 4: Run them.** Run: `npm test --workspace packages/spec-model`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(spec-model): differences between two contents, and their proposed categories (HEL-30)`

---

### Task 2: One check for a workbook and an edit

**Files:**
- Create: `packages/importer/importer/check-content.js`; test `packages/importer/test/check-content.test.js`.
- Modify:
  - `packages/importer/importer/module-importer.js`, which uses `checkContent` for everything after the trees;
  - `packages/importer/package.json`, which exports `./check`.

**Interfaces:**
- **Produces:** `checkContent( kind: string, content: Object, targets: CheckTargets ): { content: Object, anomalies: Anomaly[] }`.
  - The typedef is `CheckTargets { codeLists: CodeList[]|null, rules: RulesVersion|null, catalogue: BlueprintCatalogue|null }`.
    `null` means "not checked against".
  - The returned content has `conditions` (parsed, printed), `conditionBindings`, `blueprintBindings` and `list.keyType`
    recomputed; everything else is as given.
  - **Pure.** It reuses `importConditions`, `bindBlueprints`, `checkBlueprintFields`, `validateMessageTree`,
    `linkModule`, `linkConditions` and `linkRules`.

- [ ] **Step 1: Write the failing tests**

```js
it( "checks a module the way the importer does", () => {
    const content = synthetic();    // a module whose element names condition CDP09, which does not exist, and repeats an identity
    const { anomalies } = checkContent( "module", content, { codeLists: null, rules: null, catalogue: null } );
    assert.deepEqual( anomalies.map( ( a ) => a.type ).sort(), [ "duplicate-identity", "unknown-condition" ] );
} );
it( "recomputes a condition's parsed form and bindings from its text", () => {
    const content = synthetic();
    content.conditions[ 0 ].text = "IF 'contents.lrn' IS NULL\nTHEN 'contents.note' IS required";
    const checked = checkContent( "module", content, { codeLists: null, rules: null, catalogue: null } ).content;
    assert.equal( checked.conditions[ 0 ].printed, "IF 'contents.lrn' IS NULL THEN 'contents.note' IS required" );
    assert.equal( checked.conditionBindings.length, 1 );
} );
it( "finds a repeated key and recomputes a list's key type", () => {
    const { content, anomalies } = checkContent( "code-list", listWithKeys( [ "1", "2", "2" ] ), { codeLists: null, rules: null, catalogue: null } );
    assert.equal( content.list.keyType, "integer" );
    assert.deepEqual( anomalies.map( ( a ) => [ a.type, a.details.key ] ), [ [ "duplicate-key", "2" ] ] );
} );
it( "checks a value against the list it names, through the targets", () => {
    const { anomalies } = checkContent( "module", fixedTo( "CL009", "99" ), { codeLists: [ list( "CL009", [ "1", "2" ] ) ], rules: null, catalogue: null } );
    assert.deepEqual( anomalies.map( ( a ) => a.type ), [ "fixed-value-not-a-key" ] );
} );
```

`public-eprescription.test.js` and `public-set.test.js` pass unchanged: the importer's results do not move.

- [ ] **Step 2: Run them.** Run: `npm test --workspace packages/importer`. Expected: FAIL, `#check-content` is
  missing.
- [ ] **Step 3: Implement `checkContent`, and make `importModuleWorkbook` call it after the trees.** Its returned
  anomalies come in the order the importer emitted them before, so no existing assertion moves.
- [ ] **Step 4: Run them.** Run: `npm run fixtures:fetch && npm test --workspace packages/importer`. Expected: PASS,
  226 + 4 tests.
- [ ] **Step 5: Commit.** `refactor(importer): one checkContent for a workbook and an edit (HEL-30)`

---

### Task 3: Replacing a version's content by identity

**Files:**
- Create: `packages/data/store/item-diff.js`; test `packages/data/test/item-diff.test.js`.
- Modify:
  - `packages/data/store/schema.js`, with migration `0002-editing`;
  - `packages/data/store/versions.js`, where `storeContent` now replaces by identity, and which gains `loadItems`;
  - `packages/data/test/schema.test.js`, `packages/data/test/versions.test.js`.

**Interfaces:**
- **Consumes:** `itemKeys` (Task 1); `encodeContent` and `decodeContent` (plan 5).
- **Produces:**
  - Migration `0002-editing`:
    - `changelog_entries.difference_key TEXT`;
    - `changelog_entries.flagged INTEGER NOT NULL DEFAULT 0 CHECK ( flagged IN ( 0, 1 ) )`;
    - `conflicts ( id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions, item_key TEXT NOT NULL,
      base_data TEXT, upstream_data TEXT, current_data TEXT, created_at TEXT NOT NULL )`.

    `TABLES` gains `conflicts`.
  - `keyRows( kind, rows: ItemRow[] ): Map<string, ItemRow>`, which keys stored rows as decision 4 does.
  - `diffRows( kind, stored: ItemRow[], content ): { updates, inserts, deletes, moves }`. Rows are matched by key:
    - a matched row whose data differs is an update, revision + 1;
    - one whose parent or position differs is a move;
    - unmatched new items are inserts, numbered from the version's `next_item_no`;
    - unmatched stored rows are deletes.

    Bindings are matched by identity and occurrence, like any item.
  - `storeContent( db, versionId, content, anomalies )` writes `diffRows`' result behind the guard. It keeps its
    signature; it no longer renumbers.
  - `loadItems( db, versionId ): Promise<ItemRow[]>`, with `revision`, in `item_no` order.

- [ ] **Step 1: Write the failing tests**

```js
it( "keeps every unchanged item's number and revision when content is replaced", async () => {
    const id = await storeVersion( db(), { spec: "e-prescription", kind: "module", number: null, stage: "development", content: moduleVersion( null ) } );
    const before = await loadItems( db(), id );
    const changed = moduleVersion( null );
    changed.messages[ 0 ].elements[ 0 ].children[ 0 ].description = { bg: "ново", en: null };
    await storeContent( db(), id, changed, [] );
    const after = await loadItems( db(), id );
    const lrn = ( rows ) => rows.find( ( row ) => row.identity === "contents/lrn" );
    assert.deepEqual( [ lrn( after ).item_no, lrn( after ).revision ], [ lrn( before ).item_no, 2 ] );
    assert.ok( after.filter( ( row ) => row.kind === "message" ).every( ( row, i ) => row.revision === 1 && row.item_no === before.filter( ( r ) => r.kind === "message" )[ i ].item_no ) );
    assert.deepEqual( ( await loadVersion( db(), id ) ).content, changed );
} );
it( "matches repeated identities by occurrence", () => {
    // moduleVersion() has two contents/note@value; the second changes, the first does not.
    const changed = moduleVersion( null );
    changed.messages[ 0 ].elements[ 0 ].children[ 3 ].requirement = "O";
    const { updates } = diffRows( "module", rowsOf( moduleVersion( null ) ), changed );
    assert.deepEqual( updates.map( ( row ) => [ row.identity, row.position_no ] ), [ [ "contents/note@value", 3 ] ] );
} );
it( "numbers an inserted item after the highest, and deletes what is gone", () => {
    const stored = rowsOf( moduleVersion( null ) );
    const changed = moduleVersion( null );
    changed.messages.pop();
    changed.dictionary.push( { abbreviation: "НЗИС", name: { bg: "Система", en: null }, description: { bg: null, en: null }, source: null } );
    const { inserts, deletes } = diffRows( "module", stored, changed );
    assert.deepEqual( inserts.map( ( row ) => [ row.kind, row.identity, row.item_no ] ),
        [ [ "dictionary", "НЗИС", Math.max( ...stored.map( ( row ) => row.item_no ) ) + 1 ] ] );
    assert.deepEqual( deletes.filter( ( row ) => row.kind === "message" ).map( ( row ) => row.identity ), [ "P002" ] );
} );
```

`rowsOf( content )` is `encodeContent( "module", content ).items` with `revision: 1`: what plan 5 stores.

- [ ] **Step 2: Run them.** Run: `HDP_TEST_POSTGRES_URL=… npm test --workspace packages/data`. Expected: FAIL.
- [ ] **Step 3: Implement migration `0002-editing`, `keyRows`, `diffRows`, the new `storeContent` and `loadItems`.**
- [ ] **Step 4: Run them.** Run: `HDP_TEST_POSTGRES_URL=… npm test --workspace packages/data`. Expected: PASS on both
  databases. Every plan 5 test also passes: `storeContent` keeps its signature and its frozen-version refusal.
- [ ] **Step 5: Commit.** `feat(data): content replaced by identity, numbers and revisions kept (HEL-30)`

---

### Task 4: What an edit is checked against

**Files:**
- Create: `packages/data/store/targets.js`; test `packages/data/test/targets.test.js`.

**Interfaces:**
- **Consumes:** `resolveVersion`, `loadVersion`, `loadCatalogue` (plan 5); `CheckTargets` (Task 2).
- **Produces:** `loadTargets( db, store, versionId ): Promise<CheckTargets>`.
  - `codeLists` holds the list versions `resolveVersion` names, with their content.
  - `rules` is the rules version it names; for a rules version, `codeLists` holds CL999 as resolved for it.
  - `catalogue` is the stored one, or `null`.
  - Frozen versions are cached in a module-level `Map` by version ID, capped at 50 entries (decision 7).

- [ ] **Step 1: Write the failing tests**

```js
it( "gives a development module the lists in development or further on, and the catalogue", async () => {
    // CL009 has a development version; CL011 is in production only. The module names both and RL001.
    const targets = await loadTargets( db(), store, developmentModule );
    assert.deepEqual( targets.codeLists.map( ( list ) => [ list.id, list.entries.length ] ), [ [ "CL009", 3 ], [ "CL011", 1 ] ] );
    assert.equal( targets.rules.rules[ 0 ].id, "RL001" );
    assert.deepEqual( targets.catalogue, catalogue );
} );
it( "reads a frozen list once, however many edits ask", async () => {
    let reads = 0;
    const counting = { ...db(), all: ( sql, params ) => { reads += /FROM items/.test( sql ) && params[ 0 ] === frozenList ? 1 : 0; return db().all( sql, params ); } };
    await loadTargets( counting, store, developmentModule );
    await loadTargets( counting, store, developmentModule );
    assert.equal( reads, 1 );
} );
```

- [ ] **Step 2–4: Run them; implement `loadTargets`; run them.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): an edit is checked against the lists and rules its version reads (HEL-30)`

---

### Task 5: Editing

**Files:**
- Create: `packages/data/store/editing.js`; test `packages/data/test/editing.test.js`.
- Modify: `packages/data/store/definitions.types.js` (`Edit`, `EditResult`); `packages/data/package.json`.

**Interfaces:**
- **Consumes:** Tasks 2–4; `guardStatements`, `staleStatement` (plan 5).
- **Produces:**
  - `applyEdits( db, store, versionId, edits: Edit[] ): Promise<EditResult>`, where
    `EditResult { revisions: Object<number, number>, inserted: number[], anomalies: Anomaly[] }`.
    1. It loads the rows.
    2. It applies the edits in memory, in order.
    3. It decodes, runs `checkContent` against `loadTargets`, and folds the derived parts back into rows: conditions
       updated by key, bindings replaced, the list's key type updated.
    4. It writes everything in one batch:
       - `guardStatements`;
       - `staleStatement` on the content hash it read;
       - one stale check per edited item's revision;
       - the row changes;
       - the anomalies;
       - the new content hash, which is `encodeContent`'s hash of the decoded content, so equal content hashes alike
         whatever its history.
    5. A stale *version* (another edit touched other items) is retried, three times at most. A stale *item* is refused
       with `EditConflictError`.
  - `recheckVersion( db, store, versionId ): Promise<Anomaly[]>`: the same, with no edits. The workbook route and a
    carried change call it.
  - `class EditConflictError extends Error { version: string, item: number, revision: number }`.
  - An edit to a version that is not in development throws a `TypeError` (decision 1).

  An item's revision is checked with a third reason, `'edit'`:
  `INSERT INTO write_guards ( reason ) SELECT 'edit' FROM items WHERE version_id = ? AND item_no = ? AND revision <> ?`.
  Migration `0002-editing` recreates `write_guards` with
  `CONSTRAINT edit_guard CHECK ( reason IS NULL OR reason <> 'edit' )` beside the other two (decision 11). It is
  distinct from the version-level `stale_guard`, so a stale item is told apart from a stale version. A batch can name
  several items, so `applyEdits` checks them one at a time, in edit order, before the batch, to say which item was stale.
  The batch's own checks are what make the refusal atomic.

- [ ] **Step 1: Write the failing tests**

**Setup.**
- `id` is a development version stored from `moduleVersion( null )`; `production` is a production version of the same
  spec.
- `lrnNo`, `contentsNo`, `noteNo` and `conditionNo` are the item numbers of `contents/lrn`, `contents`, the first
  `contents/note@value` and CDP01, read with `loadItems`.
- `lrn` is `contents/lrn`'s own fields.
- `field( identity )` is an `R 1..1` String field.
- Each test starts from a fresh version.

```js
it( "updates one item, raising its revision and no other", async () => {
    const before = await loadItems( db(), id );
    const { revisions } = await applyEdits( db(), store, id, [ { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "ново", en: null } } } ] );
    assert.deepEqual( revisions, { [ lrnNo ]: 2 } );
    const changedRows = ( await loadItems( db(), id ) ).filter( ( row ) => row.revision !== before.find( ( r ) => r.item_no === row.item_no ).revision );
    assert.deepEqual( changedRows.map( ( row ) => row.item_no ), [ lrnNo ] );
} );
it( "inserts in place, renumbering nothing", async () => {
    const before = await loadItems( db(), id );
    const { inserted } = await applyEdits( db(), store, id, [ { op: "insert", kind: "element", parent: contentsNo, position: 1, data: field( "contents/new@value" ) } ] );
    const after = await loadItems( db(), id );
    assert.equal( inserted[ 0 ], Math.max( ...before.map( ( row ) => row.item_no ) ) + 1 );
    for ( const row of before ) {
        assert.equal( after.find( ( r ) => r.item_no === row.item_no ).revision, row.revision, row.identity );
    }
    assert.deepEqual( ( await loadVersion( db(), id ) ).content.messages[ 0 ].elements[ 0 ].children.map( ( e ) => e.identity ).slice( 0, 3 ),
        [ "contents/lrn", "contents/new@value", "contents/dose@value" ] );
} );
it( "refuses an edit made against an older revision, writing nothing", async () => {
    await applyEdits( db(), store, id, [ { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "първа", en: null } } } ] );
    await assert.rejects( applyEdits( db(), store, id, [
        { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "втора", en: null } } },
        { op: "remove", item: noteNo, revision: 1 }
    ] ), { name: "EditConflictError", item: lrnNo, revision: 1 } );
    assert.equal( ( await loadItems( db(), id ) ).some( ( row ) => row.item_no === noteNo ), true );
} );
it( "rechecks after an edit: removing a condition another element names blocks", async () => {
    const { anomalies } = await applyEdits( db(), store, id, [ { op: "remove", item: conditionNo, revision: 1 } ] );
    assert.ok( anomalies.some( ( a ) => a.type === "unknown-condition" && a.level === "blocking" ) );
} );
it( "drops the workbook's layout anomalies at the first check, and keeps the model's", async () => {
    // The version was stored with an inherited unknown-fill (layout) and duplicate-identity (model): moduleVersion() repeats contents/note@value.
    await applyEdits( db(), store, id, [ { op: "update", item: lrnNo, revision: 1, data: { ...lrn, description: { bg: "ново", en: null } } } ] );
    const types = ( await loadAnomalies( db(), id ) ).map( ( a ) => a.type );
    assert.ok( types.includes( "duplicate-identity" ) );
    assert.ok( !types.includes( "unknown-fill" ) );
} );
it( "refuses to edit a version outside development", async () => {
    await assert.rejects( applyEdits( db(), store, production, [ { op: "remove", item: 2, revision: 1 } ] ), { name: "TypeError" } );
} );
```

- [ ] **Step 2–4: Run them; implement; run them.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): editing a development version item by item, checked on every edit (HEL-30)`

---

### Task 6: The changelog written while editing

**Files:**
- Modify: `packages/data/store/changelog.js`; `packages/data/store/editing.js`, where `applyEdits` and `recheckVersion`
  refresh the changelog; test `packages/data/test/live-changelog.test.js`.

**Interfaces:**
- **Consumes:** `compareContents` (Task 1); Task 5.
- **Produces:**
  - `refreshChangelog( db, versionId ): Promise<{added, updated, removed, flagged}>`. It compares the version with its
    base (none for a new spec) and reconciles its `detected`, `edited` and `editor` entries as decision 9 says, in one
    batch behind the guard and the stale check.
  - `editChangelogEntry( db, entryId, { category?, textBg?, textEn? } )`: a detected entry becomes `edited`.
  - `dropChangelogEntry( db, entryId )` and `restoreChangelogEntry( db, entryId )`.
  - `addChangelogEntry( db, versionId, { category, textBg, textEn, target?, identity? } ): Promise<string>`, with origin
    `editor`.
  - `loadChangelog` (plan 5) returns `flagged` as a boolean, as it already does `dropped`.

  All of them refuse a frozen version: `FrozenVersionError`.

- [ ] **Step 1: Write the failing tests**

```js
it( "writes a detected entry for each difference as the editor edits", async () => {
    await applyEdits( db(), store, development, [ await raiseMinimumOfLrn() ] );
    const entries = ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries;
    assert.deepEqual( entries.map( ( e ) => [ e.difference_key, e.category, e.origin ] ),
        [ [ "element:P001:contents/lrn#1|cardinality", "breaking", "detected" ] ] );
} );
const entryOf = async ( key ) => ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries.find( ( e ) => e.difference_key === key );
const LRN = "element:P001:contents/lrn#1|cardinality";

it( "keeps the editor's explanation and category when the same difference changes again", async () => {
    await editChangelogEntry( db(), ( await entryOf( LRN ) ).id, { category: "non-breaking", textBg: "Задължително поле" } );
    await applyEdits( db(), store, development, [ await raiseMaximumOfLrnToo() ] );
    const entry = await entryOf( LRN );
    assert.deepEqual( [ entry.origin, entry.category, entry.text_bg, entry.after_value !== null ], [ "edited", "non-breaking", "Задължително поле", true ] );
} );
it( "removes a detected entry whose difference is gone, and flags an edited one", async () => {
    await applyEdits( db(), store, development, [ await restoreLrnCardinality() ] );
    const entry = await entryOf( LRN );
    assert.deepEqual( [ entry.origin, entry.flagged ], [ "edited", true ] );
    await applyEdits( db(), store, development, [ await changeDoseName() ] );
    await applyEdits( db(), store, development, [ await restoreDoseName() ] );
    assert.equal( await entryOf( "element:P001:contents/dose@value#1|name" ), undefined );
} );
it( "keeps a dropped entry, marked dropped", async () => {
    await applyEdits( db(), store, development, [ await changeDoseName() ] );
    const dropped = await entryOf( "element:P001:contents/dose@value#1|name" );
    await dropChangelogEntry( db(), dropped.id );
    await applyEdits( db(), store, development, [ await unrelatedEdit() ] );
    assert.equal( ( await entryOf( "element:P001:contents/dose@value#1|name" ) ).dropped, true );
} );
it( "keeps imported entries as they are", async () => {
    // A development workbook's own notes, attached by plan 5, are not differences and are never reconciled away.
    const imported = ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries.filter( ( e ) => e.origin === "imported" );
    await applyEdits( db(), store, development, [ await unrelatedEdit() ] );
    assert.deepEqual( ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries.filter( ( e ) => e.origin === "imported" ), imported );
} );
```

The tests run in order on one development version started from `moduleVersion()`, which is its base. The edit builders
are local, each `() => Promise<Edit>` reading the item's current revision:

| Builder | Edit |
|---|---|
| `raiseMinimumOfLrn` | `contents/lrn` from `1..1` to `2..2` |
| `raiseMaximumOfLrnToo` | `contents/lrn` from `2..2` to `2..3` |
| `restoreLrnCardinality` | `contents/lrn` back to `1..1` |
| `changeDoseName` | `contents/dose@value`'s `name.bg` changed |
| `restoreDoseName` | `contents/dose@value`'s `name.bg` back to the base's |
| `unrelatedEdit` | the dictionary entry's description changed |

- [ ] **Step 2–4: Run them; implement; run them.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): the changelog written while editing, corrections kept by difference (HEL-30)`

---

### Task 7: Starting a development version, and the workbook route

**Files:**
- Create: `packages/data/store/development.js`; test `packages/data/test/development.test.js`.

**Interfaces:**
- **Consumes:** Tasks 3, 5 and 6; `storeVersion`, `findVersion` (plan 5).
- **Produces:**
  - `startDevelopment( db, store, spec ): Promise<string>`. It copies the spec's most advanced version (implementation,
    else testing, else production) into a new development version: no number, `base` set, the content and its
    anomalies copied. It then rechecks it. A spec that already has a development version is refused with a
    `TypeError`.
  - `loadIntoDevelopment( db, store, spec, version: Object ): Promise<{anomalies}>`. The version is a module, rules or
    code-list content as the importer gives it. It replaces the development version's content by identity
    (`storeContent`), then rechecks and refreshes the changelog. With no development version yet, it starts one first.

    This is the workbook route of §7.11: until the editing screens exist, plan 9's staff page calls it.

- [ ] **Step 1: Write the failing tests**

```js
it( "starts from the most advanced version, its defects included", async () => {
    // e-Prescription: 1.5.1 in production, 1.6.0 in testing; 1.6.0 repeats contents/note@value.
    const id = await startDevelopment( db(), store, "e-prescription" );
    const started = await findVersion( db(), "e-prescription", { stage: "development" } );
    assert.deepEqual( [ started.id, started.number, started.base ], [ id, null, testing ] );
    assert.deepEqual( ( await loadVersion( db(), id ) ).content, { ...( await loadVersion( db(), testing ) ).content, version: null } );
    assert.ok( ( await loadAnomalies( db(), id ) ).some( ( a ) => a.type === "duplicate-identity" && a.level === "blocking" ) );
} );
it( "refuses a second development version", async () => {
    await assert.rejects( startDevelopment( db(), store, "e-prescription" ), { name: "TypeError" } );
} );
it( "loads a workbook into development, changing only what differs", async () => {
    const before = await loadItems( db(), development );
    const workbook = { ...( await loadVersion( db(), development ) ).content, changeNotes: [] };
    workbook.messages[ 0 ].elements[ 0 ].children[ 0 ].description = { bg: "от работната книга", en: null };
    await loadIntoDevelopment( db(), store, "e-prescription", workbook );
    const raised = ( await loadItems( db(), development ) ).filter( ( row ) => row.revision > ( before.find( ( r ) => r.item_no === row.item_no ) || { revision: 0 } ).revision );
    assert.deepEqual( raised.map( ( row ) => row.identity ), [ "contents/lrn" ] );
    assert.ok( ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries.some( ( e ) => e.difference_key === "element:P001:contents/lrn#1|description" ) );
} );
```

- [ ] **Step 2–4: Run them; implement; run them.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): start the next development version, and load a workbook into it (HEL-30)`

---

### Task 8: Approved changes reach development

**Files:**
- Create: `packages/data/store/carry.js`; test `packages/data/test/carry.test.js`.

**Interfaces:**
- **Consumes:** `itemKeys` (Task 1); Tasks 3, 5 and 6.
- **Produces:**
  - `carryChange( db, store, spec, before: Object, after: Object, upstreamId: string ): Promise<{applied: number, conflicts: number}>`.
    It takes the content of the version in implementation before and after an approved change (§7.8), and for each
    item key that differs:
    - **Development untouched:** if the development version's item equals `before`'s, the change is applied — set,
      inserted or removed.
    - **Development changed:** otherwise a `conflicts` row records the three data.

    It then sets the development version's `base` to `upstreamId`, rechecks it and refreshes its changelog. With no
    development version, it does nothing.

    Plan 6b calls it when the approver approves a change into implementation; plan 6a tests it directly.
  - `listConflicts( db, versionId ): Promise<Conflict[]>`, each with the development item's revision now.
  - `resolveConflict( db, store, conflictId, { choose: "upstream"|"current"|"combined", data?, revision } )`. It applies
    the chosen data as an edit (Task 5) against the revision the editor saw, refusing with `EditConflictError` if the
    item has changed since, and removes the conflict row. Against the revision at the moment of resolving, a choice
    overwrote an edit made since, unseen (final review).
  - Typedef `Conflict { id, version, key, base, upstream, current, revision }`.

  A carried item goes right after the sibling it follows upstream that development also has, else first: placed at its
  index upstream, it came in among development's own items and its changelog showed a move nobody made (final review).

- [ ] **Step 1: Write the failing tests**

```js
it( "applies a change the development version has not touched, and records a conflict where it has", async () => {
    // Implementation 1.6.0 changes contents/lrn's maxLength and contents/dose's name; development has edited contents/lrn only.
    const result = await carryChange( db(), store, "e-prescription", before, after, implementation );
    assert.deepEqual( result, { applied: 1, conflicts: 1 } );
    const [ conflict ] = await listConflicts( db(), development );
    assert.equal( conflict.key, "element:P001:contents/lrn#1" );
    assert.deepEqual( [ conflict.base.constraint.maxLength, conflict.upstream.constraint.maxLength, conflict.current.description.bg ], [ 36, 50, "редактирано" ] );
    assert.equal( ( await developmentContent() ).messages[ 0 ].elements[ 0 ].children[ 1 ].name.bg, after.messages[ 0 ].elements[ 0 ].children[ 1 ].name.bg );
} );
it( "adds nothing to the development changelog for an applied change, since its base now holds it", async () => {
    const keys = ( await loadChangelog( db(), "e-prescription" ) )[ 0 ].entries.map( ( e ) => e.difference_key );
    assert.ok( !keys.includes( "element:P001:contents/dose@value#1|name" ) );
} );
it( "resolves a conflict by the editor's choice", async () => {
    const [ conflict ] = await listConflicts( db(), development );
    await resolveConflict( db(), store, conflict.id, { choose: "upstream" } );
    assert.equal( ( await developmentContent() ).messages[ 0 ].elements[ 0 ].children[ 0 ].constraint.maxLength, 50 );
    assert.deepEqual( await listConflicts( db(), development ), [] );
} );
```

- [ ] **Step 2–4: Run them; implement; run them.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Full suite and commit.** Run: `npm ci && npm run fixtures:fetch && npm run lint && npm test`, with
  `HDP_TEST_POSTGRES_URL` set. Expected: PASS everywhere, lint 0.
  `feat(data): approved changes in implementation reach development, conflicts kept for the editor (HEL-30)`

---

## Deliberately not in this plan

These are plan 6b's:
- **Changes in implementation:** pending changes kept apart from the approved content (§7.4).
- **Review:** rounds, comments, submission and approval, and the submission refused for blocking anomalies or open
  conflicts.
- **Releases and promotion:** releases, promotion and all their rules (§7.1–§7.3, §7.6), version numbers (§7.2), and
  abandoning a release.

Two more belong to later plans:
- **The editing screens** (plan 10) and the staff page for the workbook route (plan 9).
- **Reading a single code list from a CSV or one-sheet workbook** (§7.11). `loadIntoDevelopment` already stores any
  code-list content; the file reader belongs with plan 9's upload page.
