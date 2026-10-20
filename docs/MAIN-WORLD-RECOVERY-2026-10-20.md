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
- Schema inspection confirms the absence of
  `ppw_promotion_standings` (migration 0076),
  `ppw_show_resolutions.appearance_person_ids` (0077),
  `ppw_promotions.parent_promotion_id` and
  `ppw_wrestler_promotion_affiliations` (0080).
- The current roster cannot pass `playtest:preflight`. Do not launch
  the two-player test or use the World Lock against this state.

## Recovery contract

1. Keep Git development and database on their respective `main` branches.
   The old one-week save is disposable; that is not permission to touch
   the original PPW database.
2. Migrations missing from the existing database must be identified
   individually and applied **in ascending order** with the official
   repository scripts; do not replay all 80 unconditionally on a partially
   migrated schema. Never treat a missing table as an empty gameplay table.
3. Export a fresh, authentic World from the **original repository's main
   branch**, using `npm run playtest:export-original`. The exporter reads
   source only and never connects to the original database.
4. For complete Genesis, use `npm run playtest:genesis` only after a
   controlled reset of the **rebuild** World. Its import is atomic and
   intentionally refuses to overwrite a pre-existing World. Do not
   synthesize wrestlers, generic finishers, teams or roster affiliations.
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
Recovery of the current persistent World requires access to a trusted
operator runtime and explicit validation of the target database/World,
without leaking a DSN, invitation code or secret into source or logs.
