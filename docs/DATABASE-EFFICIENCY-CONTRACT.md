# PPW Rebuild — Database Efficiency Contract (mandatory)

Status: LOCKED BEFORE SCHEMA IMPLEMENTATION. Applies to every feature, migration and deployment.

## Design constraints
1. No ordinary API request reads or serializes the entire World. Home, roster, market, contract desk, planner, results and news each use narrow, authorized, indexed queries.
2. No player action rewrites a monolithic World snapshot. Update only affected authoritative rows in an atomic transaction with optimistic revision and idempotency receipt.
3. Operational state is separate from append-only match, financial, news and simulation ledgers. Historical queries must be bounded/paginated.
4. One wrestler identity per World, multiple contracts/affiliations, no duplicate simulation entities.
5. Weekly World resolution is server-authoritative, lock-protected, deterministic, restart-safe and batched. It is the only permitted broad-scope workload, never a player request.
6. Player views use explicit projections only where justified by measured cost; they are versioned, access-controlled and invalidated atomically or with a provable version check. Never cache private views under World-only keys.
7. No per-second or per-minute idle polling. Prefer mutation responses, visibility-aware refresh and bounded cache revalidation; World lock deadlines do not require live DB countdown queries.
8. Avoid N+1 queries; use batch reads and indexed keyset pagination. Avoid SELECT * on large rows and repeated historical aggregates.
9. No production migration or deployment before parity, isolation, load and cost gates. Original project/database are recovery-only.
10. Database traffic includes connection/compute overhead, reads, writes, projections and scheduled jobs; measure actual Neon billed transfer and compute separately from application payload sizes.

## Required feature review (before implementation)
- Dependencies in and out.
- Simulation authority vs UI projection.
- Smallest complete feature slice.
- Exact SQL read/write paths and indices.
- Queries, rows, estimated wire bytes and write amplification per action.
- Two-player concurrency, unauthorized access and retries.
- Cache invalidation and World Lock behaviour.
- Long-world growth (1, 10, 100 PPW years).

## Automated acceptance tests
- Assert Home/roster/contract/card API paths never call whole-World load.
- Assert a single edit modifies only expected rows and never rewrites historical tables.
- Record SQL query counts, row counts, encoded response bytes and read/write timings per representative action.
- Stress two simultaneous players, overlapping actions, retry storms and weekly World Lock.
- Replay deterministic seeded World fixtures and compare domain outcomes to preserved reference.
- Simulate long histories; ordinary request cost must not scale linearly with accumulated history.
- Measure idle app traffic and scheduled job traffic separately.
- Maintain a documented two-player monthly projection; compare to actual Neon billed usage after staged deployment.

## Budgets and decision gates
- Operating target: less than 5 GB/month Neon transfer; preferred less than 2.5 GB/month for two players.
- These are end-to-end operational targets, not guarantees derived from a single gzip benchmark.
- Initial engineering budgets to be validated by measurement: ordinary screen requests <= 10 indexed queries and <= 100 KB serialized DB result data; single editing command <= 10 indexed queries and no historical scan; zero idle database polling. Any exception requires documented evidence and review.
- Do not ship if normal gameplay exhibits growing per-request payload with World age, cross-player leakage, repeated full snapshot transfer, or an unexplained compute/transfer spike.
- If metrics violate budget, fix the underlying data access before building the next feature.

## Rebuild sequence
A. Baseline the old game only for behavioural parity and known worst-case data transfer.
B. Build schema and repository tests with SQL query/byte instrumentation before importing simulation logic.
C. Implement one World, two players, claim/control, small roster/contract/card read/write slice.
D. Measure; only then add weekly resolution and history.
E. Continue feature parity in bounded slices with a cost regression suite.

This contract is intentionally stricter than the previous PPW persistence approach. Do not reintroduce full-World JSONB checkpoints as the hot operational data model.

## Precise booking cutoff, with no additional database round-trip
- Every future player-authored card, talent or venue booking mutation must opt into `applyWorldCommand(requiresOpenWeek:true)` and obtain the existing serialized World row lock.
- The existing receipt query is a LEFT JOIN with that locked World, so it also tests `phase='OPEN'` and `next_lock_at>clock_timestamp()`. The check is evaluated **after** the row lock, including when another request held it over the deadline.
- Transaction-start `now()` is unsafe for this scenario. The World scheduler lock uses `clock_timestamp()` too.
- A retried, already-committed request replays its receipt after deadline, but a fresh edit cannot proceed, even if the scheduler is late.
- This is a reusable command boundary, NOT yet a fully implemented card submission API; all new booking handlers must use the explicit guard.

## Bounded batch appearance charges
- A submitted show's unique wrestler list is extracted from persisted card slots; show resolution never accepts caller-provided appearance counts.
- Fetch the show's contracts using one indexed join against small `unnest` arrays; validate **all** rows before charging. Update every finite contract in one set-based statement.
- Show resolution now uses constant query count as card size grows (test fixture: 18 wrestlers, <=12 SQL statements INCLUDING BEGIN/COMMIT). The old loop made up to two additional SQL calls per performer.
- An invalid/expired contract or unexpected update row count throws inside the transaction: no partial charges and no committed show receipt.
- This is a database query budget, not evidence of real-world Neon billing; measure billed transfer after staged playtesting.

## Weekly completion / bounded verification gate
- Only a trusted resolver (never the player API) can advance a World after the single weekly lock and the internal RESOLVING phase.
- Each ACTIVE promotion must have exactly one SUBMITTED show in the current World week with a matching durable resolution receipt. Missing shows block advancement until AI/staff absence policy is implemented.
- Conflict arbitration and remaining weekly consequences must produce a compact server-only week certificate before advancement. The certification writer is **not yet implemented**; fixture seeding is test-only. Do not wire advancement into any cron until certification is real.
- Readiness is verified by one bounded indexed query across current-week booking drafts, show receipts and the single week certificate; no historical World scan or per-promotion queries.
- Move calendar (52→1), open next week and add precisely one day to next_lock_at in an atomic transaction with an append-only completion ledger entry and retry receipt.
- If the canonical next deadline has already elapsed, fail closed for manual recovery rather than quietly creating an expired opening.
- Historical ledger rows are not included in everyday Home data; player UI will query bounded projections later.

## Week-only collision inspection (server-side)
- The first inspection reads current-week submitted shows and their card slots in a bounded number of queries. It never reads old shows or the complete World.
- Same wrestler can work across multiple promotions on **different PPW days**; an identical PPW day conflicts, as does double-booking one venue on one day. Do not award ties to the first submission.
- Missing shows/schedules, empty/malformed cards and same-day conflicts block provisional readiness. No wrestler's booked finish can be rewritten by a conflict heuristic.
- This provisional inspection is NOT weekly certification: it does not yet check contract coverage/service capacity, actual venue ownership, staff fallback, or every simulation consequence. No production scheduler or seal writer has been enabled.
