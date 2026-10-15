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
