# @health-dev-portal/portal

The portal's public website (plan 8a; design record §8): every published specification version by stage, each message
element by element, the code lists, the errors and the changes, in Bulgarian at `/bg/` and English at `/en/`.

- **One server**, `PortalServer` (`bin/portal-server.js`), a ti-engine `TiWebServer` with no web application manager
  until plan 9 brings the staff area.
- **Server-rendered pages**, readable without JavaScript, built with web-content's escaping `html` template. One
  stylesheet and one small deferred script, each by its content hash; nothing inline.
- **No cookie on any response**, so every page can be cached (design record §10.1).
- **The data** is read through `@health-dev-portal/data/published` alone, which decides what is public.

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

2. **Start a Redis.** The framework's cache needs one to start, even though an anonymous visit never writes to it:

   ```bash
   docker run -d --rm --name hdp-redis -p 6379:6379 redis:8-alpine
   ```

   Measured (plan 8a, task 3): without a Redis, `npm start` never listens — core's Redis client retries the connection
   with a growing back-off (46 `ECONNREFUSED` in 40 s) and the start never completes. With one (`redis:7-alpine` on
   another port, measured), it listens within about 2 s, answers `/` and `/bg/…`, and the cache still holds no key
   after anonymous requests. The portal needs no Redis module.

3. **Configure it.** Copy `.env.example` to `.env` in this folder; every variable is explained there. `HDP_DATABASE_URL`
   and `TI_WEB_PUBLIC_URL` are required: without either the server refuses to start.

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
