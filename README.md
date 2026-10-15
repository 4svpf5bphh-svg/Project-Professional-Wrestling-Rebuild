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
5. PPW year is 52 weeks; career time is separate; a real day is one PPW week; a single weekly deadline and one asynchronous World Lock are canonical.
6. Each feature must identify dependencies in and out, simulation versus presentation, and the smallest complete first version.
7. Preserve recovery and replay paths. No deletion of original resources without explicit approval.
8. Target Neon transfer below 5 GB/month, preferably 2.5 GB/month for two players; validate with measured network usage and workload tests.

## First implementation gate
Document and inventory old domain types and invariants, then build the new schema, deterministic fixtures and tests for World creation, player/promotion control, contracts, booking, and lock/resolution. Bring over gameplay in verified slices, not a blind source copy.

The old repository remains an archival reference, not a deployment dependency.

## One World Lock (approved 15 October 2026)
- One deadline per 24-hour PPW week, seven days a week; the authoritative timestamp is a UTC-compatible PostgreSQL timestamptz, not device time.
- Talent/venue arrangements, negotiated commitments and show cards close together at that one deadline. Show conflicts need deterministic, fair server arbitration, never an online-first advantage.
- Booking mutations must atomically require BOTH phase OPEN and next_lock_at > now(). A late scheduler must not extend the player deadline.
- OPEN → LOCKED → RESOLVING are internal processing phases of ONE lock, not three player deadlines.
- World reopening, result publication and next-lock scheduling are only permitted after all shows are committed. Scheduler and conflict rules are not yet complete and must not be deployed prematurely.

## World advancement guard
The server-only `advanceResolvedWorldWeek` operation requires all active promotions' submitted cards to have resolution receipts AND an explicit week certification from the future conflict/AI/staff resolver. This ensures the rebuild cannot silently skip another promotion, publish unresolved conflicts or award extra booking time when jobs run late. Certification production, fair conflict arbitration, staff fallbacks and automated scheduling are still unimplemented; the new operation is not connected to a production scheduler.

## Current collision-inspection slice
`inspectWeekConflicts` is a server-only, transaction-bound inspection of current-week submitted shows. It checks missing shows, show day/venue details and exact same-day wrestler/venue collisions, while permitting non-exclusive talent to work different days. It returns provisional blockers, not permission to finalize the World. Full conflict resolution, real venue catalog checks and service-capacity validation are still pending.

## World resource eligibility slice
Current-week inspection also verifies each scheduled venue exists in the World registry, each wrestler is active, and the attached promotion-specific contract covers the week and has remaining dates (including exclusive rights). A wrestler can be booked on multiple **different** PPW days subject to their configured weekly service capacity; no contested booking is automatically awarded based on submission order. Historical workload rules and full financial/creative permissions are not yet integrated.

## New pre-resolution clearance
`clearWorldWeekResources` is a trusted-only atomic World command. It refuses to clear a week with any missing show, venue/talent collision, invalid contract or weekly capacity conflict; contested bookings never win simply because their show's date charging ran first. A durable week clearance must exist before `consumeShowAppearances` can charge dates or before advancement can complete. Full arbitration, staff-run show fallback, immutable post-lock persistence and certification of remaining simulation consequences are not yet complete.
