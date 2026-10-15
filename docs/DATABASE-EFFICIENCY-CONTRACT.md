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

## Prepared, owner-confirmed cards at World Lock
- During OPEN and only before next_lock_at, a verified active controller may explicitly confirm a current DRAFT as ready for the automatic lock handoff. The marker contains authenticated owner and a SHA-256 fingerprint of the ordered card slots and schedule.
- Structural first-version validation checks existing active venue, one to 100 slots, parsable participants/contracts and at least two participants on MATCH slots. It does NOT certify all authored wrestling finishes because full typed match/segment schemas are not yet ported: those remain a later gate before full show simulation.
- The locked resolver requires an existing continuity snapshot, unchanged fingerprint, active matching owner and valid draft. It atomically submits only confirmed, unchanged, eligible drafts in one set UPDATE; ambiguous/edited drafts are left unchanged with a narrow review reason. It never rewrites the card, creates a match, charges dates, or applies an absence penalty.
- One bounded batch read of candidates, one batch slot query, one venue batch query and one set UPDATE replace N+1 work. A single finalization receipt and small audit ledger persist result. The World must still be LOCKED; no extension of any booking deadline.

## First delegated staff execution: missing venue/day only
- The resolver may repair a genuinely unfinished, player-authored draft **only** when the player explicitly delegated staff coverage BEFORE World Lock and the locked continuity snapshot still names the same active controller.
- Requires existing authored MATCH slot with participants, active venue inventory and safe World-week availability. Preserves every populated day/venue field; never substitutes wrestlers, invents a match, chooses a finish, edits card slots or charges a contract date.
- A confirmed prepared draft uses the separate prior ready-to-run handoff. A fully scheduled but unconfirmed draft, a draft with no match, inactive/changed controller or missing opt-in is refused.
- All choice reads, deterministic priority, World-wide post-change eligibility check, write and compact ledger receipt run inside one serialized World transaction. Bounded active-venue, submitted-card and person batches; no idle polling or N+1.
- No claim of a universal unattended show fallback yet: missing whole cards require a later genuine staff creative/simulation mechanism.

## Generated emergency staff card (first true missing-show slice)
- Under a prior, owner-specific opt-in and **only after World Lock**, one World-locked batch may make exactly one minimal singles MATCH for a missing card; no player-authored draft or slot is overwritten. Promotions with no valid roster, safe venue or available dates remain explicitly UNFILLED.
- The current first-version booking division MUST be known (MEN/WOMEN); NULL means NOT eligible for automated generation. Same-division pairing only. This is a booking-eligibility field, not a personal identity assertion.
- Staff chooses and persists a scripted winner as its own creative choice under delegated authority, never as a simulation override of a player-authored finish. Label the slot STAFF_FALLBACK and preserve its emergency status in the draft and ledger.
- The fallback must not grant normal storyline/competitive power. A payload marker describes the intended limited consequence policy, but the consequence simulator has NOT implemented the limit yet: do not represent these emergency shows as equivalent to fully booked programmes or deploy them as playable results.
- Entire batch is sorted by reproducible World seed/week/promotion priority, not order of worker calls. All wrestler contract candidates are fetched in one bounded SQL query (10,000 max, no per-roster N+1); existing claims are reused from the current-week conflict inspector. After generated cards are inserted together, run one authoritative post-check before any appearance charges.
- Records a small weekly outcome and one compact ledger event. No original player card mutations and no background polling.

## Original engine migration: pure first, persistence by explicit projection
- Source modules: archived PPW `packages/sim-core/src/{rng,match-style,match-finishes}.ts`; math and RNG were copied unchanged, replacing ONLY the old monolithic domain type imports with equivalent local type definitions.
- Player outcome is an immutable input. `adaptBookedSinglesMatch` requires an authored winner, validates planned finish and cheating side using the original rules, and evaluates style/skill readiness without choosing the result.
- Computations are pure and use *zero* database round-trips. The persisted roster skill projection must be fetched in a bounded batch during a later trusted resolution command, never by loading a historical World snapshot or querying once per participant.
- Full match simulation is not yet integrated: injuries, chemistry, pacing, finances, programme signals, and event resolutions will be adapted individually with old-to-new deterministic parity tests.

## Original wrestler-attributes adapter (migration 0015)
- Preserve the five exact original skill dimensions plus fatigue/wear in nullable numeric columns; missing historical imports remain NULL, never silently given fictitious 50/100 skills.
- `previewLegacyShowMatchStyles` is read-only and server-only: first verify the World is RESOLVING, show SUBMITTED, promotion active and weekly resources cleared; then load <=100 current card slots and a single indexed World-scoped batch of <=100 wrestler rows.
- No one-query-per-person, no historical WorldState, no uploaded whole-World aggregate, and no result writes. Enforce a measured <=6 statement target including transaction controls. Fail closed for missing skills, status, divisions, non-singles slots, absent authored winners and impossible cheating roles.
- Player-selected finishes remain authored facts. Style readiness is assessment only, not permission to reroll winners, alter segments, spend dates, generate injuries or award popularity. Those require later fully certified resolution and parity tests.

## Archived scoring parity extraction
- `src/simulation/legacy/match-scoring.ts` ports original `matches.ts` finish modifiers and pre-injury match-rating/crowd equations, including seeded RNG draw order. The original WorldState inputs become a tiny two-person projection. No network/database calls in pure scoring.
- Its results are explicitly PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW. Not safe to publish as actual ratings or trigger downstream consequences until the original injury, run-in, match-load and show-flow mechanics are fully integrated.
- The legacy code distinguishes an explicit 6D match style from legacy intent-only matches. The adapter now exposes `explicitStyle`, preserving that distinction rather than silently coercing all matches onto the 6D scoring branch.

## Bounded archived match execution context (migration 0016)
- Store original popularity, momentum and recognition on `ppw_people`; original event importance on `ppw_booking_drafts`; and World-owned, ordered singles chemistry keyed by its pair and context. Unknown migrated scores remain NULL, and the preview refuses scoring rather than fabricating them.
- Single World-locked current-week preview uses four batched reads (show, <=100 slots, <=100 people, <=100 chemistry pairs) + BEGIN/COMMIT. No per-match or per-person queries, and zero writes. Later actual resolution needs its own transaction plus authoritative contract and injury accounting.
- First-encounter chemistry compatibility is generated using exactly the old PPW World-seed/pair RNG, with no database mutation; repeat pairings within the show advance in-memory familiarity deterministically.
- Score uses actual original execution/star/crowd calculations, returns clearly labeled PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW, and MUST NOT be displayed as a completed result.

## Original match injury RNG and referee-stop parity
- The original archived match scorer now internally retains its live RNG stream after the EXACT scoring execution, crowd and length draws; the existing public scoring function stays unchanged.
- `previewArchivedInjuryStoppage` uses original intent-only or styled per-person risk calculations, capped [0.0002,0.035], draws chances in card participant order, and consumes deterministic extra severity/weeks-out draws only for actual injuries.
- A MAJOR/SEVERE injury to the intended winner forces actual finish INJURY_STOPPAGE and the opposite winner, with crowd -4. MINOR/MODERATE or injury to loser alone does not change the winner. No other stochastic override is allowed.
- Original World ruleset injury multiplier is nullable: projection returns null until populated; no default ruleset is guessed. DB projection adds zero SQL queries: world multiplier comes from existing current-show read.
- NO medical state, contract dates, card scripts or official results are changed by this preview. The future authoritative command must apply injuries, interference, performance consequences and receipts atomically before advertising final results.

## Player-authored run-ins (pure legacy interpolation)
- The original PPW interference contract is preserved: booked SUCCESS/THWARTED, with ABORTED only for unavailability or a medical injury stoppage. Successful interference switches the finish to PROTECTED_FINISH; it never changes the winner.
- The interferer must be an ACTIVE World wrestler with a committed, contract-backed appearance in another card slot. An interference reference alone is never accepted as an appearance.
- The trusted scoring preview expands its existing World-scoped indexed person query to cover interferers, with NO additional SQL statements and an explicit <=200 distinct-person cap. If World injury-rate context is absent, this also returns no interference result rather than inventing a medical outcome.
- Delivery uses the original presentation formula, and crowd is adjusted only according to the originally authored run-in or genuine abort condition. No RNG draws, outcome writes, contract charges or World changes occur.

## Faithful original post-match progression, without a monolithic World
- Port exact `matches.ts` load and momentum/recognition/popularity expressions, plus `career.ts` injury floors and applyMatchLoad ordering, to a pure singles-consequence projector. Inputs: already resolved medical outcome, booked interference and media reach. Medical stoppage must determine actual winner before downstream momentum.
- Existing smallint progression columns were incorrect for legacy 0.1/0.01 changes; migration 0018 promotes fatigue, wear, momentum, recognition and popularity to float8 with original [0,100] bounds still enforced. This matches original JS double arithmetic and avoids truncation.
- Promotion media reach is a nullable input until legacy migration; NEVER fabricate a default. Read it on the existing show SELECT; no additional SQL. No medical or athlete changes are written by a preview, and injuries and interference still resolve prior to consequences.
- Projection is per match, NOT multi-match/week globally applied simulation. Authoritative multi-show wrestler updates, injuries and narrative effects must use one consistent ordering under World Lock.

## Pure original show pacing first slice
- Pull pacing/style similarity, ranked signal selection and match weights directly from archived `packages/sim-core/src/show-flow.ts`. No snapshot WorldState read and no standalone SQL in the pure engine.
- The existing four-batch match preview now derives an explicitly incomplete pacing projection from post-medical/post-interference match crowds. If injury rules have not been migrated, no pacing is inferred.
- Do not present this as full `evaluateShowFlow` parity: historical programmes, alignment volatility, dirty finish familiarity, and resolved segment audience signals are not yet available. Its `PACING_ONLY_NOT_FINAL` phase and `NOT_PROJECTED` segments marker prevent confusing it with final show results.

## Historic alignment and context without WorldState
- Aligned show preview uses the archived `show-flow.ts` clarity modifiers and `alignment.ts` eight-week maximum-per-performer change penalty, including different handling for scripted TURN, offscreen switch, first presentation, signing and returning.
- Promotion-specific alignment overrides are separate from a wrestler's base identity. Unknown values remain NULL; the World must explicitly certify `alignment_history_loaded` before a zero-history result is ever presumed.
- The active show already has <=100 match participants; two added bounded SQL reads get promotion overrides and up to 4096 recent change records only for confirmed imported-history Worlds. Neither query occurs until medical/interference and pacing are available. No global historical ledger hydration or participant-by-participant query.
- Incomplete show context returns NULL. The calculated crowd is labeled `PACING_AND_ALIGNMENT_NOT_FINAL` and cannot be recorded as final or award momentum until programmes, cheat familiarity and segment crowds are ported.

## Character continuity across promotions
- World-owned wrestler identity is the source of truth for both gimmick and base face/heel alignment. Promotion-specific presentation only exists as an explicitly justified, wrestler-approved, temporary **exception**, never as an independent default.
- The exception row demands a defined storyline context, meaningful justification, consent receipt and <=26-week lifetime. Pending and expired exceptions have no gameplay effect; the preview falls back to wrestler core identity without extra SQL calls.
- Future global turns/repackages must update wrestler-owned identity under authoritative World commands, with wrestler creative resistance and relationship consequences; a promotion cannot freely flip an identity by writing a local record.
