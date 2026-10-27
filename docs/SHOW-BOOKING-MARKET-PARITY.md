# PPW prepared show market & ticket snapshot + original market response

## Why
The original Project Professional Wrestling game booked demand and ticket yield
at show preparation, then realised attendance under rival-show competition and
seeded variation. The rebuild must not recalculate expected demand at show
resolution from later roster/popularity mutations.

## Original-parity first slice (server authority vs UI)
- Verified human controller can browse only bounded (<=50) market/venue
  options and pick a market, matching active venue and ticket strategy.
  No frontend is deployed; `world-service.ts` exposes callable framework-neutral
  actions to the eventual booking UI.
- The original calendar/World owns REGULAR/MAJOR event classification.
  A booker cannot change that field to exploit ticket/cost multipliers.
- The already-existing Ready-to-Run action validates the full current card
  and stores original-market demand and ticket yield on the existing draft.
  The quote is part of the ready fingerprint, so later edit or market change
  invalidates readiness and cannot reuse a stale quote.
- Prepared-show lock finalisation checks the saved commercial fingerprint.
  Match result resolution consumes that booking snapshot, never refreshes it
  from roster profiles/market history. All show finances remain exactly once.
- Original market awareness/loyalty and quality-calibrated long-run audience strength
  (attendance/demand performance, sell-through, certified match stars, audience
  response, event type, home/away) settle one time
  on the World-locked week rollover, as ONE bounded market-state query and
  ONE batched update for all promotions. Match stars come from original
  canonical match simulation, not a guessed conversion of crowd scores.
- Separate full-World snapshots or constantly recalculated dashboard
  projections are never stored.

## Dependency boundaries and follow-up
- AI/staff-generated shows must also acquire a trusted preparation-time
  commercial snapshot before results are published in an enabled World.
  Future calendar and AI show-planning work will wire this rather than
  fabricate default values for absent market/ticket choices. Missing
  context fails closed.
- Original events.ts updates market state immediately after each event; the
  rebuild waits until all shows complete to prevent online processing order
  changing rival results. This is intentionally asynchronous-fair; within a
  week, attendance uses the same pre-rollover local market state.
- Planned premium/PPV events and recurrence require authoritative calendar
  import; a player's ticket-price choice does NOT change the event type.
- GitHub PostgreSQL integration checks choices, authorization, deadline,
  snapshot invalidation, market drift and duplicate-payment boundaries.
- The exact original market calculation remains available as a regression
  reference; the separately named balance rule moderates attendance rewards for
  disappointing shows and slows top-territory snowballing for every promotion.
  Only market response at the existing World Lock uses that rule. See the Phase 10
  comparison in the master roadmap. No extra database reads or scheduler.
- No production deployment, Neon migration, or World Lock cron activation.
