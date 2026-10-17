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
   project. Apply the repository's numbered migrations 0001–0068 to that new
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
