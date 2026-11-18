# Ozmozr

A social feed reader: subscribe to RSS and Atom feeds, tag feeds, entries and
friends, save links, share them with friends and groups, and let groups vote
and talk about what is worth reading.

This is a TypeScript rebuild of the 2006 Rails application of the same name
(originally "OsmoseRSS", from the Center for Open and Sustainable Learning at
Utah State University). The original source lives one directory up and is
reference material only.

## What is here

| Path | What it is |
|---|---|
| `src/app/` | Next.js (App Router) pages, route handlers and server actions |
| `src/domain/` | All data logic, as plain functions that take a Kysely handle |
| `src/lib/` | Tag parsing, safe fetching, sanitising, storage, sessions |
| `src/worker/` | The background process that harvests feeds |
| `db/migrations/` | Schema migrations (register new ones in `index.ts`) |
| `e2e/` | Playwright browser tests |

## Run it locally

You need Node 24 and PostgreSQL 16 or newer. Either use your own Postgres or
start one with `docker compose up -d`.

```bash
cp .env.example .env        # then set BETTER_AUTH_SECRET to a long random string
createdb ozmozr_dev && createdb ozmozr_test && createdb ozmozr_e2e
npm install
npm run db:migrate
npm run dev                 # the web app, http://localhost:3000
npm run worker              # in a second terminal: fetches feeds every minute
```

A feed you add is fetched once straight away. After that the worker refreshes
it hourly; without the worker running, feeds never update.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string for the app and worker |
| `DATABASE_URL_TEST` | Database for unit tests (default `postgres://localhost:5432/ozmozr_test`) |
| `DATABASE_URL_E2E` | Database for browser tests; it is wiped on every run and its name must contain `e2e` |
| `BETTER_AUTH_SECRET` | Secret used to sign sessions. Required. |
| `BETTER_AUTH_URL` | Public origin of the site, e.g. `https://ozmozr.example`. Used in RSS output and the bookmarklet. |
| `UPLOAD_DIR` | Where avatar and group pictures are stored (default `./uploads`) |
| `OZMOZR_ALLOW_PRIVATE_FETCH` | `1` lets the app fetch private addresses. Ignored in production; for tests only. |
| `OZMOZR_RATE_LIMITS` | `off` disables rate limits. Ignored in production; for tests only. |

## Tests

```bash
npm test            # unit and database tests (Vitest, real Postgres)
npm run e2e         # browser tests (Playwright; starts its own dev server on port 3100)
npm run typecheck
npm run lint
```

Database tests run each test in a transaction that is rolled back, so the test
database stays empty.

## Deploy

`Dockerfile` builds one image that runs the web app by default, or the worker
with `npm run worker`. `docker-compose.prod.yml` wires up Postgres, a one-shot
migration, the web app and the worker:

```bash
export POSTGRES_PASSWORD=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://your.domain
docker compose -f docker-compose.prod.yml up -d --build
```

Put a TLS-terminating reverse proxy in front of port 3000 and have it set
`X-Forwarded-For`; sign-up rate limiting uses that header. Pictures are stored
on the `uploads` volume, so run a single web instance or share that volume.

## Safety notes for maintainers

- Every address a person supplies is fetched through `src/lib/safe-fetch.ts`,
  which refuses private and local network addresses and caps size and time.
  Do not call `fetch` on user-supplied addresses directly.
- HTML from feeds is sanitised once, when it is stored (`src/lib/sanitize.ts`).
  Pages render stored HTML as-is, so never write unsanitised HTML to
  `entries.content_html`.
- Scripts are restricted by a per-request nonce set in `src/proxy.ts`.
- Per-person and per-address rate limits live in `src/lib/rate-limit.ts`.
