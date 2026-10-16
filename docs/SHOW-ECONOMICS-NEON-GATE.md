# PPW show economics — original parity and Neon costs

## Scope
Restore original PPW events.ts ticket demand, capacity-limited attendance,
competition cannibalisation, seeded attendance variation, ticket yield,
production costs, venue rental, travel, event gross and net. Persist only
the completed-show economic receipt and one financial ledger delta.

Original dependencies: Genesis market metrics and promotion-local market states,
promotion reach/home, wrestler recognition/popularity/presentation, venue
market/capacity/cost, completed authored card, and signed appearance-charge
receipt. No original WorldState snapshot or historical scan.

## Transaction and invariants
- Original Genesis market identities and local states are loaded once as
  bounded normalized rows. Enabling show economics requires that full context.
  Existing manually seeded test Worlds default disabled for compatibility.
- The authoritative resolver locks the World, validates card results, writes
  the completed-show receipt, then computes and writes event economics in
  the SAME PostgreSQL transaction. If cost evidence is missing, none of
  the show resolution commits.
- Competition reads at most 128 submitted current-week shows, never old
  bookings or the complete World. Drawing power reads at most 100
  card participants. One economic receipt per show.
- Appearance fees are already charged by consumeShowAppearances. The event
  records those fees in totalCost/netResult, but incrementalCash intentionally
  omits them. Ledger categorizes SHOW_EVENT_ECONOMICS exactly once.
- Week publication for enabled Worlds checks the economic receipt exists for
  every completed show. The current-week financial-health indexed query
  includes only incrementalCash (not event net which includes already-paid
  appearance fees). No extra ordinary Home/Contract Desk database reads.
- Identical canonical show resolution ID retries return the existing result;
  conflicting completions are rejected. World lock prevents concurrently
  charging the same show. No cron or deployment is connected.

## Known parity limits — do not treat as complete original event system
- Expected attendance uses the booked card's distinct wrestler participants.
  The original estimates demand at *show preparation* with the complete selected
  roster, which can include additional unused wrestlers. Preserve a trusted
  preparation-time demand snapshot in the future booking API for exact parity.
- Original market loyalty/liveStrength/awareness drift after an event is not
  yet ported, so a later show in the same week uses the pre-week market values.
- Media/PPV/broadcast, merch, sponsors per show and premium calendar premiums
  are beyond this original event-economics first version.

## Budget and acceptance
- A current-week, show-scoped test verifies seeded pure/SQL parity,
  extra rival pressure, cash after pre-charged appearances, durable receipt,
  rollback and SQL result query budget.
- No Neon billed-transfer or compute claim until measured staging, and
  **no Vercel deployment or cron activation during rebuild**.
