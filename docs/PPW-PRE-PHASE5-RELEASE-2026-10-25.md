# PPW pre-Phase-5 production release — 25 October 2026

## Included

- Playtest feedback Stages A–B: iPhone match graphics, tag-team and Backstage touch controls, contract-date responses, Results reading hierarchy, smark Ringside and human Road Agent reports.
- Phase 3: authenticated evidence-backed wrestler memories and Backstage follow-through.
- Phase 4: career-derived reputations, eight-department Staff Meetings, promotion-local wrestler rankings, retired performer succession with paid contracts.
- Master roadmap and playtest feedback roadmap.

## Excluded

- Phase 5 title hierarchy and earned prestige, including migration 0095.
- Paused mass portraits, new World clock, automatic weekly lock, live reset or advancement.

## Schema runbook

- Existing Production schema is through migration 0092. Preserve backup branch before release and rehearse exact migrations 0093 and 0094 on a fork.
- Apply 0093 then 0094 atomically; verify memory and alumni tables, new request fields and canonical World/player counts.
- Merge full release to main once schema and CI are green. Verify exact Vercel production commit and READY state.
- Preserve authentic World, saved booking, contracts, title holders, completed shows and player claims.

## CI and release verification

- Phase 4 head 5a0e990d6b6964d8e2965c120e3f3a79eff87bdb passed 114 iPhone browser tests, 570 unit passes and 112 PostgreSQL tests.
- Require successful checks on the exact composite release SHA before main.
- Do not manually advance the World as a release smoke test.
