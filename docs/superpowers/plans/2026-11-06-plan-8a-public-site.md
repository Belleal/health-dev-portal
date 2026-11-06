# Plan 8a — The public site's reference pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a reader on `/bg/` or `/en/` finds every published specification version by stage, reads a message element
by element, browses and downloads code lists, looks up an error code, and sees what changed between any two kept
versions. Pages are server-rendered, readable without JavaScript, and set no cookie.

**Architecture:**
- **One new package, `packages/portal`:** `PortalServer`, a ti-engine `TiWebServer` (§3.1).
  - Its routes render HTML strings with `web-content`'s escaping `html` template.
  - Its one stylesheet and its one small script are served from its own `public/` folder, by their content hash.
- **The site reads the data layer through one new module, `@health-dev-portal/data/published`.** It is the only place
  that decides what is public: testing, production, previous production, and the history of versions that were
  published. A development or implementation version, or one abandoned before testing, can reach no public page,
  because no function the site calls returns one.
- **Generated files** (§7.7, §7.9) start here, with the code lists' JSON and CSV.
  - They are made when a version is promoted to testing, or the first time the site serves a migrated version.
  - They are kept by content hash and served unchanged from then on.

**Tech Stack:**
- Node 24, CommonJS, `node --test`.
- `@ti-engine/web-framework` ^1.61.2, `@ti-engine/web-content` ^0.5.3 (`/html` only) and `@ti-engine/core` ^1.21.0.
- `@fontsource/sofia-sans` and `@fontsource/sofia-sans-extra-condensed`, both 5.3.0 exactly (OFL-1.1).
- Development only: `playwright` 1.64.1 and `@axe-core/playwright` 4.14.0, exactly.

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md):
§3.1, §3.4 (look-alike folding), §4.6 (code lists), §4.9 (missing translations), **§7.6–7.7** (stages, fixed and stage
addresses), **§7.9–7.10** (generated files, changelogs), §7.12 (dates), **§8.1–8.5**, **§9**, §10.1–10.3, §11.

Tracking: **HEL-35**. Plan 8b follows with schemas, guides, FAQ, environment status and search.

## Decisions this plan takes

Reject any at review, before Task 1.

1. **The server.** `PortalServer extends TiWebServer` (`packages/portal/bin/portal-server.js`), with no `TiWebAppManager`
   until plan 9 brings the staff area.
   - Without a manager the framework's `/not-found` and `/app…` routes throw. So the portal registers its own GET
     handlers for `/`, `/not-found`, `/app` and `/app/*splat` before calling `super.defineWebApplicationRoutes()`,
     and its own `*splat` 404 after.
   - Unprotected: `/`, `/^\/(bg|en)(\/.*)?$/`, `/^\/downloads\//`.
   - It opens its database from `HDP_DATABASE_URL` and its files from `HDP_FILES_DIR` (default `.files`) in `onStart`,
     before the framework's start resolves, so the start-up gate holds every request until both are open. A missing
     `HDP_DATABASE_URL` stops the start.
   - Absolute links (canonical, `hreflang`, feeds) use `TI_WEB_PUBLIC_URL`, the framework's `publicUrl`, which is
     required.
2. **What is public: one function decides it.** A version is public when either:
   - its stage is testing, production or previous production; or
   - it is retired and has a `version_stages` row for testing, production or previous production, or has none for
     development or implementation. Migrated history versions satisfy the second clause; a version abandoned in
     implementation satisfies neither.

   The rule is a single SQL fragment in `published.js`. Every function there uses it, and nothing in the portal reads
   the data layer otherwise. The one exception is `readContent`, which `published.js` itself calls. Public functions
   return no actor, author, submitter, decider, anomaly or staff comment.
3. **Addresses** (§7.7 extended; `{at}` is a stage slug — `testing`, `production`, `previous-production` — or a number
   matching `^\d+(\.\d+)*$`):

   | Address | Page |
   |---|---|
   | `/` | 301 → `/bg/` |
   | `/{lang}/` | Home |
   | `/{lang}/specs` | Modules and the business rules by stage |
   | `/{lang}/specs/{spec}/{at}` | A module's messages by endpoint segment; for `rules`, the rules |
   | `/{lang}/specs/{spec}/{at}/conditions` · `/dictionary` | A module's conditions; its dictionary |
   | `/{lang}/specs/{spec}/{at}/{message}` | Message, Elements tab |
   | `/{lang}/specs/{spec}/{at}/{message}/elements/{path…}` | The same with one element selected |
   | `/{lang}/specs/{spec}/{at}/{message}/conditions` · `/changes` | The message's Conditions and Changes tabs |
   | `/{lang}/nomenclatures` | Every code list (`?q=`) |
   | `/{lang}/nomenclatures/{id}/{at}` | One list (`?q=`, `?expired=1`, `?page=`) |
   | `/downloads/nomenclatures/{id}/{number}.json` · `.csv` | Fixed files; `{stage}.json` gives 302 to the fixed one |
   | `/{lang}/errors`, `/{lang}/errors/testing` | CL999 and CL998 in production; in testing |
   | `/{lang}/changes` · `/{lang}/changes/{spec}` | Every spec's latest; one spec's changelog |
   | `/{lang}/changes/{spec}/compare?from=&to=` | Comparison of two kept versions |
   | `/{lang}/changes/feed.atom` · `/{lang}/changes/{spec}/feed.atom` | Atom feeds |

   - An element's `{path…}` is its `path`, each segment percent-encoded; a path met again in the same message gets
     `~2`, `~3` in document order.
   - A stage page's canonical is its fixed address.
   - A module ID under `/nomenclatures` and a list ID under `/specs` are 404s.
4. **Caching** (§10.3, as amended by this plan's design-record change):

   | Response | `Cache-Control` |
   |---|---|
   | Page at a fixed address | `public, max-age=86400` |
   | Retired fixed address (410) | `public, max-age=86400` |
   | Home, indexes, stage pages, errors, changes, comparison, feeds | `public, max-age=60` |
   | 404 | `public, max-age=60` |
   | `/` redirect, stage download redirect | `public, max-age=60` |
   | Fixed download | `public, max-age=31536000, immutable` |

   **No response the portal makes sets a cookie** (§10.1). Every page test asserts it, through one helper.
5. **Languages and text.**
   - **The interface's own words** live in `site/labels.js` (`{ bg: {…}, en: {…} }`). A sweep test holds both languages
     to the same keys, and every `label( … )` call in `site/` to a key that exists.
   - **A model text** (`{ bg, en }`) shows the page's language. When that is null it shows the other language inside
     `<span lang="…">` with a visible marker: "не е преведено" or "not yet translated", in both directions (§8.4,
     §4.9). It shows "—" when both are null. In bilingual table columns, such as a list's description in bg and in
     en, each column shows its own language or "—", with no marker.
   - **Dates** (§7.12): `dd.mm.yyyy` in Bulgarian; `11 Dec 2026` (`en-GB`, day, short month, year) in English.
   - **Spec names.** Modules and the rules have none in the model. `site/spec-names.js` names them in both languages,
     in the order the home page lists them. An unnamed spec shows its ID.
6. **Rendering** (§8.5, §9).
   - **The document.** Every page is one HTML document built from `html` / `raw` of `@ti-engine/web-content/html`, with
     the portal's own head: charset, viewport, title, canonical, `hreflang` bg and en, and `x-default` pointing at bg.
   - **Assets.** One stylesheet and one deferred script carry `?v=<first 12 hex of the file's SHA-256>`, which the
     framework answers as immutable. The script carries the response's `nonce`. There are no inline styles and no
     inline scripts.
   - **Fonts.** Sofia Sans (400, 600, 700) and Sofia Sans Extra Condensed (700), cyrillic and latin subsets, are copied
     from the pinned `@fontsource` packages into `public/fonts/sofia-sans-5.3.0/` with their licence. The version is in
     the path, so the path's content never changes.
   - **Monospace** is the system's stack; no font is shipped for it.
   - **Without JavaScript** everything is readable. The tree is shown fully expanded, an element is selected by its
     link, and the filters are GET forms. The script adds collapsing and "copy link", nothing else.
7. **The message page (M1).**
   - **Mint band:** the stage switcher, one link per kept stage. Previous production is marked "обратно съвместима до
     dd.mm.yyyy" / "backward compatible until …" here and everywhere else it appears (§7.6). A testing page also gives
     its planned production date ("предстои в продукция на …", or that none is set yet), and links "compare with
     production".
   - **Sidebar:** the module's messages grouped by endpoint segment, which is the second-to-last segment of the
     message's address path (`/doctor`); a message with no address goes under "other". Below them, links to
     conditions, dictionary and errors.
   - **Main:**
     - the heading `{code} · {title}` and the address line;
     - tabs Elements, Conditions and Changes. Sample message and XSD come with plan 8b;
     - the tree table, with columns element (tag, indented by depth), R/C/O, count (`1..1`, `0..*`), type,
       constraints and links. Links go to the code list at the version the module reads, to the rule, and to each
       condition's anchor on the Conditions tab.
   - **Constraints.**
     - On a string: a length (`≤ 36`, `≥ 2`, `2–36`), the character class (`an`, with its meaning in a `title`), and
       the format (`YYMMDD`, `base64`).
     - On a number, `max=` is a digit count (HEL-26): "до 2 цифри" / "up to 2 digits".
   - **Markers.**
     - A testing page marks each element against production: new, changed or removed (§8.3).
     - A removed element is a struck-through row under its former parent, after that parent's current children.
     - A previous-production page is not marked.
   - **Detail panel:** for the selected element, else the message:
     - the path, the description, requirement · count, the type and its constraints in words;
     - the code list, rules and conditions;
     - "used also in": the other messages of the same version with an element at the same path;
     - the XML it produces (`<nhis:{tag} {attribute}="…"/>` for a field, an elided group otherwise);
     - a "copy link" button, which the script enables.
8. **Fixed files** (§7.7, §7.9).
   - **Storage.** Migration `0004-files` adds `fixed_files ( version_id, name, hash, created_at, PRIMARY KEY (
     version_id, name ) )`; the bytes go in the file store by hash, as every file does (§3.3).
   - **Who makes them, and when:**
     - `promoteReleases` makes them for every version entering testing, after its batch. A failure is logged and does
       not undo the promotion.
     - The site makes any that are missing the first time it serves a frozen public version, as migrated versions
       need (§7.7).
     - Two first requests at once keep one: `ON CONFLICT DO NOTHING`, then both read the winner.
   - **Code-list formats:**
     - `list.json` is `{ "format": "nhis-code-list/1", id, version, name, keyType, columns: [titles], entries: [{ key,
       description, display, values: [in column order], since, validUntil }] }`, pretty-printed, UTF-8 and exact.
     - `list.csv` is for spreadsheets: UTF-8 with a BOM, CRLF, every field quoted. The columns are `key`,
       `description_bg`, `description_en`, `display_bg`, `display_en`, the list's own columns, `since`, `valid_until`.
       A field starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` (OWASP CSV injection), and
       the list page says so: the JSON is the exact one.
9. **Lists** (§4.6, §8.1).
   - **Expired.** An entry is expired when its `validUntil` is not after the version shown (`compareNumbers`).
     Expired entries are hidden unless `?expired=1`.
   - **Paging.** A page holds 500 rows (CL011 has 39,005); `?page=` is 1-based and an out-of-range page is a 404.
   - **The filter `q`** matches as a substring after both sides are folded the same way: lower case, `transliterate`
     from `@ti-engine/web-content/transliterate` (§3.4), and Latin look-alikes mapped to Cyrillic (A В С Е Н К М О Р Т
     Х У and a с е о р х у). It searches the key, both descriptions, both displays and the list's own values; on the
     index, the ID and both names.
   - **Display columns.** They appear only when some entry in the version has one.
   - **Links.** A list page links to its own changelog (`/{lang}/changes/{id}`, §8.1), and names the messages that use
     it: up to 10, then "и още N".
10. **Changes** (§7.10).
    - **The changelog.** Public versions newest first, each version's entries grouped breaking, dropped plan,
      non-breaking. Each version names:
      - the dates it entered testing and production, or "датите не са записани" when none were recorded;
      - its fix, when it was retired in testing;
      - "abandoned", when it was abandoned in testing.
    - **Entries.** An imported or editor's entry shows its text. A detected entry shows its target and its aspect, with
      the value before and after.
    - **The comparison.** `from` and `to` are kept versions (with content) of the spec. A reversed pair is swapped; an
      equal or unknown one is a 404. The page shows `compareContents( kind, from, to )` grouped by category, then the
      changelog entries of the public versions after `from` up to `to`.
    - **Feeds.** Atom 1.0, one entry per publication (a version entering testing or production). Each entry's ID is its
      changelog address with `#{number}-{stage}`, and its date is the day, written `{date}T00:00:00Z`.
11. **Errors.** The CL999 entries come with the business rules that raise each one (`rule.errorCode`), from the rules
    version in the same stage. The CL998 warnings come with their `Source` column. Production comes first; the testing
    page exists when any of the three specs has a testing version.
12. **Tests.**
    - Portal tests run on SQLite only; the data layer is the one tested on both databases.
    - **A seed database** is built by the portal's `pretest` from the public fixtures, using data's own migration and
      lifecycle functions, into `.fixtures/portal/` (git-ignored), once per test run. The migration alone takes 14.4 s
      measured, too long to repeat in every file. When the fixtures are missing, the seed is skipped and the HTTP tests
      skip locally; in CI they fail (the rule `HDP_TEST_POSTGRES_URL` already follows).
    - **One server per test file**, since core allows one service instance per process. The server is in-process, on
      a copy of the seed, with core's exported `cache.instance` replaced by an in-memory stand-in written for the
      portal: ti-engine exports none, and a deep path past its `exports` map is not allowed.
13. **The seed's own lifecycle,** all through the data layer, at `NOW = 2026-11-05T10:00:00Z`:
    1. **e-Prescription 1.5.2 in testing.** It changes `lrn`'s description, makes one optional element required, and
       adds one. It is approved and promoted with 30 days' notice, so it is planned for 2026-12-05.
    2. **CL007 1.5.34 in production.** It adds `T9` and gives `T4` a `validUntil` of 1.5.34. Promoted with 0 days'
       notice, it goes to production the same day, with 1.5.33 kept as previous production until 2027-04-30.
    3. **CL008, abandoned.** Its next version reaches implementation, and its release is then abandoned.
    4. **rules, in development.** A development version is started.

## Global Constraints

- **Node 24**, CommonJS, `node --test`.
- **House style:**
  - four-space indent, double quotes, semicolons, spaces inside brackets;
  - JSDoc on everything exported;
  - shared shapes as `@typedef`s in the package's `definitions.types.js`;
  - `#alias` inside a package, the `exports` map across packages, never a deep path past one.
- **`spec-model` stays pure:** no `node:` module, no I/O, no dependency.
- **The SQL subset of design record §3.2:**
  - `?` placeholders;
  - `TEXT` and `INTEGER` columns;
  - never ordering by text: dates and numbers are sorted in JavaScript;
  - no `LIKE`;
  - at most 100 parameters per statement;
  - batches, not transactions.
- **Every test of the data layer runs on SQLite and PostgreSQL** (`eachDatabase`).
- **No public page shows** a development or implementation version, a version abandoned before testing, a person's
  name or ID, an anomaly or a staff comment.
- **No portal response sets a cookie.** No inline `style` attribute, no inline script.
- **The framework knows nothing of the portal.** A generic gap found here is named under "not done" for a CA card in
  ti-engine, never patched around through a deep path.
- **Dependencies:** only those named under *Tech Stack*. `@fontsource` and the two development packages are pinned
  exactly.
- **Never commit unpublished specification data.** Fixtures are the public ones fetched into `.fixtures/`, and the
  seed is built from them.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Every new `.js` file begins with the EUPL block** of `packages/importer/read/raw.js`, lines 1–16, verbatim.
- **Code with backslashes or regular expressions is written with the Write and Edit tools**, not through a shell.

## Review Focus

1. **A version that was never public.**
   - The case: CL008's version abandoned in implementation, and the rules' development version.
   - Expected: 404 at their number, absent from every list, changelog, comparison choice, feed and "used in" line.
   - → Task 1, "never shows a development or implementation version, nor one abandoned before testing"; Task 6,
     "answers the number of CL008's abandoned version with 404, page and downloads alike"; Task 8, "leaves out a
     version abandoned before testing".
2. **A cookie on a public response.**
   - Expected: no `Set-Cookie` on any page, 404, redirect, download or feed.
   - → Task 3 helper `assertPublic`, used by every page test.
3. **A missing translation.**
   - The case: an element description is null in English, and a list name is null in English.
   - Expected: the English page shows the Bulgarian text in `<span lang="bg">` with "not yet translated", never an
     empty cell; the Bulgarian page shows no marker.
   - → Task 3, "shows the other language with a marker when a text is missing"; Task 5, "shows a Bulgarian description
     on the English page, marked untranslated".
4. **A very large list.**
   - The case: CL011, 39,005 entries.
   - Expected: the page holds 500 rows with links to the next page; JSON and CSV hold every entry; the filter finds a
     key on a later page.
   - → Task 6, "pages CL011 by 500, and its downloads hold every entry".
5. **Hostile input in addresses and query strings.**
   - The cases: `?q=<script>`, an element path with `..`, an unknown spec, version, message or element, percent-encoded
     Cyrillic, `from=../1.5.1`.
   - Expected: escaped output, 404 not 500, nothing outside the published data read.
   - → Task 3, "answers unknown and hostile addresses with the 404 page"; Task 6, "escapes the filter"; Task 8,
     "refuses a comparison of unknown versions".

## File map

| File | Responsibility |
|---|---|
| `packages/data/store/published.js` | `listPublished`, `findPublished`, `publishedChangelog`, `publications`, `upcoming`, `readersOf` |
| `packages/data/store/fixed-files.js` | `FIXED_FILES`, `fixedFile`, `makeFixedFiles` |
| `packages/data/store/schema.js`, `copy.js` | Migration `0004-files`; `TABLES` gains `fixed_files` |
| `packages/data/store/promotion.js` | Makes the fixed files of versions entering testing |
| `packages/spec-model/model/downloads.js` | `codeListJson`, `codeListCsv` |
| `packages/portal/bin/portal-server.js` | `PortalServer` |
| `packages/portal/site/paths.js` | Every address: builders, `parseAt`, element slugs |
| `packages/portal/site/labels.js`, `text.js`, `format.js` | Interface words; model texts; dates, counts, constraints |
| `packages/portal/site/layout.js`, `assets.js`, `responses.js` | The document; fingerprinted assets; `Cache-Control` and the 404, 410 and 500 pages |
| `packages/portal/site/fold.js` | The filter's folding |
| `packages/portal/site/spec-names.js` | Module and rules names, in home order |
| `packages/portal/site/pages/*.js` | `home`, `specs`, `message`, `nomenclatures`, `errors`, `changes`, `feeds` |
| `packages/portal/site/routes.js` | Address → page, parameters checked |
| `packages/portal/public/portal/portal.css`, `portal.js` | The stylesheet (§9 tokens), the script |
| `packages/portal/public/fonts/sofia-sans-5.3.0/` | The fonts and `OFL.txt`, copied by `scripts/copy-fonts.js` |
| `packages/portal/test/support/*.js` | `seed.js` (the lifecycle of decision 13), `build-seed.js` (`pretest`), `server.js` (`startPortal`, `assertPublic`), `memory-cache.js` |

---

### Task 1: The public view of the data

**Files:**
- Create: `packages/data/store/published.js`; `packages/data/test/published.test.js`.
- Modify: `packages/data/package.json` (`./published`, `#published`); `packages/data/store/definitions.types.js`.

**Interfaces:**
- **Consumes:** `findVersion`, `loadChangelog`, `listReleases`, `readContent`, `compareNumbers` (all existing).
- **Produces:**
  - **`PublishedVersion`** is `{ id, spec, kind, number, stage, frozen, expiresOn: string|null, enteredOn: string|null,
    retired: boolean, replacedBy: string|null }`.
  - **`listPublished( db ): Promise<PublishedSpec[]>`**, where `PublishedSpec` is `{ spec, kind, testing, production,
    previousProduction }` and each stage holds a `PublishedVersion` or null. Sorted by spec ID.
  - **`findPublished( db, spec, at ): Promise<(PublishedVersion & { content })|null>`**, where `at` is `{ stage }` or
    `{ number }`.
    - A retired number gives `retired: true` and `content: null`.
    - A version that is not public gives `null`.
  - **`publishedChangelog( db, spec ): Promise<PublishedChangelogVersion[]>`**, where each version is `{ number, stage,
    enteredTesting, enteredProduction, replacedBy, abandoned, entries }`.
    - `entries` is `{ breaking, "dropped-plan", "non-breaking" }`.
    - An entry is `{ origin, target: { kind, identity }|null, before, after, text: { bg, en } }`, with `before` and
      `after` parsed.
  - **`publications( db, { limit = 20 } ): Promise<Array<{ on, stage, spec, kind, number }>>`**, newest first.
  - **`upcoming( db, today ): Promise<Array<{ plannedOn, versions: [{ spec, kind, number, production }], breaking }>>`**:
    accepted releases with a version in testing, dated first by date, then the undated.
  - **`readersOf( db, versionId ): Promise<PublishedVersion[]>`**: the public module versions whose resolutions name
    the given version.

- [ ] **Step 1: Write the failing tests** (`eachDatabase`; the builders in `test/support/lifecycle.js`, `promoteReleases`,
  `abandonRelease`):

```js
it( "lists each spec's versions in testing, production and previous production, with the expiry and the date each entered its stage", async () => {
    const spec = ( await listPublished( db() ) ).find( ( one ) => one.spec === "e-pub" );
    assert.deepEqual( [ spec.testing.number, spec.production.number, spec.previousProduction.number, spec.previousProduction.expiresOn ],
        [ "1.6.0", "1.5.2", "1.5.1", "2027-04-30" ] );
    assert.equal( spec.production.enteredOn, "2026-11-05" );
} );
it( "never shows a development or implementation version, nor one abandoned before testing", async () => {
    // e-hidden: a development version, one in implementation, and one retired by an abandoned release.
    assert.equal( ( await listPublished( db() ) ).some( ( one ) => one.spec === "e-hidden" ), false );
    for ( const number of [ "2.0.0", "2.1.0" ] ) {
        assert.equal( await findPublished( db(), "e-hidden", { number: number } ), null );
    }
    assert.deepEqual( ( await publishedChangelog( db(), "e-hidden" ) ).map( ( one ) => one.number ), [] );
    assert.equal( ( await publications( db() ) ).some( ( one ) => one.spec === "e-hidden" ), false );
} );
it( "finds a retired version by its number as retired, with the fix that replaced it, and no content", async () => {
    // e-fixed: 1.0.0 in testing, fixed by 1.0.1 (createFix), which was promoted and so retired 1.0.0.
    const found = await findPublished( db(), "e-fixed", { number: "1.0.0" } );
    assert.deepEqual( [ found.retired, found.replacedBy, found.content ], [ true, "1.0.1", null ] );
} );
it( "gives a spec's changelog newest first, public versions only, grouped by category, without dropped entries or anyone's name", async () => {
    const versions = await publishedChangelog( db(), "e-pub" );
    assert.deepEqual( versions.map( ( one ) => one.number ), [ "1.6.0", "1.5.2", "1.5.1" ] );
    assert.equal( JSON.stringify( versions ).includes( ACTOR ), false );
} );
it( "lists publications newest first from the dates each version entered testing or production", async () => { /* … */ } );
it( "gives the releases due in production, the dated first, with their breaking-change count", async () => { /* … */ } );
it( "names the public module versions that read a list version", async () => { /* … */ } );
```

- [ ] **Step 2: Run them.** Run: `HDP_TEST_POSTGRES_URL=… npm test --workspace packages/data`. Expected: FAIL
  (`Cannot find module '#published'`).
- [ ] **Step 3: Implement `published.js`.**
  - The public rule of decision 2 is one SQL fragment, used by every function.
  - Dates and numbers are sorted in JavaScript.
  - `upcoming` reads `listReleases( db, { status: "accepted" } )` and passes on no summary or round.
  - The breaking count reads `changelog_entries` of the testing versions with `category = 'breaking' AND dropped = 0`.
- [ ] **Step 4: Run them.** Expected: PASS on both databases; the whole data suite still passes.
- [ ] **Step 5: Commit.** `feat(data): the public view of the published versions, one rule for what is public (HEL-35)`

---

### Task 2: Fixed files and the code-list downloads

**Files:**
- Create: `packages/spec-model/model/downloads.js`, `test/downloads.test.js`; `packages/data/store/fixed-files.js`,
  `test/fixed-files.test.js`.
- Modify:
  - `packages/spec-model/package.json` (`./downloads`, `#downloads`);
  - `packages/data/package.json` (`./fixed-files`);
  - `packages/data/store/schema.js` (`0004-files`, `TABLES`), `promotion.js`;
  - `packages/data/test/schema.test.js`, `copy.test.js`, `cli-copy.test.js` (the table count).

**Interfaces:**
- **Consumes:** `findPublished` (Task 1); `storeFile` and `FileStore` (`files.js`); `readContent`.
- **Produces:**
  - `codeListJson( content: CodeListVersion ): string` and `codeListCsv( content: CodeListVersion ): string`, the
    formats of decision 8.
  - `FIXED_FILES`, which holds `{ "code-list": [ { name: "list.json", type: "application/json; charset=utf-8", make },
    { name: "list.csv", type: "text/csv; charset=utf-8", make } ] }`; other kinds have none yet.
  - `fixedFile( db, store, versionId, name ): Promise<{ bytes: Buffer, type, hash }|null>`, which is `null` unless the
    version is public and frozen and its kind has that file.
  - `makeFixedFiles( db, store, versionId ): Promise<void>`.

- [ ] **Step 1: Write the failing tests.**

```js
it( "writes a code list as JSON with every entry, column and version", () => {
    const parsed = JSON.parse( codeListJson( codeListVersion( "CL007", [ "T1", "T2" ], "1.5.33" ) ) );
    assert.deepEqual( [ parsed.format, parsed.id, parsed.version, parsed.entries.length ], [ "nhis-code-list/1", "CL007", "1.5.33", 2 ] );
} );
it( "writes a code list as CSV for spreadsheets: BOM, CRLF, quoted fields, formulas neutralised", () => {
    const csv = codeListCsv( listWith( [ { key: "=1+1", description: { bg: "@cmd", en: "plain" } } ] ) );
    assert.ok( csv.startsWith( "﻿\"key\",\"description_bg\"" ) );
    assert.match( csv, /\r\n"'=1\+1","'@cmd","plain"/ );
} );
it( "makes a frozen version's files on first request and keeps them", async () => { /* same hash twice; one row in files */ } );
it( "refuses a version that is not public and frozen", async () => { /* development and implementation → null */ } );
it( "makes the files of each version promoted to testing", async () => { /* a fixed_files row after promoteReleases */ } );
it( "keeps one file when two first requests come at once", async () => { /* interleaved(): both answer the winner's hash */ } );
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the writers, `0004-files` (decision 8), `fixed-files.js`, and the call in `promoteReleases`
  after its batch: wrapped, logged on failure, never thrown.
- [ ] **Step 4: Run them.** Expected: PASS on both databases; schema, copy and the CLI copy count 18 tables.
- [ ] **Step 5: Commit.** `feat(data): fixed files, made once per published version, starting with the code lists' JSON and CSV (HEL-35)`

---

### Task 3: The portal's shell

**Files:**
- Create:
  - `packages/portal/package.json`, `README.md`, `.env.example`;
  - `bin/portal-server.js`;
  - `site/paths.js`, `labels.js`, `text.js`, `format.js`, `layout.js`, `assets.js`, `responses.js`, `routes.js`,
    `spec-names.js`;
  - `public/portal/portal.css`, `portal.js`;
  - `scripts/copy-fonts.js`, `public/fonts/sofia-sans-5.3.0/*`;
  - `test/support/memory-cache.js`, `server.js`, `seed.js`, `build-seed.js`;
  - `test/unit/paths.test.js`, `labels.test.js`, `text.test.js`, `fonts.test.js`; `test/shell.test.js`.
- Modify: `.gitignore` (`.fixtures/portal/`, `packages/portal/.env`); `eslint.config.mjs` (browser globals for
  `packages/portal/public/**`).

**Interfaces:**
- **Consumes:** Task 1; `TiWebServer` (`@ti-engine/web-framework/web-server`); `html`, `raw`
  (`@ti-engine/web-content/html`).
- **Produces:**
  - **`paths`**:
    - `home( lang )`, `specs( lang )`, `spec( lang, spec, at )`, `message( lang, spec, at, code, tab? )`;
    - `element( lang, spec, at, code, slug )`, `elementSlugs( message ): Map<ElementNode, string>`;
    - `lists( lang, query? )`, `list( lang, id, at, query? )`, `download( id, number, ext )`;
    - `errors( lang, testing? )`, `changes( lang, spec? )`, `compare( lang, spec, from, to )`, `feed( lang, spec? )`;
    - `other( path )`, which gives the same address in the other language;
    - `parseAt( segment ): { stage }|{ number }|null`;
    - `parseAddress( path ): { lang, page, …parameters }|null`, the inverse of every builder, which `routes.js`
      dispatches on.
  - **`label( lang, key, values? ): string`**.
  - **`localText( value: LocalText, lang ): SafeString`** (decision 5), and **`formatDate( date, lang )`**.
  - **`page( { lang, title, path, canonical, section, band, sidebar, main, panel, nonce } ): string`**, a whole
    document. `section` marks the active top-bar entry.
  - **`send( response, { status, cache, body, type } )`**; **`notFound( request, response )`**,
    **`gone( request, response, changesPath )`** and **`failed( request, response, error )`**, the last logging the
    error and showing no detail.
  - **Test support:**
    - `startPortal(): Promise<{ url, stop }>`;
    - `get( path ): Promise<{ status, headers, text }>`;
    - `assertPublic( response, cache, type = "text/html; charset=utf-8" )`: no `set-cookie`, the cache header, and the
      content type (`null` skips that, for a redirect);
    - `rowsOf( html )` and `rowOf( html, path )`: the tree table's rows, and one row by element path;
    - `seedContent( spec, number )`: a version's content read from the seed, so a test's expectation comes from the
      data, not from a typed copy;
    - `SEED`: the IDs and numbers of decision 13, `SEED.history`, the newest retired history number of e-Prescription
      (e.g. 1.5.0), and `SEED.ePrescriptionChanges`, a pattern for each change decision 13 makes.

- [ ] **Step 1: Write the failing tests.**

```js
it( "turns every address back into what built it", () => {
    for ( const [ build, parts ] of ROUND_TRIPS ) {                    // each builder, Cyrillic and ~2 slugs included
        assert.deepEqual( parseAddress( build() ), parts );
    }
} );
it( "holds both languages to the same keys, and every label call to a key", () => { /* sweep site/**.js */ } );
it( "shows the other language with a marker when a text is missing", () => {
    assert.equal( String( localText( { bg: "Описание", en: null }, "en" ) ),
        "<span lang=\"bg\">Описание</span> <span class=\"untranslated\">not yet translated</span>" );
    assert.equal( String( localText( { bg: "<b>", en: null }, "bg" ) ), "&lt;b&gt;" );
    assert.equal( String( localText( { bg: null, en: null }, "bg" ) ), "—" );
} );
it( "copies the pinned fonts byte for byte, with their licence", () => { /* each file equals node_modules' copy */ } );
it( "sends / to /bg/, and answers unknown and hostile addresses with the 404 page", async () => {
    assertPublic( await get( "/" ), "public, max-age=60", null );      // 301, Location /bg/
    for ( const path of [ "/bg/nope", "/en/specs/%3Cscript%3E/production", "/app", "/app/x", "/not-found", "/bg/specs/e-prescription/1.5.1/P001/elements/..%2F..%2Fx" ] ) {
        const response = await get( path );
        assertPublic( response, "public, max-age=60" );
        assert.equal( response.status, 404 );
        assert.equal( response.text.includes( "<script>" ), false );
    }
} );
it( "puts the response's nonce on its one script, and serves both assets as immutable at their hashed address", async () => { /* … */ } );
```

- [ ] **Step 2: Run them.** Run: `npm test --workspace packages/portal`. Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Measure, before implementing the server:**
  - (a) Does replacing `require( "@ti-engine/core/cache" ).instance` before the web server is required let a
    `TiWebServer` start and answer with no Redis? Which methods does the start call?
  - (b) Does `npm start --workspace packages/portal` without Redis serve pages, or must the README tell a developer to
    run `redis:8-alpine` in Docker?
  - (c) Does `staticCache.immutablePaths`' default `/fonts/` match `/static/fonts/…`, or does the font path need its own
    entry?

  Write each answer where it applies: a comment, the README, the server's configuration.
- [ ] **Step 4: Implement.**
  - **The server, decision 1.** `/` is answered 301 → `/bg/` before the framework's handler.
  - **`build-seed.js`** writes `.fixtures/portal/seed.sqlite` and `.fixtures/portal/files/`. It migrates eprescription
    1.5.1, rules 1.1.1 and nomenclatures 1.5.33 at production, then runs decision 13. Missing fixtures: in CI, it exits
    1 naming them; elsewhere, it exits 0 with a note.
  - **The stylesheet:** §9's palette as custom properties, the top bar, the mint band, the sidebar, the tables, and
    `.R` / `.C` / `.O`.
- [ ] **Step 5: Run them.** Expected: PASS; `npm run lint` 0 errors.
- [ ] **Step 6: Commit.** `feat(portal): the public site's shell — server, addresses, languages, layout and assets (HEL-35)`

---

### Task 4: Home and the specifications index

**Files:** Create `site/pages/home.js`, `site/pages/specs.js` (the index), `test/home.test.js`. Modify `site/routes.js`.

**Interfaces:**
- **Consumes:** `listPublished`, `upcoming`, `publications` (Task 1); `page`, `paths`, `label`, `formatDate` (Task 3).
- **Produces:** `homePage( context )` and `specsIndexPage( context )`. A `context` is `{ db, store, lang, request,
  response, nonce, today }`, and every page takes it.

- [ ] **Step 1: Write the failing tests.**

```js
it( "lists the versions by stage, marking a testing version ahead of production", async () => {
    const response = await get( "/bg/" );
    assertPublic( response, "public, max-age=60" );
    assert.match( response.text, /Е-рецепта[\s\S]*class="ahead"[^>]*>1\.5\.2<[\s\S]*>1\.5\.1</ );
} );
it( "shows the next production go-live with its breaking changes and a link to the comparison", async () => {
    assert.match( ( await get( "/bg/" ) ).text, /05\.12\.2026[\s\S]*\/bg\/changes\/e-prescription\/compare\?from=1\.5\.1&amp;to=1\.5\.2/ );
} );
it( "lists the latest publications, CL007 1.5.34 in production among them", async () => { /* … */ } );
it( "is the same page in English, linked both ways with hreflang", async () => {
    const response = await get( "/en/" );
    assert.match( response.text, /<html lang="en">/ );
    assert.match( response.text, /hreflang="bg" href="https:\/\/developers\.example\.test\/bg\/"/ );
    assert.match( response.text, /hreflang="x-default" href="https:\/\/developers\.example\.test\/bg\/"/ );
} );
it( "lists every module and the rules by stage on the specifications index", async () => { /* … */ } );
```

- [ ] **Step 2: Run them.** Expected: FAIL (404).
- [ ] **Step 3: Implement** H1 (§8.2), without the environment band, which comes with plan 8b's status. "Номенклатури"
  is one row: the count of lists, and how many have testing ahead, linked to the index.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(portal): the home page and the specifications by stage (HEL-35)`

---

### Task 5: Modules, rules and the message page

**Files:** Create `site/pages/message.js`, `test/specs.test.js`, `test/message.test.js`. Modify `site/pages/specs.js`
and `site/routes.js`.

**Interfaces:**
- **Consumes:** `findPublished`, `readersOf` (Task 1); `resolveVersion` (`@health-dev-portal/data/resolution`);
  `compareContents` and `itemKeys` (`@health-dev-portal/spec-model/differences`); `printCondition`
  (`…/condition-printer`).
- **Produces:**
  - `specPage`, `conditionsPage`, `dictionaryPage` and `messagePage( context, { spec, at, code, tab, slug } )`;
  - `endpointSegment( address ): string|null`;
  - `describeConstraint( element, lang ): SafeString`, in `format.js`.

- [ ] **Step 1: Write the failing tests** against the seed: e-Prescription 1.5.1 in production and 1.5.2 in testing.

```js
it( "groups a module's messages by endpoint segment", async () => { /* P001 under /doctor */ } );
it( "renders every element of P001 with its requirement, count, type, constraints and links", async () => {
    const response = await get( "/bg/specs/e-prescription/1.5.1/P001" );
    assertPublic( response, "public, max-age=86400" );
    assert.equal( rowsOf( response.text ).length, elementsOf( "P001" ).length );
    assert.match( rowOf( response.text, "contents/prescription/lrn" ), /R[\s\S]*1\.\.1[\s\S]*≤ 36/ );
    assert.match( rowOf( response.text, "contents/prescription/category" ), /href="\/bg\/nomenclatures\/CL007\/1\.5\.33"/ );
} );
it( "selects an element at its own address and fills the panel", async () => { /* aria-current; description */ } );
it( "shows a Bulgarian description on the English page, marked untranslated", async () => { /* … */ } );
it( "marks a testing page's elements new, changed or removed against production", async () => { /* decision 13 */ } );
it( "gives a stage page its fixed address as canonical, and caches it briefly", async () => { /* … */ } );
it( "answers a version that was never public, and an unknown message or element, with 404", async () => {
    // Staff-only stages have no public address at all; a development version has no number to be found by.
    for ( const path of [ "/bg/specs/rules/development", "/bg/specs/e-prescription/implementation", "/bg/specs/e-prescription/1.5.1/P999",
        "/bg/specs/e-prescription/1.5.1/P001/elements/none" ] ) {
        assert.equal( ( await get( path ) ).status, 404 );
    }
} );
it( "answers a retired version's fixed address with 410 and a link to its changes", async () => {
    const response = await get( `/bg/specs/e-prescription/${ SEED.history }` );
    assertPublic( response, "public, max-age=86400" );
    assert.equal( response.status, 410 );
    assert.match( response.text, /href="\/bg\/changes\/e-prescription"/ );
} );
it( "lists a message's conditions with an anchor each, and the module's rules with their error codes", async () => { /* … */ } );
it( "states a number's max= as a count of digits", async () => { /* "до 2 цифри" on a numeric field */ } );
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** decision 7 and the module, rules, conditions and dictionary pages.
  - "Used also in" scans the version's other messages.
  - A link to a code list or a rule uses `resolveVersion`'s number for the version shown.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(portal): modules, rules and the message page, every element at its own address (HEL-35)`

---

### Task 6: Nomenclatures

**Files:** Create `site/pages/nomenclatures.js`, `site/fold.js`, `test/unit/fold.test.js`, `test/nomenclatures.test.js`.
Modify `site/routes.js`.

**Interfaces:**
- **Consumes:** `listPublished`, `findPublished`, `readersOf` (Task 1); `fixedFile` (Task 2); `transliterate`
  (`@ti-engine/web-content/transliterate`).
- **Produces:**
  - `fold( text ): string` (decision 9);
  - `listsPage( context )`, `listPage( context, { id, at, q, expired, page } )`;
  - `downloadFile( context, { id, at, ext } )`.

- [ ] **Step 1: Write the failing tests.**

```js
it( "folds case, transliteration and Latin look-alikes the same way on both sides", () => {
    assert.equal( fold( "PeЦeпTA" ), fold( "рецепта" ) );
} );
it( "lists every published code list, and filters them by ID or name", async () => { /* ?q=CL00 and a name with a Latin letter */ } );
it( "shows a list's columns, hides expired entries unless asked, and names the messages that use it", async () => {
    const page = ( await get( "/bg/nomenclatures/CL007/production" ) ).text;
    assert.match( page, />T9</ );
    assert.doesNotMatch( page, />T4</ );
    assert.match( ( await get( "/bg/nomenclatures/CL007/production?expired=1" ) ).text, />T4</ );
    assert.match( page, /href="\/bg\/specs\/e-prescription\/1\.5\.1\/P001\/elements\/[^"]*category"/ );
} );
it( "pages CL011 by 500, and its downloads hold every entry", async () => {
    assert.equal( rowsOf( ( await get( "/bg/nomenclatures/CL011/production" ) ).text ).length, 500 );
    const json = await get( "/downloads/nomenclatures/CL011/1.5.33.json" );
    assertPublic( json, "public, max-age=31536000, immutable", "application/json; charset=utf-8" );
    assert.equal( JSON.parse( json.text ).entries.length, 39005 );
} );
it( "redirects a stage download to its fixed address", async () => { /* 302, public, max-age=60 */ } );
it( "answers the number of CL008's abandoned version with 404, page and downloads alike", async () => {
    for ( const path of [ `/bg/nomenclatures/CL008/${ SEED.cl008Abandoned }`, `/downloads/nomenclatures/CL008/${ SEED.cl008Abandoned }.json` ] ) {
        assert.equal( ( await get( path ) ).status, 404 );
    }
} );
it( "escapes the filter, and answers a page past the end with 404", async () => {
    const page = ( await get( "/bg/nomenclatures/CL007/production?q=%3Cscript%3E" ) ).text;
    assert.equal( page.includes( "<script>" ), false );
    assert.match( page, /value="&lt;script&gt;"/ );
    assert.equal( ( await get( "/bg/nomenclatures/CL007/production?page=999" ) ).status, 404 );
} );
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** decision 9, and the list page's note on CSV and JSON (decision 8).
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(portal): nomenclatures — every list, filtered and paged, with its JSON and CSV (HEL-35)`

---

### Task 7: Errors

**Files:** Create `site/pages/errors.js`, `test/errors.test.js`. Modify `site/routes.js`.

**Interfaces:** **Consumes:** `findPublished` (Task 1). **Produces:** `errorsPage( context, { testing } )`.

- [ ] **Step 1: Write the failing tests.**

```js
it( "explains every CL999 error with the rules that raise it", async () => {
    const page = ( await get( "/bg/errors" ) ).text;
    for ( const code of errorCodesOf( "CL999" ) ) {
        assert.match( page, new RegExp( `id="${ code }"` ) );
    }
    assert.match( page, /href="\/bg\/specs\/rules\/1\.1\.1#RL\d{3}"/ );
} );
it( "lists the CL998 warnings with their source", async () => { /* … */ } );
it( "answers the testing page with 404 while nothing of the three is in testing", async () => { /* … */ } );
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** decision 11.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(portal): errors and warnings, each with the rules that raise it (HEL-35)`

---

### Task 8: Changes, comparison and feeds

**Files:** Create `site/pages/changes.js`, `site/pages/feeds.js`, `test/changes.test.js`. Modify `site/routes.js`.

**Interfaces:**
- **Consumes:** `listPublished`, `findPublished`, `publishedChangelog`, `publications` (Task 1); `compareContents`.
- **Produces:** `changesIndexPage`, `changelogPage`, `comparePage( context, { spec, from, to } )` and
  `feed( context, { spec? } )`.

- [ ] **Step 1: Write the failing tests.**

```js
it( "gives a spec's changelog newest first, grouped by category", async () => {
    const page = ( await get( "/bg/changes/e-prescription" ) ).text;
    assert.ok( page.indexOf( "1.5.2" ) < page.indexOf( "1.5.1" ) );
    assert.match( page, /Несъвместими[\s\S]*Съвместими/ );
} );
it( "says when a version's dates were not recorded", async () => { /* a migrated history version */ } );
it( "leaves out a version abandoned before testing", async () => { /* CL008 */ } );
it( "compares two kept versions, structure and the entries between them", async () => {
    const response = await get( "/bg/changes/e-prescription/compare?from=1.5.1&to=1.5.2" );
    assertPublic( response, "public, max-age=60" );
    for ( const change of SEED.ePrescriptionChanges ) {
        assert.match( response.text, change.pattern );
    }
} );
it( "swaps a reversed comparison, and refuses a comparison of unknown versions", async () => { /* to < from; from=../1.5.1 → 404 */ } );
it( "publishes Atom feeds for everything and for one spec", async () => {
    const response = await get( "/bg/changes/e-prescription/feed.atom" );
    assertPublic( response, "public, max-age=60", "application/atom+xml; charset=utf-8" );
    assert.match( response.text, /^<\?xml version="1\.0" encoding="utf-8"\?>\s*<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/ );
} );
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** decision 10. The changelog page carries the comparison form, a GET form with two selects of
  kept versions.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(portal): changelogs, comparison and Atom feeds (HEL-35)`

---

### Task 9: Accessibility in Chromium, CI and the README

**Files:**
- Create: `packages/portal/test/a11y.test.js`.
- Modify: `packages/portal/package.json` (`playwright`, `@axe-core/playwright`, exact); `.github/workflows/ci.yml`;
  `packages/portal/README.md`.

**Interfaces:** **Consumes:** `startPortal` (Task 3).

- [ ] **Step 1: Write the test.**

```js
// Every page kind, in both languages: axe finds no violation of WCAG 2.1 A and AA (§8.5, EN 301 549).
it( "finds no WCAG 2.1 AA violation on any kind of page", async () => {
    for ( const path of PAGES ) {
        await page.goto( `${ url }${ path }` );
        const result = await new AxeBuilder( { page } ).withTags( [ "wcag2a", "wcag2aa", "wcag21a", "wcag21aa" ] ).analyze();
        assert.deepEqual( result.violations.map( ( one ) => `${ path } ${ one.id }` ), [] );
    }
} );
```

  It skips when Chromium is not installed, except in CI, where that fails.
- [ ] **Step 2: Run it.** Expected: the violations it finds. Fix each in the page that has it, never by a rule
  exception, and run it again until it passes.
- [ ] **Step 3: CI.** Add `npx playwright install --with-deps chromium` before `npm test`.
- [ ] **Step 4: The README:**
  - how to build the seed;
  - the environment, from `.env.example`;
  - what Task 3's measurement (b) settled about Redis;
  - `npm start --workspace packages/portal`.
- [ ] **Step 5: Run the definition of done.** `npm ci && npm run fixtures:fetch && npm run lint && npm test`. Expected:
  lint 0 errors; every workspace passes.
- [ ] **Step 6: Commit.** `test(portal): accessibility in Chromium on every kind of page (HEL-35)`

---

## Deliberately not in this plan

- **Plan 8b:**
  - schemas (generated XSDs, after HEL-26 and HEL-34) and sample messages;
  - guides and FAQ (§8.1; the solution architect owns the guides);
  - environment status (§8.7) and the home page's newcomer link;
  - search (§3.4).
- **Feeds in RSS.** Atom only; §7.10's "Atom/RSS" is met by one standard format.
- **A `TiWebAppManager`, sign-in and the staff area** (plan 9).
- **A CA card for ti-engine:** the framework exports no in-memory cache or test harness for a consumer's own HTTP
  tests, so the portal writes a stand-in replacing core's exported `cache.instance`. A supported one belongs in
  ti-engine.
- **web-content's `composeHead`** (decision 6, §8.5). A configurable `x-default` and optional social tags would let the
  portal use it; that is a ti-engine change, named here, not made.
