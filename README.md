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

## Deterministic provisional resource arbitration
A pure server-side planner ranks competing venue-day and wrestler-day/weekly-capacity bookings from World seed, PPW week and promotion identity. It does not reward early submissions, and does not silently change scripted finishes. `previewWorldWeekArbitration` reuses bounded World Lock inspection reads. The resulting outcomes remain **proposals only**, not definitive allocation or permission to charge dates; durable decision receipts, staff/AI alternatives and actual conflict remediation remain to be implemented.

## Recorded provisional arbitration (not enforced allocation)
`recordWorldWeekArbitration` persists a small World-week proposal before resource clearance, using revision/idempotency protections and a fingerprint of all inspected evidence. `readRecordedWeekArbitration` returns CURRENT/STALE/NONE and never changes shows. Only server resolution may call these functions. Resolution alternatives, staff/AI decisions and binding resources remain future work.

## Staff/AI booking alternatives (preview only)
The trusted `previewWorldWeekRemediations` operation rechecks the persisted arbitration result and offers an available venue on the same show day, or a free PPW day for the unchanged show. A weekly wrestler capacity problem instead requires an explicit creative booking decision. No alternative is automatically executed; human authorship and scripted outcomes are preserved.

## AI-only authoritative booking alternative (not deployed)
The server-only `applyAiWeekRemediation` now commits one revalidated venue or show-day alternative for an explicitly AI-managed promotion, never a human-controlled or dormant promotion. It preserves every saved card slot and scripted finish, rejects changed proposals or commenced resolution, and records a durable decision ledger. Remaining disputes can be re-planned after each atomic update. No staff delegation or human post-lock approvals exist yet.

## Staff continuity / absence groundwork
A player-controlled promotion can explicitly opt into staff handling unfinished mandatory shows before the World Lock. The one-time lock-stage `recordWeekContinuity` identifies submitted shows, prepared-but-unsubmitted drafts, delegated unfinished work, unfinished work needing player attention and unassigned promotions. It saves only a small status per active promotion and changes no cards. Full validation/auto-submission for complete drafts, staff-authored fallbacks and actual absence consequences are **not** enabled yet.

## Confirmed prepared-show lock handoff
Players can explicitly confirm a valid draft as ready for World Lock before the deadline. The server remembers a fingerprint of the original authored card and venue/day. After Lock and the continuity snapshot, `finalizePreparedWorldShows` auto-submits only unchanged owner-confirmed drafts, or flags edited/invalid drafts for review without touching scripted finishes. This is structural validation; full typed wrestling outcome schemas, venue economics, conflicts and simulation still remain gates before the show can actually run.

## Delegated staff schedule salvage (first executable fallback)
After the prepared-card lock handoff, the trusted World resolver may submit an **incomplete-schedule** human draft with an existing authored match card, but only where its same controlling player opted in before Lock. Staff fills only missing day/venue fields using server-seeded conflict-free choices, retaining all match and segment outcomes. The post-change World check and ledger are atomic. Missing or truly unfinished cards are not invented or silently completed; a later creative staff fallback system remains outstanding.

## Emergency fallback singles card (backend, nonproduction)
`generateWeekStaffFallbackCards` now handles a genuinely **missing** booking (not an abandoned player draft) for an explicitly opted-in human promotion after World Lock and the prepared handoff. It deterministically books ONE emergency singles match using two contracted, active, same-division wrestlers with sufficient unused appearances and a venue/day that does not collide with submitted shows. Every generated card is visibly marked STAFF_FALLBACK; the staff selects and records the finish under its delegated booking authority. Inadequate roster or venue means an explicit unfilled report, not an invented booking. No wrestler dates are charged, and future simulation must enforce limited consequences on emergency cards before deployment.

## Legacy wrestling simulation migration — first pure kernel
The rebuilt architecture now carries **unchanged** original PPW deterministic RNG, match-style calculations (all six dimensions, physical and creative load, execution and readiness), and match-finish/cheater rules. Only their type imports point to a minimal type seam. `adaptBookedSinglesMatch` translates a new relational card-slot payload into these tested pure legacy calculations, requiring a scripted winner and existing wrestler skill input. It neither imports the original WorldState nor saves simulation results or consumes dates. The first adapter is singles-only and read-only; moving full match execution, show flow, programmes and consequences remains follow-up work. Source: archived `Project-Professional-Wrestling` branch `archive/pre-rebuild-main-20261015`.

## Original roster skills → booked singles evaluation
`db/migrations/0015_wrestler_simulation_attributes.sql` adds the original five wrestler skill scores plus fatigue and wear. The trusted `previewLegacyShowMatchStyles` adapter retrieves only the current submitted/cleared show slots and the matching World-scoped wrestler rows in indexed batches, then feeds exact original PPW match-style algorithms. Unknown roster data, inactive or mixed-division wrestlers and unsupported match types fail rather than quietly using fake ratings. No actual show results, contract charges or database-wide simulation snapshots are produced yet.

## Original pre-injury match rating and crowd calculations
The scoring slice now uses the exact legacy match execution, critic stars and opening crowd equations with the original seeded RNG draw order, including dimensional or intent-only branches and finish modifiers. This is a PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW read-only score; it is **not a completed match** and cannot substitute for later injuries, real finishes, load, programmes and full show resolution. New relational audience attributes, event importance and chemistry must be wired before database score previews can run.

## Relational pre-injury match scoring (migration 0016)
The new bounded server-only `previewArchivedShowMatchScores` reads a submitted current-week show, the wrestler's original audience/skill attributes and current World-owned singles chemistry in four targeted indexed queries. Unknown stats or event importance fail closed, whereas an absent first-time chemistry pair uses the **original deterministic seed** and first-encounter familiarity. Results are previews, not completed matches: no contract debit, injuries, momentum, booking changes, show-flow consequences or ledger writes.
