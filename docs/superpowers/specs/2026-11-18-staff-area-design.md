# The staff area — design (plan 9)

- **Date:** 2026-11-18
- **Status:** approved by Boris, 2026-11-19. Planned as 9a (the foundation), 9b (the editor's round) and 9c (the
  approver's round).
- **Tracking:** HEL-48
- **Builds on:** the design record [`2026-10-14-portal-foundation-design.md`](2026-10-14-portal-foundation-design.md):
  - §3.1, one application;
  - §7, the lifecycle;
  - §8.5, the staff area uses the framework's application shell;
  - §10.1–§10.3, security, privacy and caching.

  Where this document and the record disagree, the record wins until this design is approved. Then the record is
  updated to match in the same pull request as the code.
- **Needs:** `@ti-engine/web-framework` 1.63.1 (HEL-49), for the three seams below.

**Settled since the first draft (2026-11-19).** The builder's check found three gaps in web-framework. Boris had them
fixed in ti-engine first, and they shipped in 1.63.0 and 1.63.1:

| Gap | Framework change | Where it is used here |
|---|---|---|
| The shell was fixed at `/`, which is the public site's | `application.home` (CA-584) | §3: the staff area lives at `/studio/` |
| The per-request role refresh could not read the database | asynchronous `refreshSession` and `augmentSession` (CA-585) | §5.1, §5.2 |
| An Entra sign-in gave no ID that is the same in every app registration | `objectID` and `tenantID` on the session user (CA-586) | §5.1: a person is keyed by `objectID` |

Also settled:
- a limited editor acts only on a release whose every spec is theirs (§5.2, my call);
- a code list is uploaded as a single-list file, and the whole nomenclatures workbook is a migration input only (§6.3,
  Boris);
- the area is reached by its own address, with no link from the public site (§3);
- a sign-out is final, even against a request still in flight (CA-587, §3);
- with no sign-in method in effect, the staff area does not exist (§3, Boris, 2026-11-19).

## 1. Intent

Plans 5 and 6 built the whole lifecycle into the data layer:
- loading a workbook into a development version;
- submitting a release, with its changelog corrected;
- review rounds, and approval or return with comments;
- promotion through testing to production;
- abandonment, the planned date, and the expiry of previous production.

None of it can be used except from code: a workbook can be loaded with `hdp-migrate`, but nothing can be submitted,
reviewed or promoted.

Plan 9 lets Boris and his team run the whole round in the browser, from a workbook to production. They are the first
users: Information Services staff in its Entra tenant. The drug agency's representative, who will maintain CL009,
comes later, once the DPO has answered (§10.2, §15). Plan 9 builds what that person needs, an editor limited to named
specs, but onboarding them is not part of it.

Until plan 10 brings the editing screens, a change is still authored in a workbook. Plan 9 is the round around it:
- the workbook is uploaded;
- the changelog the portal writes is corrected;
- the release is submitted, reviewed, approved and promoted.

## 2. Goals, non-goals, anti-goals

**Goals**
- Sign-in with Entra ID. Signing in grants nothing: an admin gives each person a role.
- The four roles of §10.1: reader, editor (optionally limited to named specs), approver, admin. A person may hold
  several.
- **The editor's round:**
  - upload a workbook into a spec's development version;
  - see its anomalies;
  - correct its changelog;
  - submit one or more versions as a release;
  - see what was returned, with the comments, and submit again;
  - withdraw a version from a release;
  - resolve the conflicts that approved changes cause (§7.8).
- **The approver's round:**
  - the queue of releases awaiting review;
  - a release's versions, each with its changelog and its differences from its base;
  - approve, or return with comments;
  - promote one or several releases, to testing (with the notice period) or to production (with previous
    production's expiry);
  - move the planned date, abandon a release, retire previous production.
- **The admin's work:**
  - people and their roles;
  - the self-approval setting (§7.4);
  - the environment status form, which replaces `hdp-status` (plan 8c).
- **The reader's view:** releases, development and implementation versions, changelogs and review history, read-only.

**Non-goals**
- **Editing elements, conditions, entries or rules in the browser.** That is plan 10, with its own design session.
  This also leaves out:
  - fixes of a version in testing (§7.1);
  - changes to a version in implementation (§7.4).

  Both are authored by editing, and a workbook loads only into development. `createFix` and pending-change rounds
  wait for plan 10.
- **Comments on a single element, condition, entry or rule.** They need plan 10's screens to sit on. Plan 9 takes
  comments on the release as a whole and on each changelog entry; the data layer already holds both (`target` null,
  or `changelog:<id>`).
- **Browsing a development version's whole tree.** Plan 9 shows what changed. The full tree view is plan 10's editor.
- E-mail notices (§7.4 says they come later), onboarding the drug agency's guest, deployment (plan 12).

**Anti-goals** (each would make plan 9 a failure even if every screen works)
- **A public page that sets a cookie for an anonymous visitor**, or loses its shared caching.
- **Staff-only content reaching anything public:** a page, a feed, a download, a fixed file or the search index. Today
  `published.js` decides what is public; it stays the only way public pages read.
- **Anyone admitted by signing in alone,** or a role that survives being taken away.
- **An action allowed because its button was hidden.** Every action checks the role and the spec limit on the
  server.
- **An approver deciding on content other than what was submitted.** Under review, the versions are read-only (§7.4);
  the screen shows the content the round froze.

## 3. Constraints

- **One application** (§3.1). The staff area runs in the same `PortalServer` as the public site. It gains a web
  application manager (`TiWebAppManager`), configured through `serviceConfig.application` (`classPath`).
- **Its own address: `/studio/`** (`application.home`, web-framework 1.63.0) *(design call: the record calls the staff
  side "the studio")*.
  - The shell, which is also the sign-in screen, is served at `/studio/`. Every answer that sends the browser home goes
    there: a sign-in, a sign-out, a refused sign-in (`/studio/?error=`), and an unknown staff screen (`/studio/not-found`).
  - `/` stays the public site's redirect to `/bg/`. The screens stay at `/app/*`, as the framework routes them.
  - **No link from the public site** (Boris): staff reach the area by its address. A public page never names it.
  - The framework refuses to start on a home under one of its own routes, or on an OpenID callback's path. `/studio/`
    is neither, with the callback at `/login/azure-callback`.
- **The public exemption narrows.** Today `PortalServer.defineUnprotectedRoutes` exempts every path but `/admin` from
  the session check. With a staff area, that would leave `/app/*` and `/studio/` open. The exemption must leave out
  `/app`, `/studio` and `/admin`, in any case. The framework's own list still admits the sign-in screen's routes
  (`/studio/`, `/app`, `/app/enter`, `/app/config`, `/login/:method`). A test pins that an anonymous request for each
  staff screen is refused, and that every public page still answers anonymously.
- **The framework's application shell** (§8.5): HTML fragments, HTMX, Alpine in its CSP build, the framework's CSS
  primitives, and its user menu and language switch. Staff pages are not server-rendered like the public site's.
- **Entra ID only, in production:** `openid-azure`, the tenant-pinned discovery URL, and
  `TI_AZURE_AUTH_ALLOWED_DOMAINS` (§10.1). Development and the tests use the framework's local sign-in, with
  synthetic users.
- **No sign-in method, no staff area** *(Boris, 2026-11-19)*. A deployment may run the public site before IT has
  registered the application with Entra, with `TI_WEB_AUTH_METHODS` empty. With no sign-in method in effect (none
  listed, or each listed one dropped by the framework as unconfigured), the staff area behaves as if it did not exist:
  - for every address under `/studio`, `/app`, `/admin`, `/me`, `/login`, `/logout`, `/csrf-token` and `/language`, in
    any case, a GET is the pages' 404 page;
  - any other method gets the framework's own answer for an address that is none: a 403 from its CSRF check when the
    request carries no token, and its JSON 404 otherwise;
  - every answer is the same as for `/bg/nope`, with no cookie and no redirect. Two framework answers still name the
    home and are not covered: the redirect an htmx error answer carries (CA-593), and the refusal of a request target
    in absolute form (CA-592);
  - the studio's own static files stay served under `/static`, which is outside the list;
  - the public pages and `/health` are unchanged;
  - the portal logs a notice at start that the studio is off.

  Rejected:
  - refusing to start, which would take the public site down with the studio;
  - the framework's sign-in screen with no method on it, a dead end that shows the staff address to anyone who finds
    it.
- **The routes the portal shadows today come back:** `PortalServer.defineWebApplicationRoutes` answers `/not-found`,
  `/app`, `/app/*splat`, `/csrf-token` and `/logout` with the pages' 404, because nothing behind them existed. Plan 9
  hands `/app`, `/csrf-token` and `/logout` back to the framework. `/not-found` needs no shadow any more: with the home
  at `/studio/`, the framework serves its not-found page at `/studio/not-found`, and `/not-found` is the pages' 404 like
  any unknown address.
  - **What must stay true:** an anonymous visit to any public page still sets no cookie and keeps its `Cache-Control`,
    with sign-in enabled.
  - **What may change:** a signed-in staff member's own public page views may carry their session cookie. The
    framework then drops `public` from those responses.
- **Sessions** need the framework's cache:
  - Redis in the data centre, the state service on Cloudflare (§3.2);
  - in the tests, the portal's stand-in (`test/support/memory-cache.js`), which today answers only three members and
    must grow to hold sessions. Since 1.63.0 that includes `setValue` and `getValue`, which the session store uses
    for its "ended" mark.
- **A sign-out is final** (CA-587, web-framework 1.63.1). A request still in flight when a person signs out cannot
  write their session back. The framework leaves one narrow window open, and only with more than one process. The
  portal runs one process per deployment (§3.1), so it has none.
- **Staff responses are never cached** (`no-store`, §10.3).
- **Personal data:** a staff member's identity is stored for staff only and never shown on a public page (§10.2). See
  §8.
- **Two languages and accessibility:** Bulgarian and English labels, with the framework's language choice at sign-in;
  WCAG 2.1 AA (§8.5). The studio starts in Bulgarian, as the public site's `/` goes to `/bg/` *(design call, plan
  9a)*.
- **The SQL subset of §3.2** for every new table, and every data-layer test on SQLite and PostgreSQL.
- **Uploads are hostile** (§10.1): size and decompression limits, a parse timeout, and formulas never evaluated. The
  importer has no limits today, so plan 9 adds them where an upload is read.
- **No new dependency** unless the plan names it and why.
- **The framework knows nothing of the portal.** A gap in web-framework goes to a CA card in ti-engine.

## 4. Approaches

- **Chosen: the framework's application shell, in the same server.** The design record decided it (§3.1, §8.5). The
  framework already provides everything the staff area needs:
  - Entra sign-in, with the allowed domains;
  - sessions, CSRF and the role gate on each screen;
  - the per-request role refresh;
  - notifications, the busy indicator and the language switch.
- **Rejected: a separate staff application.** It would mean a second deployment, a second session store and a second
  sign-in, for a handful of users. §3.1 chose one process.
- **Rejected: staff pages in the public site's server-rendered style.** Forms, CSRF, sessions and role checks would be
  rebuilt by hand, beside a framework that has them.
- **Rejected: commands only.** The team is technical and could run them. But correcting a changelog and reading a
  release's differences are reading tasks, and a terminal does them badly.

## 5. Sign-in, people and roles

### 5.1 Who a person is

- **The key is the Entra object ID** (`oid`), which web-framework 1.63.0 puts on the session user as `objectID`
  (CA-586), as §10.2 names it.
  - **Why not the framework's user ID?** That is `oauth2:` + the subject (`sub`), and Entra makes `sub` pairwise: the
    same person has a different one in each app registration. The development database is carried over to the data
    centre at launch, history included (§7.11), under another registration, so a `sub` key would turn every person into
    a stranger there. The object ID is the same in every registration of the tenant.
  - **One tenant.** Sign-in uses the tenant-pinned discovery URL (§10.1), so every person, the drug agency's guest
    included, has an object ID in Information Services' tenant. `tenantID` is not part of the key *(design call)*.
  - **An Entra sign-in that carries no object ID is refused** *(design call)*: it cannot be keyed for good.
  - **The local sign-in** used in development and the tests has no object ID. There the key is `local:` and the
    user's `username`, never the framework's user ID: a users-file entry may set its own `userID`, and one written
    `entra:<oid>` would take that Entra person's grants. A local sign-in with no username is refused, as an unkeyable
    Entra one is. Production enables Entra only (§3).
- **The first sign-in creates the person's record, with no role.** `augmentSession` does it before the session is
  written; since web-framework 1.63.0 it may await the database (CA-585). The record holds:
  - the key;
  - the display name, as `name`, else `username`;
  - when they were first and last seen.

  No e-mail is kept: nothing in plan 9 writes to anyone.
- **The display name is refreshed at each sign-in.** That way the history shows a person's current name, not the one
  they had when they acted.

### 5.2 Roles

| Role | May |
|---|---|
| **reader** | See the queue, releases, development and implementation versions, changelogs and review history |
| **editor** | Upload a workbook, correct a changelog, submit, resubmit, withdraw a version, resolve conflicts, and see what that needs. Limited to named specs, if set |
| **approver** | What a reader may; approve, return with comments, promote, set the planned date, abandon, retire previous production |
| **admin** | People and roles, settings, environment status |

- **A limited editor acts only on a release whose every spec is theirs** *(design call)*.
  - A release that also holds another person's spec is not theirs to submit, withdraw from or resubmit. The release
    is reviewed and promoted as one, so acting on it decides for specs they were not given.
  - They see only those releases and their own specs' development versions.
  - **Seeing more takes the reader or the approver role,** since an approver may do what a reader may (the table
    above). An editor limited to CL009 who also holds either sees every release read-only, and still acts as an editor
    only where every spec is theirs. An unlimited editor acts on any release. *(clarified 2026-11-20, CodeRabbit on
    #10)*
- **Roles are stored in the portal's database,** one row per person, role and, for a limited editor, spec. An admin
  changes them on the People screen.
- **They are read again on every request,** through web-framework's `refreshSession`, which since 1.63.0 may await
  the database (CA-585). A role taken away is gone on the next request; a role given works without signing in again.
  - The read is one indexed query by the person's key, since it runs on every signed-in request.
  - A read that fails drops the person's portal roles for that request (the framework fails closed). The
    configuration's admin keeps the framework's `admin` role, so broken data stays repairable.
- **The first admin comes from configuration:** the framework's allowlist (`TI_WEB_AUTH_ADMINS`), which grants the
  framework's `admin` role. The portal reads that role as its own admin, so a fresh deployment has someone who can
  give roles.
  - An allowlisted admin is marked "from configuration" on the People screen, and the screen cannot remove that.
  - Removing them from the allowlist takes effect on the next request, as the framework already ensures.
- **A signed-in person with no role** sees one screen: their name, "You have no access yet; ask an administrator",
  and sign-out.
- **Self-approval** (§7.4) is a setting, **allowed by default**. When it is switched off, an approver cannot approve
  a round they submitted, and the refusal names the reason. The data layer already enforces it: `approveRelease`
  reads the setting `review.two-people`. Plan 9 adds only the screen that switches it.

### 5.3 Who did what

- **Every lifecycle call already takes an actor.** Plan 9 passes the person's key (§5.1):
  - `release_events.actor`;
  - a round's `submittedBy` and `decidedBy`;
  - a comment's `author`;
  - `edit_log`;
  - a status update's `updated_by`.
- **Staff screens show the display name,** looked up when the screen is drawn.
- **Public pages and feeds never show an actor.** That is true today, and plan 9 adds a test for it.

## 6. Screens

All screens live in the framework's shell: a sidebar, a topbar with the screen's title, the user menu (sign-out) and
the language switch. Each screen declares the roles that may open it. The server checks each action again, whatever
the screen showed.

```text
Sidebar (what a person sees depends on their roles)
  Опашка / Queue                 every role
  Издания / Releases             every role
  Качване / Upload a workbook    editor
  Хора / People                  admin
  Настройки / Settings           admin
  Състояние на средите / Environment status   admin
```

### 6.1 Queue (the home screen)

What needs this person, newest first, in sections that show only for their roles:

```text
Опашка                                                        Борис К. ▾
─────────────────────────────────────────────────────────────────────────
За преглед (approver)                                           3
  Е-рецепта 1.6.0 + CL009 1.5.40   подадено от М. П., 17.11 14:20   2 предупреждения
  CL011 1.5.41                      подадено от М. П., 16.11 09:02
Върнати към мен (editor)                                        1
  Е-направление 2.1.0              върнато от Б. К., 17.11 16:40   3 коментара
Одобрени, чакат тестване (approver)                             1
  Е-имунизация 1.0.9               одобрено 15.11
В тестване, планирани за продукция (approver)                   2
  Е-рецепта 1.5.2                  планирано 05.12.2026
Моите версии в разработка (editor)
  Е-рецепта (разработка, качено 17.11)
```

- **Each line opens the release, or the version.**
- **An editor limited to named specs** sees only releases whose every spec is theirs, and their own specs'
  development versions, unless they also hold reader or approver (§5.2). *(clarified 2026-11-20, CodeRabbit on #10)*

### 6.2 A release

```text
Издание · Е-рецепта 1.6.0 + CL009 1.5.40                    [за преглед]
Резюме (bg / en)
Версии
  Е-рецепта   разработка → 1.6.0 при одобрение   база 1.5.1   предупреждения: 2
  CL009       разработка → 1.5.40                база 1.5.39
▸ Е-рецепта: промени (14)       breaking 2 · non-breaking 12 · dropped 1
    [breaking] P001 contents/prescription/lrn   max 40 → 36      "Обяснение…" (bg / en)
    [comment on this entry]
    …
  Разлики спрямо базата (the structural comparison, as /changes/…/compare draws it)
▸ CL009: промени (3) …
История
  Кръг 1 · подадено от М. П. 17.11 14:20 · върнато от Б. К. 17.11 16:40
    Коментар (към изданието): …
    Коментар (към промяна P001 …/lrn): …
  Кръг 2 · подадено от М. П. 18.11 10:05 · за преглед
Действия (by role and status)
  [Одобри]  [Върни с коментари]  [Изоставяне]                  approver, under review
  [Повиши към тестване…] [Повиши към продукция…] [Планирана дата…]   approver, by stage
  [Оттегли версия] [Подай отново]                               editor, returned
```

- **Each version's changelog** shows every entry:
  - its category, target, and before and after values;
  - its explanation in both languages, marking a missing translation;
  - whether the portal detected it or the editor wrote it;
  - when dropped, the entry stays visible, marked dropped (§7.5).
- **The differences from the base** reuse the structural comparison the public Changes section draws.
  - A version in development or implementation is drawn only behind sign-in.
  - Nothing from it is ever written to a public file or index.
- **Under review,** the screen shows the content and changelog the open round froze, not anything newer.
- **Returning** asks for at least one comment, on the release or on a changelog entry.
- **Anomalies** are shown per version:
  - blocking ones stop submission (§7.4);
  - warnings go to the approver.

### 6.3 Upload a workbook, then submit

```text
Качване на работна книга (editor)
  Спецификация   [Е-рецепта ▾]        (a limited editor sees only their specs)
  Файл           [e-prescription.xlsx]   до 20 MB   (a code list: CL009.csv, or a one-sheet .xlsx)
  [Качи в разработка]
→ Е-рецепта · разработка
  Аномалии: блокиращи 0 · предупреждения 2  (listed)
  Промени (14): category ▾ · explanation bg · explanation en · [отпадане] … [+ добави промяна]
  [Запази]
→ Подаване (editor)
  Версии в разработка: [x] Е-рецепта  [x] CL009  [ ] CL011
  Резюме bg / en
  [Подай за преглед]
```

- **What can be uploaded,** by the spec's kind (§7.11):
  - **a module or the rules:** that spec's workbook. This route closes when plan 10's editing screens ship (§7.11).
  - **a code list:** a file of that one list, as CSV or as a workbook with one sheet in the template's layout (§4.6).
    This route stays for good, so the drug agency can apply a register update in one step.
  - **The whole nomenclatures workbook is not uploadable** (Boris). It is a migration input only, for `hdp-migrate`,
    since one file would replace every list at once.
- **The upload goes into the spec's development version.** If there is none, it starts one; if there is, it loads
  over it (`startDevelopment`, `loadIntoDevelopment`). It is recorded like an edit, by its actor. For a code list the
  differences become edits, and the changelog follows (§7.11).
- **A version under review cannot be loaded over.** The data layer refuses it, and the screen says why.
- **The changelog screen** works on the development version's changelog, as the data layer keeps it (`editChangelogEntry`,
  `dropChangelogEntry`, `restoreChangelogEntry`, `addChangelogEntry`):
  - change a category;
  - write each explanation in both languages;
  - drop a detected entry, which stays, marked;
  - add an entry.

  Saving keeps the corrections; submitting freezes them into the round.
- **Submitting** is one or more development versions together, with a summary in both languages (`submitRelease`).
- **Resubmitting a returned release** is a new round of it (`submitRound`), after the editor has uploaded again and
  corrected the changelog.

### 6.4 Promote

A dialog from a release, or from the queue's section of releases ready to move:

- **To testing:**
  - choose one or more approved releases, which move together (§7.3);
  - set the notice period in days;
  - the screen shows the planned production date it gives.
- **To production:**
  - choose one or more releases in testing;
  - for each production version they replace, set whether it stays as previous production and until which date
    (§7.6).
- **Before confirming,** the screen lists every version and the stage it goes to.
- **A refusal** shows the data layer's reasons, each naming the version and the rule (§7.3).
- **The other actions:**
  - **Planned date:** moving it records the change (`setPlannedDate`).
  - **Abandon:** confirms, then retires the release's versions (`abandonRelease`).
  - **Retire previous production:** offered once its date has passed (`retirePreviousProduction`).

### 6.5 Conflicts

When an approved change carried into a development version conflicts with the editor's own (§7.8):
- the release goes back to its editor, as §7.4 says;
- the version shows its conflicts, one per item, with the base, upstream and current values side by side;
- the editor keeps one of them (`listConflicts`, `resolveConflict`).

### 6.6 People (admin)

```text
Хора                                                     [+ няма покана: хората се появяват при първо влизане]
  Име            Роли                              Последно   
  Борис К.       admin (от конфигурацията)         18.11       
  Мария П.       editor · approver                 17.11      [Промени]
  Иван С.        editor: само CL009, CL011         —          [Промени]
  Нов човек      — няма роля —                     18.11      [Дай роля]
```

- **People appear when they first sign in.** There are no invitations; the guest account waits for the DPO (§1).
- **Changing roles** is a small form:
  - the four roles as checkboxes;
  - for an editor, "all specs" or a list of specs.
- **Every change is recorded,** with who made it and when.

### 6.7 Settings and environment status (admin)

- **Settings:** self-approval, allowed or not.
- **Environment status:**
  - each environment's state and message in both languages;
  - adding a maintenance window, with times in Sofia time, and cancelling one;
  - the recent updates.

  It writes through `packages/data/store/status.js`, with the person's key (§5.3) as `by`. `hdp-status` stays for
  scripts.

## 7. Data

- **New tables,** in migration `0006-staff`:
  - the people;
  - their roles, with the spec limits;
  - a log of role changes: who, what, when.

  The self-approval setting is already in the `settings` table, as `review.two-people`.
- **Reading non-public versions is the staff area's own module,** never `published.js`, which stays the only path
  public pages use. The lifecycle functions plan 9 calls already exist; any reading function it lacks is added beside
  them:
  - a spec's development version and its anomalies;
  - the releases in a status.
- **The actor in every call** is the person's key (§5.3).

## 8. Privacy

- **Stored per staff member:**
  - their Entra object ID (§5.1), an opaque identifier;
  - a display name;
  - when they were first and last seen;
  - their roles;
  - who changed those roles, and when.
- **Recorded against their actions,** as plans 5 and 6 already do: every edit, round, decision, comment, promotion
  and status change.
- **None of it reaches a public page, feed, file or the search index.**
- **For the DPO, before anyone signs in for real:** the record's retention, and the drug agency's representative, who
  is a person from another organisation (§10.2, §15). Development and the tests use synthetic users only.

## 9. Testing

- **Sign-in in the tests** is the framework's local sign-in, with a users file built in code. Each role signs in as
  its own synthetic person. An OpenID flow against a stand-in provider is the framework's to test, not the portal's;
  the portal's keying by object ID is tested through its `augmentSession` with a session user that carries one.
- **Every action is refused for every role that may not take it,** and for a limited editor on a release that holds
  a spec not theirs. The test is one table, checked over HTTP: the server's check, not the screen's.
- **The staff area is closed to an anonymous visitor:** every `/app/*` screen and action is refused without a
  session, while `/studio/` serves the sign-in screen. Every public page still answers anonymously (§3).
- **A person is keyed by the object ID:** a stand-in sign-in that carries `objectID` creates one record, and a second
  sign-in with another subject but the same object ID finds the same person. A sign-in without one is refused.
- **Public pages stay as they are,** with sign-in enabled:
  - an anonymous visit sets no cookie and keeps its `Cache-Control`;
  - a page never names an actor.
- **The data layer's new tables and functions** are tested on SQLite and PostgreSQL.
- **Accessibility:** axe in Chromium over every staff screen, signed in, in both languages.
- **Uploads:**
  - a file over the size limit is refused;
  - an archive over the decompression limit is refused;
  - a workbook that takes too long is refused;
  - nothing is written for any of them.

## 10. Left to the builder

- The URL of each screen under `/app`, and its fragment and component names.
- Layout within the shell's primitives, and the labels' exact wording in both languages.
- **The upload limits' values.** The nomenclatures workbook is about 5 MB and a module's far smaller (measured in
  §5.7). Start at 20 MB on disk and a decompressed size a few times that, and measure before settling.
- Page sizes, sorting within a queue section, and how much of a long changelog shows before "more".
- How the test cache stand-in grows to hold sessions: the members the framework is measured to call, as it does now.
