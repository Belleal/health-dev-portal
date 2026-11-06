# @health-dev-portal/portal

The portal's public website (plan 8a; design record §8): every published specification version by stage, each message
element by element, the code lists, the errors and the changes, in Bulgarian at `/bg/` and English at `/en/`.

- **One server**, `PortalServer` (`bin/portal-server.js`), a ti-engine `TiWebServer` with no web application manager
  until plan 9 brings the staff area.
- **Server-rendered pages**, readable without JavaScript, built with web-content's escaping `html` template. One
  stylesheet and one small deferred script, each by its content hash; nothing inline.
- **No cookie on any response**, so every page can be cached (design record §10.1).
- **The data** is read through `@health-dev-portal/data/published`, which decides what is public, with one more read
  that a controller ruling allows: `resolveVersion` from `@health-dev-portal/data/resolution`, used only for a module
  version already found public, to say which code-list versions it reads.

## Running it

It needs a database, a file store and a Redis.

1. **Build the seed.** The tests' seed is a good database to look at: the public production set, plus the lifecycle of
   plan 8a's decision 13 (e-Prescription 1.5.2 in testing, CL007 1.5.34 in production). Then copy it, so the running
   server does not hold the file the next test run rebuilds:

   ```bash
   npm run fixtures:fetch
   npm test --workspace packages/portal      # its pretest builds .fixtures/portal/
   cp -r .fixtures/portal .fixtures/portal-dev
   ```

   To build the seed without running the suite, run the script `pretest` runs, from the repository's root:

   ```bash
   node packages/portal/test/support/build-seed.js
   ```

   `.env.example` already points a local run at the copy: `HDP_DATABASE_URL` is `sqlite:../../.fixtures/portal-dev/seed.sqlite`
   and `HDP_FILES_DIR` is `../../.fixtures/portal-dev/files`, both relative to `packages/portal`.

2. **Start a Redis.** The framework's cache needs one to start, even though an anonymous visit never writes to it:

   ```bash
   docker run -d --rm --name hdp-redis -p 6379:6379 redis:8-alpine
   ```

   Measured (plan 8a, task 3): without a Redis, `npm start` never listens — core's Redis client retries the connection
   with a growing back-off (46 `ECONNREFUSED` in 40 s) and the start never completes. With one (`redis:7-alpine` on
   another port, measured), it listens within about 2 s, answers `/` and `/bg/…`, and the cache still holds no key
   after anonymous requests. The portal needs no Redis module.

3. **Configure it.** Copy `.env.example` to `.env` in this folder; every variable is explained there. `HDP_DATABASE_URL`
   and `TI_WEB_PUBLIC_URL` are required: without either the server refuses to start. The environment, in short:

   | Variable | Meaning |
   |---|---|
   | `TI_INSTANCE_CLASS` | The class core's start-instance constructs: `bin/portal-server.js`. |
   | `HDP_DATABASE_URL` | Where every page is read from (required): `sqlite:<path>` or `postgres://user@host:5432/database`. A URL with a password belongs in the deployment's secret store, never in a file. |
   | `HDP_FILES_DIR` | The file store, by content hash. Default: `.files` under `packages/portal`. |
   | `TI_WEB_PUBLIC_URL` | The public origin every absolute link is written from (required): canonical addresses, `hreflang`, feeds. |
   | `TI_WEB_USE_TLS`, `TI_WEB_HOST`, `TI_WEB_PORT` | Plain HTTP on `127.0.0.1:3000` here; in a deployment TLS ends in front of the container. |
   | `TI_WEB_AUTH_METHODS` | Empty: no sign-in method until plan 9 brings the staff area. |
   | `TI_MESSAGE_EXCHANGE_ENABLED`, `TI_SERVICE_HEALTH_CHECK_ENABLED`, `TI_WEB_JOBS_TRIGGER` | `false`, `false`, `off`: one instance, no mesh, no heartbeat, no scheduled jobs. |
   | `TI_MEMORY_CACHE_REDIS_HOST`, `TI_MEMORY_CACHE_REDIS_PORT` | The framework's cache; without a Redis the start never completes (step 2). |
   | `TI_LOCALIZATION_TIME_ZONE` | `Europe/Sofia`: a day is a calendar day there (design record §7.12). |

   The shell's environment beats the file: core never overrides a variable that is already set, so a stale `export`
   silently wins.

4. **Start it**, and open <http://localhost:3000/>:

   ```bash
   npm start --workspace packages/portal
   ```

## Testing

```bash
npm test --workspace packages/portal
```

- **The seed.** `pretest` builds `.fixtures/portal/` (git-ignored) from the public fixtures, through the data layer's
  own migration and lifecycle functions: about 6 s, once per run. Without the fixtures it says so and the HTTP tests
  skip; in CI it fails, since a skipped test looks exactly like a passing one.
- **One server per test file**, in the test's process, on a copy of the seed (`test/support/server.js`): core allows
  one service instance per process, and `node --test` runs each file in its own.
- **No Redis.** The tests replace core's exported `cache.instance` with a stand-in written for the portal
  (`test/support/memory-cache.js`). Measured, the server asks it for nothing but `initialize` when it starts,
  `shutDown` when it stops and `isOperational` on `/health`; anything else throws, naming itself.
- **SQLite only.** The data layer is the one tested on both databases.

### Accessibility

`test/a11y.test.js` opens every kind of page in real Chromium, in both languages where it has two, and runs axe against
WCAG 2.1 A and AA (design record §8.5, EN 301 549). No rule is switched off and no element excluded: a violation is fixed
in the page or the stylesheet. Install the browser once, then run the file alone or with the rest:

```bash
npx playwright install chromium
node --test packages/portal/test/a11y.test.js
```

Without Chromium the test skips with a note; in CI (`CI` set and not `false`) it fails, as a missing seed does. CI
installs it with `npx playwright install --with-deps chromium`. The file takes about a minute.

## Fonts

Sofia Sans (400, 600, 700) and Sofia Sans Extra Condensed (700), Cyrillic and Latin, are copied from the pinned
`@fontsource` packages, with their OFL-1.1 licences, into `public/fonts/sofia-sans-5.3.0/`, and committed:

```bash
npm run fonts --workspace packages/portal
```

The framework serves everything under `/static/fonts/` as `immutable` (its `staticCache.immutablePaths` default,
`/fonts/`, is matched against the path under the static folder — measured), so a file there must never change: a new
version of the fonts goes into a new directory.

## Caching

| Response | `Cache-Control` |
|---|---|
| A page at a fixed address (`…/1.5.1/…`), and a retired one's 410 | `public, max-age=86400` |
| Home, indexes, stage pages, errors, changes, comparison, feeds, 404, redirects | `public, max-age=60` |
| A fixed download | `public, max-age=31536000, immutable` |
| The stylesheet and the script at their hashed address, the fonts | `public, max-age=31536000, immutable` |
| A failure (500) | `no-store` |
