# Developer portal foundation — spec model, importer and public documentation

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-10-14 |
| **Scope** | Parts 1 and 2 of 7 (see §1) |
| **Tracking** | HEL-1 (design); data defects found on the way: HEL-2 … HEL-12 |
| **Framework** | [ti-engine](https://github.com/Belleal/ti-engine) — `core`, `web-framework`, `web-content`, `cloudflare` |
| **Mockups** | [`mockups/`](mockups/) — HTML fragments from the design sessions (see §9) |

This record is the design agreed in the brainstorming sessions of 2026-10-13 and 2026-10-14. Every decision in it was
taken explicitly; §2 lists them with the reasoning, so that a later reader does not have to re-open them.

---

## 0. Context

### 0.1 What exists today (measured 2026-10-13)

The developer material for the National Health Information System (НЗИС) is three pages on his.bg:

- **`/bg/dev/specifications`** — one page of ~270 links: 12 PDFs, 22 XLSX API specifications, 2 BPMN files, a zip,
  and ~230 XSD/XML schema files in a section collapsed by default. Each module lists a test and a production version;
  four were ahead in test on the day (e-Immunization, e-Examination, e-Hospitalization, business rules). The roadmap
  infographic is v2.7 of 01.04.2022.
- **`/bg/dev/nomenclatures`** — a dropdown of 100 code lists, each a plain table without search or download. Its
  "all nomenclatures" download is v1.5.27 while the specifications page names v1.5.33 (HEL-7).
- **`/bg/dev/faq`** — 11 undated questions, almost all from the e-Referral rollout.

Beside them: a test-environment Swagger (`ptest-api.his.bg`, OpenAPI 3.0, API versions v1–v4, 120 operations, XML
bodies only, Bearer authentication), and an external forum (a Redmine derivative, "Project Space") used for
announcements, questions and tickets. There is no English developer section.

### 0.2 What the sources actually are

- **The XLSX workbooks are the authoritative contract**, written by hand in Excel online by the spec team from a
  shared template (§5.1).
- **The XSDs at `https://www.his.bg/api/v1/` were never kept up to date** (HEL-6): `NHIS-P001.xsd` is 1.3.2 while the
  e-Prescription spec is 1.5.1; the shared `Fields`/`Entities`/`Commons` are 1.13.1; `NHIS-Nomenclatures.xsd` is 1.4.3
  with 110 types against 183 code lists in the 1.5.33 workbook.
- **The Word/PDF guides are obsolete** and are to be replaced by portal documentation kept current with each release.
- **The Swagger is secondary** — useful to developers for trying messages, not a contract.

### 0.3 Goal

A professional developer portal that replaces the three pages and the forum, and becomes the place where the
specifications themselves are written. Success for this foundation: a vendor goes from "never heard of NHIS" to a
message that passes validation against the current test version **without emailing anyone**, and can always answer
"what is live where, what changes next, and what do I have to change".

Audience: ~100 software vendors, mostly returning users; Bulgarian and English at launch.

---

## 1. Decomposition

The whole programme is seven parts, each with its own design → plan → implementation cycle. **This record covers
parts 1 and 2.** It designs part 1's model for part 3 from the start, so nothing is rebuilt when the studio arrives.

| # | Part | Delivers |
|---|---|---|
| **1** | **Spec model and importer** | The structured, versioned model of every specification, filled from the workbooks |
| **2** | **Public documentation** | Module/message/field reference, nomenclatures, errors, schemas, changes, guides, FAQ, message tester |
| 3 | Spec studio (staff) | Editing the development version, promotion, approvals, changelog editing, nomenclature maintenance |
| 4 | Developer accounts | Email + password + TOTP or email code; staff approval before first sign-in; organisations |
| 5 | Community | Announcements, public Q&A, private tickets with two-way Jira Cloud sync; replaces the forum |
| 6 | Sandbox | Per-vendor data spaces in the shared test environment — to be designed with the NHIS backend team |
| 7 | Software assessment | The Art. 28ж procedure (§12), run by Information Services through the portal |

Parts 1 and 2 include the minimum staff surface they need: Entra ID sign-in, the workbook upload with its report,
release approval, the go-live switch and the environment status form (§7, §8.7).

---

## 2. Decisions

| Topic | Decision | Why / rejected |
|---|---|---|
| Repository | `Belleal/health-dev-portal`, public | The portal is open source; development-version spec data therefore never enters the repo |
| Licence | Code EUPL-1.2; content CC BY 4.0 | Public-sector licence with network copyleft and an equal Bulgarian text. Rejected: Apache-2.0 for all (allows a closed hosted fork) |
| Framework | ti-engine packages from npm; generic gaps go into ti-engine, nothing НЗИС-specific does | The framework knows nothing of its applications |
| Storage of specs | A database, not Git (§3.2) | The studio needs approvals, three-slot promotion and 39,000-row lists. Rejected: everything in Git (development versions would need a private repo; a studio committing to Git with approvals is awkward) |
| Guides and FAQ | Markdown in the repo, edited by pull request | Technical staff edit them; review and diffs come free |
| Source of truth | The workbooks now; the studio later; then XLSX disappears (no export) | — |
| Versions kept | Development, staging, production, **previous production** (until its expiry date); retired versions keep only their changelog | The full changelog from the first version is kept |
| Version numbers | The spec version is the only version that matters; the workbook's "Release" column is ignored; `/vN/` is an endpoint space | — |
| Conditions | A formal, executable language (§6); business rules later in the same engine | Rejected: conditions as text only |
| XSDs | Generated; type, element and attribute names, structure, restrictions and documentation reproduced exactly where the type exists today; compared structurally, not byte for byte | The `version` attribute becomes the spec version of the file's source |
| `/api/v1/` | Obsolete: left frozen and marked obsolete; never redirected | Vendors' code points at it |
| Common schema | Its own spec with its own versions and approvals | A shared-type change appears in the changelog of every module using it |
| Releases | Approved by the solution architect from day one; go-live switched and announced **manually** | No automation for now |
| Staging releases | Announced; no notice period. Production: notice period + announcement | — |
| Message tester | Runs in the browser; the message is never sent | Messages may carry patient data |
| Environment status | Shown on the home page, set by staff manually; automation later | — |
| Root URL | `/` → `/bg/`, visible language switch | Predictable and cacheable |
| Staff | Entra ID only (Information Services tenant); roles editor, approver, admin | — |
| Server logs | 90-day retention, **assumption pending DPO** | — |
| Data layer | SQL over D1 for development, PostgreSQL at launch, Redis for sessions | §3 |
| Files | S3-compatible storage (R2 via the Worker; an S3-compatible service in the data centre) | — |
| Search | Self-hosted, built at publish time | — |
| Hosting | Cloudflare account for development; Information Services' data centre (Kubernetes) at launch | — |
| Email | From the his.bg domain in production; Cloudflare's facilities during development | — |
| Visual direction | C · hybrid; home H1 · status first; message page M1 · tree table | §9 |
| Tracking | YouTrack project HEL | — |

---

## 3. Architecture

### 3.1 One application

The portal is one ti-engine web application, a `TiWebServer` subclass, serving the public site now and the staff
studio and vendor area later. For two developers, one process with separate areas beats several services; anything can
be split out when load demands it.

### 3.2 Data layer

On Cloudflare a ti-engine container cannot reach D1 directly: it goes through its Worker, over core's state protocol,
which is key/JSON documents only. The spec model needs real queries — field trees, cross-version comparison, lists of
39,000 rows (CL011). Therefore:

- **SQL gateway (in ti-engine, generic).** The Worker exposes an internal endpoint that runs parameterised statements
  and batches against D1, reachable only from the container through `outboundByHost`, exactly like the state service.
  The client has two drivers: D1-over-HTTP and PostgreSQL.
- **One SQL dialect subset.** The portal's data layer writes SQL that runs on SQLite and PostgreSQL; the few
  differences (placeholders, JSON functions, upsert) live in one adapter.
- **One test suite, two databases**: SQLite through `node:sqlite` (as core's suites already do) and PostgreSQL in
  Docker.
- **Rejected:** forcing the model into the JSON document store (no queries; D1's 2 MB row limit already breaks on
  CL011); PostgreSQL from day one through Hyperdrive (a hosted EU PostgreSQL only for development).
- **Redis** keeps its role: sessions and cache in the data centre; on Cloudflare the state service, as competence does.

### 3.3 Files

Generated files (§7.4) are stored by content hash in S3-compatible storage: **R2 through the Worker** on Cloudflare (a
file gateway beside the SQL gateway, same ti-engine feature), an **S3-compatible service** in the data centre
(MinIO, Ceph's object gateway or SeaweedFS — operations' choice).

### 3.4 Search

Built at release time from the frozen data into an index file the application loads — no database full-text search, so
D1 and PostgreSQL behave alike. Bulgarian matching is the portal's own normalisation: case, Latin transliteration
(`web-content`'s `transliterate`), and **look-alike letters folded together**, so "E-рецепта" with a Latin E (HEL-10)
matches the Cyrillic spelling.

### 3.5 Repository layout

npm workspaces, CommonJS, ti-engine's house style (four-space indent, spaces inside brackets, `#alias` imports, JSDoc
on everything exported):

| Path | Contents |
|---|---|
| `packages/spec-model` | Pure logic, no I/O: entities, validation, version comparison, the conditions language and evaluator, the XSD generator, the message validator. Candidates for a permissive licence later |
| `packages/importer` | Workbook and XSD → model; the anomaly report |
| `packages/data` | The SQL data layer and migrations |
| `packages/portal` | The web application |
| `deploy/cloudflare` | The Worker, from ti-engine's `cloudflare` template |
| `content/` | Guides and FAQ in Markdown (CC BY 4.0) |

---

## 4. Spec model

### 4.1 Specs and versions

A **spec** is anything with its own version line:

| Kind | Holds |
|---|---|
| `module` | One per module — e-Prescription, e-Referral, … : messages and their elements |
| `rules` | Business rules (`RL…`) |
| `nomenclatures` | Code lists (`CL…`) |
| `common-schema` | The shared type library behind `NHIS-Fields`, `NHIS-Entities`, `NHIS-Commons` |

A spec has at most one version in each **slot**: `development`, `staging` (the public test environment), `production`
and `previous-production`. A version records its staging date, its production date, the notice period and
announcement of its production release, and — in the previous-production slot — the date its backward compatibility
**expires**. A retired version keeps only its changelog entries; its content is gone.

Development versions are never public.

### 4.2 Messages

Code (`P001`), names in both languages, endpoint address, request or response, sender and recipient, the
request/response pairing, and an explicit lifecycle: `in-development`, `active`, `withdrawn`, read from the
workbook's tab colour (§5.4). "Changed in this version" is computed by comparing versions; the tab colour's claim is
kept beside it as a cross-check.

### 4.3 Elements

Each message has a tree of elements. An element has:

- a **kind**: `group`, `field`, `polymorphic` (its variants as children), `attribute`;
- required / conditional / optional, and cardinality (min, max);
- a data type and a **structured** constraint (length, character class, format) instead of the text
  `min=1, max=255, chars=an`;
- fixed and default values;
- references to rules, conditions and a code list;
- its XML tag and attribute, and its order;
- descriptions in both languages;
- its **binding to a common-schema type**.

**Identity across versions** is the tag path plus the attribute, e.g.
`contents/prescription/group/medication/medicationCode@name`. Polymorphic variants share their tag, so each variant
**and every identity under it** carries the variant's ordinal: `…/doseQuantityCode@value#1`, `…/doseQuantityCode@name#1`.
Comparison and changelog generation rely on it; the studio preserves it when an element is edited.

### 4.4 Common-schema types

Exact name (`lrnBase`), the schema file it belongs to, restrictions and documentation. Many elements in many modules
share one type, so a type change shows up in every module that uses it. A new field gets a type name by the existing
convention (`<tag>Base`), which an editor can override.

### 4.5 Conditions

The parsed expression (§6), the original imported text (kept until an editor confirms the parsed form), and
descriptions in both languages.

### 4.6 Code lists

Per-list column definitions (e.g. `NHIF Code` on CL006), entries with key, descriptions and display values in both
languages and `Since` / `Valid Until` — which hold **nomenclature versions** (`v1.0.0`), not dates — a source note
(e.g. a FHIR code system), and whether an external register maintains the list (CL009 from НСЦРЛП, CL011 ICD). The
workbook's index sheet "Номенклатури" adds a status ("В УПОТРЕБА"), a "dynamic" flag and a visibility column per
list. CL009 and CL011 are imported once; how they are maintained afterwards is decided later.

Measured on nomenclatures 1.5.33 (2026-10-19):

- **Sheet layout.** A title row `CLxxx - <name>` (Bulgarian only; no list has an English name), optional note rows
  (`Източник: …`, `FHIR: …`, `Важно: …`), a column-group row (`Entity` / `Meta Data` / `System Data`), then the
  header row, found on rows 3 to 6.
- **Header layouts.** 63 distinct layouts, which reduce to one set of column roles under different titles:
  - descriptions: `Description BG` / `Description EN`, or `Description` / `Language EN`;
  - display values: `Display value BG` / `Display value EN`, in either case, or `Display Value (Bulgarian)` /
    `Display Value (English)` (CL999).

  Every other column is list-specific. CL007 has a list-specific `Description` beside `Description BG`.
- **Statuses.** The index gives six:

  | Status | Lists |
  |---|---|
  | `В УПОТРЕБА` (in use) | 173 |
  | `ПРЕМАХНАТА` (removed) | 3 |
  | `ЗА РЕВИЗИЯ` (under revision) | 1 |
  | `РЕЗЕРВИРАНА` (reserved) | 2 |
  | `В РАЗРАБОТКА` (in development) | 2 |
  | `ЗА ДОПЪЛВАНЕ` (incomplete) | 1 |

  "Dynamic" is `true` for 6 lists. The visibility column is empty throughout.
- **Index and sheets.**
  - CL068 is listed as removed and has no sheet.
  - Two sheets, CLS01 and CLS02, are not listed. They are relation tables, not code lists, and are not imported.
- **Entries.**
  - 59,343 entries in 181 lists: 59,360 keyed rows, of which 17 repeat a key. CL011 alone holds 39,005.
  - Placeholder rows (`...`, `---`), footnotes typed into the Key column, and keyless rows are not entries. CL122 is
    entirely keyless: it is a relation table, reserved.
  - Two lists repeat a key (HEL-15).
- **Versions.** Of the 59,311 filled `Since` / `Valid Until` cells:
  - 58,933 are in the form `v1.2.3`;
  - 252 are versions in another form (`v.1.5.21`, `1.5.16`);
  - 124 are dates (`10.10.2023`);
  - 2 are neither.
- **Fills.** A red fill on a key marks some withdrawn entries but not all: 98 entries with a `Valid Until` have no fill.
  So `Valid Until`, not colour, says an entry is withdrawn.

### 4.6.1 Business rules

A rule has an ID (`RL001`), a definition (Bulgarian only, often several lines), a source note, the error code it returns
(a CL999 key) and the rules version it was added in. As on a module's message tabs, **the ID cell's fill gives the
rule's status**:

| Fill | Status | Rules in 1.1.1 |
|---|---|---|
| green `70AD47` | active | 87 |
| yellow `FFC000` | active, changed in this version | 1 |
| red `C00000` | withdrawn; the definition is cleared | 9 |

The prevention workbook (`PR001`) is a relation table keyed by a code list, not a set of rules. It waits for its own
design.

### 4.7 Change records

An entry belongs to a spec version and has a category (`breaking`, `dropped-plan`, `non-breaking`), a target (message,
element, condition, code list or entry), before and after values, an explanation in both languages, and an origin
(`detected` or `editor`). Detected entries come from comparing versions; editors may amend them and add their own.
Historical workbook notes are imported as text entries under their versions.

### 4.8 References between specs

References resolve **within the same slot**: a module's staging version reads the staging nomenclatures, rules and
common schema. A release records exactly which versions it resolved against, so a frozen version never changes
meaning.

### 4.9 Text

Every human-readable text is stored in both languages. A missing translation is recorded as missing — never filled
with the other language.

### 4.10 XSD generation

The XSD set is generated **per slot, from all specs together**: `NHIS-Fields.xsd`, `NHIS-Entities.xsd` and
`NHIS-Commons.xsd` from the common schema, `NHIS-Nomenclatures.xsd` from the code lists (code lists are enforced in
XSD: `prescriptionTypeBase` takes `nhis:CL007`), and one file per message from its module. Each file's `version`
attribute is the version of the spec it comes from. Each `include` points to the **fixed** address of the exact
common-schema version the release resolved against (§7.3).

---

## 5. Importer

### 5.1 The template, as measured

e-Prescription 1.5.1 (28 sheets) and nomenclatures 1.5.33 (185 sheets):

- Message sheets (`P001` … `P099`) share 13 columns: Name, R/C/O, Cardinality, Data types, Constraint, Fixed Value,
  Default Value, Rules, Conditions, Code Lists, Field Name / Tag, Attribute, description.
- **Meaning carried by formatting:** nesting depth is the cell **indentation**, repeated by leading asterisks
  (`*Prescription`, `**Medication Group`); the row kind is the **fill colour** (legend: group `#BDD7EE`, polymorphic
  `#FCE4D6`, attribute `#FFF2CC`, field none or white); groups close with "END of …" rows (grey `#F2F2F2`), though
  not every group has one, so indentation is authoritative; change-note categories are the **font colour** (breaking
  `#C65911`, dropped plan `#C00000`, default non-breaking); message status is the **tab colour** (working and
  unchanged `#70AD47`, working and changed `#FFC000`, not yet working `#ED7D31`, removed `#C00000`).
- **Tab colours are often theme colours** (`{ theme: 9 }` rather than `#70AD47`) and resolve only through the
  workbook's own theme part. In e-Prescription 1.5.1 all 23 message sheets carry one: 19 working and unchanged, P011
  and P012 removed, P021 and P022 not yet working — exactly what the 1.5.0 and 1.5.1 change notes say. (An earlier
  reading through openpyxl, which cannot resolve theme colours, wrongly found only 10 of them coloured.)
- Code lists: `Key`, `Description BG/EN`, `Display value BG/EN`, list-specific columns, `Since`, `Valid Until`;
  change notes carry test and production dates.

### 5.2 Inputs

For each spec, the workbook of each slot; the rules workbooks; the nomenclatures workbook; and **once**, the XSD set at
`/api/v1/`, to learn the type name each element uses — the workbooks do not contain them.

### 5.3 Stages

Five pure stages, each tested on its own:

1. **Read** — cell values plus the formatting that carries meaning (indentation, fill, font colour, tab colour).
2. **Structure** — the element tree from indentation (asterisks as cross-check), kinds from fills, groups closed by
   "END of" rows.
3. **Interpret** — cardinality and R/C/O; constraint text into parts; references collected; conditions parsed into the
   language of §6, their paths resolved to elements.
4. **Link** — code lists against the same slot's nomenclatures, rules against the rules spec, XSD type names from the
   imported schemas. Linking also checks each rule's error code against CL999. A reference to a removed list or a
   withdrawn rule is a warning: the target exists but should no longer be used.
5. **Report** — every anomaly with sheet, row and cell, at one of two levels:
   - **blocking** — nothing is written; the source is fixed and re-imported. Examples:
     - the tree cannot be built;
     - a reference to a code list, rule or condition that does not exist;
     - two elements with the same identity, or two entries of one list with the same key;
   - **warning** — imported, and listed on a staff "data quality" page (indentation and asterisks disagree; a Cyrillic
     look-alike in a key, code or compared value; a word mixing scripts; an unknown fill; an unresolved condition path;
     a free-text effect).

### 5.4 Status, history and re-import

- The **tab colour** sets the lifecycle: green and yellow → `active`, orange → `in-development`, red → `withdrawn`
  (P011 and P012, removed in 1.5.0). An unknown or missing colour is a warning. "Changed" is computed; where the tab
  colour disagrees with the computed difference, the report says so.
- Historical change notes are imported as text entries in their categories. Differences the importer **detects**
  between slots are shown in the report for review, not merged into the notes.
- Importing the same workbook twice changes nothing; a newer workbook replaces its slot's content.

### 5.5 Acceptance: the round trip

Import workbook and XSDs → generate XSDs from the model → compare structurally with the originals. Because the
published XSDs are stale, the result is a **drift report**, not equality: each difference is an importer defect or real
drift between workbook and XSD, and the report says which side has what. Wherever a type exists today, the generated
XSD keeps its exact name and shape.

### 5.6 Where it runs

- A command-line tool for development: OneDrive folder → local SQLite.
- The staff upload page on the deployed portal: the same stages, the report, then a write on confirmation and a release
  awaiting approval (§7.1).

### 5.7 Measured: exceljs

Measured on 2026-10-19 with exceljs 4.4.0 against both public workbooks:

- Indentation is `alignment.indent` (absent at depth 0); fills are `fill.fgColor.argb` on `pattern` fills; font and
  tab colours are `{ argb }` or `{ theme, tint }`; the theme part is reachable as raw XML. No cell is rich text or a
  formula; 31 are numbers (fixed values such as `4`), so cell values are converted to text.
- **e-Prescription 1.5.1** reads in ~0.15 s.
- **Nomenclatures 1.5.33** reads in 2.1 s and **751 MB** of memory — too much for an upload in a container, so code lists
  are read with exceljs' streaming reader.
- A prototype of §5.3's tree rules over all 23 e-Prescription message sheets found no duplicate identity, no
  indentation jump, no asterisk disagreement, no field without a tag and no attribute outside a field; one constraint
  format beyond the four expected (`YYMMDD`, for expiry dates); and **30 requirement cells holding a Cyrillic `О`**
  (HEL-12) — folded to Latin with a warning, so the workbook still imports.
- **Look-alike folding** applies only where the result is entirely Latin: `О`, `Т3`, `Е003` fold; a genuine Bulgarian
  word in a fixed value is left alone.
- **Codes are folded to Latin; text never is** (Boris, 2026-10-20: "to Latin always, unless it is a BG text or
  description").
  - **Code-list keys** are codes.
  - **A list-specific column** is a code column when every value in it, once folded, is printable ASCII without
    whitespace. That is 141 of 207 such columns in 1.5.33, and folding them changes 20 values, among them CL024's
    `CL022 Mapping`, which must match CL022's folded keys.
  - **Descriptions, display values and text columns** stay as written, even when every letter has a Latin twin:
    `Русе` would otherwise become `Pyce`.

The streaming reader, measured on nomenclatures 1.5.33:

- **What it gives:**
  - cell values;
  - fills, fonts and indentation through the cached styles;
  - colours as `{ argb }` or `{ theme }` (1,005 change-note fonts are `{ theme: 1 }`).
- **What it does not give:**
  - **No theme part:** the reader skips it. It is read separately, from the same bytes, with jszip (19 ms), so theme
    colours resolve as they do in the full reader.
  - **No tab colours:** a code list carries its status in the index sheet, so none is needed.
  - **No merged ranges:** covered cells carry no value in the file, so they read as empty, which is what the full
    reader now does too.
- **Order:** sheets arrive in the order of the zip archive, not of the tabs (CL178 comes first).
- **Temporary files, and a defect:** a worksheet that arrives before the shared strings is spooled to a temporary
  file, so 1.5.33 put all 185 worksheets on disk. Worse, while such a spool is pending, the reader's entry iterator
  loses the rest of the archive.
  - On a workbook written by exceljs itself (worksheets first, workbook part last), the reader fails outright.
  - Excel stores the workbook part early, which is why 1.5.33 survived.

  The importer therefore **re-packs the archive** in memory with jszip, uncompressed and one part at a time. The
  parts a worksheet depends on come first: the workbook part, its relationships, the shared strings and the styles.
  Every worksheet is then parsed straight from the archive, with **no temporary files**.
- **Cost**, on 1.5.33 with the importer as built (plan 2):
  - reading every sheet into raw rows takes **1.3 s at a 254 MB peak**, against 2.2 s with the spooling;
  - importing the whole workbook into the model takes **1.7 s at a 297 MB peak**;
  - the full reader takes 751 MB.

---

## 6. Conditions language

### 6.1 Shape

The IF/THEN/ELSE the team already writes:

```text
IF 'prescription.category'.value IN ['T2', 'T3']
THEN 'prescription.isProtocolBased'.required = 'R'
ELSE 'prescription.isProtocolBased'.required = 'O'
```

An optional scope clause makes repetition explicit:

```text
FOR EACH 'prescription.group.medication.dosageInstruction'
IF 'prescription.category'.value IN ['T2', 'T3', 'T6', 'T7']
THEN 'prescription.group.medication.dosageInstruction.boundsDurationUnit'.required = 'R'
 AND 'prescription.group.medication.dosageInstruction.boundsDurationUnit'.value = 'd'
```

### 6.2 Paths

- One form: quoted, dotted, absolute from the message root (`header.…`, or the contents' children such as
  `prescription.…`).
- After the path: `.value` (the value attribute), `.@name` (any other XML attribute, e.g.
  `'requester.qualification'.@nhifCode`), `.required`, `.cardinality`.
- Stored as element identities, not text: renaming a tag updates every condition using it.
- Relative (`'..medication'`) and partial (`'medication.mkb'`) forms are accepted **only by the importer**, and only
  where they resolve to exactly one element; anything else is reported (HEL-5).

### 6.3 Predicates (IF)

`=`, `!=`, `<`, `<=`, `>`, `>=`, `IN [...]`, `NOT IN [...]`, `MATCHES 'glob'`, `IS null`, `IS NOT null`, `IS true`,
`IS false`, combined with `AND`, `OR`, `NOT` and parentheses. The shorthand `= 'T2' OR 'T3'` is accepted and stored as
`IN ['T2', 'T3']`.

**Globs:** `?` is exactly one character, `*` any number. The workbook's `x` (one character, e.g. `'N80.xx'` in CDP30)
becomes `?` on import. Globs, not regular expressions: `MATCHES 'N80.??'` is readable by analysts where
`^N80\..{2}$` is not.

### 6.4 Effects (THEN / ELSE), joined with AND

| Effect | Meaning |
|---|---|
| `.required = 'R'` / `'O'` | Must / may appear |
| `.value IS null` | **Must be absent** from the message |
| `.value = 'x'` | Fixed value |
| `.value IN` / `NOT IN` / `NOT MATCHES` | Restricted value |
| `.cardinality = '1..3'` | Overridden occurrence count |
| `.value IS any` | No constraint |
| `NOTE '…'` | Prose that cannot be expressed (CDP14); shown, marked not checkable |

### 6.5 Checked against the model

- A value compared with a code-list element must be a key of that list in the same slot — so the Cyrillic `'Т3'` of
  CDP08 (HEL-3) fails as "not a CL007 key", and the class of bug cannot be published.
- Every element marked `C` must be governed by at least one condition.
- Paths must resolve; types must agree (no `> '1'` on a boolean).

### 6.6 Repetition

Default: a condition is evaluated **once per occurrence of the innermost repeating element that contains all its
paths**; a path above that level has one value shared by every occurrence. `FOR EACH` overrides the default.
**To be confirmed against the live NHIS validation (HEL-9)** with CDP19, CDP23 and CDP29.

### 6.7 Display and execution

- Every condition is printed from its parsed form, so all read alike; the original text stays beside it until
  confirmed.
- The evaluator is plain code in `spec-model`, without I/O, so it runs in the browser (§8.6).
- Business rules (`RL…`) stay text for now; the model reserves a formal expression for them and the same evaluator is
  meant to carry them.

---

## 7. Releases and publication

### 7.1 Release

A release puts a spec version into a slot. In parts 1–2: a staff member uploads the workbook, reviews the import
report and fills in the release form (slot, summary in both languages, and for production the planned go-live date set
by the notice period, plus whether the replaced version stays as previous production and until when). **The release
waits for the approver (solution architect) before anything is published**. Whether an approver may approve a release
they uploaded themselves is a **setting, off by default** (self-approval allowed) while the team is small; switching it
on makes change control need two people. Part 3 adds promotion from development and
editing; the release record stays the same.

### 7.2 Production timeline (manual)

1. **Announced** — published with its planned date; shown as "upcoming in production". Staging already carries it.
2. **Live** — when staff (or the approver) **switch it live by hand** and announce it. There is no automatic switch and
   no reminder. The replaced version either moves to **previous production**, marked everywhere as "backward compatible
   until dd.mm.yyyy", or is retired.
3. **Expired** — staff retire previous production when its date passes.

Staging releases are announced, without a notice period.

### 7.3 Freezing and addresses

A release freezes the version's content and the versions it resolved against.

| | Fixed (never changes, cached forever) | Slot (follows the slot, cached briefly, canonical → fixed) |
|---|---|---|
| Pages | `/bg/specs/e-prescription/1.5.1/P001` | `/bg/specs/e-prescription/production/P001` |
| XSDs | `/schemas/e-prescription/1.5.1/NHIS-P001.xsd` | `/schemas/production/NHIS-P001.xsd` |

`/api/v1/` on www.his.bg is **obsolete**: frozen, marked obsolete on the portal, never redirected.

### 7.4 Generated files per release

The XSD set; nomenclature downloads (JSON, CSV); a zip with everything for the version (XSDs, sample messages, JSON
model, changelog); the search index.

### 7.5 Changelogs

- Per spec, newest first, each version split into breaking, dropped-plan and non-breaking.
- **Comparison** between any two kept versions: the structural difference plus the changelog entries in between —
  "what do I change to go from what I have to what is live".
- Atom/RSS per spec and for everything; email subscriptions come with part 4.

### 7.6 Dates

Sofia time; `dd.mm.yyyy` in Bulgarian and the English locale's format in English.

---

## 8. Public site

### 8.1 Sections

Every address starts with `/bg/` or `/en/`; `/` goes to `/bg/`.

| Section | Contents |
|---|---|
| Home | Environment status band; versions by slot; next production go-live; latest releases (§8.2) |
| Specifications | Modules → messages grouped by endpoint segment (`/doctor`, `/pharmacy`) → message page (§8.3) |
| Nomenclatures | All 183 lists, searchable; per-list page with every column, filter, expired entries hidden by default, JSON/CSV |
| Errors | CL999 errors and CL998 warnings, explained |
| Schemas | XSD sets per slot and version; `/api/v1/` obsolete notice |
| Changes | Changelogs, comparison, feeds |
| Guides | Getting started, environments, authentication, signing, NRN generation, 2D barcode, secure network, dosage parser, error handling — written fresh from the obsolete PDFs, drafted with AI assistance, marked as such, reviewed by the solution architect |
| FAQ | The 11 questions migrated as they are (review later), categorised, searchable |
| Tools | Message tester (§8.6) |

### 8.2 Home (H1 · status first)

Under the top bar a mint band with each environment's status and one link for newcomers ("Нов разработчик? Започнете
оттук"). Below: versions by environment, test-ahead-of-production marked in red; on the right the next production
go-live with its breaking-change count and a link to the comparison, then the latest releases with a feed.
Mockup: [`mockups/home-layout.html`](mockups/home-layout.html), option H1.

### 8.3 Message page (M1 · tree table with detail panel)

- The slot switcher in the mint band: Staging, Production, Previous production with its expiry date; on a staging page,
  elements that differ from production are marked new / changed / removed.
- One dense, collapsible table: element, R/C/O, cardinality, type, constraints, links (code list, rules, conditions).
- Selecting a row opens its definition on the right: description, constraints spelled out, XSD type, the XML it
  produces, every message that uses the same field, and a copy-link button. **Every element has its own address.**
- Tabs: elements, sample message, conditions, XSD, changes.

Mockup: [`mockups/message-page.html`](mockups/message-page.html), option M1.

### 8.4 Languages

Bulgarian and English, linked with `hreflang`. A missing English text shows the Bulgarian with a visible "not yet
translated" marker.

### 8.5 Rendering

Server-rendered and readable without JavaScript; one small plain script adds collapsing, search and the tester (the
arrangement `web-content` uses). From `web-content`: HTML escaping, document head and `hreflang`, Markdown. The staff
area uses the framework's application shell. Accessibility target WCAG 2.1 AA (EN 301 549).

### 8.6 Message tester

- **Runs in the browser; the message never leaves the vendor's machine.** It validates against the published model:
  structure, code lists (only those the message type uses are downloaded) and conditions.
- **Equivalence with the XSDs is proven in CI**: a corpus of synthetic messages is validated by a real XSD validator
  against the generated XSDs and by the model validator; the verdicts must agree.
- The page states plainly: synthetic data only. Sending to the test environment comes later, when the network allows.

### 8.7 Environment status

Per environment (test, production): operational / degraded / maintenance / outage, a message in both languages, planned
maintenance windows, who updated it and when; a feed. Set by staff; automation later.

---

## 9. Visual direction

**C · hybrid**: НЗИС identity where it orients, documentation conventions where people work.

- **Top bar** dark green with a condensed capital wordmark; **mint band** under it carrying environment status or the
  slot switcher; **sidebar** and **dense tables** for reference content.
- **Palette** (from his.bg's live stylesheets): green `#00664D`, dark green `#005842`, bright green `#009B75`, mint
  `#BFE6DC`, mint tint `#EEF8F5`, ink `#00130F`, logo red `#D0201F` — **red reserved for changes and warnings**.
- **Type**: Sofia Sans for text (his.bg's body font), Sofia Sans Extra Condensed for display headings in place of
  his.bg's Bebas — one openly licensed family with full Cyrillic, avoiding a dependency on the licensing of his.bg's
  Cyrillic Bebas files. Monospace for tags and paths. All fonts self-hosted.
- Brand assets (NHIS logo, marks) are supplied by Information Services later; the mockups use a placeholder mark.

Mockups (HTML fragments written for the brainstorming companion, which supplies the surrounding frame):
[`visual-direction.html`](mockups/visual-direction.html) (A/B/C), [`home-layout.html`](mockups/home-layout.html)
(H1/H2), [`message-page.html`](mockups/message-page.html) (M1/M2), and
[`secondary-pages.html`](mockups/secondary-pages.html) (nomenclature list, changes, tester). Real data where stated in
each; the rest is labelled example data.

---

## 10. Security, privacy, operations

### 10.1 Security

- **Anonymous readers get no cookies** — the framework mints a session only on demand — so public pages stay
  cacheable.
- The framework's nonce-based CSP; no third-party scripts; self-hosted fonts; no analytics for now.
- **Staff**: Entra ID, Information Services' tenant only (`allowedDomains`); roles **editor**, **approver**, **admin**,
  each staff screen gated by its role. Every upload, approval, go-live switch and status change is recorded with who
  and when.
- **Uploads are hostile input**, even from staff: size and decompression limits (an `.xlsx` is a zip), a parse
  timeout, formulas never evaluated. XSDs parsed with external entities disabled (XXE).
- NIS2 and the pre-launch penetration test: security events logged; Dependabot and CodeQL; secrets only in the
  deployment's secret store.

### 10.2 Privacy

The public site processes no personal data beyond server logs (IP addresses): **90-day retention, an assumption until
the DPO confirms it**. The tester transmits nothing. The DPO is involved before part 4 (accounts) at the latest, because
per-organisation monitoring and contact data start there.

### 10.3 Caching

Fixed addresses and generated files: cached forever. Slot addresses: briefly. Status and feeds: one minute.

### 10.4 Deployment

One container image; only environment variables differ.

| | Development | Launch |
|---|---|---|
| Platform | Cloudflare Worker + container, from ti-engine's template | Kubernetes in Information Services' data centre |
| Spec data | D1 through the SQL gateway | PostgreSQL |
| Sessions | State service | Redis |
| Files | R2 through the Worker | S3-compatible service |
| Domain | `developers-test.his.bg` if DNS allows, else the Cloudflare development domain | `developers.his.bg` |

CI on GitHub Actions: lint, tests on SQLite and PostgreSQL, container build, CodeQL; CodeRabbit on pull requests.

---

## 11. Testing

| Area | How |
|---|---|
| `spec-model` | Unit tests for parser and evaluator, plus generated random cases; the XSD round trip against the public `/api/v1/` XSDs and the public e-Prescription 1.5.1 workbook |
| Importer | One synthetic workbook per anomaly class, built in code |
| Data layer | The same suite on SQLite and PostgreSQL |
| Tester | Model validator and a real XSD validator agree on a synthetic corpus |
| Portal | HTTP tests against a real server; automated accessibility checks in Chromium |

Fixtures contain only published (public) versions. Development-version data never enters the repository.

---

## 12. Legal basis of part 7 (for the record)

Art. 28ж of the Health Act (State Gazette 85/2024, in force 08.10.2024): the Minister of Health **assesses** specialised
software exchanging data with НЗИС, for **ease of use** and conformance with the ordinance under Art. 28г(6); the
ordinance **may not restrict use of software on the basis of the result**; the Minister approves and publishes on the
Ministry's website a list of assessed software **with each result**; producers provide the software free of charge for
the assessment. Ordinance Н-6/2022 has not yet been amended with the procedure; Information Services will run the
assessment through the portal. Consequences carried into every part: **API access is never gated on an assessment
result**, and usability assessment needs human evaluators. To be confirmed by Legal when part 7 is designed.

---

## 13. ti-engine work

Generic, so it lands in ti-engine with its own CA cards and pull requests, built in parallel and finished before the
first Cloudflare deployment (the portal develops locally on SQLite meanwhile):

1. **SQL gateway** — a statement-and-batch endpoint over D1 beside core's state service; a client with D1-over-HTTP
   and PostgreSQL drivers; Worker wiring in the `cloudflare` package.
2. **File gateway** — R2 through the Worker; an S3 client for the data centre.

---

## 14. Deliberately not in parts 1–2

Accounts, community, sandbox and assessment (parts 4–7); editing in the studio (part 3); the formal language for
business rules; automatic go-live and environment monitoring; analytics; forum migration (a side task — "Project
Space" may not be migratable); XLSX export.

---

## 15. Open items

| Item | Owner |
|---|---|
| Repetition semantics of conditions (HEL-9) | NHIS backend team |
| Which spelling the backend holds for code-list keys with Cyrillic look-alikes, e.g. CL022 `10-0А0` (HEL-15) | NHIS backend team |
| Server-log retention (90 days assumed) | DPO |
| Copyright holder of the code (README names "the contributors") | Information Services legal |
| Source workbooks for every spec and slot — the shared OneDrive folder was still empty on 2026-10-14 | Spec team |
| `developers-test.his.bg` on Cloudflare | Information Services DNS |
| Entra ID app registration for staff sign-in | Information Services IT |
| S3-compatible service in the data centre | Operations |
| Brand assets | Information Services |
| Data defects in the current sources (HEL-2 … HEL-12) | Spec team |
