# Rebuild main: one-world recovery checkpoint — 20 October 2026

The active development Git branch is **rebuild `main`**. The active database
branch is **rebuild Neon `main`**, project `orange-flower-99606272`,
branch `br-wispy-block-zagss9wk`, database `neondb`. No `alpha-1a`
reference and no second persistent alpha branch or World is required.

## Observed state (read-only)

- World `world-20261017`, Year 1 / Week 1, open, one claimed promotion.
- 643 wrestlers, 13 promotions, 478 signed contracts, 60 venues,
  20 markets, 26 active titles, four unclaimed takeover-eligible companies.
- **Zero** active teams and **zero** wrestler-owned personas. The Genesis
  receipt alone is NOT evidence of a complete import.
- Migrations **0070–0080 were subsequently applied** to this exact rebuild Neon
  main database, including all missing standings and affiliation relations.
  The schema is now ready for authentic content reconciliation.
- The current World **still cannot pass** `playtest:preflight` until its
  643 original personas, seeded tag teams, original standings and parent-company
  rosters are reconciled. Do not launch the two-player test or World Lock yet.

## Recovery contract

1. Keep Git development and database on their respective `main` branches.
   The old one-week save is disposable; that is not permission to touch
   the original PPW database.
2. Schema recovery has been completed through migration 0080. Do not replay
   these non-idempotent DDL statements; validate tables read-only.
3. Export a fresh, authentic World from the **original repository's main
   branch**, using `npm run playtest:export-original`. The exporter reads
   source only and never connects to the original database.
4. The **preferred path is additive reconciliation of the existing World**:
   run `npm run playtest:reconcile-main` with the verified original-main export,
   exact World and host and `PPW_GENESIS_RECONCILE_AUTHORIZED=YES`.
   This restores only missing original identities in a single transaction,
   preserving existing ownership, bookings and World clock. An official
   manually gated GitHub Actions workflow `reconcile-rebuild-main.yml` is
   committed; it requires the protected repo secret
   `PPW_REBUILD_MAIN_DATABASE_URL` and exact World/project confirmations.
   If input identities differ, it fails without modifying the database.
   Do not fabricate the missing content or trigger destructive resets.
5. Check `npm run playtest:preflight`: exactly one authentic Genesis
   receipt, 643 personas, >=10 original tag teams, >=2 viable original
   NXT/ROH affiliate rosters, two available/controlled human promotions,
   and all other readiness requirements. Two independently authenticated
   managers must then complete a real browser booking journey.
6. Before a public Vercel build, verify **server-side** invite hashes,
   session secret, main World ID and database identity. Explicit main
   host settings are required by `requireIsolatedPreviewHost`.
   Automatic Git deployment of `main` and all World Lock cron jobs remain
   disabled unless separately released.
7. Capture Neon consumption **before and after** a bounded two-player
   week; never extrapolate a free plan claim from cumulative usage.

A GitHub Actions job's disposable PostgreSQL is **not** rebuild Neon main.
Never connect a generic CI job to the rebuild's persistent Neon credentials.
Authentic main-World recovery was tested against **disposable PostgreSQL**
using the actual original-main exporter, followed by the two-player and World
resolution journey (CI #39411202180 passed). The persistent rebuild main World
still requires the protected recovery database secret and a manual workflow run.
Never leak a DSN, invitation code or session secret into source or logs.
