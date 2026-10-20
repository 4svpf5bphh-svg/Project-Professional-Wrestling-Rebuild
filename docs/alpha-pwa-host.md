# PPW Rebuild — authenticated iPhone PWA host

This host replaces the original Alpha's server-configured single player with
**two or more independently authenticated managers** sharing one existing PPW
World. It does not bootstrap Worlds, migrate an environment, create a cron or
alter the old PPW Neon project.

## What is implemented

- `apps/web/`: phone-first installable standalone PWA, World Home, login,
  existing-World join and promotion claim. The existing typed UI mounts
  Planner/Card Editor, Roster/Market, Contracts, Backstage, Results, Business,
  Staff and Industry.
- `api/*.ts`: Vercel Node functions backed by `handlePpwHostApi`. Sign-in and
  cookies are server owned, independent of client-provided actor IDs.
- `src/web/invite-session.ts`: signed seven-day HttpOnly/Secure/SameSite=Lax
  sessions, per-session CSRF token and timing-safe invite-code checking.
- `src/web/card-http.ts`: verifies same-origin, CSRF, active authentication and
  request-size limits before calling the real authoritatively owned World API.
- `vercel.json`: **main Git deployment deliberately disabled**. No crons
  configured. Building in CI is not permission to publish.
- Tests: session forging/expiry, browser transport, two distinct players on one
  real PostgreSQL World, independent control, private business records and
  existing broad gameplay integration.

## Release prerequisites — do not perform without explicit approval

1. Choose the **new isolated rebuild Neon database**, not the original PPW
   project. Apply the repository's numbered migrations 0001–0080 to that new
   database through an explicit migration workflow, not from a player request.
   No host code automatically creates a World. `PPW_WORLD_ID` must refer to an
   existing, migrated World in that database.
2. Generate **independent high-entropy random access codes** (at least
   128 bits), one for each invited player. Convert each to its SHA-256 hex
   digest locally using an offline trusted tool. Only the *digest* goes in
   the environment; private codes are shared directly with their respective
   players outside source control. Use stable, distinct World player IDs.
3. Configure protected runtime environment variables in the target project:
   `DATABASE_URL` (new, isolated Neon connection only),
   `PPW_WORLD_ID` (existing World), `PPW_SESSION_SECRET` (independent, random
   secret of at least 32 characters), `PPW_PLAYER_ACCESS_HASHES` (a JSON
   object mapping each player ID to their SHA-256 hex access-code digest).
   No real credentials belong in GitHub, tests or the PWA bundle.
4. Add an edge/WAF rate limit for sign-in and mutating game routes. The
   function's in-memory request ceiling is defence in depth only; different
   serverless instances do not share counters. Configure secure HTTPS domain,
   session telemetry and trusted backups before live users.
5. Explicitly authorize and stage a preview from the reviewed commit, then
   exercise the World claim flow on **two iPhones**, book separate shows,
   check player-private records, and verify server restart/session recovery.
   Measure **actual Neon network transfer** and CPU using the full playtest.
   Existing query-budget tests measure SQL counts/returned payload, not
   transport overhead or a month of real Neon compute.
6. **Do not enable the World Lock cron** during routine testing. Test it
   exactly once only after user approval, and disable it again. The
   `vercel.json` release guard must be changed only on a separately authorized
   deployment.

## Isolated iPhone preview branch — fail-closed database approval

The Vercel host refuses to start **any** `VERCEL_ENV=preview` instance
unless its deployment branch, World and PostgreSQL host/database all match
an explicitly approved, independent preview environment. This check runs
*before* creating a database pool and causes a generic 503 on mismatch.

Configure the following **on the exact new preview branch**, never by
copying a production or older test-branch connection:

- `VERCEL_GIT_COMMIT_REF`: supplied by Vercel Git integration; the branch
  must begin `alpha/playtest-` and must never be `main`.
- `PPW_PREVIEW_ISOLATED=YES` and `PPW_PREVIEW_GIT_BRANCH`: the exact branch.
- `PPW_PREVIEW_DB_HOST` and `PPW_PREVIEW_DB_NAME`: independently confirmed
  hostname and database name of the **new isolated** preview database.
- `PPW_PREVIEW_WORLD_ID`: exact immutable World imported and verified by
  `npm run playtest:preflight`.
- Existing authenticated host secrets: `DATABASE_URL`, `PPW_WORLD_ID`,
  `PPW_SESSION_SECRET`, `PPW_PLAYER_ACCESS_HASHES`, with the World ID
  and database URL matching those approved above.

These are **environment names only**. Do not paste credentials or invite
codes into source, GitHub Actions logs or this document. A ready static
Vercel build does **not** mean a player is authorised to use a World;
the isolated runtime guard and invite authentication must both succeed.
Normal production and disposable CI execution remain unchanged.

## Isolated playtest World preparation (not yet authorised)

The preview has two explicit safeguards: the starting World must be built from
a *fresh, actual original-main Genesis export*, not the synthetic 643-person
test fixture, and the active promotion list must allow two different managers
to claim separate companies. The original real promotions may be deliberately
locked against takeover; the preflight refuses to treat a World with no
player-eligible companies as playable. Do not bypass that by changing the
original's protected promotion contracts.

The rebuild can now produce that offline source from the **original PPW main**
without opening the original database or altering the original project. With
a separate clean clone of
`4svpf5bphh-svg/Project-Professional-Wrestling` checked out to `main` and
its Node dependencies installed, run this from the **rebuild** checkout:

```sh
npm run playtest:export-original -- \
  --original-root /path/to/Project-Professional-Wrestling \
  --seed 20261019 \
  --out /path/to/new-ppw-genesis.json
```

The exporter verifies the exact original repository remote, checks the active
branch is `main` (not `alpha-1a`), requires no tracked local modifications,
then invokes the original's genuine `createAlphaWorldAggregate` factory.
It takes only fresh original-main population, wrestler identities, contract
terms, territories, standings and 13 promotion profiles. The eight protected
real-world promotions stay protected; the original five fictional entry
promotions remain eligible. The 643 wrestlers and original portable gimmick IDs
are preserved without a fabricated roster. The export is an exclusive-create,
owner-readable JSON file; **no database connection is used**. Keep it outside
source control, and use the printed `worldId` for the following commands.

After migrations on an **authorised isolated database**, a trusted operator can
validate and import an offline source through `npm run playtest:genesis`.
It requires `PPW_PLAYTEST_DB_URL`, `PPW_PLAYTEST_WORLD_ID`,
`PPW_GENESIS_IMPORT_AUTHORIZED=YES`, and explicit `--world`,
`--source`, `--confirm-world`, `--confirm-host`. The import is atomic,
rejects non-Genesis game data, and never overwrites an existing World.
No original database connection or export API is involved. A compatible
original-main fresh Genesis source still needs to be supplied; the tooling
does not fabricate a roster or silently initialise the live World.

The operator then runs `npm run playtest:preflight -- --world <id>` with
`PPW_PLAYTEST_DB_URL`. This is read-only and reports compact population
counts and reasons the World is not yet previewable. The release gate expects
**13 promotions (eight protected real-world, five original fictional-entry),
643 wrestlers, a substantial women\u0027s division, at least ten real tag teams,
championships, and one authentic Genesis import receipt**. A synthetic 643-person
test fixture must never pass the playable-preview release gate.

A full manual week can **only be run after separate explicit approval** via
`npm run playtest:week -- --world <id> --resolve --confirm-world <id>
--confirm-host <isolated-host>`, with `PPW_PLAYTEST_DB_URL`,
`PPW_PLAYTEST_WORLD_ID` and `PPW_ONE_SHOT_AUTHORIZED=YES` set. It does not
bypass the single World deadline, start a cron, or choose human booking
outcomes. Do not run this on production or on the original PPW project.

## Local and CI verification

```text
npm install
npm run typecheck
npm run web:build
npm test
npm run test:postgres   # disposable PostgreSQL with all migrations
```

The web entry point is `apps/web/index.html`; the built static output is
`dist/web`. The `api` functions require a host that supports standard
Node.js Request/Response and route them to the shared host adapter.
Running `vite` by itself only starts a static front-end development server,
**not** the secure game API. For a realistic local session, run through
the host's Node-compatible API adapter with a **disposable World** and use
`PPW_ALLOW_LOCAL_HTTP=1` in nonproduction only.

## Limitations, deliberately not bypassed

The host requires a verified invite code: no guest actor, fake in-browser
player ID, privileged dev token or automatic World initialization. Payment
details and wrestler/Backstage data are never part of the login response.
Session logout clears the browser's cookie; long-lived stateless tokens are
not individually revoked server-side until their seven-day expiry. If
immediate revocation becomes a hard launch requirement, add a durable,
**bounded**, authoritative revocation mechanism rather than accepting an
unverified token or a World-wide session lookup on every screen.
