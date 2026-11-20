# Plan 9a — The staff area's foundation: sign-in, people, roles and the admin screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boris and his team sign in to the staff area at `/studio/`. An admin gives people roles, switches
self-approval, and keeps the environment status. Nothing else is open: no anonymous visitor reaches a staff screen,
and every public page stays as it is.

**Architecture:** `PortalServer` gains a web application manager (`StudioManager`, a `TiWebAppManager`) with its shell
at `/studio/` (`application.home`). The session hooks record each person at first sign-in, keyed by the Entra object
ID, and read their roles from the portal's database on every request. The admin screens are framework fragments, with
Alpine components in the portal's own script, and they call the manager's services, which check the role on the
server.

**Tech Stack:** Node 26, CommonJS, `node --test`; `@ti-engine/web-framework` 1.63.1 (shell, sessions, local and Entra
sign-in), `@ti-engine/core` 1.23.0; the data layer on SQLite and PostgreSQL.

**Spec:** [`docs/superpowers/specs/2026-11-18-staff-area-design.md`](../specs/2026-11-18-staff-area-design.md), §1–§3,
§5, §6.6, §6.7, §7–§9. The design record [`2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md)
§3.1, §8.5, §10.1–§10.3.

**Plan 9 in three parts.** 9a is this plan. **9b, the editor's round**, follows: upload with its limits, the
single-list file reader, changelog correction, submit, withdraw and conflicts. **9c, the approver's round**, follows
that: the queue, the release screen, review and promotion. Each ends in working software. Card: HEL-48.

**Starts after** HEL-49 (portal PR #9) has merged: it raises the floors to web-framework `^1.63.1` and core
`^1.23.0`. Branch `feat/plan-9a-staff-foundation` from the updated `main`.

## Decisions this plan takes

- **The portal's roles have their own names in the session:** `studio:reader`, `studio:editor`, `studio:approver`,
  `studio:admin`. The framework reconciles its own `admin` role against the allowlist on every request, in both
  directions (`authorization.applyAdminRole`), so a database-granted role named `admin` would be stripped from anyone
  not on the allowlist. The configuration's admin keeps the framework's `admin`, and the portal counts it as
  `studio:admin`. The database stores the four role names bare: `reader`, `editor`, `approver`, `admin`.
- **A person's key** is `entra:<objectID>` for an Entra sign-in and `local:<username>` for a local
  one (never the users file's own `userID`, which an entry may set to an `entra:` key). The prefix keeps the two sources from ever meeting.
- **An editor's spec limit is stored as rows,** one per spec; the spec `*` means every spec. A role other than editor
  always has `*`.
- **"From configuration" is recorded at sign-in,** as a column on the person, by the framework's `isAdminIdentity`
  against `auth.admins`. The People screen shows it as of the person's last sign-in.
- **The manager reaches the database through a holder module** (`studio/context.js`), which `PortalServer` fills
  once the database is open. The framework builds the manager with no arguments and gives it no reference to the
  server.
- **`classPath` is given relative to the working directory,** because the framework joins it onto `process.cwd()`. An
  absolute Windows path joined that way is broken.
- **The portal ships its own `index.html` for the shell,** a copy of web-framework 1.63.1's with the studio's script
  added before Alpine's. The framework has no hook for an application's script. This is a framework gap, for a CA card
  (Task 7).
- **The studio offers Bulgarian and English, and starts in Bulgarian** (`languages` and `language` in
  `PortalServer`'s configuration; a ruling in Task 4). The framework offers only the deployment's language when
  neither is set.
- **With no sign-in method in effect, the studio does not exist** (Task 6a, added with Boris's approval on
  2026-11-19). A deployment may run the public site before Entra is registered.
- **The test environment signs in locally from now on** (`TI_WEB_AUTH_METHODS=local`), with synthetic users. The shell
  tests that pinned the framework's routes as the pages' 404 are rewritten to what they answer now.

## Global Constraints

- `@ti-engine/web-framework` `^1.63.1`, `@ti-engine/core` `^1.23.0` (HEL-49). No new dependency.
- The EUPL header on every new `.js` file, copied from `packages/portal/bin/portal-server.js:1-16`. CommonJS; four
  spaces; double quotes; spaces inside parentheses, brackets and braces; JSDoc on everything exported.
- `#alias` imports within a package; `@health-dev-portal/data/<name>` across packages.
- Every staff text has a label in Bulgarian and English. WCAG 2.1 AA, checked with axe.
- Staff responses are never cached. The framework answers `/app/*` with `no-store`; nothing in this plan changes that.
- **An anonymous visit to any public page sets no cookie and keeps its `Cache-Control`,** with sign-in enabled.
- Every data-layer test runs on SQLite and PostgreSQL (`eachDatabase`).
- Synthetic users only. No real name, address or object ID in a test, fixture or document.
- Never commit unpublished specification data, `.env`, secrets, a model identifier, or the company's host name.
- Commits: `feat(data)`, `feat(portal)`, `test(portal)`, `docs(design)`, with `(HEL-48)` in the subject.

## Review Focus

1. **A staff path written in another case** (`/APP/people`, `/Studio/`, `/ME`): an anonymous visitor is refused
   exactly as for the lower-case path. The exemption ignores case and so does Express. Test in Task 3.
2. **A role taken away while a screen is open:** the screen's next service call is refused, with no sign-out needed.
   Test in Task 5.
3. **A signed-in staff member browsing public pages:** their own responses carry their session cookie and lose
   `public`. An anonymous visitor's responses to the same pages still carry no cookie and keep `public`. Test in
   Task 3.
4. **A display name with markup from Entra** (`<img src=x onerror=alert(1)>`): it is shown as text everywhere. No
   studio fragment uses `x-html`. Tests in Tasks 4 and 5.
5. **Every studio admin grant removed,** the admin's own included: the configuration's admin still reaches People and
   can give the role back. Test in Task 5.

## File map

| Path | Responsibility |
|---|---|
| `packages/data/store/schema.js` | migration `0006-staff`; `TABLES` |
| `packages/data/store/copy.js` | the new tables' keys |
| `packages/data/store/staff.js` | people, grants and grant changes |
| `packages/data/store/versions.js` | `listSpecs` |
| `packages/portal/studio/context.js` | the holder of the database and file store for the manager |
| `packages/portal/studio/roles.js` | session role names; grants to session roles; admin check |
| `packages/portal/studio/session.js` | the person's key; the sign-in and per-request hooks' logic |
| `packages/portal/studio/manager.js` | `StudioManager`: fragments, views and services |
| `packages/portal/studio/people.js` | the People screen's view and service |
| `packages/portal/studio/settings.js` | the Settings screen's view and service |
| `packages/portal/studio/environment.js` | the environment status screen's view and services; Sofia time |
| `packages/portal/studio/labels.js`, `labels.json` | the staff texts, bg and en, laid down through `addCatalogue` |
| `packages/portal/public/index.html` | the shell page, with `studio.js` |
| `packages/portal/public/scripts/studio.js` | the screens' Alpine components |
| `packages/portal/public/fragments/…` | the landing, People, Settings and Environment status screens; the sidebar; the sign-in brand |
| `packages/portal/bin/portal-server.js` | `application`, the exemption, the shadows, the hooks |
| `packages/portal/test/support/memory-cache.js` | grows to hold sessions |
| `packages/portal/test/support/staff.js` | synthetic users, their file, `signIn` |

---

### Task 1: The staff tables and their store

**Files:**
- Modify: `packages/data/store/schema.js` (a `STAFF` statement list; `MIGRATIONS` gains
  `{ id: "0006-staff", statements: STAFF }`; `TABLES` gains the three tables after `maintenance_windows`)
- Modify: `packages/data/store/copy.js:24-29` (`KEYS`: `staff_people: "key"`, `staff_grants: "person_key, role, spec"`,
  `staff_grant_changes: "id"`)
- Modify: `packages/data/store/versions.js` (`listSpecs`)
- Modify: `packages/data/package.json` (`exports["./staff"]`, `imports["#staff"]`)
- Create: `packages/data/store/staff.js`
- Test: `packages/data/test/staff.test.js` (new); `test/schema.test.js:37` and `:41-43`; `test/cli-copy.test.js:67`
  (20 tables become 23)

**Schema** (the SQL subset of §3.2; times stored as the other tables store them; `oneOf` for the role):

```sql
CREATE TABLE staff_people ( key TEXT PRIMARY KEY, name TEXT NOT NULL, configured_admin INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL )
CREATE TABLE staff_grants ( person_key TEXT NOT NULL REFERENCES staff_people ( key ),
    role TEXT NOT NULL, spec TEXT NOT NULL, PRIMARY KEY ( person_key, role, spec ) )   -- role: oneOf reader, editor, approver, admin
CREATE TABLE staff_grant_changes ( id TEXT PRIMARY KEY, person_key TEXT NOT NULL REFERENCES staff_people ( key ),
    changed_by TEXT NOT NULL, changed_at TEXT NOT NULL, grants TEXT NOT NULL )          -- grants: JSON of the whole new set
```

**Interfaces:**
- Produces, in `@health-dev-portal/data/staff`:
  - `ROLE`, a frozen object `{ READER: "reader", EDITOR: "editor", APPROVER: "approver", ADMIN: "admin" }`; `ROLES`, the
    array of its values; `EVERY_SPEC = "*"`.
  - `recordSignIn( db, { key, name, configuredAdmin, at = new Date() } ) → Promise<void>`: inserts the person with no
    grant, or updates `name`, `configured_admin` and `last_seen_at`, keeping `first_seen_at`.
  - `loadGrants( db, key ) → Promise<Array<{ role, spec }>>`, ordered by role, then spec.
  - `listPeople( db ) → Promise<Array<{ key, name, configuredAdmin, firstSeenAt: Date, lastSeenAt: Date, grants }>>`,
    ordered by name in Bulgarian collation.
  - `setGrants( db, key, grants, { by, at = new Date() } ) → Promise<void>`: replaces the whole set and records one
    change, in one batch. It throws `RangeError` for each of these, writing nothing:
    - an unknown person;
    - an unknown role;
    - a spec other than `*` on a role other than editor;
    - an editor holding both `*` and named specs;
    - a named spec that `listSpecs` does not know.
  - `grantChanges( db, { key = null, limit = 50 } = {} ) → Promise<Array<{ id, key, by, at: Date, grants }>>`, newest
    first.
- Produces, in `@health-dev-portal/data/versions`: `listSpecs( db ) → Promise<string[]>`, every spec ID, sorted.

- [ ] **Step 1: Write the failing tests** in `test/staff.test.js`, with `eachDatabase`, each seeding the specs it
  names:
  - `records a first sign-in, and the next one refreshes the name and last seen but keeps the first`
  - `starts a person with no grant`
  - `replaces a person's grants and records who changed them` (`grantChanges` has one row, `by` the admin's key, and
    `grants` equal to the set given)
  - `refuses a role, a limit or a spec it does not accept, and writes nothing`, as a table:
    `[ { role: "owner", spec: "*" } ]`, `[ { role: "approver", spec: "CL009" } ]`,
    `[ { role: "editor", spec: "*" }, { role: "editor", spec: "CL009" } ]`, `[ { role: "editor", spec: "NOPE" } ]`,
    and an unknown person. Each throws `RangeError`, and `loadGrants` is unchanged.
  - `lists people by name, with their grants and whether configuration made them admin`
  - `lists every spec`

  Update `test/schema.test.js` (the migration IDs end with `"0006-staff"`; `TABLES` ends with `staff_people`,
  `staff_grants`, `staff_grant_changes`) and `test/cli-copy.test.js:67` (`/Copied \d+ rows in 23 tables; 1 files\./`).

- [ ] **Step 2: Run them and watch them fail**
  Run: `npm test --workspace @health-dev-portal/data`, with `HDP_TEST_POSTGRES_URL` set
  Expected: FAIL. `Cannot find module '#staff'`, the schema test on the migration list, the copy test on the count.

- [ ] **Step 3: Implement** the migration, the keys, `staff.js` and `listSpecs`. Validate in `setGrants` before
  writing, so a refused set changes nothing.

- [ ] **Step 4: Run them and watch them pass**
  Run: the same.
  Expected: PASS on SQLite and PostgreSQL; the rest of the package unchanged.

- [ ] **Step 5: Commit** `feat(data): people, their roles and their changes, in migration 0006-staff (HEL-48)`.

---

### Task 2: The studio's context, roles and the person's key

**Files:**
- Create: `packages/portal/studio/context.js`, `studio/roles.js`, `studio/session.js`
- Modify: `packages/portal/package.json` (`imports["#studio/*"]: "./studio/*.js"`)
- Test: `packages/portal/test/unit/studio-roles.test.js`, `test/unit/studio-session.test.js`

**Interfaces:**
- Consumes: Task 1's `recordSignIn`, `loadGrants`, `EVERY_SPEC`.
- Produces:
  - `#studio/context`: `instance`, frozen, with `attach( { db, store } )`, `detach()`, and getters `db` and `store`.
    The getters throw `Error` naming the cause when nothing is attached.
  - `#studio/roles`:
    - `SESSION_ROLE`, frozen: `{ reader: "studio:reader", editor: "studio:editor", approver: "studio:approver",
      admin: "studio:admin" }`.
    - `STAFF_ROLES`: the four, plus the framework's `"admin"`. `ADMIN_ROLES`: `[ "studio:admin", "admin" ]`.
    - `sessionRolesOf( grants ) → { roles: string[], editorSpecs: string[]|null }`. `editorSpecs` is `null` for an
      unlimited editor, the named specs for a limited one, and `[]` for someone who is not an editor.
    - `isStudioAdmin( roles ) → boolean`.
  - `#studio/session`:
    - `personKeyOf( user, authMethod ) → string`:
      - `openid-azure` gives `entra:<objectID>`;
      - `local` gives `local:<username>`, never the users file's own `userID`, which an entry may set to an `entra:` key;
      - an Entra user with no `objectID`, a local one with no `username`, or any other method, throws `Error`.
    - `augment( session, db, { admins, now = new Date() } ) → Promise<void>`: records the sign-in, with the name
      `user.name || user.username` and `configuredAdmin` from `authorization.isAdminIdentity( user, admins )`. It sets
      `session.studio = { key, editorSpecs }` and `session.user.roles` from the person's grants.
    - `refresh( session, db ) → Promise<void>`: reads the grants by `session.studio.key` and assigns
      `session.user.roles` and `session.studio.editorSpecs` only when they changed. express-session writes a session
      whose content changed, and writing on every request would be a store write per request.

- [ ] **Step 1: Write the failing tests:**
  - `keys an Entra sign-in by its object ID, whatever its subject`: two users with different `userID` and the same
    `objectID` give the same key, `entra:<oid>`.
  - `refuses an Entra sign-in that carries no object ID`
  - `keys a local sign-in by its username, so a users file cannot name an Entra person's key`: `local:<username>`.
  - `refuses a local sign-in that carries no username`
  - `refuses a sign-in method the studio does not use` (`openid-google`)
  - `turns grants into session roles and an editor's specs`. As a table:
    - no grant gives `{ roles: [], editorSpecs: [] }`;
    - an editor with `*` gives `editorSpecs: null`;
    - an editor with CL009 and CL011 gives `[ "CL009", "CL011" ]`;
    - a reader and an approver give `[ "studio:reader", "studio:approver" ]`.
  - `counts the configuration's admin as a studio admin`
  - `augment records the person and sets their roles; refresh follows a change of grants`, on
    `openDatabase( "sqlite::memory:" )` after `migrateSchema`.
  - `refresh leaves the roles untouched when nothing changed`: the same array instance stays.

- [ ] **Step 2: Run them and watch them fail**
  Run: `node --test test/unit/studio-roles.test.js test/unit/studio-session.test.js` in `packages/portal`.
  Expected: FAIL, `Cannot find module '#studio/roles'`.

- [ ] **Step 3: Implement** the three modules.

- [ ] **Step 4: Run them and watch them pass.**

- [ ] **Step 5: Commit** `feat(portal): the studio's roles, and a person keyed by the Entra object ID (HEL-48)`.

---

### Task 3: The studio in `PortalServer`

**Files:**
- Create: `packages/portal/studio/manager.js`: `class StudioManager extends TiWebAppManager`, `constructor()` calling
  `super( "studio" )`. Screens come in Tasks 4–6.
- Modify: `packages/portal/bin/portal-server.js`:
  - **Constructor:** `application: { classPath: path.relative( process.cwd(), STUDIO_MANAGER ), home: "/studio/" }`,
    where `STUDIO_MANAGER` is the path of `studio/manager.js`. A comment says why it is relative.
  - **`onStart`:** after `#open()`, `context.instance.attach( { db, store } )`. **`onStop`:** `detach()`.
  - **`defineUnprotectedRoutes`:** the exemption becomes `/^\/(?!(?:admin|app|studio|me)(?:\/|$)).*$/i`. Update the
    method's comment to say why each name is left out.
  - **`defineWebApplicationRoutes`:** keeps `/` and the pages' catch-all. It drops every `notFound` shadow, for
    `/not-found`, `/app`, `/app/*splat` (GET and POST), `/csrf-token` and `/logout`.
  - **`augmentSession( session, request )`** returns `studioSession.augment( session, context.instance.db,
    { admins: this.serviceConfig.auth.admins } )`, where `studioSession` is `require( "#studio/session" )`.
    **`refreshSession( session )`** returns `studioSession.refresh( session, context.instance.db )`.
- Modify: `packages/portal/test/support/memory-cache.js`. It grows the members the framework calls for sessions and
  for CA-587's "ended" mark, found by running the tests: the Proxy names each missing member. Keep it in-memory, with
  expiry measured against an injectable clock, as the ti-engine stand-in does.
- Modify: `packages/portal/test/support/server.js`. The environment gains `TI_WEB_AUTH_METHODS: "local"`,
  `TI_WEB_AUTH_LOCAL_USERS_PATH` (the file from `support/staff.js`), `TI_WEB_AUTH_ADMINS: "config-admin@example.test"`
  and a fixed test `TI_WEB_COOKIE_SECRET`.
- Create: `packages/portal/test/support/staff.js`, which exports:
  - `USERS`: synthetic `config-admin`, `admin`, `editor`, `editor-cl009`, `approver`, `reader` and `nobody`, each
    `{ username, email: "<username>@example.test", name, password }`;
  - `writeUsersFile( directory ) → string`, with each hash made by
    `node <web-framework>/bin/build/hash-password.js`, the password on stdin, since `#local-user-directory` is not
    exported;
  - `signIn( url, username ) → Promise<{ cookie: string, token: string }>`, the four-step sequence of
    `web-server.application-home.test.js`;
  - `grant( database, username, grants ) → Promise<void>`, which calls `setGrants` with `by: "test"`.
- Modify: `packages/portal/test/shell.test.js`. Its framework-route pins become what the routes answer now:
  - **Unchanged:** a malformed escape answers 404.
  - `/admin/config/editors` (any case) answers 303 to `/studio/` (was `/`), or 401 for JSON.
  - `/app/x` answers 303 to `/studio/` for HTML, or 401 for JSON.
  - `/not-found` is the pages' 404.
  - The cookie and 404 pins on `/csrf-token`, `/me` and `/login/*` move to the access test below.
- Modify: `test/unit/paths.test.js:133,155` and `test/unit/layout.test.js:83`, if they still assume `/app/x` is a page
  address. Keep what they test.
- Test: `packages/portal/test/studio-access.test.js` (new).

**Interfaces:**
- Consumes: Task 2's `augment`, `refresh`, `context.instance`.
- Produces: a signed-in session with `session.studio = { key, editorSpecs }` and `session.user.roles` drawn from the
  `studio:*` names, plus `"admin"` for the configuration's admin; and the `signIn` and `grant` helpers.

- [ ] **Step 1: Write the failing tests** in `studio-access.test.js`:
  - `serves the sign-in screen at /studio/ and /studio, to an anonymous visitor`: 200, HTML, with the sign-in form.
  - `refuses a staff address to an anonymous visitor, in any case`: for each of `/app/profile`, `/APP/profile`,
    `/app/about`, `/me`, `/ME` and `/Studio/not-found/x`, HTML gets 303 to `/studio/` and JSON gets 401.
  - `keeps every public page anonymous and cacheable with sign-in enabled`: `assertPublic` over the pages the
    accessibility test lists, plus a download and a feed. Then the same pages fetched with a signed-in cookie answer
    200 with the cookie and without `public`.
  - `records a person at first sign-in, with no role`: `nobody` signs in; `listPeople` holds them with no grant;
    `/me` shows `roles: []`.
  - `gives a role on the next request, and takes it away on the next`: `grant( reader )` makes `/me` show
    `studio:reader`; `grant( [] )` removes it, with no new sign-in.
  - `gives the configuration's admin the framework's admin role, and records them as from configuration`
  - `no public page names the studio`: none of the pages the accessibility test lists contains `/studio` or `/app/`.

  Rewrite the `shell.test.js` pins as listed above.

- [ ] **Step 2: Run them and watch them fail**
  Run: `npm test --workspace @health-dev-portal/portal`
  Expected: FAIL. `/studio/` is the pages' 404, `/app/profile` is the 404 page, and sign-in is refused.

- [ ] **Step 3: Implement** the server changes, the manager skeleton, the cache stand-in and the support module.

- [ ] **Step 4: Run every portal test and watch them pass**
  Expected: PASS, including the public-site suites, unchanged apart from the rewritten pins.

- [ ] **Step 5: Commit** `feat(portal): the studio at /studio/, its sign-in, and roles read on every request (HEL-48)`.

---

### Task 4: The shell, its texts and the landing screen

**Files:**
- Create: `packages/portal/public/index.html`, a copy of web-framework 1.63.1's `bin/static/index.html`, with
  `<script defer src="/static/scripts/studio.js" nonce='{ti-nonce-placeholder}'></script>` placed before Alpine's
  script. A comment names the framework version it was copied from.
- Create: `packages/portal/public/scripts/studio.js`, the Alpine components registered on `alpine:init`, as
  `ti-framework.js` registers its own; this task adds `tiStudioHome`.
- Create: `packages/portal/public/fragments/frame-dashboard.html`, the landing screen (`dashboard` is the framework's
  landing fragment). It shows the person's name and roles, or "You have no access yet; ask an administrator".
- Create: `packages/portal/public/fragments/components/component-sidebar.html`, the framework's sidebar with its
  navigation slot filled. People, Settings and Environment status appear only for an admin, by the `studio` block of
  `/app/config`.
- Create: `packages/portal/public/fragments/components/component-login-brand.html` ("НЗИС · студио" and
  "Health dev portal studio", with no link to the public site).
- Create: `packages/portal/studio/labels.json`, keys under `studio.*`, each `{ "bg": …, "en": … }`, and
  `studio/labels.js`, which calls `localization.addCatalogue( catalogue )`. `manager.js` requires it first.
- Modify: `packages/portal/studio/manager.js`:
  - `processDataRequest( session, view, options )` answers `studio-home` with
    `{ name, roles, editorSpecs, admin: boolean }`;
  - for `config` it adds `studio: { admin: isStudioAdmin( roles ) }` to `super`'s answer;
  - it delegates every other view to `super`.
- Test: `packages/portal/test/studio-shell.test.js` (new); `test/unit/studio-labels.test.js` (new).

**Interfaces:**
- Consumes: Task 3's server and helpers; `#studio/roles`.
- Produces: the `studio-home` view and the `studio` block of `/app/config`. Tasks 5 and 6 add their components to
  `studio.js`, their keys to `labels.json`, and their entries to the sidebar.

- [ ] **Step 1: Write the failing tests:**
  - `the shell page loads the studio's script before Alpine's`: in the HTML of `/studio/`, the index of `studio.js` is
    before the index of `alpinejs-csp.min.js`.
  - `the landing tells a person with no role that they have no access yet`: `nobody`'s `/app/studio-home` gives
    `roles: []` and `admin: false`.
  - `the config marks an admin, and only an admin`: `/app/config` gives `studio.admin` true for `admin` and
    `config-admin`, and false for `editor`.
  - `no studio fragment renders markup from data`: no file under `public/fragments` contains `x-html`.
  - `every studio label has Bulgarian and English`, in `studio-labels.test.js`.

- [ ] **Step 2: Run them and watch them fail.** Expected: `studio.js` missing; `studio-home` answers 404.

- [ ] **Step 3: Implement.** Use the framework's CSS primitives only; a new class needs a reason in a comment.

- [ ] **Step 4: Run them and watch them pass.** Then open `/studio/` in the Browser pane against a local portal,
  signed in as `nobody` and as `admin`, in both languages. Take a screenshot of each for the PR.

- [ ] **Step 5: Commit** `feat(portal): the studio's shell, texts and landing screen (HEL-48)`.

---

### Task 5: People

**Files:**
- Create: `packages/portal/studio/people.js`, `public/fragments/frame-people.html`
- Modify: `studio/manager.js`:
  - the constructor registers `addFragment( "people", { title: "People", path: "fragments/frame-people.html",
    roles: ADMIN_ROLES } )`;
  - the `people` view;
  - `processServiceRequest( session, service, params )` answers `people-grants` and delegates the rest to `super`.
- Modify: `public/scripts/studio.js` (`tiStudioPeople`), `studio/labels.json`, `component-sidebar.html` (People).
- Test: `packages/portal/test/studio-people.test.js` (new).

**Interfaces:**
- Consumes: Task 1's `listPeople`, `setGrants`, `grantChanges`, `listSpecs`; `#studio/roles`.
- Produces:
  - `peopleView( db ) → Promise<{ people, specs, changes }>`;
  - `changeGrants( db, session, { key, grants } ) → Promise<void>`. It is refused with `E_SEC_UNAUTHORIZED_ACCESS`
    (403) unless `isStudioAdmin( session.user.roles )`. A `RangeError` from `setGrants` is raised as a 422 that names
    the reason.

- [ ] **Step 1: Write the failing tests:**
  - `an admin lists people with their roles, specs and whether configuration made them admin`
  - `an admin limits an editor to CL009, and the change records who made it`
  - `everyone but an admin is refused, the screen and the service alike`, for `editor`, `approver`, `reader` and
    `nobody`: 403 on `/app/people` (JSON and HTML) and on `POST /app/people-grants`.
  - `a role taken away while the screen is open refuses the next save`: `admin` loads People, then `grant( admin, [] )`,
    then `admin`'s save gets 403.
  - `with every studio admin grant gone, the configuration's admin still gives the role back`
  - `a display name with markup comes back as text`: a person recorded with the name `<img src=x onerror=alert(1)>`
    is returned verbatim in JSON. With Task 4's `x-html` test, nothing renders it.
  - `refuses a grant the store refuses, and says why`: 422, with the message naming the reason.

- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.** The form has the four roles as checkboxes and, for an editor, "all specs" or a list of
  specs. Saving sends the whole new set.
- [ ] **Step 4: Run them and watch them pass;** check the screen in the Browser pane in both languages.
- [ ] **Step 5: Commit** `feat(portal): the People screen, where an admin gives roles (HEL-48)`.

---

### Task 6: Settings and environment status

**Files:**
- Create: `packages/portal/studio/settings.js`, `studio/environment.js`, `public/fragments/frame-settings.html`,
  `public/fragments/frame-environment-status.html`
- Modify: `studio/manager.js` (two fragments with `roles: ADMIN_ROLES`; the views `settings` and `environment-status`;
  the services `settings-save`, `status-set`, `maintenance-add` and `maintenance-cancel`), `public/scripts/studio.js`,
  `studio/labels.json`, `component-sidebar.html`
- Test: `packages/portal/test/studio-settings.test.js` (new), `test/unit/sofia-time.test.js` (new)

**Interfaces:**
- Consumes: `readSetting`, `writeSetting` (`@health-dev-portal/data/files`); `TWO_PEOPLE` from
  `@health-dev-portal/data/review`, which must be exported if it is not; and `setStatus`, `currentStatus`,
  `statusHistory`, `addMaintenance`, `cancelMaintenance`, `maintenanceWindows` and `statusEvents` from
  `@health-dev-portal/data/status`.
- Produces:
  - `settingsView( db ) → Promise<{ selfApproval: boolean }>`. A missing value, or `"off"`, means self-approval is
    allowed, as `review.js:121` reads it.
  - `saveSettings( db, { selfApproval } ) → Promise<void>`. It writes `"off"` when self-approval is allowed and `"on"`
    when it is not.
  - `environmentView( db, now ) → Promise<{ current, windows, events }>`.
  - `sofiaInstant( localDateTime ) → Date`, from `yyyy-mm-ddThh:mm` in Europe/Sofia. It throws `RangeError` for a time
    the clock skips in March, and for one it repeats in October. A bare local time is refused in `hdp-status` for the
    same reason.
  - The three status services pass the person's key as `by`. Each service is refused with 403 unless
    `isStudioAdmin`.

- [ ] **Step 1: Write the failing tests:**
  - `sofiaInstant`:
    - `2026-11-20T10:00` gives `2026-11-20T08:00:00Z`;
    - `2026-07-01T10:00` gives `07:00Z`;
    - `2026-03-29T03:30` throws, because the clock skips it;
    - `2026-10-25T03:30` throws, because the clock repeats it.
  - `an admin switches self-approval off and on`: `readSetting( db, TWO_PEOPLE )` is `"on"`, then `"off"`. The refusal
    itself is the data layer's, already tested in `review.test.js:164-166`.
  - `an admin sets an environment's status, and the update names them`: `updated_by` is the admin's key.
  - `a public page never shows who set a status`: the public status page, in both languages, contains neither the
    admin's key nor their name.
  - `an admin adds a maintenance window in Sofia time and cancels it`
  - `everyone but an admin is refused, the screens and the services alike`

- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.** Convert Sofia time with `Intl.DateTimeFormat`'s `timeZone` option, checking the
  round-trip, as core's time-zone module does; no new dependency.
- [ ] **Step 4: Run them and watch them pass;** check both screens in the Browser pane.
- [ ] **Step 5: Commit** `feat(portal): Settings and environment status in the studio (HEL-48)`.

---

### Task 6a: A refused start lets go, and no sign-in method means no studio

Added on 2026-11-19, after Task 3's review, with Boris's approval. Spec §3, "No sign-in method, no staff area".

**Files:**
- Modify: `packages/portal/bin/portal-server.js`:
  - `onStart` and `onStop`;
  - `isUnprotectedRoute`, a new override;
  - `defineWebApplicationRoutes`.
- Modify: `packages/portal/studio/manager.js` (`setEnabledAuthMethods`, `hasSignIn`).
- Modify: `packages/portal/test/start.test.js`, and `test/support/server.js` if `createPortal` must take a service
  configuration.
- Create: `packages/portal/test/studio-off.test.js`.

**Interfaces:**
- Consumes:
  - the framework's push of the effective methods into the manager, `setEnabledAuthMethods( methods )`. It comes after
    `AuthManager#initialize` has dropped any provider without a client ID, and before the server listens.
  - `TiWebServer#webAppManager`.
  - `isUnprotectedRoute( route )`, which the framework's protection calls with `request.url` before it refuses
    anything.
- Produces:
  - `StudioManager#hasSignIn → boolean`. It is `true` once the framework has pushed a list that is not empty, and
    `false` before any push, so the studio fails closed.
  - With no sign-in method in effect, every address whose first segment is `studio`, `app`, `admin`, `me`, `login`,
    `logout`, `csrf-token` or `language`, in any case, answers 404, sets no cookie and redirects nowhere:
    - a GET or HEAD is the pages' own 404 page;
    - any other method gets the framework's own answer, exactly as at an address that is none: 403 from its CSRF
      check without a token, and otherwise its JSON 404 (`E_WEB_INVALID_REQUEST_URI`). Each is compared with
      `/bg/nope`'s live answer.

    The public pages and `/health` are unchanged. With a method in effect, nothing changes. *(Revised after Task 6a's
    review: a bare 404 of the studio's own told an outsider which addresses were the studio's.)*
  - A NOTICE at start when the studio is off: `The studio is off: no sign-in method is in effect (TI_WEB_AUTH_METHODS).`

- [ ] **Step 1: Write the failing tests for a refused start** (`start.test.js`):
  - `a start refused after the database opened lets the database and the studio's context go, and rejects with its own
    error`. Hold a port with a `net` server on `127.0.0.1`, then start a portal on it (service configuration
    `{ port }`). Assert three things:
    - the start rejects with the listen error (`EADDRINUSE`);
    - `context.instance.db` throws, because the context is detached;
    - the database was closed.

    Windows' file lock shows an open database only on Windows, as EPERM when the copy is removed, and this test must
    also fail on Linux CI without the fix. So observe the close directly: wrap the real `openDatabase` with node:test's
    `mock.method` before the portal's module is first required in the file, or use a better observable you measure.
  - `a stop whose framework stop fails still lets the database and the context go, and rejects with that failure`:
    after a good start, make `TiWebServer.prototype.onStop` reject once (`mock.method`), then stop the server for real.
- [ ] **Step 2: Write the failing tests for the studio switched off** (`studio-off.test.js`). Use a file of its own,
  started with no sign-in method. First measure how the methods reach the framework: from the environment at
  construction (`TI_WEB_AUTH_METHODS=""` through `createPortal`), or from the service configuration's `auth.methods`.
  Use whichever works.
  - `with no sign-in method, every studio address is the pages' 404, with no cookie and no redirect`. Send GETs as a
    browser sends them (HTML, no redirect followed):
    - `/studio/`, `/studio`, `/STUDIO/` and `/studio/not-found`;
    - `/app`, `/app/enter`, `/app/config`, `/app/dashboard` and `/APP/profile`;
    - `/me`, `/login/local`, `/csrf-token`, `/language/bg` and `/admin/config/editors`;
    - `/me#x`, through `rawStatus`.

    Each one answers 404 with no `Set-Cookie` and no `Location`, and its body is the pages' 404 page.
  - `with no sign-in method, any other method at a studio address answers as at an address that is none`: `OPTIONS`
    to `/studio/`, `/app/feedback` and `/logout`, which the CSRF check never applies to, and a `POST` to
    `/app/feedback`, `/login/local` and `/logout` with a session left in the store and its CSRF token. Each answer —
    status, `Location`, content type, `Cache-Control`, cookie names and exception code — equals `/bg/nope`'s live
    answer to the same request: the framework's JSON 404, `E_WEB_INVALID_REQUEST_URI`.
  - `with no sign-in method, a POST or PUT with no session is refused as at an address that is none`: the CSRF check
    answers 403 before any route, at a studio address as at `/bg/nope`.
  - `with no sign-in method, the public pages and /health are unchanged`: `assertPublic` on `/bg/` and `/en/`, and
    `/health` answering 200.
  - `a listed method the framework drops leaves the studio off too`: `openid-azure` with no client ID, then
    `/studio/` answers 404. Use a process of its own if the methods are read once per process.
  - The NOTICE: pin it if the logger can be observed without a seam added to production code. Otherwise, say so in
    the report.
- [ ] **Step 3: Run them and watch them fail.**
- [ ] **Step 4: Implement.**
  - `onStart`: when `super.onStart()` rejects, detach the context and close the database, then reject with the start's
    own error. A failure while closing is logged and never takes the start error's place.
  - `onStop`: the portal's cleanup runs in `finally`. The database is let go even when `super.onStop()` rejects, and
    that rejection still reaches the caller.
  - `StudioManager.setEnabledAuthMethods( methods )`: call `super`, set `hasSignIn`, and log the NOTICE when it is
    `false`.
  - `PortalServer.isUnprotectedRoute( route )`: `true` for a studio address while `!this.webAppManager.hasSignIn`,
    otherwise `super`'s answer. The path is read up to `?`, as `super` reads it, and the match ignores case. Without
    this, the framework's protection answers an anonymous `/app/profile` or `/me` with a 303 to `/studio/`, which names
    the address the studio is meant not to have. Opening these paths is safe here because nobody can sign in, and the
    route below answers every one of them with 404.
  - `defineWebApplicationRoutes`: first, before `/` and the framework's routes, add
    `registerRoute( "all", <the studio address pattern>, … )`. It calls `next()` while sign-in is on. Otherwise a GET
    or HEAD goes to the pages handler (the catch-all's own instance), and any other method is passed the error the
    framework's catch-all raises, `E_WEB_INVALID_REQUEST_URI` with 404, for its error handler to answer. The pattern is
    tested against the routed path, so `/me#x` is caught as `/me`.
- [ ] **Step 5: Run them and watch them pass,** then run the whole portal suite. Check `/studio/` in the Browser pane
  with sign-in off (the controller does this, ruling R2).
- [ ] **Step 6: Commit** `fix(portal): a refused start lets the database and the studio's context go (HEL-48)`, then
  `feat(portal): with no sign-in method, the studio does not exist (HEL-48)`.

---

### Task 7: The access table, accessibility, the record, and the framework card

**Files:**
- Modify: `packages/portal/test/studio-access.test.js`, which gains the table.
- Modify: `packages/portal/test/a11y.test.js`, which checks the staff screens signed in.
- Modify: `docs/superpowers/specs/2026-10-14-portal-foundation-design.md`: §8.5 (the shell at `/studio/`, the copied
  `index.html`), §10.1 (the roles as built, the session role names, the narrowed exemption) and §10.2 (the person
  keyed by the Entra object ID; the stored fields)
- Modify: `packages/portal/.env.example`, which documents `TI_WEB_AUTH_METHODS`, the `TI_AZURE_AUTH_*` variables,
  `TI_WEB_AUTH_ADMINS` and `TI_WEB_COOKIE_SECRET`, each with a placeholder value. It says that an empty
  `TI_WEB_AUTH_METHODS` switches the studio off (Task 6a).
- Modify: `packages/portal/README.md`, a section on the studio: its address, sign-in, the first admin, and roles

- [ ] **Step 1: Write the access table:** one test over every 9a view and service × `anonymous`, `nobody`, `reader`,
  `editor`, `approver`, `admin` and `config-admin`. Each cell expects 200 or the refusal (303/401 for anonymous,
  403 otherwise), checked over HTTP.
- [ ] **Step 2: Extend the accessibility check:** sign in as `admin`, and run axe over `/studio/`, `/app/people`,
  `/app/settings` and `/app/environment-status`, full-page, in both languages. Run it over the landing as `nobody` too.
- [ ] **Step 3: Run the whole definition of done:** `npm ci`, `npm run fixtures:fetch`, `npm run lint`, and
  `npm test` with `HDP_TEST_POSTGRES_URL`. Expected: 0 lint errors, every test passing. Quote the numbers.
- [ ] **Step 4: Update the record, `.env.example` and the README.** Then file the CA card in ti-engine: "web-framework:
  an application adds its own scripts to the shell page without copying `index.html`". It names this plan's copy as
  the cost, under CA-11, and its ID goes in the PR body.
- [ ] **Step 5: Commit** `test(portal): every 9a screen and service refused to every role that may not use it (HEL-48)`
  and `docs(design): the record follows the studio as built (HEL-48)`.

---

## Deliberately not in this plan

- **The editor's round (9b) and the approver's round (9c).** The queue, as the landing screen, arrives in 9c. Until
  then the landing names the person and their roles.
- **Entra in the tests.** The framework tests its OpenID flow against a stand-in provider. The portal tests its keying
  through `augment` with a user that carries an object ID (Task 2), and signs in locally.
- **Showing a person's history across their actions.** The actor columns already hold the key; 9c shows display
  names on the release screen.
- **Retention of staff records.** That waits for the DPO (§8).
- **A framework hook for application scripts.** It goes on the CA card (Task 7), not into this plan.
