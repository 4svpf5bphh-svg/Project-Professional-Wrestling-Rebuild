# PPW Rebuild — authenticated iPhone PWA host

This host replaces the original Alpha's server-configured single player with
**two or more independently authenticated managers** sharing one existing PPW
World. It does not bootstrap Worlds, migrate an environment, create a cron or
alter the old PPW Neon project.

## Recovery status — 20 October 2026

The existing rebuild Neon **main** World is `world-20261017`, not an
alpha save. Migrations 0070–0080 have now been applied in order to the
existing rebuild database; inspection confirms the required roster and
standing tables exist. Genuine wrestler personas, tag-team identities,
original standings and parent-company roster affiliations are **still
absent** until a separate recovery run.

The tested non-destructive recovery is `npm run playtest:reconcile-main`.
It rejects any mismatched World seed, wrestler names and IDs, promotion
IDs, or partially recovered identities. Its one-transaction writes retain
all player ownership, existing booking drafts and World clock. It has
passed the authentic original-main Genesis CI restoration test, including
two-player booking and Week resolution.

The manually gated GitHub Actions workflow
[`reconcile-rebuild-main.yml`](../.github/workflows/reconcile-rebuild-main.yml)
is scoped only to rebuild `main`, project `orange-flower-99606272`,
World `world-20261017` and its verified UK Neon endpoint.
It requires the protected repository secret
`PPW_REBUILD_MAIN_DATABASE_URL` pointing to the rebuild Neon **main**
database, and manual exact World/project confirmations. It will export
the genuine original repository **main** Genesis from source, reconcile
the one existing World and run read-only preflight. Never paste database
credentials into workflow inputs or commit them to GitHub.

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
- `vercel.json`: **automatic main Git deployment remains disabled pending reviewed, authorised release**. No crons
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

## Single main development World — fail-closed hosted database approval

Use **rebuild Git `main` and rebuild Neon `main` only** for the active
playtest. The existing disposable one-week World is `world-20261017` in
`neondb`; its Genesis and ownership should be verified before inviting
another player. No `alpha-1a` World, alternative main/alpha state, or new
long-lived test branch is necessary.

Before any Vercel release of the reviewed `main` commit, set protected
server-side settings `PPW_MAIN_WORLD_APPROVED=YES`, `PPW_MAIN_WORLD_ID`,
`PPW_MAIN_DB_HOST`, and `PPW_MAIN_DB_NAME`. The last three must **exactly**
match `PPW_WORLD_ID` and the PostgreSQL `DATABASE_URL` for the rebuild
Neon **main** branch. The host refuses `main` in preview **or production**
unless all four match; unrelated deployment branches cannot use these
approvals. This avoids confusing two live World timelines without silently
allowing a production deployment to use the original project's credentials.

No Git commit here permits automatic deployment: `vercel.json` continues
to disable Git deployments of `main` until the host configuration, rate
limiting, private invitations, and intended release are verified and approved.
There are no World Lock crons. CI uses its own disposable PostgreSQL.

## One hosted main World, with fail-closed credentials

Only rebuild Git `main` may run the hosted game, in Vercel preview or
production. The host rejects all old alpha branches before creating a
database pool. `PPW_MAIN_WORLD_APPROVED=YES`, `PPW_MAIN_WORLD_ID`,
`PPW_MAIN_DB_HOST` and `PPW_MAIN_DB_NAME` must match the actual
`PPW_WORLD_ID` and `DATABASE_URL` exactly.

**Main code is not automatically deployed.** Deployment remains disabled
in `vercel.json` until the authentic World passes preflight, private
invitations and production edge protections are ready, and the intended
release is explicitly approved. No cron is enabled.

## Genuine original-main Genesis — first import or existing-World recovery

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
