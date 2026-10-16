# PPW original weekly finances — one-week settlement / Neon cost gate

## Scope (16 October 2026)
The project is a functional rebuild to reduce Neon data transfer/compute **without reducing PPW gameplay depth**. The archived original's `finance.ts` defines weekly cashflow, runway and distress, and the rebuild now applies those rules in one World-locked week completion.

### Retained mechanics
- Pay contracted weekly guarantees even if appearance dates have run out, but not before signed start or after expiration.
- Charge appearance fees, signing bonuses and extra dates to the correct promotion at the actual transaction; never charge them twice during settlement.
- Add media income and sponsorship; subtract baseline overhead once/week for active promotions; skip dormant and closed promotions.
- Calculate last-week net from *all five existing categories* of money events in that specific World week, including early-week signing, appearances and addendum payments.
- Original runway formula `Math.round((cash/Math.abs(weeklyNet))*10)/10` for negative net and positive cash; original HEALTHY/WATCH/DISTRESSED/CRISIS thresholds with cash<=0 overriding everything.
- Store just three summary values `last_weekly_net`, `runway_weeks`, `financial_distress` on the existing promotion row. A status-change event is written only when actual status changes. Overview reads the same player-authorized promotion row; **zero extra ordinary-player queries**.
- No World JSON snapshots, new continuously maintained finance projections, status polling or per-wrestler weekly wage SQL updates.
- Repeated World stage IDs replay the original receipt and cannot settle a paid week twice.

### SQL cost boundaries
- One group-by query for all payroll (one query for all promotions).
- One set-based query for all baseline media/sponsor/overhead.
- One indexed current-week-only financial event aggregate, set UPDATE of the maximum 128 active promotions and status-change ledger receipt. No history scan in ordinary screens.
- Index: `ppw_ledger_week_finance(world_id,year,week,event_type)` partially over the five money event categories. Its size grows with finance events, not non-finance social/news/match details.
- One 100-year / 643-talent / eight-promotion PostgreSQL fixture tests the cost proxy: <=3 SQL statements including BEGIN and COMMIT, **one result row**, <=500 encoded result bytes. Separate end-to-end rollover tests verify World Week 52 -> 1, status change, cash totals, posted money events, dormant exclusion and idempotent retries.
- **Application result bytes are not Neon billed transfer.** No staging Neon compute/network measurement has yet been performed and no production release is approved.

### Future dependencies / caveats
- Archived show ticket sales, merchandise, event expenses, PPV media revenue, staff payroll, broadcasting contracts and detailed original cash categories are NOT yet fully ported. This milestone only totals cash paths that are actually implemented, not an invented full-game P&L.
- Post-match revenue and operating costs will write narrow, categorized money event records, not full World saves; add categories to indexed settlement only when those real actions exist.
- Importing financial profile fields is supported for a *new* original Genesis World, not an in-place upgrade of the live saved World.
- Direct finance settlement is trusted internal World-workflow only. No cron, Vercel deployment, production database migration or player-triggered settlement was enabled.
