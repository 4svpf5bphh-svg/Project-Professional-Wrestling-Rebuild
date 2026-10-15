# Rebuild Gate 1 — source inventory and transfer boundaries

Status: **source audit started; no code migration yet**.

## Verified source modules
- `packages/domain/src/types.ts`: World, PPW date, promotion, roster, contract, show, championship and finance model.
- `packages/application/src/world-aggregate.ts`: currently mixes authoritative World state with ownership, commands, runtime, planning and engagement.
- `packages/application/src/ownership.ts`: player membership and promotion control.
- `packages/application/src/runtime.ts`, `scheduler.ts`, `schedule-clock.ts`: authoritative World clock and lock.
- `packages/application/src/planning.ts`, `planning-commands.ts`, `planning-reservations.ts`: editable booking intentions.
- `packages/application/src/commands.ts`, `world-transactions.ts`: mutation/idempotency boundary.
- `packages/application/src/player-view.ts`: player-scoped read-model boundary.
- `packages/application/src/contract-renewal.ts`, `creative-consent.ts`: talent obligations and approvals.
- `packages/application/src/backstage-*.ts`, `wrestler-*.ts`: wrestler-owned identity, creative and backstage consequences.
- `packages/domain/src/staff.ts`, `programmes.ts`, `wrestler-identity.ts`: core gameplay definitions.
- Historical source and design: [original main](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling/tree/archive/pre-rebuild-main-20261015) and [original alpha-1a](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling/tree/archive/pre-rebuild-alpha-1a-20261015).

## Non-negotiable migration invariants
1. One person/wrestler identity per World; many simultaneous nonexclusive promotion relationships.
2. Separate human membership/control from promotion simulation state.
3. A player's authored outcome is authoritative; simulation resolves consequences.
4. Server-only resolution and deterministic 52-week calendar; lock/commitment deadlines must be atomic.
5. Every mutation must be retry-safe and World-scoped, with revision control.
6. Contracts, appearance balances, renewal outcomes and payments must remain consistent.
7. Append-only match, financial and World ledgers must be queryable without joining them to routine Home reads.
8. Distinct player projections cannot leak other players' private decisions.
9. Long-running Worlds must retain deterministic IDs even when historical rows are archived.
10. Preserve every existing feature as a parity requirement, including partially implemented ones.

## Target database domains (first schema slices)
- **World runtime:** worlds, world_clocks, world_locks, world_revisions.
- **Ownership:** players, world_memberships, promotion_controls.
- **Wrestling entities:** promotions, people, markets, venues, teams, stables, championships.
- **Talent economy:** contracts, contract_dates, offers, appearances, finance_entries.
- **Creative:** show_series, occurrences, booking_drafts, card_slots, segments, programmes.
- **Outcomes/history:** results, match_history, relationship_events, ledger_events, command_receipts.
- **Read side:** versioned player_home_views and bounded roster/market projections.

## Build order and acceptance
1. Create versioned migrations and transactional repository contracts **without** importing the old giant World JSON snapshot model.
2. Port deterministic fixtures and the smallest World creation/control/clock slice.
3. Test two players, one World, concurrent claims, World Lock, retries and late join.
4. Port contracts and booking in integrated slices, then deterministic weekly resolution and history.
5. Compare gameplay outputs and long-run invariants against the preserved implementation.
6. Wire mobile UI and production only after parity and measured cost gates.

## Cost design
Avoid full-World JSON on routine reads/writes. Query by World and player; paginate history; batch weekly resolution; measure bytes and DB queries per operation. Target <5 GB/month and preferably <2.5 GB/month for two players.

## Cleanup safety
Original GitHub branches and Neon snapshot remain immutable recovery references. Do not delete or redeploy the old environment as part of migration.
