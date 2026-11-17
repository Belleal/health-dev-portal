# Plan 8c — Guides, FAQ, environment status and search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a developer on `/bg/` or `/en/` can:
- find where to start;
- see each environment's hosts and whether it is up;
- read the old FAQ's answers;
- find anything on the site by searching for it.

**Architecture:**
- **Guides and FAQ are Markdown in `content/`** (§3.5), under CC BY 4.0 (`LICENSE-CONTENT`).
  - Each file is registered by name in `content/content.yml`; nothing in the folder is served unless it is listed there. This is web-content's own stance: a content folder is never scanned.
  - The portal reads them once, at start, through web-content's `sources` and `markdown`.
  - A file it cannot read stops the start. The content ships in the image, so a broken file is a broken build, and a test that loads the real `content/` catches it in CI.
- **Environment status lives in the database** (two new tables).
  - Until plan 9's staff form, a command writes it: `hdp-status`.
  - The home page's band, the status page and its feed read it.
- **Search** is one index of everything public, folded the way the nomenclatures filter folds (`fold.js`, §3.4).
  - Each server process builds it in memory, from the testing and production versions and the content.
  - It is rebuilt on the first search after the published set changes.

**Tech Stack:**
- Node 26, CommonJS, `node --test`.
- Everything of plans 8a and 8b. web-content's `sources` (front matter through gray-matter) and `markdown` (markdown-it, `html: false`) are already in `@ti-engine/web-content` 0.5.4.
- **No new dependency.**

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md),
sections:
- §0.1 (what his.bg has);
- §2 (Guides and FAQ, Environment status, Search);
- **§3.4** and §3.5;
- **§8.1**, **§8.2**, §8.4, §8.5 and **§8.7**;
- §10.1–§10.3.

**Tracking:**
- **This plan:** HEL-40.
- **Plan 9** brings the staff form that replaces `hdp-status`, and plan 11 the Tools section.

## Decisions this plan takes

Reject any at review, before Task 1.

1. **Scope** (the split of 2026-11-16, and Boris's choice for the guides, "section plus two drafts"):
   - the Guides section, with drafts of Getting started and Environments;
   - the FAQ;
   - environment status, with the home page's band and the newcomer's link (§8.2);
   - search.

   The top bar gains Guides and FAQ after Changes, in §8.1's order, and a search box.

2. **The content folder.**

   | Path | What |
   |---|---|
   | `content/README.md` | How to add or change a guide or a question, for the solution architect and a business analyst |
   | `content/content.yml` | The register: the guides in order, the planned guides, the FAQ's categories and questions in order |
   | `content/guides/{slug}.bg.md` · `.en.md` | A guide in each language; the Bulgarian is required |
   | `content/faq/{slug}.bg.md` · `.en.md` | A question and its answer; the Bulgarian is required |

   - **The register** holds what both languages share, so that the two files cannot disagree on it:

     ```yaml
     guides:
       - slug: getting-started
         aiAssisted: true
         reviewed:            # the date the solution architect reviewed it; empty for a draft
         sources:
           - { title: "НЗИС Автентикация за Достъп до API", version: "1.0.2", url: "https://www.his.bg/upload/32/…" }
     planned:
       - slug: authentication
         title: { bg: "Автентикация", en: "Authentication" }
         legacy: { title: "НЗИС Автентикация за Достъп до API", version: "1.0.2", url: "https://www.his.bg/upload/32/…" }
     faq:
       source: "https://www.his.bg/bg/dev/faq"
       retrieved: "2026-11-17"
       categories:
         - key: authentication
           name: { bg: "Автентикация и подпис", en: "Authentication and signing" }
           questions: [ token-method, signature-schema, signature-format ]
     ```

   - **A guide's file:**
     - Its front matter holds `title`, `summary` and `updated` (a date).
     - Every `##` heading carries an explicit id, `## Среди {#environments}`, which web-content's attributes plugin writes as `<h2 id="environments">` (measured). The guide's contents in the sidebar are built from those headings.
     - An explicit id survives a change to the heading's wording, so a link to it keeps working.
   - **A question's file:** its front matter holds `question`; the body is the answer.
   - **Slugs** match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, and none is used twice.

3. **Front matter must open with a plain `---` line.**
   - **Why:** web-content's `parseRecord` hands front matter to gray-matter, whose JavaScript engine evaluates a `---js` block. Measured on 2026-11-17: `parseRecord( "---js\n{ title: ( globalThis.__ran = true, \"x\" ) }\n---\nbody" )` set `__ran`. Content may be written by a business analyst (§8.1), and a reviewer reading a Markdown diff does not expect code in it.
   - **What the loader does:** it reads each file's text itself, refuses one whose first line is not exactly `---`, and only then calls `parseRecord`.
   - **The register is safe:** it is parsed with `parseVocabulary`, gray-matter's YAML engine alone.
   - **The gap is web-content's.** It is named for a CA card in ti-engine (Task 7) and is not worked around past its `exports` map.

4. **The guides** (§8.1).
   - **Two drafts, in both languages:** Getting started and Environments. The English is a translation of the Bulgarian.
     - They are written from the three old PDFs that cover them, the FAQ, and the portal's own pages. Their sources are listed in Task 2.
     - **Nothing the sources do not say is asserted.** Where a newcomer needs a fact the sources lack, the draft leaves it out, and the pull request lists it as a question for the solution architect. Such facts include how a vendor gets access to the test environment, whether test certificates exist, rate limits, and the forum's address.
   - **Marking** (§8.1; the organisation's rule on AI-generated content):
     - A guide with `aiAssisted: true` and no `reviewed` date opens with a notice:
       - Bulgarian: "Чернова, изготвена с помощта на изкуствен интелект. Архитектът на решението още не я е прегледал: проверявайте всичко в нея срещу спецификациите."
       - English: "A draft written with the help of artificial intelligence. The solution architect has not yet reviewed it: check everything in it against the specifications."
     - Once reviewed, the notice becomes "Изготвено с помощта на изкуствен интелект; прегледано на {date}." / "Written with the help of artificial intelligence; reviewed on {date}." The mark stays after review, as §8.1 says.
   - **The seven planned guides** are listed on the index, each marked "Предстои" / "Coming":
     - authentication, signing, NRN generation, 2D barcode, secure network, dosage parser and error handling;
     - where an old his.bg PDF covers one, the line links it: "Дотогава: {title} v{version} (PDF, his.bg)" / "Meanwhile: {title} v{version} (PDF in Bulgarian, his.bg)";
     - **why:** until a guide is written, that PDF is all a vendor has, and saying so is better than an empty section.
   - **Each guide page** shows:
     - its sources, by title, version and link;
     - its `updated` date;
     - the licence line: "Текстът е под лиценз CC BY 4.0" / "This text is licensed under CC BY 4.0", linking `https://creativecommons.org/licenses/by/4.0/deed.bg` or `deed.en`.

5. **The FAQ** (§8.1: "migrated as they are (review later), categorised, searchable").
   - **The eleven questions**, in his.bg's order within each category, with their slugs:

     | Category | Questions |
     |---|---|
     | `authentication` — Автентикация и подпис / Authentication and signing | 1 `token-method`, 2 `signature-schema`, 3 `signature-format` |
     | `messages` — Съобщения / Messages | 5 `repeated-elements`, 10 `lrn`, 11 `patient-names` |
     | `e-referral` — Е-направление / e-Referral | 4 `lab-staff`, 6 `nhif-number`, 8 `cdr07-country`, 9 `pmi-deputy` |
     | `nomenclatures` — Номенклатури / Code lists | 7 `qualification-gp` |

   - **Verbatim** from `https://www.his.bg/bg/dev/faq` as fetched on 2026-11-17. Only these changes are made:
     - the `В: ` and `О: ` prefixes are dropped;
     - `&ndash;` becomes "–";
     - no link is added, and no typo is fixed.
   - **Bulgarian only.** The English page shows the Bulgarian, marked "not yet translated" (§8.4).
   - **The page opens with a notice:**
     - Bulgarian: "Въпросите и отговорите са пренесени без промяна от his.bg, където са без дати и са главно от въвеждането на е-направлението. Предстои преглед."
     - English: "These questions and answers were moved unchanged from his.bg, where they are undated and mostly from the e-Referral rollout, and they are in Bulgarian only. A review is planned."
   - **For the review**, listed in the pull request and not acted on here:
     - question 1 names GET, while the authentication PDF's alternative method POSTs a signed challenge;
     - question 2 gives xmldsig's namespace as the schema's address, and the portal now serves the schema beside every set;
     - question 6 has the typo "склчени".

6. **Environment status** (§8.7).
   - **Environments,** in this order:
     - `production` — Продукционна среда / Production environment;
     - `test` — Тестова среда / Test environment.
   - **States:**

     | Key | Bulgarian | English |
     |---|---|---|
     | `operational` | Работи нормално | Operational |
     | `degraded` | Работи със затруднения | Degraded |
     | `maintenance` | Профилактика | Maintenance |
     | `outage` | Не работи | Outage |
     | *(nothing set yet)* | Няма данни | Not reported |

     - **A state is always written in words.** Colour only adds to it (WCAG 1.4.1).
     - **With nothing set, the site never claims that an environment works.**
   - **Messages.** A message is optional; when given, it is given in both languages (§8.7).
   - **Maintenance windows:**
     - each has an environment, a start, an end and an optional message;
     - a window is shown from when it is announced until it ends;
     - a cancelled window is not shown, and its feed entry says it was cancelled.
   - **Who and when** (§8.7, §10.1, §10.2). Every update records who made it and when.
     - **Public:** the time only. No public page or feed names anyone.
     - **The "who"** is kept for staff. Plan 9 replaces the command's free text with the staff member's Entra object ID.
   - **Times:**
     - stored as UTC ISO strings (`toISOString()`), sorted in JavaScript (§3.2);
     - shown in Sofia time (§7.12): `20.11.2026 22:00` in Bulgarian, en-GB's `20 Nov 2026, 22:00` in English.
   - **The command:** `hdp-status`, in `@health-dev-portal/data`. It runs the schema's migrations first, as `hdp-copy` does for its target. It refuses a time without an offset (`2026-11-20T22:00+02:00`), since a bare local time is ambiguous for an hour each October.

     ```text
     hdp-status [--database <url>] show
     hdp-status set --environment <production|test> --state <operational|degraded|maintenance|outage> [--bg <text> --en <text>] --by <who>
     hdp-status window add --environment <…> --from <time with offset> --to <time with offset> [--bg <text> --en <text>] --by <who>
     hdp-status window cancel --id <id> --by <who>
     ```

   - **Pages:**
     - `/{lang}/status`: each environment's state, message and time; the windows that have not ended; the last 20 updates; and the feed.
     - `/{lang}/status/feed.atom`: status updates and maintenance windows, newest first, 50 at most, as plan 8a's feeds are written.
     - Both are cached for a minute (§10.3).
   - **The home page's band** (§8.2):
     - each environment's state, linked to the status page;
     - a line for each window that has not ended;
     - "Нов разработчик? Започнете оттук" / "New developer? Start here", linking Getting started.

7. **Search** (§3.4, a design call this plan records there).
   - **What is found:**

     | Group, in this order | From | Title | Linked |
     |---|---|---|---|
     | Guides | `content/` | its title | the guide |
     | Questions | `content/` | the question | `/{lang}/faq#{slug}` |
     | Specifications | each module and the rules | the spec's name | the spec page |
     | Messages | each message not withdrawn | code and title | the message page |
     | Conditions | each module's conditions | its ID | its anchor on the conditions page |
     | Rules | the rules | its ID | its anchor on the rules page |
     | Code lists | each list | ID and name | the list page |
     | Errors, Warnings | CL999 and CL998 entries | the key | its anchor on the errors page |
     | Elements | each element of each message not withdrawn | its name (`elementName`) | the element's address |

   - **Which versions:**
     - testing and production. Production comes first, and a testing version adds only what production lacks, linked at the testing address and marked "в тестване" / "in testing";
     - not previous production, which expires by date with nothing to trigger a rebuild. Its stage switcher still reaches it;
     - not code-list entries, which each list's own filter searches, and not changelogs.
   - **Matching:**
     - Each word of the query must be found in the entry's folded title, text, code and element path, in either form that `needles` gives (plan 8a, decision 9). Both languages are searched, whatever the page's language.
     - **The order:**
       1. an entry whose code, folded, equals a word (`p001` finds P001 first);
       2. then one whose title has every word;
       3. then the rest, in the index's own order.
     - Each group shows 20 at most, with its total.
     - There are no snippets around a match: transliteration changes the text's length, so a match's position in the folded text is not its position in the original.
   - **Limits:**
     - a query of fewer than 2 characters asks for more;
     - one of more than 200 says it is too long;
     - both answer 200, and the query is shown escaped.
   - **The index** (refining §3.4's "built at publish time … into an index file"):
     - **Built** in memory by each server process, on its first search, and again on the first search after the published set changes.
     - **The change** is noticed through a fingerprint: SHA-256 of the sorted IDs of every testing and production version that `listPublished` gives, read on each search.
     - **One build at a time** per fingerprint.
     - **Why not a stored file:** it would need a rule for when a code change makes it stale, whereas memory starts empty after every deploy. Task 6 records the build's time on the seed.
     - **Each portal has its own index,** held by the server instance, never by the module, so two portals in one test process never share one.
   - **Pages:**
     - `/{lang}/search?q=…`, cached briefly. Its canonical is its own address with the query, as the nomenclatures filter's is.
     - The top bar holds a GET form to it, so search works without JavaScript.

8. **Prose styling.**
   - A guide's tables take the `rows` style.
   - Its `<pre>` blocks wrap (`white-space: pre-wrap; overflow-wrap: anywhere`), so none scrolls.
     - **Why:** plan 8b measured axe's `scrollable-region-focusable` on a scrolling `<pre>`, and Markdown's blocks cannot carry `tabindex`.

9. **Tests**, as in plan 8a's decision 12:
   - the data layer on SQLite and PostgreSQL;
   - the portal over HTTP on the seed;
   - axe in Chromium for every new page.

   Content fixtures are built in code in a temporary directory, so no broken or `---js` file is committed.

## Global Constraints

- **Node 26**, CommonJS, `node --test`.
- **House style:**
  - four-space indent, double quotes, semicolons, spaces inside brackets;
  - JSDoc on everything exported;
  - shared shapes as `@typedef`s in the package's `definitions.types.js`;
  - `#alias` inside a package, the `exports` map across packages, never a deep path past one.
- **The SQL subset of design record §3.2:**
  - `?` placeholders;
  - `TEXT` and `INTEGER` columns;
  - never ordering by text, so times are sorted in JavaScript;
  - no `LIKE`;
  - at most 100 parameters per statement;
  - batches, not transactions.
- **Every test of the data layer runs on SQLite and PostgreSQL** (`eachDatabase`).
- **No public page or feed shows:**
  - a development or implementation version;
  - a person's name or ID, which includes a status update's "who";
  - an anomaly or a staff comment.
- **No portal response sets a cookie.** No inline `style` attribute, no inline script.
- **The framework knows nothing of the portal.** A generic gap found here is named for a CA card in ti-engine, never patched through a deep path.
- **No new dependency.**
- **Never commit unpublished specification data**, `.env`, secrets or workbooks.
- **Never copy personal data from the old PDFs into `content/`.** Their document histories name their authors.
- **Placeholders, never token-like values,** in any example: `<nhis:accessToken value="…"/>`.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Every new `.js` file begins with the EUPL block** of `packages/importer/read/raw.js`, lines 1–16, verbatim.
- **Code with backslashes or regular expressions** is written with the Write and Edit tools, not through a shell.
- **Running one test file:** `node --test <file>`. After a change under `packages/data` or `packages/spec-model`, run
  `npm run pretest -w packages/portal` first, so the seed holds the new tables (plan 8b's constraint).

## Review Focus

1. **Front matter that is code.**
   - The case: a registered file opening `---js` with a side effect.
   - Expected:
     - the side effect never happens;
     - the loader's error names the file;
     - the portal does not start.
   - → Task 1, "refuses front matter that does not open with a plain --- line, without running it"; Task 3, "refuses to start on content it cannot load, naming the file".
2. **An English text that does not exist:** every question, and a guide without `.en.md`.
   - Expected:
     - the Bulgarian, in `lang="bg"`, with "not yet translated";
     - never an empty page, and never a 404.
   - → Task 3, "shows the FAQ in Bulgarian on the English page, marked" and "shows a guide's Bulgarian on the English page when it has no English, marked".
3. **A degenerate or hostile query:**
   - the cases:
     - empty, `a`, and 201 characters;
     - `<script>`;
     - `.*(`;
     - `PeЦeпTA`, `retsepta` and `p001`.
   - Expected:
     - 200 every time, never 500;
     - the query escaped;
     - look-alikes and romanisations found;
     - a code found whatever its case.
   - → Task 6, "answers short, long and hostile queries" and "finds by look-alike letters, romanisation and code in any case".
4. **A promotion while the portal runs.**
   - Expected: the next search finds `exampleNote`, added in e-Prescription 1.5.2, at production rather than testing, with no restart.
   - → Task 6, "finds what a promotion made public on the next search".
5. **No status set, and windows across the October clock change.**
   - Expected:
     - "Not reported", never "Operational";
     - a window on 25.10.2026 shown in Sofia time on both sides of the change;
     - an ended or a cancelled window not shown.
   - → Task 4, "lists the windows that have not ended, without the cancelled"; Task 5, "says Not reported before any status is set" and "shows times in Sofia time across the clock change".

## File map

| File | Responsibility |
|---|---|
| `content/README.md`, `content/content.yml` | How content is written; the register |
| `content/faq/*.bg.md` | The eleven questions (Task 1) |
| `content/guides/*.md` | Getting started and Environments (Task 2) |
| `packages/portal/site/content.js` | `loadContent`, `ContentError`, `CONTENT_DIRECTORY` |
| `packages/portal/site/pages/guides.js`, `pages/faq.js` | The Guides section and the FAQ |
| `packages/data/store/schema.js`, `store/status.js`, `bin/status.js` | The status tables, their API, `hdp-status` |
| `packages/portal/site/pages/status.js`, `pages/home.js` | The status page and feed; the band |
| `packages/portal/site/search.js`, `pages/search.js` | The index and matching; the search page |
| `packages/portal/site/paths.js`, `routes.js`, `layout.js`, `labels.js`, `format.js` | Addresses, the top bar and its search box, the words, `formatDateTime` |
| `packages/portal/bin/portal-server.js` | Loads the content at start; holds the search |
| `packages/portal/public/portal/portal.css` | Prose, the band's states, the search box |

---

### Task 1: The content register, its loader, and the FAQ moved over

**Files:**
- Create:
  - `content/README.md`, `content/content.yml`;
  - `content/faq/{slug}.bg.md` × 11;
  - `packages/portal/site/content.js`.
- Modify: `packages/portal/package.json` (`#content`), `packages/portal/site/definitions.types.js`.
- Test: `packages/portal/test/unit/content.test.js`.

**Interfaces:**
- Produces:
  - `loadContent( directory: string ) => Content`, synchronous, read at start.
  - `CONTENT_DIRECTORY`: the repository's `content/`, resolved from the package.
  - `ContentError extends Error`, with `problems: string[]`. Every problem is found before throwing, each naming its file.
  - The `@typedef`s:
    - `Content = { guides: Guide[], planned: PlannedGuide[], faq: { source, retrieved, categories: FaqCategory[] } }`;
    - `Guide = { slug, aiAssisted, reviewed: string|null, sources: Source[], texts: { bg: GuideText, en: GuideText|null } }`;
    - `GuideText = { title, summary, updated: "yyyy-mm-dd", html: SafeString, contents: Array<{ id, title }>, plain }`;
    - `PlannedGuide = { slug, title: LocalText, legacy: Source|null }`, with `Source = { title, version, url }`;
    - `FaqCategory = { key, name: LocalText, questions: FaqEntry[] }`;
    - `FaqEntry = { slug, texts: { bg: { question, html, plain }, en: …|null } }`.
- At this task, the register has no guides and all nine planned ones. Task 2 moves two of them.

- [ ] **Step 1: Write the failing tests.** Each builds its content in a temporary directory, as `support/seed.js` builds
  its fixtures in code.

```js
it( "loads the register's guides, planned guides and questions in its order", () => {
    const content = loadContent( folder( { register: REGISTER, files: FILES } ) );
    assert.deepEqual( content.guides.map( ( one ) => one.slug ), [ "first", "second" ] );
    assert.deepEqual( content.faq.categories.map( ( one ) => one.key ), [ "authentication", "messages" ] );
} );
it( "renders a guide's headings with their ids and lists them as its contents", () => {
    const guide = loadContent( folder( … ) ).guides[ 0 ].texts.bg;
    assert.match( String( guide.html ), /<h2 id="environments">Среди<\/h2>/ );
    assert.deepEqual( guide.contents, [ { id: "environments", title: "Среди" } ] );
    assert.equal( guide.updated, "2026-11-17" );
} );
it( "refuses front matter that does not open with a plain --- line, without running it", () => {
    globalThis.__contentRan = false;
    const error = assert.throws( () => loadContent( folder( { …, "faq/one.bg.md": "---js\n{ question: ( globalThis.__contentRan = true, \"x\" ) }\n---\nО" } ) ), ContentError );
    assert.equal( globalThis.__contentRan, false );
    assert.match( error.problems.join( "\n" ), /faq[\\/]one\.bg\.md/ );
} );
it( "refuses a heading without an id, a missing Bulgarian file, a repeated slug and a malformed one, naming each", () => {
    // one register and folder with all four: the error lists four problems
} );
it( "leaves a missing English text null", () => { … assert.equal( content.faq.categories[ 0 ].questions[ 0 ].texts.en, null ); } );
it( "reads no file the register does not name", () => {
    // faq/stray.bg.md holds "---js …": loading succeeds
} );
it( "loads the repository's own content", () => {
    const content = loadContent( CONTENT_DIRECTORY );
    assert.deepEqual( content.faq.categories.map( ( one ) => [ one.key, one.questions.length ] ),
        [ [ "authentication", 3 ], [ "messages", 3 ], [ "e-referral", 4 ], [ "nomenclatures", 1 ] ] );
    assert.equal( content.faq.categories[ 0 ].questions[ 0 ].texts.bg.question,
        "При обръщението към https://auth.his.bg кой метод се използва – POST или GET?" );
    assert.equal( content.planned.length, 9 );
} );
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `node --test packages/portal/test/unit/content.test.js`
  - Expected: they fail on the missing module `#content`.
- [ ] **Step 3: Implement `content.js`** (decisions 2 and 3).
  - **Reading:** `parseVocabulary` for the register. For each registered file, its text is read, its first line is checked to be `---` (a trailing `\r` tolerated), and only then does `parseRecord( text, { format: "markdown" } )` run.
  - **Rendering:** web-content's `render`.
  - **Dates:** a YAML date comes back as `2026-11-17T00:00:00.000Z` (measured), so `updated`, `reviewed` and `retrieved` keep their first ten characters after the pattern check.
  - **Contents and search text:** headings are read from the source lines `## Title {#id}`. `plain` is the body with the `{#…}` marks removed.
- [ ] **Step 4: Move the FAQ** into `content/faq/`, as decision 5 says, from the page fetched on 2026-11-17.
  - The register lists the categories, the source and the date retrieved, and the nine planned guides, with the old PDFs' addresses as `specifications.html` links them.
  - `content/README.md` says, for someone who is not a programmer:
    - how to add a guide or a question;
    - the plain `---` rule, and why;
    - the heading ids;
    - the `reviewed` date;
    - that a pull request's checks prove the content loads.
- [ ] **Step 5: Run the tests.**
  - Run: `node --test packages/portal/test/unit/content.test.js`
  - Expected: all pass.
- [ ] **Step 6: Commit** — `feat(portal): the content register and its loader, and the FAQ moved from his.bg (HEL-40)`

### Task 2: The Getting started and Environments drafts

**Files:**
- Create: `content/guides/getting-started.bg.md`, `.en.md`, `content/guides/environments.bg.md`, `.en.md`.
- Modify: `content/content.yml`, moving both from `planned` to `guides`, with their sources.
- Test: `packages/portal/test/unit/content.test.js`.

**Interfaces:**
- Consumes: `loadContent` (Task 1).
- Produces:
  - two guides, `aiAssisted: true` with no `reviewed` date;
  - Getting started's heading ids, which Task 3's band links to: `what`, `environments`, `certificate`, `token`, `signing`, `first-message`, `changes`, `questions`;
  - Environments': `overview`, `versions`, `status`, `hospital-network`.

**Sources, and what each draft takes from them.** Nothing else is asserted (decision 4).

| Source | Gives |
|---|---|
| *Техническа спецификация за реализация на автентикацията за достъп до бизнес API на НЗИС*, v1.0.2 (his.bg, `upload/32`) | Production `auth.his.bg`, `api.his.bg`; public test `ptest-auth.his.bg`, `ptest-api.his.bg`; the token from `/token` with a qualified certificate (КЕП); the S001 answer's fields; `Authorization: Bearer`; `expiresIn` in seconds and 401 on expiry; the alternative: 401 with a challenge, signed in XMLDSig and POSTed to `/token` |
| *Инструкция за конфигуриране и използване на сигурна информационна преносна мрежа между ЛЗБП и НЗИС*, v1.0.0 (`upload/285`) | `hospital-auth.his.bg`, `hospital-api.his.bg`, and `hospital-cc.his.bg` to check access without a token; same specifications as public access; by name only, through DNS, never fixed addresses |
| *НЗИС Общи медицински услуги — Инструкции за употреба*, v1.0.3 (`upload/239`) | Requests and answers in pairs (C001/C002); C001 gives code lists with no signature |
| The FAQ (Task 1) | The signature covers the whole message and holds the certificate (question 3) |
| The portal | Stages and the notice period (§7.1, §7.6); the Specifications, Nomenclatures, Errors, Schemas (xmldsig) and Changes sections; the status page |

- [ ] **Step 1: Write the failing test**

```js
it( "has the two guide drafts, in both languages, marked as unreviewed", () => {
    const content = loadContent( CONTENT_DIRECTORY );
    assert.deepEqual( content.guides.map( ( one ) => one.slug ), [ "getting-started", "environments" ] );
    for ( const guide of content.guides ) {
        assert.equal( guide.aiAssisted, true );
        assert.equal( guide.reviewed, null );
        assert.ok( guide.texts.en, guide.slug );
        assert.deepEqual( guide.texts.en.contents.map( ( one ) => one.id ), guide.texts.bg.contents.map( ( one ) => one.id ) );
    }
    assert.equal( content.planned.length, 7 );
} );
it( "names no host the sources do not", () => {
    // Every *.his.bg host in either guide, in either language, is one the sources name: a host the drafts made up would
    // send a vendor's software somewhere that is not NHIS.
    const KNOWN = new Set( [ "auth", "api", "ptest-auth", "ptest-api", "hospital-auth", "hospital-api", "hospital-cc", "www" ].map( ( one ) => `${ one }.his.bg` ) );
    for ( … every text's plain … ) {
        for ( const host of text.match( /[a-z0-9-]+\.his\.bg/g ) || [] ) {
            assert.ok( KNOWN.has( host ), host );
        }
    }
} );
```

- [ ] **Step 2: Run it and watch it fail.**
  - Run: `node --test packages/portal/test/unit/content.test.js`
  - Expected: the first test fails, since there are no guides yet.
- [ ] **Step 3: Write the drafts.**
  - Plain, short sentences, with the heading ids above.
  - The token's example is the S001 answer with `value="…"`, never the PDF's sample string.
  - No author, no document history, no person's name.
  - The English follows the Bulgarian section by section.
- [ ] **Step 4: Run the tests.**
  - Run: `node --test packages/portal/test/unit/content.test.js`
  - Expected: all pass.
- [ ] **Step 5: Commit** — `docs(content): drafts of Getting started and Environments, AI-assisted and marked (HEL-40)`. The body lists the questions for the solution architect.

### Task 3: The Guides and FAQ pages

**Files:**
- Create: `packages/portal/site/pages/guides.js`, `pages/faq.js`.
- Modify:
  - `paths.js`, `routes.js`, `layout.js`, `labels.js`, `definitions.types.js`;
  - `bin/portal-server.js`;
  - `public/portal/portal.css`;
  - `test/support/server.js`: `startPortal( { contentDirectory } )` sets `HDP_CONTENT_DIR`.
- Test: `packages/portal/test/guides.test.js`, `test/faq.test.js`, `test/unit/paths.test.js`.

**Interfaces:**
- Consumes: `loadContent`, `CONTENT_DIRECTORY` (Task 1).
- Produces:
  - **Addresses:** `paths.guides( lang )`, `paths.guide( lang, slug )`, `paths.faq( lang )`.
  - **Parsing:** `parseAddress` gives `{ page: "guides" }`, `{ page: "guide", slug }` and `{ page: "faq" }`. A slug that fails the pattern parses as `null`.
  - **Context:** `PageContext.content: Content`.
  - **The server:** `PortalServer#open` loads the content from `HDP_CONTENT_DIR` or `CONTENT_DIRECTORY` before the database. A `ContentError` stops the start, with its problems in the message.
  - **The top bar:** `layout.page`'s `section` takes `guides` and `faq`.
  - **The words:** `label` keys `sectionGuides`, `sectionFaq`, `guidesLede`, `guidesPlanned`, `guidePlannedLegacy`, `guideDraftNotice`, `guideReviewedNotice`, `guideSources`, `guideUpdated`, `guideContents`, `contentLicence`, `faqNotice`, with the texts of decisions 4 and 5.

- [ ] **Step 1: Write the failing tests**

```js
// guides.test.js
it( "lists the guides in the register's order, a draft marked, and the planned ones with their old document", async () => {
    const response = await get( "/bg/guides" );
    assertPublic( response, BRIEF, HTML );
    assert.ok( response.text.indexOf( "/bg/guides/getting-started" ) < response.text.indexOf( "/bg/guides/environments" ) );
    assert.match( response.text, /Предстои/ );
    assert.match( response.text, /href="https:\/\/www\.his\.bg\/upload\/32\// );
} );
it( "serves a guide with its contents, its AI-draft notice, its sources and its licence", async () => {
    const response = await get( "/bg/guides/getting-started" );
    assert.match( response.text, /Чернова, изготвена с помощта на изкуствен интелект/ );
    assert.match( response.text, /<a href="#token">/ );
    assert.match( response.text, /<h2 id="token">/ );
    assert.match( response.text, /deed\.bg/ );
} );
it( "shows a guide's Bulgarian on the English page when it has no English, marked", async () => {
    // a portal started on a content folder built in code whose one guide has no .en.md
    assert.match( text, /<div lang="bg">/ );
    assert.match( text, /not yet translated/ );
} );
it( "answers an unknown or malformed guide with 404", async () => {
    for ( const address of [ "/bg/guides/nope", "/bg/guides/Getting-Started", "/bg/guides/getting-started/more", "/bg/guides/%2e%2e" ] ) {
        assert.equal( await rawStatus( address ), 404, address );
    }
} );
it( "refuses to start on content it cannot load, naming the file", async () => {
    await assert.rejects( startPortal( { contentDirectory: brokenFolder() } ), /faq[\\/]one\.bg\.md/ );
} );
// faq.test.js
it( "groups the questions by category, each at its own anchor, and says they are unreviewed", async () => {
    const response = await get( "/bg/faq" );
    assert.match( response.text, /Предстои преглед/ );
    assert.match( response.text, /<h3 id="token-method">При обръщението към https:\/\/auth\.his\.bg кой метод се използва – POST или GET\?<\/h3>/ );
    assert.ok( response.text.indexOf( "Автентикация и подпис" ) < response.text.indexOf( "Номенклатури</h2>" ) );
} );
it( "shows the FAQ in Bulgarian on the English page, marked", async () => {
    const response = await get( "/en/faq" );
    assert.match( response.text, /lang="bg"/ );
    assert.match( response.text, /not yet translated/ );
    assert.match( response.text, /Authentication and signing/ );
} );
it( "names Guides and FAQ in the top bar, marked on their own pages", async () => { … aria-current="true" … } );
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `node --test packages/portal/test/guides.test.js packages/portal/test/faq.test.js`
  - Expected: they fail with 404.
- [ ] **Step 3: Implement.**
  - **The guide page:**
    - its contents go in the sidebar, as a `nav` named `guideContents`;
    - the notice comes before the `h1`;
    - an English page without English shows the Bulgarian title and body inside `<div lang="bg">`, with the `untranslated` marker after the title.
  - **The FAQ:**
    - the categories go in the sidebar;
    - each question is an `h3` with its slug as id;
    - a missing English shows the same way.
  - **Caching:** `CACHE.BRIEF` for all three pages.
  - **The CSS:** the prose rules of decision 8.
- [ ] **Step 4: Run the portal's suite.**
  - Run: `npm test -w packages/portal`
  - Expected: all pass, with plan 8a's top-bar tests updated for the two new sections.
- [ ] **Step 5: Commit** — `feat(portal): the Guides section and the FAQ (HEL-40)`

### Task 4: Environment status in the database, and `hdp-status`

**Files:**
- Modify:
  - `packages/data/store/schema.js`: migration `0005-status`, and `TABLES`;
  - `store/copy.js`: the key columns;
  - `definitions.types.js`;
  - `package.json`: bin `hdp-status`, export `./status`, import `#status`.
- Create: `packages/data/store/status.js`, `packages/data/bin/status.js`.
- Test: `packages/data/test/status.test.js` (`eachDatabase`), `packages/data/test/status-cli.test.js`.

**Interfaces:**
- Produces:
  - **Constants:** `ENVIRONMENT = { PRODUCTION: "production", TEST: "test" }`, `ENVIRONMENTS`, in that order, and `STATE`, with the four keys of decision 6.
  - **Writing:**
    - `setStatus( db, { environment, state, message?: LocalText|null, by, at?: Date } ) => Promise<string>`, the new update's ID;
    - `addMaintenance( db, { environment, startsAt, endsAt, message?, by, at? } ) => Promise<string>`;
    - `cancelMaintenance( db, id, { by, at? } ) => Promise<boolean>`, false for an unknown or already cancelled window.
    - **Refusals:** `setStatus` and `addMaintenance` throw `RangeError` for:
      - an unknown environment or state;
      - a message with only one language;
      - a blank `by`;
      - an end not after the start.
  - **Reading:**
    - `currentStatus( db ) => Promise<Array<{ environment, state: string|null, message, updatedAt: string|null }>>`, one per environment, in order;
    - `statusHistory( db, { limit = 20 } ) => Promise<Array<{ id, environment, state, message, updatedAt }>>`, newest first;
    - `maintenanceWindows( db, { now: Date } ) => Promise<Array<{ id, environment, startsAt, endsAt, message }>>`: neither ended nor cancelled, by start;
    - `statusEvents( db, { limit = 50 } ) => Promise<Array<StatusEvent>>`, newest first.
      - A status update's time is its `updatedAt`.
      - A window's is its cancellation's, if any, else its announcement's.
      - `StatusEvent = { kind: "status"|"maintenance", id, environment, at, state?, startsAt?, endsAt?, cancelled?, message }`.
    - **No reading function returns `by`.**
  - **The tables:**
    - `status_updates ( id TEXT PRIMARY KEY, environment TEXT NOT NULL CHECK …, state TEXT NOT NULL CHECK …, message_bg TEXT, message_en TEXT, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL )`, indexed on `environment`;
    - `maintenance_windows ( id TEXT PRIMARY KEY, environment …, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, message_bg TEXT, message_en TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, cancelled_by TEXT, cancelled_at TEXT )`;
    - IDs from `crypto.randomUUID()`, as `changelog.js` makes them.

- [ ] **Step 1: Write the failing tests**

```js
// status.test.js, inside eachDatabase
it( "reports nothing for an environment no one has set", async () => {
    assert.deepEqual( await currentStatus( db ), [ { environment: "production", state: null, message: null, updatedAt: null },
        { environment: "test", state: null, message: null, updatedAt: null } ] );
} );
it( "keeps the latest update of each environment, and never says who", async () => {
    await setStatus( db, { environment: "test", state: "degraded", message: { bg: "Бавно", en: "Slow" }, by: "staff-a", at: new Date( "2026-11-17T08:00:00Z" ) } );
    await setStatus( db, { environment: "test", state: "operational", by: "staff-b", at: new Date( "2026-11-17T09:00:00Z" ) } );
    const [ , test ] = await currentStatus( db );
    assert.deepEqual( test, { environment: "test", state: "operational", message: null, updatedAt: "2026-11-17T09:00:00.000Z" } );
    assert.equal( JSON.stringify( await statusHistory( db ) ).includes( "staff-" ), false );
} );
it( "refuses an unknown state, a one-language message and a blank author", async () => { … RangeError ×3 … } );
it( "lists the windows that have not ended, without the cancelled", async () => {
    // one ended, one cancelled, two to come: two, by start
} );
it( "gives the feed's events newest first, a cancelled window at its cancellation", async () => { … } );
// status-cli.test.js: run node packages/data/bin/status.js on a temporary SQLite file
it( "sets a status and shows it", … );
it( "refuses a time without an offset, saying how to write one", … );   // stderr matches /2026-11-20T22:00\+02:00/, exit 1
it( "refuses an unknown state, naming the four", … );
it( "cancels a window", … );
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `node --test packages/data/test/status.test.js packages/data/test/status-cli.test.js`, with `HDP_TEST_POSTGRES_URL` set.
  - Expected: they fail on the missing module.
- [ ] **Step 3: Implement**, as the interfaces say.
  - Reading: the rows of one environment are read and the latest is picked in JavaScript (§3.2). An update's ISO string sorts as its time.
  - The command parses with `node:util`'s `parseArgs`, as `migrate.js` does, and runs `migrateSchema` first.
- [ ] **Step 4: Run the data layer's suite.**
  - Run: `npm test -w packages/data`
  - Expected: all pass on both databases, the copy test included with the two new tables.
- [ ] **Step 5: Commit** — `feat(data): environment status and maintenance windows, set by hdp-status (HEL-40)`

### Task 5: The status page, its feed, and the home page's band

**Files:**
- Create: `packages/portal/site/pages/status.js`.
- Modify: `pages/home.js` (the band; its header comment, which still says plan 8b brings it), `paths.js`, `routes.js`, `labels.js`, `format.js`, `portal.css`.
- Test: `packages/portal/test/status.test.js`, `test/home.test.js`, `test/unit/format.test.js`.

**Interfaces:**
- Consumes:
  - from Task 4: `currentStatus`, `statusHistory`, `maintenanceWindows`, `statusEvents`, `ENVIRONMENTS`, `STATE`;
  - `paths.guide` (Task 3).
- Produces:
  - **Addresses:** `paths.status( lang )`, `paths.statusFeed( lang )`. `parseAddress` gives `{ page: "status" }` and `{ page: "status-feed" }`.
  - **Formatting:** `formatDateTime( moment: string|Date, lang ) => string`, in Sofia time: `dd.mm.yyyy HH:mm`, or en-GB's date and 24-hour time. The output is measured and recorded in a comment, as `formatDate`'s is.
  - **The words:** `label` keys `environmentProduction`, `environmentTest`, `stateOperational`, `stateDegraded`, `stateMaintenance`, `stateOutage`, `stateNotReported`, `statusTitle`, `statusUpdated`, `statusHistory`, `maintenancePlanned`, `statusFeed`, `newcomer`. `status.js` maps each environment and state key to its label key; a key is never spliced into a label's name.

- [ ] **Step 1: Write the failing tests**

```js
// unit/format.test.js
it( "shows times in Sofia time across the clock change", () => {
    assert.equal( formatDateTime( "2026-10-24T23:30:00Z", "bg" ), "25.10.2026 02:30" );   // EEST, +3
    assert.equal( formatDateTime( "2026-10-25T01:30:00Z", "bg" ), "25.10.2026 03:30" );   // EET, +2
} );
// status.test.js
it( "says Not reported before any status is set", async () => {
    const response = await get( "/en/status" );
    assertPublic( response, BRIEF, HTML );
    assert.match( response.text, /Production environment[\s\S]*Not reported/ );
    assert.doesNotMatch( response.text, /Operational/ );
} );
it( "shows each environment's state, message and time, and the windows to come, never who", async () => {
    // set through the data layer on the copy (portal.database), as lifecycle.test.js moves specs
} );
it( "serves the status feed, newest first, naming no one", async () => {
    const response = await get( "/bg/status/feed.atom" );
    assertPublic( response, BRIEF, "application/atom+xml; charset=utf-8" );
} );
// home.test.js
it( "shows each environment's state in the band, and the newcomer's link to Getting started", async () => {
    const response = await get( "/bg/" );
    assert.match( response.text, /<div class="band">[\s\S]*Продукционна среда[\s\S]*Няма данни/ );
    assert.match( response.text, /<a href="\/bg\/guides\/getting-started">Нов разработчик\? Започнете оттук<\/a>/ );
} );
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `node --test packages/portal/test/unit/format.test.js packages/portal/test/status.test.js packages/portal/test/home.test.js`
  - Expected: the new tests fail.
- [ ] **Step 3: Implement.**
  - **The band:** the states and the windows to come, in the language's words, each in an element whose class names the state (`state-degraded`). The CSS colours it; the words carry it.
  - **The feed:** written as `feeds.js` writes a feed, with an entry's ID and `updated` from the event. Its empty-feed `updated` is the same fixed epoch.
  - **The newcomer's link:** if the register has no `getting-started`, it goes to the Guides index.
- [ ] **Step 4: Run the portal's suite.**
  - Run: `npm run pretest -w packages/portal && npm test -w packages/portal`
  - Expected: all pass.
- [ ] **Step 5: Commit** — `feat(portal): environment status, its feed, and the home page's band (HEL-40)`

### Task 6: Search

**Files:**
- Create: `packages/portal/site/search.js`, `pages/search.js`.
- Modify:
  - `paths.js`, `routes.js`, `layout.js` (the top bar's form), `labels.js`, `definitions.types.js`;
  - `bin/portal-server.js`;
  - `portal.css`.
- Test: `packages/portal/test/search.test.js`, `test/unit/search.test.js`.

**Interfaces:**
- Consumes:
  - `Content` (Task 1);
  - `listPublished`, `findPublishedById`;
  - `elementSlugs`, `elementName`, `fold`, `needles`;
  - the code lists' names, read as the nomenclatures index reads them: export its `nameOf`.
- Produces:
  - **The entry:** `SearchEntry = { kind, spec: string|null, stage: "testing"|"production"|null, code: string|null, slug: string|null, title: LocalText, text: LocalText|null, terms: string }`.
    - `kind` is one of `guide`, `faq`, `spec`, `message`, `condition`, `rule`, `list`, `error`, `warning`, `element`.
    - `terms` is what is the same in both languages: a code, an element's path, a list's ID.
  - **Building:** `indexEntries( { versions: Array<{ spec, kind, stage, content }>, listNames: Map<string, LocalText>, content: Content } ) => SearchEntry[]`.
    - It is pure.
    - Production is indexed before testing, and the first entry for a `kind|spec|code|slug` key wins (decision 7).
  - **Matching:** `matchEntries( entries, query: string|null ) => SearchResults`, also pure.
    - `SearchResults = { query, state: "empty"|"short"|"long"|"done", groups: Array<{ kind, total, entries: SearchEntry[] }> }`.
  - **The searcher:** `createSearch( content ) => { find( db, query ) => Promise<SearchResults> }`.
    - Its index is cached by fingerprint, with one build at a time.
    - `PortalServer` makes one at start, and `PageContext.search` is its `find`.
  - **The address:** `paths.search( lang, q = null )`. `parseAddress` gives `{ page: "search", query: { q } }`.

- [ ] **Step 1: Write the failing tests**

```js
// unit/search.test.js, on entries built in code
it( "puts a code that equals a word first, then title matches, then the rest", () => { … } );
it( "requires every word", () => { … } );
it( "finds by look-alike letters, romanisation and code in any case", () => {
    // "PeЦeпTA" and "retsepta" find a title "Рецепта"; "p001" finds code P001
} );
it( "answers short, long and hostile queries", () => {
    assert.equal( matchEntries( entries, "" ).state, "empty" );
    assert.equal( matchEntries( entries, "a" ).state, "short" );
    assert.equal( matchEntries( entries, "x".repeat( 201 ) ).state, "long" );
    assert.equal( matchEntries( entries, ".*(" ).state, "done" );
} );
it( "indexes production before testing, and testing only for what production lacks", () => { … } );
// search.test.js, over HTTP on the seed
it( "finds a message by its code, at production", async () => {
    const response = await get( "/bg/search?q=p001" );
    assertPublic( response, BRIEF, HTML );
    assert.match( response.text, /href="\/bg\/specs\/e-prescription\/production\/P001"/ );
} );
it( "links every result to a page that exists, at an anchor it has", async () => {
    // for q in P001, CL009, lrn and a CL999 key from the seed: each result's link answers 200, and its #fragment is an id on that page
} );
it( "finds the FAQ and the guides", async () => { … "токен" finds token-method and Getting started … } );
it( "answers short, long and hostile queries", async () => {
    for ( const q of [ "", "a", "x".repeat( 201 ), "<script>", ".*(" ] ) {
        const response = await get( `/bg/search?q=${ encodeURIComponent( q ) }` );
        assert.equal( response.status, 200, q );
        assert.doesNotMatch( response.text, /<script>/ );
    }
} );
it( "finds what a promotion made public on the next search", async () => {
    // before: exampleNote found at testing; then promote the seed's e-Prescription release through the data layer, as
    // lifecycle.test.js does; after: found at production
} );
it( "has a search box in the top bar that works without JavaScript", async () => { … form action="/bg/search" method="get" … } );
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `node --test packages/portal/test/unit/search.test.js packages/portal/test/search.test.js`
  - Expected: they fail on the missing module.
- [ ] **Step 3: Implement**, as the interfaces say.
  - **Folding:** each entry's folded haystack and title are made once, when the index is built.
  - **The build's time:** log it on the console once per build, with the entry count, and record the seed's figures in the commit.
  - **The ids:** the top bar's input has `id="site-search"` and the page's own form `id="search-query"`, so no id is used twice (axe).
- [ ] **Step 4: Run the portal's suite.**
  - Run: `npm test -w packages/portal`
  - Expected: all pass.
- [ ] **Step 5: Commit** — `feat(portal): search across the site, folded as the code lists' filter is (HEL-40)`

### Task 7: Accessibility, the READMEs, the design record, and the ti-engine card

**Files:**
- Modify:
  - `packages/portal/test/a11y.test.js`;
  - `packages/portal/README.md`, `packages/data/README.md`;
  - the design record.

- [ ] **Step 1: Add the new pages to the accessibility test:**
  - `/bg/guides`, `/bg/guides/getting-started`, `/en/guides/environments`;
  - `/bg/faq`, `/en/faq`;
  - `/bg/status`, with a status and a window set;
  - `/bg/search?q=P001`;
  - `/bg/`, with its band.

  Then run it.
  - Run: `node --test packages/portal/test/a11y.test.js`
  - Expected: no violation. A violation is fixed in the page, never excluded.
- [ ] **Step 2: Update the READMEs.**
  - **The portal's:**
    - `content/` and `HDP_CONTENT_DIR`;
    - that the content loads at start or the portal does not start;
    - the search, and when its index is rebuilt.
  - **The data layer's:** `hdp-status`, with one example of each command.
- [ ] **Step 3: Update the design record**, in the same pull request (the working agreement):
  - **§1.1:** plan 8 done.
  - **§3.4:** decision 7: what is indexed, the order, and the per-process index with its fingerprint.
  - **§3.5:** the register, and the plain `---` rule.
  - **§8.1:**
    - Guides: the planned guides linking their old PDFs;
    - FAQ: verbatim, with the review items of decision 5.
  - **§8.7:** the environments and states, "not reported", `hdp-status` until plan 9, and the "who" kept for staff.
- [ ] **Step 4: Open the CA card in ti-engine** for decision 3, under the CA project's open epic for web-content.
  - **The case:** web-content's `parseRecord` evaluates `---js` front matter through gray-matter's JavaScript engine.
  - **The proposal:** pass gray-matter only the YAML engine, or refuse any other front-matter language.
  - **The evidence:** the reproduction of decision 3.
- [ ] **Step 5: Run the definition of done.**
  - Run: `npm run lint && npm test`
  - Expected: 0 lint errors; every workspace passes; quote the counts.
- [ ] **Step 6: Commit** — `docs(design): plan 8c recorded: guides, FAQ, environment status and search (HEL-40)`

## Deliberately not in this plan

- **The seven other guides.** They are planned and listed. The solution architect writes them, or delegates them (§8.1).
- **The FAQ's English, and its review.** It is migrated as it is (§8.1).
- **The staff form for status, and automating status:** plan 9 and later (§8.7).
- **Search over code-list entries and changelogs**, snippets, typo tolerance, and ranking beyond the three tiers.
- **Feeds for guides and FAQ changes.** A pull request changes them, and the repository's history is their log.
- **The Tools section:** plan 11.
- **The ti-engine fix for decision 3:** its own CA card and pull request, released, then taken here by a range.
