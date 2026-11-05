# Plan 6b — Review, releases and promotion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** editors submit development versions as a release; the approver returns it with comments or approves it into
implementation, where further changes are kept apart until approved; the approver promotes releases to testing and
production under the rules of §7.1 and §4.8, fixes a version in testing, and abandons a release — every step recorded
with who and when. The second half of the lifecycle (design record §7); plan 6a built editing and the live changelog.

**Architecture:**
- **A release is a row with a status, and its review is rounds.** Each round records who submitted, the changelog of
  each version as submitted, the comments, and the decision. A version under review is read-only.
- **An implementation version holds two contents.** Its items are the pending content, edited as in development; a copy
  taken at each approval, `approved_items`, is the approved content that the backend team builds and that other specs
  read. A round in implementation approves the pending content, and carries the difference to development (plan 6a).
- **Every move goes through one check.** `checkMove` takes everything moving together — one release or several — and
  applies §7.1's line rules and §4.8's link rules to the state after the move. It refuses as a whole and names each
  version and rule.
- **Every write is one batch behind the lock and the guards** (§3.2), as in plan 5 and 6a; a new `review_guard` refuses
  an edit to a version under review even when the edit was computed before the submission.

**Tech Stack:** Node 24, CommonJS, `node --test`; SQLite and PostgreSQL as in plan 5. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md):
§4.8 (a module moves with what it needs); **§7.1** (stages, one line, fixes, abandoning); **§7.2** (numbers);
**§7.3** (releases); **§7.4** (review, changes in implementation, self-approval); **§7.6** (notice period, production,
expiry); §7.7 (freezing); §7.8 (approved changes reach development); §7.12 (Sofia dates); §10.1 (who and when).

Builds on plan 6a (HEL-30). Tracking: **HEL-32**.

## Decisions this plan takes

Reject any at review, before Task 1.

1. **The data layer records who, and checks no role.** Every function that changes the lifecycle takes
   `{ actor, now }`: `actor` is the caller's opaque ID of a person, `now` a `Date`. Plan 9 signs people in and decides
   who may call what (§10.1); a test passes both. `applyEdits` gains the same options and logs each batch's author,
   time and edits in `edit_log` (§10.1: "every edit's author and time … is recorded").
2. **A release's status** is `review`, `returned`, `accepted` or `abandoned` (`RELEASE_STATUS`, spec-model). It is
   `accepted` from its first approval on, and its stage is its versions'. Migrated releases are `accepted`.
3. **Rounds, comments and events are rows.**
   - `rounds ( id, release_id, round_no, submitted_by, submitted_at, decision, decided_by, decided_at )`;
   - `round_versions ( round_id, version_id, content_hash, changelog )`: the version's changelog entries, as
     submitted, in JSON;
   - `comments ( id, round_id, comment_no, version_id, target, text, author, created_at )`: `version_id` and `target`
     are `null` for the release as a whole; `target` is an item key (plan 6a, decision 4) or `changelog:<entry id>`;
   - `release_events ( id, release_id, event_no, event, actor, at, details )`: submitted, approved, returned,
     promoted, date set, fix created, abandoned, previous production retired.

   Order is by the integer `round_no`, `comment_no` and `event_no`, each taken as `MAX + 1` inside its `INSERT …
   SELECT`, as plan 6a's changelog entries are: never by text (§3.2).
4. **Approved content is a copy of the items** (`approved_items`, the items' columns without `revision`), written in the
   approval's batch by `INSERT INTO approved_items SELECT … FROM items WHERE version_id = ?`, and
   `versions.approved_hash` its content hash. An implementation version has pending changes exactly when its
   `content_hash` differs from its `approved_hash`. `loadApprovedContent` decodes it; `loadTargets` and resolution read
   it for a version in implementation, so a module never checks against a list's unapproved entries.
   - Rejected: a second version row for the pending changes, which fights the one-per-stage and one-number indexes;
     a JSON snapshot in the file store, which falls outside the approval's batch.
5. **What may be edited.** `applyEdits` and the changelog writers accept a version in development or implementation
   whose release is not under review; one under review is refused with `UnderReviewError`. The check runs before the
   batch and again inside it (`review_guard`), so an edit computed before a submission and landing after it writes
   nothing. A recheck, a refresh and a carried change are not edits and pass: approved changes still reach a version
   under review (§7.4).
6. **Numbers** (§7.2). `proposeNumber( numbers )` is the highest of a spec's numbers, retired ones included, with its
   last part raised by one, or `1.0.0` for a spec with none; `acceptsNumber( number, numbers )` accepts a dotted number
   above every one of them. `compareNumbers` moves from `data/store/changelog.js` to `spec-model/model/numbers.js`; the
   changelog re-exports it.
7. **Dates are Sofia's** (§7.12). `sofiaDate( now )` gives `yyyy-mm-dd` in Europe/Sofia; `addDays( date, days )` adds
   calendar days. `version_stages.entered_on`, `releases.planned_on` and `versions.expires_on` hold such dates.
8. **The move check** (`checkMove`, §7.1, §4.8). A move is `{ version, to }`; a fix's move to testing also names the
   version it `replaces`. Over the state after every move, it refuses with these rules:
   - `skip` — `to` is not the version's next stage;
   - `one-per-stage` — a spec would hold two versions in one stage;
   - `one-line` — a development version would enter implementation while its spec has a version in implementation or
     testing, after the move;
   - `link` — a module would carry a blocking anomaly from `linkModule` or `linkConditions` (§5.3) that it does not
     carry now, against what it will read in its new stage, counting what moves with it;
   - `key-type` — a code-list version whose key type differs from that of the version it replaces in its new stage,
     without a version of every module in that stage that names the list moving with it.

   It also warns, never refuses, for each module that will read a moving list and names something the list no longer
   has: a key in a fixed value or condition, a column (§4.8, "a list that moves shows its readers").
9. **Approval.** A first round moves the release's development versions into implementation, each with the number
   the approver gave or the one proposed; copies the approved content; and records what each resolves to. A later round
   approves pending changes, and adds any development version submitted with it. Each version whose approved content
   changed is carried to development with `carryChange` (plan 6a). A conflict it causes in a development version under
   review returns that version's release, with a comment naming the change (§7.4). Approval waits until the line is
   clear: `checkMove` refuses it otherwise, and the release stays under review.
   - **Self-approval** is a setting, `review.two-people`, off by default (§7.4): when it is `on`, the approver of a
     round may not be its submitter.
10. **Promotion** takes one or more releases in the same stage.
    - **To testing:** from implementation, with no pending changes and no open round (`pending`). Each version
      records what it resolves to in testing and freezes in the batch (§7.7); its approved copy goes. A fix replaces
      the testing version it fixes, which retires. `noticeDays` sets `planned_on` to `addDays( sofiaDate( now ),
      noticeDays )`; a release that has a date keeps it (a fix, §7.6.2).
    - **To production:** from testing, with every version of the release in testing (`waiting`), and on or after
      `planned_on` (`date`; a release without a date is refused). Each replaced production version goes to previous
      production until the date the approver gives for it, or retires on `null`; one with no decision refuses
      (`previous`). A version already in previous production retires.
    - `setPlannedDate` sets or moves a testing release's date (§7.6.2–3); `retirePreviousProduction` retires a version
      in previous production (§7.6.4).
11. **A fix** (§7.1). `createFix` makes a new version in implementation from a testing version: same release, the
    content and approved content copied, `base` and `replaces_id` the testing version, the number the approver gave or
    the one proposed. It is refused while the spec has a version in implementation.
12. **Abandoning** (§7.1). A release that is `accepted` and has no version in production may be abandoned: its
    versions retire and freeze, with their changelogs and numbers. A development version whose base was one of them
    moves its base to the spec's most advanced remaining version, or to none, and its changelog is refreshed, so the
    abandoned changes show in it.
13. **Migration `0003-review`.**
    - `releases.status` (default `accepted`), `versions.approved_hash`, `versions.replaces_id`, added with `ALTER TABLE
      … ADD COLUMN`;
    - tables `approved_items`, `rounds`, `round_versions`, `comments`, `release_events`, `edit_log`, which `TABLES`
      and the copy carry;
    - `write_guards` recreated with a fourth check, `review_guard`, as plan 6a recreated it for `edit_guard`.

## Global Constraints

- **Node 24**, CommonJS, `node --test`.
- **House style:** four-space indent, double quotes, semicolons, spaces inside brackets; JSDoc on everything exported;
  model shapes in `packages/spec-model/model/definitions.types.js`, data-layer shapes in
  `packages/data/store/definitions.types.js`; `#alias` inside a package, the `exports` map across.
- **`spec-model` stays pure:** no `node:` module, no I/O, no dependency. `Intl` is the language's, not I/O.
- **The SQL subset of design record §3.2:**
  - `?` placeholders;
  - `TEXT` and `INTEGER` columns;
  - never ordering by text;
  - at most 100 parameters per statement;
  - batches, not transactions;
  - a write computed from content read before its batch carries the lock, the frozen guard and the stale guard, and
    reads the content hash before the rows.
- **Every test of the data layer runs on SQLite and PostgreSQL** (`eachDatabase`); a race is tested with
  `interleaved()` from `test/support/databases.js`.
- **No new dependency.**
- **Never commit unpublished specification data.** Fixtures are synthetic or fetched public files.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Every new `.js` file begins with the EUPL block** of `packages/importer/read/raw.js`, lines 1–16, verbatim.
- **Code with backslashes or regular expressions is written with the Write and Edit tools.**

## Review Focus

1. **Two releases that need each other.** A module's release names a CL009 key that only CL009's own release adds.
   - Expected: promoting the module alone is refused with `link`, naming the module and CL009; promoting both in one
     call passes, on both databases.
   - → Task 6, "promotes two releases that need each other together, and refuses the module alone".
2. **An edit computed before a submission, landing after it.**
   - Expected: refused with `UnderReviewError`; nothing of it is written.
   - → Task 2, "refuses an edit to a version under review, and one that lands after the submission it was computed
     before".
3. **A fix promoted to testing while its release's other versions wait there.**
   - Expected: the fix enters testing, the version it replaces retires in the same batch, the planned date is kept,
     and the one-per-stage index holds on both databases.
   - → Task 7, "promotes a fix to testing in place of the version it fixes, keeping the date".
4. **Approval while the line is busy.**
   - Expected: refused with `one-line`, naming the spec; the release stays under review; an approved change upstream
     still reaches its version.
   - → Task 5, "waits for a clear line, and keeps the release under review".
5. **Production on the planned date, when UTC is still the day before.**
   - Expected: at 22:30 UTC on 10.12 it is 00:30 on 11.12 in Sofia, so a release planned for 11.12 is promoted.
   - → Task 6, "promotes on the planned date in Sofia, whatever the UTC date".

## File map

| File | Responsibility |
|---|---|
| `packages/spec-model/model/kinds.js` | `RELEASE_STATUS`, `ROUND_DECISION`, `RELEASE_EVENT` |
| `packages/spec-model/model/numbers.js` | `compareNumbers`, `proposeNumber`, `acceptsNumber` |
| `packages/spec-model/model/dates.js` | `sofiaDate`, `addDays` |
| `packages/data/store/schema.js` | Migration `0003-review`; `reviewStatement`; `TABLES` |
| `packages/data/store/versions.js` | `loadApprovedContent` |
| `packages/data/store/editing.js` | Editing gates, `UnderReviewError`, `edit_log` |
| `packages/data/store/changelog.js` | Writers refuse under review; `compareNumbers` re-exported |
| `packages/data/store/targets.js`, `resolution.js` | Approved content for implementation; `resolveAt` |
| `packages/data/store/moves.js` | `checkMove`, `PromotionRefusedError` |
| `packages/data/store/releases.js` | `submitRelease`, `submitRound`, `listReleases`, `loadRelease`, `abandonRelease` |
| `packages/data/store/review.js` | `approveRelease`, `returnRelease`, `SelfApprovalError` |
| `packages/data/store/promotion.js` | `promoteReleases`, `setPlannedDate`, `retirePreviousProduction` |
| `packages/data/store/fixes.js` | `createFix` |

Test support: `test/support/lifecycle.js` holds the builders the later tasks share — a spec with a production
version 1.5.1, a development version started from it, a list with its own versions — and the constants `ACTOR`,
`APPROVER` and `NOW = new Date( "2026-11-05T10:00:00Z" )`, a Thursday in Sofia.

---

### Task 1: The model of a release, numbers, dates and migration `0003-review`

**Files:**
- Create: `packages/spec-model/model/numbers.js`, `packages/spec-model/model/dates.js`; tests `numbers.test.js`,
  `dates.test.js`.
- Modify: `packages/spec-model/model/kinds.js`; `packages/data/store/schema.js`, `copy.js`, `changelog.js`;
  `packages/data/test/schema.test.js`, `copy.test.js`, `cli-copy.test.js`.

**Interfaces:**
- **Produces:**
  - `RELEASE_STATUS { REVIEW: "review", RETURNED: "returned", ACCEPTED: "accepted", ABANDONED: "abandoned" }`;
    `ROUND_DECISION { APPROVED: "approved", RETURNED: "returned" }`; `RELEASE_EVENT { SUBMITTED, APPROVED, RETURNED,
    PROMOTED, DATE_SET, FIX_CREATED, ABANDONED, PREVIOUS_RETIRED }` with kebab-case values.
  - `compareNumbers( a, b ): number`; `proposeNumber( numbers: string[] ): string`;
    `acceptsNumber( number: string, numbers: string[] ): boolean`.
  - `sofiaDate( now: Date ): string`; `addDays( date: string, days: number ): string`.
  - Migration `0003-review` as decision 13; `reviewStatement( versionId ): Statement`, which inserts `'review'` into
    `write_guards` when the version's release is under review.

- [ ] **Step 1: Write the failing tests**

```js
it( "proposes the highest number with its last part raised, and accepts only a higher one", () => {
    assert.equal( proposeNumber( [ "1.5.1", "1.6.0", "1.5.10" ] ), "1.6.1" );
    assert.equal( proposeNumber( [] ), "1.0.0" );
    assert.deepEqual( [ "1.7.0", "1.6.1", "1.6.0", "1.5.11", "1.7", "v1.7.0" ].map( ( n ) => acceptsNumber( n, [ "1.5.1", "1.6.0" ] ) ),
        [ true, true, false, false, true, false ] );
} );
it( "gives the date in Sofia, across midnight and the clock change", () => {
    assert.equal( sofiaDate( new Date( "2026-12-10T22:30:00Z" ) ), "2026-12-11" );
    assert.equal( sofiaDate( new Date( "2026-03-29T00:30:00Z" ) ), "2026-03-29" );
    assert.equal( addDays( "2026-12-30", 3 ), "2027-01-02" );
} );
// A column added with a default fills every existing row with it, so a release plan 5's migration made is accepted.
it( "gives a release written without a status, as plan 5's migration wrote them, the status accepted", async () => {
    await db().run( "INSERT INTO releases ( id, created_at ) VALUES ( 'r', '2026-11-05' )" );
    assert.deepEqual( await db().get( "SELECT status FROM releases WHERE id = 'r'" ), { status: "accepted" } );
} );
it( "refuses a batch on a version under review, naming review_guard", async () => { /* status 'review' */ } );
```

- [ ] **Step 2: Run them.** Run: `npm test --workspace packages/spec-model` and `HDP_TEST_POSTGRES_URL=… npm test
  --workspace packages/data`. Expected: FAIL.
- [ ] **Step 3: Implement the constants, `numbers.js`, `dates.js` and migration `0003-review`.** `TABLES`, in an order
  in which each row's references exist: `specs, releases, versions, version_stages, items, approved_items, anomalies,
  changelog_entries, resolutions, conflicts, rounds, round_versions, comments, release_events, edit_log, files,
  settings`; the copy's keys and its table count follow.
- [ ] **Step 4: Run them.** Expected: PASS on both databases; every plan 6a test still passes.
- [ ] **Step 5: Commit.** `feat(data): the model of a release, its numbers and dates, and migration 0003-review (HEL-32)`

---

### Task 2: Changes in implementation, editing gates and who edited

**Files:**
- Modify: `packages/data/store/editing.js`, `changelog.js`, `versions.js`, `targets.js`, `resolution.js`,
  `development.js`; tests `editing.test.js`, `live-changelog.test.js`; create `test/support/lifecycle.js`.

**Interfaces:**
- **Consumes:** `reviewStatement` (Task 1).
- **Produces:**
  - `applyEdits( db, store, versionId, edits, { actor, now } )`: a version in development or implementation; an
    `edit_log` row in its batch. `loadIntoDevelopment` takes the same options.
  - `class UnderReviewError extends Error { version }`, from `applyEdits` and the changelog writers.
  - `loadApprovedContent( db, versionId ): Promise<VersionContent|null>` — `null` when the version has no approved copy.
  - `resolveAt( db, versionId, stage, after: Map<string, Map<string, string|null>> ): Promise<Resolution[]>` — what
    the version resolves to in `stage`, where `after` overrides the version a spec holds in a stage (`null`: empty).
  - `resolutionStatements( versionId, resolutions: Resolution[] ): Statement[]` — the record `recordResolution`
    writes, for an approval or a promotion to write in its own batch.
  - `loadTargets` and `resolveVersion` read the approved content and key type of a version in implementation.

- [ ] **Step 1: Write the failing tests**

```js
it( "keeps an implementation version's edits apart from its approved content", async () => {
    // lifecycle.inImplementation(): a version moved to implementation by SQL, its approved copy taken.
    await applyEdits( db(), store, implementation, [ await raiseMinimumOfLrn( implementation ) ], { actor: ACTOR, now: NOW } );
    assert.equal( lrnOf( await loadApprovedContent( db(), implementation ) ).cardinality.min, 1 );
    assert.equal( lrnOf( ( await loadVersion( db(), implementation ) ).content ).cardinality.min, 2 );
} );
it( "refuses an edit to a version under review, and one that lands after the submission it was computed before", async () => {
    await assert.rejects( applyEdits( interleaved( db(), () => putUnderReview( development ) ), store, development, [ await anEdit() ],
        { actor: ACTOR, now: NOW } ), { name: "UnderReviewError" } );
    assert.equal( ( await loadItems( db(), development ) ).every( ( row ) => row.revision === 1 ), true );
    await assert.rejects( editChangelogEntry( db(), entryId, { textBg: "x" } ), { name: "UnderReviewError" } );
} );
it( "records who edited and when", async () => { /* edit_log: actor, at = NOW's ISO time, edits as sent */ } );
it( "checks a module against a list's approved content, not its pending changes", async () => { /* loadTargets */ } );
```

- [ ] **Step 2–4: Run; implement; run.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): changes in implementation kept apart, versions under review read-only, edits recorded (HEL-32)`

---

### Task 3: The move check

**Files:**
- Create: `packages/data/store/moves.js`; test `packages/data/test/moves.test.js`.

**Interfaces:**
- **Consumes:** `resolveAt`, `loadApprovedContent` (Task 2); `linkModule`, `linkConditions`, `referencedSpecs`
  (spec-model).
- **Produces:**
  - `checkMove( db, moves: Array<{version: string, to: string, replaces?: string}> ): Promise<{refusals: Refusal[],
    warnings: Warning[]}>`, as decision 8. `Refusal { version, spec, rule, message }`; `Warning { version, spec, reader,
    anomaly }`.
  - `class PromotionRefusedError extends Error { refusals: Refusal[] }`.
  - Typedefs `Move`, `Refusal`, `Warning` in `definitions.types.js`.

- [ ] **Step 1: Write the failing tests**

```js
it( "refuses a skipped stage and a busy line, naming the version and the rule", async () => {
    assert.deepEqual( rules( await checkMove( db(), [ { version: development, to: "testing" } ] ) ), [ [ development, "skip" ] ] );
    // e-Prescription has a version in testing:
    assert.deepEqual( rules( await checkMove( db(), [ { version: development, to: "implementation" } ] ) ), [ [ development, "one-line" ] ] );
} );
it( "refuses a module that needs a key only a list in development has, unless the list moves with it", async () => {
    assert.deepEqual( rules( await checkMove( db(), [ { version: module, to: "implementation" } ] ) ), [ [ module, "link" ] ] );
    assert.deepEqual( rules( await checkMove( db(), [ { version: module, to: "implementation" }, { version: list, to: "implementation" } ] ) ), [] );
} );
it( "does not refuse an anomaly the module already carried", async () => { /* migrated defect, §4.8 */ } );
it( "holds a list whose key type changed until a version of each module that names it moves too", async () => { /* key-type */ } );
it( "warns of a reader that names a key the moving list withdrew", async () => { /* warning, no refusal */ } );
```

- [ ] **Step 2–4: Run; implement; run.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): one check for every move, by the rules of §7.1 and §4.8 (HEL-32)`

---

### Task 4: Submission, rounds and queues

**Files:**
- Create: `packages/data/store/releases.js`; test `packages/data/test/releases.test.js`.

**Interfaces:**
- **Consumes:** Tasks 1–2; `listConflicts` (plan 6a); `loadAnomalies`, `loadChangelog`.
- **Produces:**
  - `submitRelease( db, { versions: string[], summary: {bg, en}, actor, now } ): Promise<string>` — a new release
    under review, its first round, a snapshot of each version's changelog. Refused with `SubmissionRefusedError
    { reasons: Array<{version, rule}> }`: `blocking`, `conflict`, `stage` (not development), `released` (already in a
    release), `spec` (two versions of one spec).
  - `submitRound( db, releaseId, { add?: string[], actor, now } ): Promise<number>` — the next round of a returned
    release, or of an accepted one with pending changes or versions added; the same refusals, and `nothing` when an
    accepted release has neither.
  - `listReleases( db, { status?, submittedBy? } ): Promise<ReleaseSummary[]>` — the approver's queue
    (`status: "review"`) and an editor's (`status: "returned", submittedBy`).
  - `loadRelease( db, releaseId ): Promise<Release>` — `{ id, status, summary, noticeDays, plannedOn, versions,
    rounds, events }`. Each version comes with its anomalies, so the warnings reach the approver with it (§7.4), and,
    in implementation, its pending differences — `compareContents` from the approved content to the current — which a
    round there is reviewed by (§7.5). Each round comes with its versions' snapshots and its comments.
  - Typedefs `Release`, `ReleaseSummary`, `Round` in `definitions.types.js`.

- [ ] **Step 1: Write the failing tests**

```js
it( "submits development versions as one release, under review and read-only", async () => {
    const release = await submitRelease( db(), { versions: [ development, listDevelopment ], summary: { bg: "Нова версия", en: null }, actor: ACTOR, now: NOW } );
    const loaded = await loadRelease( db(), release );
    assert.deepEqual( [ loaded.status, loaded.rounds.length, loaded.rounds[ 0 ].submittedBy ], [ "review", 1, ACTOR ] );
    assert.ok( loaded.rounds[ 0 ].versions.every( ( version ) => Array.isArray( version.changelog ) ) );
    await assert.rejects( applyEdits( db(), store, development, [ await anEdit() ], { actor: ACTOR, now: NOW } ), { name: "UnderReviewError" } );
} );
it( "refuses a version with a blocking anomaly or an open conflict, saying which", async () => {
    await assert.rejects( submitRelease( db(), { versions: [ defective ], summary: NONE, actor: ACTOR, now: NOW } ),
        ( error ) => error.name === "SubmissionRefusedError" && error.reasons[ 0 ].rule === "blocking" );
} );
it( "lists the approver's queue and the releases returned to an editor", async () => { /* listReleases */ } );
```

- [ ] **Step 2–4: Run; implement; run.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): submitting a release, its rounds and the review queues (HEL-32)`

---

### Task 5: Approving and returning

**Files:**
- Create: `packages/data/store/review.js`; test `packages/data/test/review.test.js`.

**Interfaces:**
- **Consumes:** Tasks 1–4; `carryChange` (plan 6a); `readSetting` (plan 5).
- **Produces:**
  - `approveRelease( db, store, releaseId, { numbers?: Object<string, string>, actor, now } ): Promise<{carried:
    Array<{version, applied, conflicts}>}>` as decision 9. Refused with `PromotionRefusedError` (from `checkMove`, and
    `number` for a number `acceptsNumber` refuses), or `SelfApprovalError` under `review.two-people`.
  - `returnRelease( db, releaseId, { comments: Array<{version?, target?, text}>, actor, now } )`; a comment's target is
    checked to name an item or changelog entry of that version.

- [ ] **Step 1: Write the failing tests**

```js
it( "approves a first round into implementation with the numbers proposed", async () => {
    await approveRelease( db(), store, release, { actor: APPROVER, now: NOW } );
    const version = await loadVersion( db(), development );
    assert.deepEqual( [ version.stage, version.number ], [ "implementation", "1.5.2" ] );
    assert.deepEqual( await loadApprovedContent( db(), development ), version.content );
} );
it( "waits for a clear line, and keeps the release under review", async () => {
    await assert.rejects( approveRelease( db(), store, busy, { actor: APPROVER, now: NOW } ),
        ( error ) => error.name === "PromotionRefusedError" && error.refusals[ 0 ].rule === "one-line" );
    assert.equal( ( await loadRelease( db(), busy ) ).status, "review" );
} );
it( "approves pending changes, carries them to development, and returns a release they conflict with", async () => { /* §7.4, §7.8 */ } );
it( "returns a release with comments on the whole and on one element, and makes it editable again", async () => { /* targets */ } );
it( "refuses self-approval only when two people are required", async () => { /* writeSetting( "review.two-people", "on" ) */ } );
```

- [ ] **Step 2–4: Run; implement; run.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): approving and returning a release, and approved changes carried on (HEL-32)`

---

### Task 6: Promotion to testing and production

**Files:**
- Create: `packages/data/store/promotion.js`; test `packages/data/test/promotion.test.js`.

**Interfaces:**
- **Consumes:** Tasks 1–5; `freezeVersion`'s column, `recordResolution`'s statements.
- **Produces:**
  - `promoteReleases( db, store, releaseIds: string[], { to: "testing"|"production", noticeDays?: number,
    previous?: Object<string, string|null>, actor, now } ): Promise<{warnings: Warning[]}>`, as decision 10, in one
    batch; refusals as `PromotionRefusedError` with `pending`, `waiting`, `date` and `previous` beside `checkMove`'s.
  - `setPlannedDate( db, releaseId, { plannedOn: string, actor, now } )`; `retirePreviousProduction( db, versionId,
    { actor, now } )`.

- [ ] **Step 1: Write the failing tests**

```js
it( "promotes to testing, freezing each version with what it resolves to, and sets the planned date", async () => {
    await promoteReleases( db(), store, [ release ], { to: "testing", noticeDays: 30, actor: APPROVER, now: NOW } );
    assert.deepEqual( [ ( await loadVersion( db(), version ) ).frozen, ( await loadRelease( db(), release ) ).plannedOn ], [ true, "2026-12-05" ] );
    await assert.rejects( applyEdits( db(), store, version, [ await anEdit() ], { actor: ACTOR, now: NOW } ), { name: "TypeError" } );
} );
it( "refuses testing while changes are pending or a round is open", async () => { /* pending */ } );
it( "promotes two releases that need each other together, and refuses the module alone", async () => { /* Review Focus 1 */ } );
it( "refuses production before the planned date, and after a moved date allows it", async () => { /* date, setPlannedDate */ } );
it( "promotes on the planned date in Sofia, whatever the UTC date", async () => { /* Review Focus 5 */ } );
it( "keeps the replaced production version as previous production until the given date, and retires the one there", async () => {
    // previous: { [ production ]: "2027-06-30" }; an earlier previous-production version retires.
} );
```

- [ ] **Step 2–4: Run; implement; run.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Commit.** `feat(data): promoting releases to testing and production, with the notice period (HEL-32)`

---

### Task 7: Fixes and abandoning

**Files:**
- Create: `packages/data/store/fixes.js`; tests `packages/data/test/fixes.test.js`; modify `releases.js` (abandon).

**Interfaces:**
- **Consumes:** Tasks 1–6; `refreshChangelog` (plan 6a).
- **Produces:**
  - `createFix( db, store, testingVersionId, { number?, actor, now } ): Promise<string>`, as decision 11.
  - `abandonRelease( db, store, releaseId, { actor, now } )`, as decision 12.

- [ ] **Step 1: Write the failing tests**

```js
it( "creates a fix of a testing version in implementation, numbered next, in the same release", async () => {
    const fix = await createFix( db(), store, testing, { actor: APPROVER, now: NOW } );
    const loaded = await loadVersion( db(), fix );
    assert.deepEqual( [ loaded.stage, loaded.number, loaded.release, loaded.base ], [ "implementation", "1.6.1", release, testing ] );
} );
it( "promotes a fix to testing in place of the version it fixes, keeping the date", async () => { /* Review Focus 3 */ } );
it( "holds the rest of the release in testing until its fix is there", async () => { /* production refused: waiting */ } );
it( "abandons a release: its versions retire, their numbers stay taken, and development's base moves back", async () => {
    await abandonRelease( db(), store, release, { actor: APPROVER, now: NOW } );
    assert.equal( ( await loadVersion( db(), implementation ) ).stage, "retired" );
    assert.equal( ( await loadVersion( db(), development ) ).base, production );
    assert.equal( acceptsNumber( "1.6.0", await numbersOf( "e-prescription" ) ), false );
} );
```

- [ ] **Step 2–4: Run; implement; run.** Expected: FAIL, then PASS on both databases.
- [ ] **Step 5: Full suite and commit.** Run: `npm ci && npm run fixtures:fetch && npm run lint && npm test`, with
  `HDP_TEST_POSTGRES_URL` set. Expected: PASS everywhere, lint 0.
  `feat(data): fixing a version in testing, and abandoning a release (HEL-32)`

---

## Deliberately not in this plan

- **Generated files** (§7.9): made from implementation on and fixed at publication, by the plan that serves them.
- **Announcements and the public "upcoming in production" marks** (§7.6): the public site (plan 8) reads the release
  events and dates this plan records.
- **Roles, sign-in and the review screens** (plan 9), and the editing screens (plan 10).
- **Email notifications** for the queues (§7.4: later).
- **The minor findings of plan 6a's review** (HEL-31).
