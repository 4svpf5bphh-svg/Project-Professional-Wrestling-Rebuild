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

## Advancement resource guard
- Even when a weekly certificate exists, the World-locked advancement transaction inspects the CURRENT submitted shows for missing day/venue/card details and same-day wrestler or venue conflicts before reopening.
- This adds three bounded server-only queries once per resolved World week, never to routine player reads. It is a safeguard, not a completed talent-capacity, venue-catalogue or AI/staff-resolution pipeline.

## Resource eligibility inspection (week resolution only)
- Venue existence/active status is read through one World-scoped indexed batch query. A provisional venue string is not proof of actual capacity or ownership.
- Wrestler active status, signed promotion-specific contract, remaining dates, term, and competing exclusive rights are checked in a second batched query, with composite World/contract/people keys and indexed exclusive lookups.
- Distinct show appearances count towards wrestler Service Capacity across the whole PPW week; a nullable per-person override of 1–7 is supported. Unconfigured capacity defaults to 7 until the old workload-calculation model is ported. Same-day collisions always remain illegal.
- The maximum card limits (100 appearances/show, 128 active promotions) bound the batch. These are server-only weekly inspections, not per-user polling.
- A contract's final legal/creative approvals and the venue's full rental/financial ledger remain future development gates; this inspector alone cannot certify a week.

## Last-date resolution invariant
- Resource inspection distinguishes a show that has a matching durable resolution receipt from a fresh unresolved booking. A remaining contract date balance of zero can be accepted for the *already resolved* show, because date consumption has already occurred.
- A separate unresolved show with zero remaining dates is still forbidden. Never require remaining_dates>0 during end-of-week reinspection of completed shows, or the World could deadlock after a valid final contract appearance.
- Regression tests cover already charged date, unsigned deal, conflicting exclusivity, weekly service capacity and inactive venues using disposable PostgreSQL.

## Pre-resolution World-wide clearance gate
- ALL active promotions' cards must pass the bounded weekly conflict/contract/venue inspector BEFORE any dates can be consumed; missing shows and disputed day allocations fail closed.
- Trusted resolver records exactly one indexed World/week clearance with observed promotion/slot counts. World revision and request receipt make retries and competing workers safe.
- `consumeShowAppearances` verifies the clearance in its EXISTING submitted-show lookup via an indexed LEFT JOIN; no extra network round-trip per show. Week advancement requires clearance as well as the later completion certification.
- A clearance cannot be issued after show resolution has begun. Clearing the same week twice with a different request ID is rejected.
- The existing typed booking command boundary disallows post-deadline player changes. DB-level immutability for all historical/admin write paths and deterministic contested-resource arbitration still need explicit follow-up before a production scheduler.

## World-seeded resource arbitration (pure and provisional)
- First version: repeatable SHA-256 ordering by immutable World identity/seed, year/week, resource identity and promotion; never submission clock, request ID or mutable show ID.
- Venue claims are contested per venue/day; wrestlers use both one booking per day and the wrestler's total weekly service capacity. Different-day nonexclusive work is valid when capacity permits.
- Pure allocation returns proposed losers and protected claims. Does NOT mutate authored cards, select match finishes, consume dates, or write a misleading clearance receipt. Staff/AI fallback and final binding are separate next steps.
- Server preview reuses the already-batched Week conflict inspector in one World transaction (<=7 SQL statements including BEGIN/COMMIT in a 2-promotion fixture), never a whole-World load or one query per wrestler. Never expose a full cross-promotion draft to player API.
- Decisions have a canonical claims fingerprint for later durable binding and stale-plan detection; repeatable outcomes across input permutations are covered by tests.

## Durable arbitration proposal, not an allocation (Gate 10)
- Exactly one compact proposal row per World week; only disputed outcomes are stored, never a complete World or card snapshot. It is a server-side planning receipt and does NOT unblock clearance, edit any card or authorise date charging.
- A snapshot fingerprint hashes the already-fetched scoped World-week evidence (promotions, ordered slot metadata/content, venue status and wrestler contract/capacity). This detects raw card edits that leave wrestler/venue claims unchanged; zero additional SQL statements for fingerprinting.
- Command revision and request receipt serialize simultaneous proposal writers and make exact retries safe; changed input fingerprints and later revisions fail closed.
- Retrieving the record rechecks World revision and evidence fingerprint under World row lock. Stale proposals cannot be used as current arbitration decisions. Future staff remediation will require its own transactional operations and explicit outcome-ledger records.
- Concurrency and edited-script regressions use disposable PostgreSQL; no worker or cron is connected.

## Staff and AI availability alternatives (read-only first version)
- For a valid recorded arbitration, suggest a different active venue on the same date or moving the whole show to a free day, checking other bookings' venues and all participants. Weekly wrestler capacity failures always require creative rebooking, not a false reschedule fix.
- Revalidate the durable proposal and compute alternatives under the SAME World transaction. One bounded World-scoped active-venue query (<=256) is added; no per-person SQL or live polling. Large-venue worlds require a later market-scoped search rather than silent truncation.
- Suggested changes are individually possible against the existing schedule but not reserved for all losers simultaneously. Future acceptance MUST recheck all World claims atomically.
- No wrestler replacements, show/card changes, contract deductions or scripted finish changes are applied by this operation.

## AI-only remediation commit, with authored-card safety
- Only explicit AI management-mode promotions with **no active human controller** are eligible. Unassigned/dormant promotions are never treated as AI by absence of a claim.
- Apply exactly one previously offered venue/day alternative per World-locked command; verify proposal fingerprint, revision, current venue inventory and eligibility, then inspect post-change claims before committing.
- Never touch ppw_card_slots (matches, segments, winners, outcomes), contracts or date charges. Every successful change creates an append-only World/week ledger receipt plus the command retry receipt.
- Atomically refresh the compact provisional proposal for remaining disputes using the NEW World revision, or delete it when no disputes remain; later workers can continue fairly, but must request a fresh preview/revision.
- This is a server-only weekly resolution workload, not an ordinary player read. Two bounded whole-week inspection passes are permitted here; player UI is never polled.
- Human delegation and authority tokens, venue capacity/cost, and creative substitution/absence fallbacks remain separate gates.

## Staff continuity: narrow opt-in and weekly Lock checkpoint
- Only verified active controlling promotion player may opt in/out of unfinished-show staff fallback, before the single weekly World Lock. A controller ID is stored with delegation; stale settings cannot transfer automatically to another owner.
- A SUBMITTED show with basic scheduled card readiness is not a missed-show absence. A schedule-filled draft with card slots is `PREPARED_DRAFT` and is explicitly protected from being deemed an absence, but still requires full card validation and finalisation in a later feature.
- Truly unfinished work is `STAFF_FALLBACK_ELIGIBLE` only with owner-specific opt-in. Non-delegated human work is `PLAYER_ACTION_REQUIRED`; unclaimed promotions remain `UNASSIGNED` and are not automatically converted to AI.
- The lock-time snapshot is a bounded current-week query (<=128 promotions) and a **single** batched INSERT; it stores narrow statuses, no card payloads, no individual N+1 SQL and no polling.
- This checkpoint does NOT create shows, apply absence penalties, amend scripts or permit World advancement. Actual staff show creation and immutable booking submission remain follow-up work.
