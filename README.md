# Project Professional Wrestling — Rebuild

This repository is the clean-room rebuild of Project Professional Wrestling (PPW), a persistent multiplayer wrestling management game.

## Source of truth and preservation
- Historical implementation and feature reference: [original PPW repository](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling).
- Frozen references: `archive/pre-rebuild-main-20261015` and `archive/pre-rebuild-alpha-1a-20261015` in the original repository.
- Original production Neon project: `holy-bar-13925911` (do not modify, migrate or reset).
- Pre-rebuild database snapshot: `snap-broad-cloud-zaw50rjd`.
- New isolated Neon project: `orange-flower-99606272` (`ppw-rebuild-2026`).
- No production deployment or migration until parity, deterministic simulation, concurrency and recovery gates pass.

## Rebuild contract
1. Multiplayer-first, server-authoritative World; real-time access offers choices, never simulation advantage.
2. Preserve all agreed mechanics, wrestler identities, promotions, roster, contracts, segments, calendar, World Lock, outcomes, relationships, backstage, UI decisions and roadmap.
3. Do not copy the old monolithic World JSON persistence as the primary architecture. Design relational authoritative state, bounded transactions, efficient player-scoped reads, versioned projections and immutable historical ledgers.
4. Player scripts match and segment outcomes. Simulation determines consequences, not whether a scripted outcome happens.
5. PPW year is 52 weeks; career time is separate; a real day is one PPW week; asynchronous World Lock is canonical.
6. Each feature must identify dependencies in and out, simulation versus presentation, and the smallest complete first version.
7. Preserve recovery and replay paths. No deletion of original resources without explicit approval.
8. Target Neon transfer below 5 GB/month, preferably 2.5 GB/month for two players; validate with measured network usage and workload tests.

## First implementation gate
Document and inventory old domain types and invariants, then build the new schema, deterministic fixtures and tests for World creation, player/promotion control, contracts, booking, and lock/resolution. Bring over gameplay in verified slices, not a blind source copy.

The old repository remains an archival reference, not a deployment dependency.
