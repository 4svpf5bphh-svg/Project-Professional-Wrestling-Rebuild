# PPW recovery audit — 16 October 2026

## Decision
The rebuild exists to reduce **Neon billed transfer and compute** while preserving the original PPW multiplayer gameplay. Do not treat server authority or architectural expansion as independent objectives. No production deployment or cron activation during this audit.

## Verified original source
- `packages/persistence/src/postgres-world-repository.ts` persists the full `world_state` JSONB, with a `world_state_gzip` transport optimization. The original database reads and writes a whole-World aggregate.
- `packages/persistence/src/postgres-server-world-access.ts` contains warm-instance caching, version probes and compressed World reads; it explicitly notes that the full World JSON can be 5–6 MB and that application payload counters **do not equal Neon billed transfer**.
- `packages/sim-core/src/contracts.ts` already implements contract availability, exclusivity, capacity, market wages, signing and offer logic.
- `packages/sim-core/src/human-contracts.ts` implements human contract offer validation and creation.
- `packages/application/src/contract-renewal.ts` implements the same-terms renewal template, excluding historical signing bonuses.
- `docs/NEON-NETWORK-TRANSFER-ACCEPTANCE.md` requires two-player billed-transfer measurement, including idle and cold-server scenarios, before shipping.

## Verified rebuild source
- `docs/DATABASE-EFFICIENCY-CONTRACT.md` requires narrow reads, bounded queries, zero idle polling and <5 GB monthly billed Neon transfer (preferred <2.5 GB) for two players.
- `src/db/query-meter.ts` meters SQL result payload, query count and elapsed time, **not billed Neon usage**.
- `src/db/contract-desk-workspace.ts` reads bounded roster, pending date requests and renewal proposals; it is not yet full original-game feature parity.
- `src/db/contract-renewals.ts`, `src/db/contract-date-requests.ts` and corresponding decision modules provide only portions of the original negotiation lifecycle.
- Accepted renewals are staged until expiry and activated in one set-based operation in `src/db/week-advancement.ts`; verify lifecycle and overlapping accepted offers with PostgreSQL tests before shipping.

## Feature-by-feature recovery plan
| Original gameplay | Rebuild state | Lowest-risk next action |
|---|---|---|
| Offer economics and wrestler utility | Incomplete | Port and test original formulas, adapting only data access |
| Exclusivity and cross-promotion capacity | Partial | Reuse original rules; test overlapping terms and shared wrestlers |
| Manual offer/renewal | Same-terms proposal only | Port manual offer validation and decisions |
| Additional purchased dates | Request/decision scaffold | Port original compensation and wrestler acceptance |
| Creative control | Stored as a term | Reuse original resistance/consequence logic |
| Renewal term transition | Deferred activation | Test expiration, rollover and retries |
| Staff auto-renewals | Not complete | Defer until manual contracts reach parity |
| Contract Desk UI | Deferred | Build after backend parity and measured cost gate |

## Execution order
1. Freeze new abstractions. Keep existing useful SQL foundation.
2. Transfer **complete original contract behaviour** into the rebuild, using a compatibility/parity test suite before adding new gameplay.
3. Measure query count, transferred rows/bytes and idle traffic in test fixtures. Avoid whole-World reads and N+1 writes.
4. Test end-to-end contract lifecycle and two-player concurrency on disposable PostgreSQL.
5. Repeat with roster-scale and long-history fixtures, then measure **actual Neon billed transfer and compute** in controlled staging.
6. Resume other gameplay parity systems, retaining the same transfer-first approach.

## Explicit non-claims
Passing CI is not contract parity. Query-meter bytes are not Neon billed bytes. No production cost saving has yet been proven by this audit. Do not mark the rebuild ready until those measurements pass.
