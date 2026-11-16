# Plan 8b — Schemas and downloads

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a vendor on `/bg/` or `/en/` gets what they build against:
- the generated XSD set of any published module version, by number or by stage;
- each message's XSD and a sample message on the message page;
- everything of one version in a single zip.

The notes of the combined nomenclatures that name no list get their own page.

**Architecture:**
- **Generated files are fixed files** (plan 8a, decision 8). They are made once per frozen public version, stored by content hash, and kept.
  - Plan 8a made a code list's files from its content alone.
  - A module version's XSDs also need the key types of the code lists it resolved against (§4.8, §4.10). Its recorded resolution holds them, so `fixed-files.js` gathers that too.
- **What each file says is decided in `spec-model`, which stays pure:** the XSDs (`generateXsds`, plan 4), the sample messages, the JSON model and the changelog. The data layer gathers the inputs, zips, and stores the result. The portal only serves files and pages.
- **The site gains:**
  - the Schemas section;
  - the message page's Sample message and XSD tabs;
  - the download addresses of §7.7;
  - the combined nomenclatures' changelog (HEL-36).

**Tech Stack:**
- Node 26, CommonJS, `node --test`.
- Everything of plan 8a, plus two dependencies, both already used by the importer:
  - `jszip` 3.10.2 exactly, in `@health-dev-portal/data`;
  - `xmllint-wasm` 5.3.0 exactly, as a development dependency of the portal.

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md),
sections:
- §3.3, §4.6 (combined history) and §4.8;
- **§4.10**;
- **§7.7** and **§7.9**;
- §8.1, **§8.3** (with the sample message this plan adds) and §8.6;
- §10.3.

**Tracking:**
- **This plan:** HEL-39. HEL-36 is part of it.
- **Depends on HEL-34** (pull request #2): a number's `max=` becomes `xs:totalDigits`. Execute this plan after it merges.
- **Plan 8c** (HEL-40) follows with guides, FAQ, environment status and search.

## Decisions this plan takes

Reject any at review, before Task 1.

1. **The split** (2026-11-16). Plan 8a's "8b" was schemas, guides, FAQ, environment status and search. This plan takes
   schemas and downloads, with HEL-36. Plan 8c takes the rest, with Boris's choice for the guides: the section plus two
   drafts.
2. **A module version's fixed files** (§7.9; plan 8a, decision 8, extended):

   | Name | What | Type |
   |---|---|---|
   | `NHIS-{code}.xsd` | One per message not withdrawn, from `generateXsds` (§4.10) | `application/xml; charset=utf-8` |
   | `{code}.xml` | Its sample message (decision 3) | `application/xml; charset=utf-8` |
   | `model.json` | The model (decision 4) | `application/json; charset=utf-8` |
   | `changelog.json` | The changelog up to this version (decision 4) | `application/json; charset=utf-8` |
   | `all.zip` | All of the above, and xmldsig (decision 5) | `application/zip` |

   - **Inputs:**
     - the version's content;
     - its recorded resolution (`resolveVersion`), giving each code list as `{ id, keyType }`, all that `valueTypeOf` reads (§4.10);
     - for the samples, each list's first key that has not expired at the list version read, from that version's content. A key is expired when its `validUntil` is not after that version (plan 8a, decision 9).
   - **Each message's files come from that message alone:** `messageShape` and `writeMessageXsd` for it, and its own sample. Never `generateXsds` for the whole version, which maps every message in one pass: one message's `RangeError` stopped them all (CodeRabbit on #3).
   - **A file that cannot be made** is not stored, for example when `messageShape`'s `RangeError` names two paths with one type name.
     - The error is logged on the console's error stream with the version's ID and the file's name.
     - The file answers as missing, and the version's other messages keep theirs.
     - **The zip is made only when every other file is.** A zip that left a file out would be fixed so forever.
     - The next request tries again, so a generator fixed later heals it.
   - **A withdrawn message** has no XSD and no sample, as `generateXsds` already leaves it out.
   - **At promotion** `promoteReleases` already calls `makeFixedFiles` for every version entering testing. From now on that makes a module's files too. As in plan 8a, a failure is logged and does not undo the promotion.
3. **The sample message** (§8.3, a design call this plan records there). `synthesizeMessage` of the message's shape, the shape its XSD is written from:
   - **Elements:** each `max( min, 1 )` times, so an optional one appears once.
   - **Coded values:**
     - **A fixed value the XSD keeps wins,** since the XSD then requires it. 242 of the 1,500 coded elements in the eight production modules have one, among them every header's sender and recipient (measured 2026-11-16, CodeRabbit on #3).
     - **A kept fixed value that is no key of its list is still written.** The XSD requires it, and linking already reports it as `fixed-value-not-a-key`.
     - **A fixed value the XSD drops is not written.** `messageShape` drops one its own type refuses, such as I006's `senderId`, fixed to `NHIS` on the integer list CL018, so the XSD holds no fixed value there. The sample then writes the list's key, as for any other coded value; written, `NHIS` would fail the XSD (CodeRabbit on #3).
     - **Any other coded value** is the first key of its list that has not expired, so the message tester (plan 11) will accept it.
   - **Other values:** `synthesizeMessage`'s own, which fit the XSD.
   - **Layout:**
     - indented by two spaces, with an XML declaration;
     - then a comment, one line in each language:
       `Синтетичен пример от {spec} {number}: всеки елемент по веднъж, стойности според XSD. Не е реално съобщение.`
       and `Synthetic example from {spec} {number}: every element once, values the XSD accepts. Not a real message.`
     - `<ds:Signature/>` stays empty, after the comment `<!-- Тук е XML подписът (xmldsig). / The XML signature goes here (xmldsig). -->`.
4. **Formats.** Both are pretty-printed with two spaces, in UTF-8.
   - **`model.json`:** `{ "format": "nhis-module/1", "spec", "version", "messages", "conditions", "dictionary" }`. These are the stored content's own shapes (§4.3), with two things removed:
     - every `source` property, at any depth: it records workbook rows, not the specification;
     - `conditionBindings` and `blueprintBindings`, which the studio derives.
   - **`changelog.json`:** `{ "format": "nhis-changelog/1", "spec", "version", "versions": [ { "number", "entries": { "breaking", "dropped-plan", "non-breaking" } } ] }`.
     - It holds this version and every earlier public one, newest first, with their entries as `publishedChangelog` gives them.
     - It has no dates, stages or expiry. Those change after the file is fixed, and the changelog page has them.
5. **The zip.** It holds one folder, `{spec}-{number}/`, compressed with deflate:
   - `xsd/`: every `NHIS-{code}.xsd`, and `xmldsig-core-schema.xsd`, which they import by that relative name;
   - `samples/`: every `{code}.xml`;
   - `model.json` and `changelog.json`.
6. **xmldsig.** This is W3C's `xmldsig-core-schema.xsd`, in the bytes his.bg serves at `/api/v1/`:
   - **Its hash:** SHA-256 `cfdd3c47…5e2362`, recorded in `scripts/api-v1.sha256`.
   - **Why these bytes:** they are what the published XSDs import, and what plan 4's tests compile against offline.
   - **Where it goes:** committed as `packages/data/assets/xmldsig-core-schema.xsd`. Its own header carries W3C's software licence.
   - **One check first:** Task 2 compares it with W3C's copy and records the result in its commit.
7. **Addresses** (plan 8a's decision 3 and §7.7, extended):

   | Address | Answer |
   |---|---|
   | `/{lang}/schemas` | The Schemas section: the `/api/v1/` notice, then each stage's module versions |
   | `/{lang}/schemas/{spec}/{at}` | One module version's set: each message's XSD and sample, the zip, the model and xmldsig |
   | `/{lang}/specs/{spec}/{at}/{message}/sample` · `/xsd` | The message's Sample message and XSD tabs |
   | `/schemas/{spec}/{number}/NHIS-{code}.xsd` | The fixed XSD (§7.7), inline |
   | `/schemas/{stage}/NHIS-{code}.xsd` | 302 to the fixed XSD of the one module whose `{stage}` version has `{code}` |
   | `/schemas/{spec}/{number}/xmldsig-core-schema.xsd` · `/schemas/{stage}/xmldsig-core-schema.xsd` | xmldsig: 200, the same bytes at every address |
   | `/downloads/specs/{spec}/{number}.zip` · `.json` | The fixed zip and the fixed model, as attachments |
   | `/downloads/specs/{spec}/{number}/{code}.xml` | The fixed sample, as an attachment |
   | `/downloads/specs/{spec}/{stage}.zip` · `.json` · `/{stage}/{code}.xml` | 302 to the fixed file |

   - **Which names exist.** `{code}` is parsed as `[A-Z][0-9]{3}`: all 186 message codes of the eight production modules have that form, and none is in two modules (measured 2026-11-16). The file is then looked up among the version's own names, never used as a path.
   - **Stage addresses.** If two modules at one stage had the same code, the stage XSD address would answer 404 and log both.
   - **Attachment names:** `e-prescription-1.5.1.zip`, `e-prescription-1.5.1.json` and `e-prescription-1.5.1-P001.xml`. An XSD is served inline, so that a validator can fetch it.
   - **Errors, as plan 8a's downloads:**
     - a retired version answers 410;
     - a version that was never public, a code list, the rules, an unknown name, or a stage without that version answers 404.
   - **Caching** (plan 8a, decision 4):
     - fixed files and xmldsig: forever;
     - stage redirects: briefly;
     - set pages: a day at a fixed address, briefly at a stage address;
     - the Schemas index: briefly.
8. **The Schemas pages** (§8.1).
   - **`/{lang}/schemas`:**
     - **The notice comes first.** In Bulgarian: "Схемите на www.his.bg/api/v1/ са остарели: замразени са на по-стари версии на спецификациите и не се обновяват. Тук са схемите на всяка публикувана версия, генерирани от спецификацията." In English: "The XSDs at www.his.bg/api/v1/ are obsolete: they are frozen at older versions of the specifications and are no longer updated. Here are the XSDs of every published version, generated from the specification."
     - **Then one table per stage:** testing, production, and previous production, marked as plan 8a's decision 7 marks it. Each module, in `SPEC_NAMES` order, links its set page and its zip.
   - **`/{lang}/schemas/{spec}/{at}`:**
     - plan 8a's stage switcher in the mint band;
     - a table of the messages: code, title, XSD and sample. A withdrawn message is listed, marked, with neither file;
     - then links to the zip, `model.json` and xmldsig;
     - its canonical is the fixed address.
   - **The top bar** gains Schemas after Errors, in §8.1's order.
9. **The message page's tabs** (§8.3), in this order: Elements, Sample message, Conditions, XSD, Changes.
   - **The two new tabs** show the file's text, escaped, in `<pre><code id="…">`. Each has its download link, and a copy button that the script enables, as it does copy-link: `data-copy-target` names the code element.
   - **A withdrawn message:** its tabs say it has no XSD and no sample.
   - **A file that cannot be had:** the tab says it could not be made.
10. **The combined nomenclatures** (HEL-36, §4.6).
    - **The page.** `/{lang}/changes/nomenclatures` shows the combined spec's public versions and their entries, through `publishedChangelog`.
      - `changelogPage` now serves any spec with a public version, live or not. Today the combined spec is the only one with none live.
      - A spec with no live version gets no comparison form and no feed link, since it has no content to compare. Its feed stays 404, as plan 8a answers it.
    - **The name.** It is "Номенклатури преди разделянето" / "Nomenclatures before the split", named in `spec-names.js` but outside `SPEC_NAMES`, so the home page does not list it.
    - **The link.** The nomenclatures index links it as "Бележки на общите версии, които не назовават списък" / "Notes of the combined versions that name no list".
11. **Tests**, as in plan 8a's decision 12. The portal's tests also validate every served sample of e-Prescription 1.5.1 against its served XSD with xmllint-wasm. Errors at `ds:Signature` are set aside, as in plan 4's tests.

## Global Constraints

- **Node 26**, CommonJS, `node --test`.
- **House style:**
  - four-space indent, double quotes, semicolons, spaces inside brackets;
  - JSDoc on everything exported;
  - shared shapes as `@typedef`s in the package's `definitions.types.js`;
  - `#alias` inside a package, the `exports` map across packages, never a deep path past one.
- **`spec-model` stays pure:** no `node:` module, no I/O, no dependency.
- **The SQL subset of design record §3.2:**
  - `?` placeholders;
  - `TEXT` and `INTEGER` columns;
  - never ordering by text, so dates and numbers are sorted in JavaScript;
  - no `LIKE`;
  - at most 100 parameters per statement;
  - batches, not transactions.
- **Every test of the data layer runs on SQLite and PostgreSQL** (`eachDatabase`).
- **No public page or file shows:**
  - a development or implementation version, or one abandoned before testing;
  - a person's name or ID;
  - an anomaly or a staff comment.
- **No portal response sets a cookie.** No inline `style` attribute, no inline script.
- **The framework knows nothing of the portal.** A generic gap found here is named under "not done" for a CA card in ti-engine, never patched around through a deep path.
- **Dependencies:** only those named under *Tech Stack*, pinned exactly.
- **Never commit unpublished specification data.** Fixtures are the public ones fetched into `.fixtures/`, and the seed is built from them.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Every new `.js` file begins with the EUPL block** of `packages/importer/read/raw.js`, lines 1–16, verbatim.
- **Code with backslashes or regular expressions is written with the Write and Edit tools**, not through a shell.
- **Running one test file.** Use `node --test <file>`: `npm test -w … -- --test-name-pattern=…` does not pass the
  pattern through (measured 2026-11-16).
- **The portal's seed.** The portal's HTTP tests read the seed that its `pretest` builds, and `node --test` does not
  run `pretest`. After any change under `packages/data` or `packages/spec-model`, run `npm run pretest -w
  packages/portal` before running a portal test file on its own. Otherwise the tests read content built by the old
  code, as HEL-34 found.

## Review Focus

1. **A version whose XSDs cannot be generated.**
   - Expected: the pages still render; the file answers 404 and its tab says it could not be made; one error is logged naming the version and the file; nothing is stored.
   - The version's other messages keep their files, and no zip is made.
   - → Task 2, "logs a file it cannot make, stores nothing, and answers null" and "keeps the other messages' files when
     one cannot be made, and makes no zip"; Task 5, "says when a file could not be made".
2. **A withdrawn message** (P011 and P012 in e-Prescription 1.5.1).
   - Expected:
     - the set page lists it, marked, with no links;
     - its tabs say it has no XSD and no sample;
     - its XSD and sample addresses answer 404;
     - the zip leaves it out.
   - → Task 2, "gives a withdrawn message no files"; Task 3, "answers a withdrawn message's files with 404"; Task 4,
     "lists a set's messages with their XSD and sample, and a withdrawn one without"; Task 5, "says a withdrawn message
     has no XSD and no sample".
3. **Hostile and unknown file names.**
   - The cases:
     - `NHIS-p001.xsd`, `NHIS-P001.xsd.bak` and `NHIS-Z999.xsd`;
     - a percent-encoded `..`;
     - a code list's `.zip`;
     - the rules' XSD.
   - Expected: 404, never 500, and nothing read outside the version's own names.
   - → Task 3, "answers unknown and hostile file names with 404".
4. **A retired version, and one never public:** e-Prescription 1.5.0 (`SEED.history`), and CL008's abandoned number.
   - Expected: 410 for the retired one, on every download and set page; 404 for the other.
   - → Task 3, "answers a retired version with 410 and one never public with 404"; Task 4, "answers a code list's, the
     rules', an unknown and a retired set as plan 8a's pages do".
5. **A stage that has no version with that message.**
   - The cases: `/schemas/previous-production/NHIS-P001.xsd`, since the seed's e-Prescription has no previous production, and `/schemas/testing/NHIS-R001.xsd`.
   - Expected: 404, while `/schemas/testing/NHIS-P001.xsd` gives 302 to 1.5.2.
   - → Task 3, "redirects a stage XSD to the one module that has the message".

## File map

| File | Responsibility |
|---|---|
| `packages/spec-model/model/synthetic-message.js` | `synthesizeMessage` takes `keys` and `indent` |
| `packages/spec-model/model/xsd-shape.js`, `definitions.types.js` | A schema attribute's `codeList` |
| `packages/spec-model/model/downloads.js` | `sampleMessage`, `moduleModelJson`, `changelogJson` beside plan 8a's code-list formats |
| `packages/data/store/fixed-files.js` | `fixedFilesOf` replaces `FIXED_FILES`; `fixedFile`, `makeFixedFiles` for modules; `xmldsigSchema` |
| `packages/data/assets/xmldsig-core-schema.xsd` | W3C's xmldsig, as his.bg serves it |
| `packages/portal/site/paths.js`, `routes.js` | The addresses of decision 7 |
| `packages/portal/site/pages/downloads.js` | `schemaFile`, `specDownload` |
| `packages/portal/site/pages/schemas.js` | `schemasIndexPage`, `schemaSetPage` |
| `packages/portal/site/pages/message.js` | The Sample message and XSD tabs |
| `packages/portal/site/pages/changes.js`, `nomenclatures.js`, `spec-names.js` | HEL-36 |
| `packages/portal/site/layout.js`, `labels.js` | The Schemas section; the new words |
| `packages/portal/public/portal/portal.js`, `portal.css` | The copy button for a code block; `pre` styling |

---

### Task 1: Sample messages and the download formats

**Files:**
- Modify: `packages/spec-model/model/synthetic-message.js`, `xsd-shape.js`, `downloads.js`, `definitions.types.js`
- Test: `packages/spec-model/test/synthetic-message.test.js`, `xsd-shape.test.js`, `downloads.test.js`

**Interfaces:**
- Consumes: `generateXsds`, `messageShape` (plan 4); `compareNumbers` (`#numbers`).
- Produces:
  - `synthesizeMessage( shape, { omit?, keys?: Map<string, string>, indent?: string } ) => string`.
    - A coded attribute without a fixed value is written as its list's key from `keys`. A fixed value always wins.
    - With no `keys` and no `indent`, the output is as before, on one line, so plan 4's corpus is unchanged.
  - A `SchemaNode` attribute's `codeList: string|null`. It is set by `messageShape`, and is null in shapes read from a
    published XSD.
  - `sampleMessage( message: Message, version: { spec, number }, codeLists: Array<{id, keyType}>, keys: Map<string,
    string> ) => string`: one message's sample, from its own `messageShape`.
    - It throws that function's `RangeError`, so that the caller can keep the version's other files (decision 2).
  - `moduleModelJson( content: ModuleVersion ) => string`.
  - `changelogJson( spec: string, number: string, versions: Array<{ number, entries }> ) => string`.

- [ ] **Step 1: Write the failing tests**

```js
// synthetic-message.test.js
it( "writes a coded value as the key it is given for its list", () => {
    // a shape with one field whose value attribute has codeList "CL009" and value type int
    assert.match( synthesizeMessage( shape, { keys: new Map( [ [ "CL009", "12" ] ] ) } ), /value="12"/ );
    assert.match( synthesizeMessage( shape ), /value="1"/ );
} );
it( "keeps a field's fixed value over its list's key", () => {
    // header/recipient: codeList "CL018", fixed "4", as every common-services message has it
    assert.match( synthesizeMessage( header, { keys: new Map( [ [ "CL018", "1" ] ] ) } ), /<recipient value="4"\/>/ );
} );
// downloads.test.js
it( "writes the list's key where the XSD drops a fixed value its type refuses", () => {
    // I006's senderId: fixed to "NHIS" on the integer list CL018; messageShape keeps no fixed value there
    assert.match( sampleMessage( i006, version, [ { id: "CL018", keyType: "integer" } ], new Map( [ [ "CL018", "1" ] ] ) ), /<senderId value="1"\/>/ );
} );
it( "puts each element on its own line, indented, when asked", () => {
    const lines = synthesizeMessage( shape, { indent: "  " } ).split( "\n" );
    assert.match( lines[ 0 ], /^<message xmlns="https:\/\/www\.his\.bg"/ );
    assert.ok( lines.slice( 1, -1 ).every( ( line ) => line.startsWith( "  " ) ) );
} );
// xsd-shape.test.js
it( "names a coded attribute's list", () => {
    // P001's medicationCode value is CL009's; an uncoded field's is null
} );
// downloads.test.js
it( "writes a message's sample, declared and commented in both languages", () => {
    const text = sampleMessage( p001, { spec: "e-prescription", number: "1.5.1" }, [ { id: "CL009", keyType: "integer" } ], new Map( [ [ "CL009", "12" ] ] ) );
    assert.ok( text.startsWith( "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" ) );
    assert.match( text, /Синтетичен пример от e-prescription 1\.5\.1/ );
    assert.match( text, /Synthetic example from e-prescription 1\.5\.1/ );
    assert.match( text, /The XML signature goes here \(xmldsig\)\. -->\s*<ds:Signature\/>/ );
} );
it( "throws the message's own RangeError, which the caller keeps to that message", () => {
    // a message whose two sibling groups share a tag
    assert.throws( () => sampleMessage( broken, { spec: "e-prescription", number: "1.5.1" }, [], new Map() ), RangeError );
} );
it( "writes the model without workbook sources or the studio's bindings", () => {
    const model = JSON.parse( moduleModelJson( content ) );
    assert.equal( model.format, "nhis-module/1" );
    assert.deepEqual( Object.keys( model ), [ "format", "spec", "version", "messages", "conditions", "dictionary" ] );
    assert.equal( keysAtAnyDepth( model ).includes( "source" ), false );
} );
it( "writes the changelog up to the version, newest first, without dates", () => {
    const log = JSON.parse( changelogJson( "e-prescription", "1.5.1", [ v( "1.5.2" ), v( "1.5.0" ), v( "1.5.1" ) ] ) );
    assert.deepEqual( log.versions.map( ( one ) => one.number ), [ "1.5.1", "1.5.0" ] );
    assert.deepEqual( Object.keys( log.versions[ 0 ] ), [ "number", "entries" ] );
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test packages/spec-model/test/synthetic-message.test.js packages/spec-model/test/xsd-shape.test.js packages/spec-model/test/downloads.test.js`
Expected: the seven new tests fail; `sampleMessage`, `moduleModelJson` and `changelogJson` are not functions.

- [ ] **Step 3: Implement**, as the interfaces say. `sampleMessage` builds its shape as `generateXsds` builds each one,
  so a sample and its XSD come from the same shape. Add `codeList` to the attribute `@typedef`.

- [ ] **Step 4: Run spec-model's suite**

Run: `npm test -w packages/spec-model`
Expected: all pass, plan 4's synthetic-message tests unchanged.

- [ ] **Step 5: Commit** — `feat(spec-model): sample messages and the module download formats (HEL-39)`

### Task 2: A module version's fixed files

**Files:**
- Modify: `packages/data/store/fixed-files.js`, `packages/data/package.json` (`jszip` 3.10.2)
- Create: `packages/data/assets/xmldsig-core-schema.xsd`
- Test: `packages/data/test/fixed-files.test.js`

**Interfaces:**
- Consumes:
  - Task 1's functions, and `messageShape` and `writeMessageXsd` (plan 4) for each message's XSD;
  - `resolveVersion` (`#resolution`) and `readContent` (`#targets`), for the lists' first valid keys;
  - `publishedChangelog` (`#published`).
- Produces:
  - `fixedFilesOf( published, inputs ) => Array<{ name, type, make: ( made ) => Promise<Buffer> }>`. It replaces `FIXED_FILES`.
    - A code list has plan 8a's two files.
    - A module has decision 2's files, each message's own, and the zip last.
    - `made( name )` gives a sibling's bytes, so the zip is made from the stored files. It throws when a sibling cannot
      be made, so the zip is not made either.
  - `fixedFile( db, store, versionId, name )` and `makeFixedFiles( db, store, versionId )`: plan 8a's signatures, now also for modules.
  - `xmldsigSchema() => Buffer`: the asset's bytes, read once.

- [ ] **Step 1: Check the xmldsig copy.** Download W3C's
  `https://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd` into the scratchpad and compare its SHA-256 with
  `cfdd3c47…5e2362`. Commit the his.bg bytes from `.fixtures/public/api-v1/` either way, and record whether they are
  equal in the commit message.

- [ ] **Step 2: Write the failing tests** (`eachDatabase`, on a module version made with the test support's lifecycle,
  frozen and public, that reads one integer list)

```js
it( "makes a module version's XSDs from the key types it recorded", async () => {
    const file = await fixedFile( db, store, version.id, "NHIS-P001.xsd" );
    assert.equal( file.bytes.toString( "utf8" ), generateXsds( content, { codeLists: [ { id: "CL009", keyType: "integer" } ] } )[ 0 ].text );
    assert.equal( file.type, "application/xml; charset=utf-8" );
} );
it( "writes a sample's coded value as the first key not expired", async () => {
    // CL009 at the version read has "1" (validUntil = that version, so expired) then "2"
    assert.match( ( await fixedFile( db, store, version.id, "P001.xml" ) ).bytes.toString( "utf8" ), /value="2"/ );
} );
it( "gives a withdrawn message no files", async () => {
    assert.equal( await fixedFile( db, store, version.id, "NHIS-P011.xsd" ), null );
    assert.equal( await fixedFile( db, store, version.id, "P011.xml" ), null );
} );
it( "zips every file under the version's folder, with xmldsig beside the XSDs", async () => {
    const zip = await JSZip.loadAsync( ( await fixedFile( db, store, version.id, "all.zip" ) ).bytes );
    assert.deepEqual( Object.keys( zip.files ).filter( ( name ) => !name.endsWith( "/" ) ).sort(), [
        "e-prescription-1.5.1/changelog.json", "e-prescription-1.5.1/model.json", "e-prescription-1.5.1/samples/P001.xml",
        "e-prescription-1.5.1/xsd/NHIS-P001.xsd", "e-prescription-1.5.1/xsd/xmldsig-core-schema.xsd" ] );
    assert.deepEqual( await zip.file( "e-prescription-1.5.1/xsd/xmldsig-core-schema.xsd" ).async( "nodebuffer" ), xmldsigSchema() );
} );
it( "logs a file it cannot make, stores nothing, and answers null", async () => {
    // P002's two sibling groups share a tag, so messageShape throws a RangeError for it; P001 is sound
    assert.equal( await fixedFile( db, store, broken.id, "NHIS-P002.xsd" ), null );
    assert.equal( logged.length, 1 );
    assert.match( logged[ 0 ], new RegExp( `${ broken.id }.*NHIS-P002\\.xsd` ) );
    assert.equal( await db.get( "SELECT 1 AS one FROM fixed_files WHERE version_id = ? AND name = ?", [ broken.id, "NHIS-P002.xsd" ] ), undefined );
} );
it( "keeps the other messages' files when one cannot be made, and makes no zip", async () => {
    assert.notEqual( await fixedFile( db, store, broken.id, "NHIS-P001.xsd" ), null );
    assert.notEqual( await fixedFile( db, store, broken.id, "P001.xml" ), null );
    assert.equal( await fixedFile( db, store, broken.id, "all.zip" ), null );
    assert.equal( await db.get( "SELECT 1 AS one FROM fixed_files WHERE version_id = ? AND name = ?", [ broken.id, "all.zip" ] ), undefined );
} );
```

  Also change plan 8a's test that read `FIXED_FILES` so that it asserts the same two code-list files through
  `fixedFilesOf`.

- [ ] **Step 3: Run them and watch them fail**

Run: `npm test -w packages/data`
Expected: the six new tests fail (a module has no files yet), and the rest pass.

- [ ] **Step 4: Implement**, as the interfaces and decisions 2–6 say. `ensured` keeps its `ON CONFLICT DO NOTHING`. A
  `make` that throws is caught in `fixedFile` and `makeFixedFiles` alike.

- [ ] **Step 5: Run the data suite on both databases**

Run: `HDP_TEST_POSTGRES_URL=… npm test -w packages/data` (CI provides PostgreSQL)
Expected: all pass.

- [ ] **Step 6: Commit** — `feat(data): a module version's XSDs, samples, model, changelog and zip as fixed files (HEL-39)`

### Task 3: The schema and download addresses

**Files:**
- Modify: `packages/portal/site/paths.js`, `routes.js`, `definitions.types.js`
- Create: `packages/portal/site/pages/downloads.js`
- Test: `packages/portal/test/downloads.test.js`

**Interfaces:**
- Consumes: `fixedFile`, `xmldsigSchema` (Task 2); `findPublished`, `listPublished`; `CACHE`, `send`, `redirect`,
  `notFound`, `gone`.
- Produces:
  - `paths.schemaFile( spec, at, name )`, `paths.specDownload( spec, at, ext )` (`zip`, `json`) and
    `paths.sampleDownload( spec, at, code )`. A stage `at` gives its stage address.
  - `parseAddress` kinds `schema-file` (`{ spec|null, at, name }`) and `spec-download` (`{ spec, at, ext, code|null }`).

- [ ] **Step 1: Write the failing tests** (every response through `assertPublic`)

```js
it( "serves a fixed XSD inline, as XML, forever", async () => {
    const response = await get( "/schemas/e-prescription/1.5.1/NHIS-P001.xsd" );
    assert.equal( response.status, 200 );
    assert.equal( response.headers[ "content-type" ], "application/xml; charset=utf-8" );
    assert.equal( response.headers[ "cache-control" ], "public, max-age=31536000, immutable" );
    assert.equal( response.headers[ "content-disposition" ], undefined );
    assert.match( response.text, /targetNamespace="https:\/\/www\.his\.bg"[^>]*version="1\.5\.1"/ );
} );
it( "redirects a stage XSD to the one module that has the message", async () => {
    assert.equal( ( await get( "/schemas/testing/NHIS-P001.xsd" ) ).headers.location, "/schemas/e-prescription/1.5.2/NHIS-P001.xsd" );
    assert.equal( ( await get( "/schemas/production/NHIS-P001.xsd" ) ).headers.location, "/schemas/e-prescription/1.5.1/NHIS-P001.xsd" );
    assert.equal( ( await get( "/schemas/previous-production/NHIS-P001.xsd" ) ).status, 404 );
    assert.equal( ( await get( "/schemas/testing/NHIS-R001.xsd" ) ).status, 404 );
} );
it( "serves xmldsig beside every set, the same bytes", async () => {
    for ( const address of [ "/schemas/e-prescription/1.5.1/xmldsig-core-schema.xsd", "/schemas/production/xmldsig-core-schema.xsd" ] ) {
        assert.equal( sha256( ( await get( address ) ).body ), "cfdd3c471dca1ee14ed47a6a2eb8c634b1300d082c44e33c74eea1ba6b5e2362" );
    }
} );
it( "serves a version's zip, model and samples as attachments", async () => {
    const zip = await get( "/downloads/specs/e-prescription/1.5.1.zip" );
    assert.equal( zip.headers[ "content-disposition" ], "attachment; filename=\"e-prescription-1.5.1.zip\"" );
    assert.equal( Object.keys( ( await JSZip.loadAsync( zip.body ) ).files ).filter( ( name ) => name.endsWith( ".xsd" ) ).length, 22 ); // 21 messages and xmldsig
    assert.equal( JSON.parse( ( await get( "/downloads/specs/e-prescription/1.5.1.json" ) ).text ).format, "nhis-module/1" );
    assert.equal( ( await get( "/downloads/specs/e-prescription/1.5.1/P001.xml" ) ).headers[ "content-disposition" ], "attachment; filename=\"e-prescription-1.5.1-P001.xml\"" );
    assert.equal( ( await get( "/downloads/specs/e-prescription/testing.zip" ) ).headers.location, "/downloads/specs/e-prescription/1.5.2.zip" );
} );
it( "answers a withdrawn message's files with 404", async () => { /* NHIS-P011.xsd and P011.xml */ } );
it( "answers unknown and hostile file names with 404", async () => {
    for ( const address of [ "/schemas/e-prescription/1.5.1/NHIS-p001.xsd", "/schemas/e-prescription/1.5.1/NHIS-P001.xsd.bak",
        "/schemas/e-prescription/1.5.1/NHIS-Z999.xsd", "/schemas/e-prescription/1.5.1/%2e%2e/NHIS-P001.xsd",
        "/downloads/specs/CL007/1.5.34.zip", "/schemas/rules/1.1.1/NHIS-P001.xsd" ] ) {
        assert.equal( ( await get( address ) ).status, 404, address );
    }
} );
it( "answers a retired version with 410 and one never public with 404", async () => {
    assert.equal( ( await get( `/schemas/e-prescription/${ SEED.history }/NHIS-P001.xsd` ) ).status, 410 );
    assert.equal( ( await get( `/downloads/specs/e-prescription/${ SEED.history }.zip` ) ).status, 410 );
    assert.equal( ( await get( `/downloads/specs/CL008/${ SEED.cl008Abandoned }.zip` ) ).status, 404 );
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm run pretest -w packages/portal && node --test packages/portal/test/downloads.test.js`
Expected: FAIL; every address answers the 404 page.

- [ ] **Step 3: Implement** `schemaFile` and `specDownload`, shaped as plan 8a's `downloadFile`. The stage XSD finds the
  module through `listPublished`: the specs whose `{stage}` version holds a message `{code}` that is not withdrawn.

- [ ] **Step 4: Run the portal's suite**

Run: `npm test -w packages/portal`
Expected: all pass.

- [ ] **Step 5: Commit** — `feat(portal): the XSD and download addresses of §7.7 (HEL-39)`

### Task 4: The Schemas section

**Files:**
- Create: `packages/portal/site/pages/schemas.js`
- Modify: `packages/portal/site/paths.js` (`schemas( lang )`, `schemaSet( lang, spec, at )`, their kinds), `routes.js`,
  `layout.js` (`SECTIONS`), `labels.js`, `public/portal/portal.css`
- Test: `packages/portal/test/schemas.test.js`

**Interfaces:**
- Consumes: Task 3's path builders; plan 8a's `stages.js` switcher and stage marking.
- Produces: `schemasIndexPage`, `schemaSetPage`; `paths.schemas`, `paths.schemaSet`.

- [ ] **Step 1: Write the failing tests**

```js
it( "puts the /api/v1/ notice first, then each stage's module versions", async () => {
    const page = await get( "/bg/schemas" );
    assert.ok( page.text.indexOf( "www.his.bg/api/v1/" ) < page.text.indexOf( "<table" ) );
    assert.match( page.text, /href="\/bg\/schemas\/e-prescription\/1\.5\.2"/ );
    assert.match( page.text, /href="\/downloads\/specs\/e-prescription\/1\.5\.1\.zip"/ );
    assert.equal( page.headers[ "cache-control" ], "public, max-age=60" );
} );
it( "lists Schemas in the top bar after Errors, marked on its own pages", async () => {
    // the nav's hrefs in order: specs, nomenclatures, errors, schemas, changes; aria-current="page" on schemas
} );
it( "lists a set's messages with their XSD and sample, and a withdrawn one without", async () => {
    const page = await get( "/en/schemas/e-prescription/1.5.1" );
    assert.match( rowOf( page.text, "P001" ), /href="\/schemas\/e-prescription\/1\.5\.1\/NHIS-P001\.xsd"/ );
    assert.match( rowOf( page.text, "P001" ), /href="\/downloads\/specs\/e-prescription\/1\.5\.1\/P001\.xml"/ );
    assert.doesNotMatch( rowOf( page.text, "P011" ), /href=/ );
    assert.match( rowOf( page.text, "P011" ), /withdrawn/ );
    assert.equal( page.headers[ "cache-control" ], "public, max-age=86400" );
} );
it( "gives a stage set page its fixed address as canonical", async () => {
    assert.match( ( await get( "/bg/schemas/e-prescription/production" ) ).text, /<link rel="canonical" href="[^"]*\/bg\/schemas\/e-prescription\/1\.5\.1">/ );
} );
it( "answers a code list's, the rules', an unknown and a retired set as plan 8a's pages do", async () => {
    // /bg/schemas/CL007/production 404; /bg/schemas/rules/production 404; /bg/schemas/e-prescription/9.9.9 404;
    // /bg/schemas/e-prescription/${ SEED.history } 410
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test packages/portal/test/schemas.test.js`
Expected: FAIL with 404s.

- [ ] **Step 3: Implement**, as decision 8 says. The words go in `labels.js`, in both languages.

- [ ] **Step 4: Run the portal's suite.** Expected: all pass. The labels sweep holds both languages to the same keys.

- [ ] **Step 5: Commit** — `feat(portal): the Schemas section (HEL-39)`

### Task 5: The message page's Sample message and XSD tabs

**Files:**
- Modify: `packages/portal/site/pages/message.js` (`TABS`), `paths.js` (tabs `sample`, `xsd`), `labels.js`,
  `public/portal/portal.js`, `portal.css`, `package.json` (development dependency `xmllint-wasm` 5.3.0)
- Test: `packages/portal/test/message.test.js`, `packages/portal/test/samples.test.js`, `packages/portal/test/script.test.js`

**Interfaces:**
- Consumes: `fixedFile` (Task 2); Task 3's path builders.
- Produces: `paths.message( lang, spec, at, code, "sample" | "xsd" )`.

- [ ] **Step 1: Write the failing tests**

```js
it( "orders the tabs as §8.3 does", async () => {
    // tab names in order: Elements, Sample message, Conditions, XSD, Changes
} );
it( "shows a message's XSD, escaped, with its download link", async () => {
    const page = await get( "/bg/specs/e-prescription/1.5.1/P001/xsd" );
    assert.match( page.text, /<pre><code id="[^"]+">&lt;\?xml version=/ );
    assert.match( page.text, /href="\/schemas\/e-prescription\/1\.5\.1\/NHIS-P001\.xsd"/ );
} );
it( "shows a message's sample, and says it is synthetic", async () => {
    const page = await get( "/en/specs/e-prescription/1.5.1/P001/sample" );
    assert.match( page.text, /&lt;message xmlns=/ );
    assert.match( page.text, /href="\/downloads\/specs\/e-prescription\/1\.5\.1\/P001\.xml"/ );
    // the page's own sentence that the sample is synthetic, from labels.js
} );
it( "says a withdrawn message has no XSD and no sample", async () => {
    for ( const tab of [ "xsd", "sample" ] ) {
        const page = await get( `/bg/specs/e-prescription/1.5.1/P011/${ tab }` );
        assert.equal( page.status, 200 );
        assert.doesNotMatch( page.text, /<pre>/ );
    }
} );
it( "says when a file could not be made", async () => {
    // remove P001's XSD bytes from this server's copy of the file store: fixedFile answers null
    assert.doesNotMatch( ( await get( "/bg/specs/e-prescription/1.5.1/P001/xsd" ) ).text, /<pre>/ );
} );
// samples.test.js
it( "validates every sample of e-Prescription 1.5.1 against its XSD, but for the empty signature", async () => {
    // for each of the 21 messages not withdrawn: GET the sample and the XSD, then validateXML with [ XSD, xmldsig ];
    // the errors that do not name Signature are none
} );
// script.test.js (Playwright)
it( "copies a code block's text with its button", async () => { /* clipboard text equals the <code>'s textContent */ } );
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `node --test packages/portal/test/message.test.js packages/portal/test/samples.test.js packages/portal/test/script.test.js`
Expected: the tab tests fail with 404, and the script test finds no button.

- [ ] **Step 3: Implement**, as decision 9 says. The copy button is `hidden` until the script finds `navigator.clipboard`,
  as plan 8a's copy link is.

- [ ] **Step 4: Run the portal's suite.** Expected: all pass, the Playwright tests included.

- [ ] **Step 5: Commit** — `feat(portal): the message page's Sample message and XSD tabs (HEL-39)`

### Task 6: The combined nomenclatures' history (HEL-36)

**Files:**
- Modify: `packages/portal/site/pages/changes.js`, `pages/nomenclatures.js`, `spec-names.js`, `labels.js`
- Test: `packages/portal/test/changes.test.js`, `nomenclatures.test.js`

**Interfaces:**
- Consumes: `publishedChangelog` (plan 8a).
- Produces: `specName( "nomenclatures", lang )` names the combined spec; `SPEC_NAMES` is unchanged.

- [ ] **Step 1: Write the failing tests**

```js
it( "shows the combined nomenclatures' notes that name no list", async () => {
    const page = await get( "/bg/changes/nomenclatures" );
    assert.equal( page.status, 200 );
    assert.match( page.text, /<h1>Номенклатури преди разделянето · / );
    // as many entries as publishedChangelog( db, "nomenclatures" ) holds: 21 across 8 versions in 1.5.33, measured by
    // plan 8a's final review
    assert.doesNotMatch( page.text, /name="from"/ ); // no comparison form
    assert.doesNotMatch( page.text, /feed\.atom/ ); // no feed
} );
it( "links the combined history from the nomenclatures index", async () => {
    assert.match( ( await get( "/en/nomenclatures" ) ).text, /href="\/en\/changes\/nomenclatures"/ );
} );
it( "keeps the combined spec off the home page", async () => {
    assert.doesNotMatch( ( await get( "/bg/" ) ).text, /преди разделянето/ );
} );
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `node --test packages/portal/test/changes.test.js packages/portal/test/nomenclatures.test.js`
Expected: `/bg/changes/nomenclatures` answers 404.

- [ ] **Step 3: Implement**, as decision 10 says.

- [ ] **Step 4: Run the portal's suite.** Expected: all pass. The combined spec's feed is still 404.

- [ ] **Step 5: Commit** — `feat(portal): the combined nomenclatures' history (HEL-36)`

### Task 7: Accessibility, the README and the design record's state

**Files:**
- Modify: `packages/portal/test/a11y.test.js`, `packages/portal/README.md`,
  `docs/superpowers/specs/2026-10-14-portal-foundation-design.md` (plan table, row 8)

- [ ] **Step 1: Add the new pages to the sweep,** in both languages:
  - `paths.schemas( lang )`;
  - `paths.schemaSet( lang, SPEC, SEED.ePrescription.production )`;
  - P001's `sample` and `xsd` tabs, in testing;
  - `paths.changes( lang, "nomenclatures" )`.

- [ ] **Step 2: Run it.**

Run: `node --test packages/portal/test/a11y.test.js`
Expected: no axe violation on any page.

- [ ] **Step 3: Update the README and the design record.**
  - The README's list of addresses gains decision 7's.
  - Row 8 of the plan table reads "8a and 8b done; 8c (guides, FAQ, environment status, search) next".

- [ ] **Step 4: Run the definition of done.**

Run: `npm ci && npm run fixtures:fetch && npm run lint && npm test`
Expected: lint 0 errors; every suite passes.

- [ ] **Step 5: Commit** — `test(portal): the Schemas pages and tabs in Chromium; README (HEL-39)`

## Deliberately not in this plan

- **Plan 8c (HEL-40):** guides and FAQ, environment status, and search.
- **The message tester and the XSD-equivalence corpus** (plan 11). Its samples will be these, so a coded value is already a real key.
- **A signature that validates.** The sample's `ds:Signature` is empty, because signing a synthetic message proves nothing. xmldsig refuses an empty one, and the page and the sample both say so.
- **A README inside the zip,** and a model per message. Nothing asks for either yet.
- **Announcing the new XSDs** (§15): the solution architect's. That covers the changed classes, `dataType`, the unenforced code lists, and D001, D006 and H005's order.
