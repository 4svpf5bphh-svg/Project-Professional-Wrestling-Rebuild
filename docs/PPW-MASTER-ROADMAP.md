# PPW Rebuild — Master Roadmap

**Authoritative priority order agreed 24 October 2026. Phase 1 VERIFIED in CI on the development branch, NOT DEPLOYED; next unfinished gameplay phase is Phase 2 — Gorilla Position.** Use this page, not an old parity checklist, to continue development in future conversations. Only edit the priority order with the owner's direction.

## Contracts and primary references

- [Original feature dependency audit, main](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling/blob/main/docs/PPW-FEATURE-DEPENDENCY-AUDIT.md) — §§9.1–9.12 describe the eventual living World.
- [Original navigation blueprint, main](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling/blob/main/docs/FUTURE-NAVIGATION-BLUEPRINT-2026-10-12.md) — task-first, bottom-navigation architecture.
- Original repository **main only**, never `alpha-1a`. The rebuild repository is the only writable game source.

TEW underneath, EWR on top; existing server-authoritative World state is the truth. One World Lock, no second clock, no attendance bonus for a human manager, no ownership or privacy bypass. Keep current gameplay and five-root bottom navigation. Neon usage must remain bounded: no speculative polling or full-World scans.

**Production guard:** preserve both managers, live World, cards, outcomes, contracts and history. Never reset or advance the live World, activate automatic World Lock, or deploy to Production without express permission. Development happens on a branch until release authorization.

## Phase 1 — Immediate UI and advance-booking polish (VERIFIED IN CI, AWAITING RELEASE APPROVAL)

1. Match/angle graphics remain automatically visible; markedly compress the default iPhone ticket, centre branding/logos, retain wrestler portraits/event identity and offer larger artwork on demand.
2. Staff selector must show **two readable columns on phones** for all eight departments. Maintain personality, dossier, contracting, renewal and buyout.
3. Verify venue and card creation/edit/save during the current week and six future weeks, persistence through advancement, saved valid submissions when a player misses World Lock, results handoff, revision conflicts, and independent manager isolation. Use disposable CI data only.
4. Regression 320px/390px iPhone navigation, keyboard and tap controls, scroll width, save controls and presentation.

**Baseline:** `f75361ca20d863b0a994df67a369d0a6eba69839` (previous Production release, authentic two-manager Genesis check passed before this work). **Development branch:** `phase1-iphone-polish-2026-10-24`. UI milestone `affc688910beb4589c1b499dc141645f83a6a014`, readability refinement `11e2cdde200c9e7389fe4a786cde2fcfc1e6fac5`, and seven-week two-human PostgreSQL regression `53e7f26bedc8a16db5dd76495b0efd9180367f65` are **verified together** by [CI run 40098312106](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40098312106): TypeScript and Vite build PASS; **105/105 browser tests**, **558 unit passes, 0 failures, 115 expected skips without disposable DB**, and **106/106 real PostgreSQL tests**. The DB suite includes saved valid unconfirmed cards being taken at the one World Lock, confirmed and changed-draft behaviour, 26 certified weeks with two human managers and authored winners, and the new current-plus-six-week advance card/venue isolation test. This is CI verification, **not** live-device sign-off, new Production Genesis verification or permission to deploy.

## Phase 2 — Gorilla Position (NEXT MAJOR GAMEPLAY FEATURE)

Reuse booking, appointed staff, weekly resolution and the one World Lock. A pre-show standing policy chooses **Stick to the card / Use judgement / Follow the crowd / Protect key plans**. Player-authored protected finishes, critical constraints and explicit alternatives are authoritative; handle genuine injury/unavailability, exceptional crowd response and severe time overruns with a legal decision set. A present human may author one of **the same** legal decisions a competent delegated staff member could select — never a superior option or modifier for being online. All unresolved decisions auto-resolve at the deadline; the World never waits or replays canonical outcomes. Persistent scoped post-show **Gorilla Log** records the incident, legal options, protection and decision rationale. First design the pre-lock vs resolution boundary; then implement end-to-end and validate two-manager concurrency and idempotency.

## Phase 3 — Persistent memories and living-world depth

**Already foundational:** Backstage requests, relationship/trust consequences, promises, tag/rivalry pitches, persona carry-over, bounded historical Groq context. **To extend:** durable high-signal memories of honoured/broken promises, title chances, omissions, forced losses, injury support/treatment, contract conduct and promoter relationships. They explain and shape morale, negotiation, future requests and working relationships, with retention/decay rules. Scope private intent to the relevant promotion; public World history is separate.

## Phase 4 — Earned reputations and staff succession

**Already foundational:** appearances/match evidence, career progression/retirement trajectory, eight staffed departments, contracts, named characters, salaries, morale, simple buyouts/renewals, road-agent feedback. **To build:** verified-evidence-derived reputations like Big Match Performer and Tag Specialist, with thresholds and change over time; eligible retirees may enter the competitive staff market as agents/trainers/commentators etc., with competencies based on actual career evidence rather than celebrity auto-bonuses. Keep person identity/history continuous.

## Phase 5 — Organic prestige and traditions

**Already foundational:** championship prestige and lineages, recurring premium-event identity, calendars, teams/stables and Programmes. **To build:** earned prestige for long-running titles/events from canonical matches, headliners, significant moments, continuity/neglect; deeper faction competition and actual tournament structures when scheduling, title rights and history support them. Do not give arbitrary manual prestige boosts.

## Phase 6 — Commercial and international expansion

In dependency order: negotiable streaming/TV and sponsorship terms; campaigns and facilities; expanded academies; consent-based time/date-limited loans and excursions; promotion working agreements and diplomacy; joint shows and advanced commercial partnerships; local market history and affinity. All must work fairly with both AI and humans, respect contracts, private booking, player ownership and scarce venues.

## Phase 7 — Historical World and legacy progression

World talent rankings, press/headlines, efficient searchable public World/career records, yearly awards and Hall of Fame, spectator/public completed-show experiences, World Moments, **non-competitive** Kayfabe Points, earned legend unlocks and balanced Create-a-Wrestler contributions. No second live timeline or gameplay advantage for collectible progress.

## Existing systems — verify and extend, never recreate

- Battle royals and multi-person/team matches; debuts, videos, return hype, turns and specialist segments.
- WWE/AEW recurring premium-event identities; current plus six future-week Planner and card editor.
- Staff employment, personality, contracts, salaries, renewals, morale and buyouts; road-agent reports.
- Groq post-show narratives with bounded match/Programme memory, protected authored winners, Results and finish replay.
- Portable personas, stable/working relationships, Backstage pitches, requests and promises.
- Weekly costs, cash flow and distress; career progression, injuries and basic recovery.
- Admin controls for manual World advance, booking extensions and Groq configuration.
- Five-root iPhone PWA navigation and promotion-scoped human multiplayer.

These are implemented *foundations*, not claims every edge case is perfect. Test source state before alleging a missing feature. Older parity docs are not authoritative.

## Known issues, deferred work and validation ledger

| Item | Status | Evidence or next action |
| --- | --- | --- |
| Baseline Production rebuild | Previously released | `f75361ca20d863b0a994df67a369d0a6eba69839`; previous authentic two-human Genesis green |
| Compact graphics/brand and staff grid | Verified in disposable CI; not deployed | `affc688910beb4589c1b499dc141645f83a6a014` + `11e2cdde200c9e7389fe4a786cde2fcfc1e6fac5`; [run 40098312106](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40098312106), 105/105 Chromium mobile browser tests (320px included) |
| Six-week booking across missed deadline and canonical results | Verified in disposable CI; not deployed | `53e7f26bedc8a16db5dd76495b0efd9180367f65`, 106/106 SQL tests, `prepared-show-postgres` for saved valid cards at Lock, `world-resolution-journey-postgres` for authored results, and `living-world-two-human-postgres` for certified 26-week progression. New advance test uses an isolated clock-boundary projection; certified advancing is checked separately, not asserted to occur in that test |
| Portrait catalogue expansion | Deliberately deferred | Preserve good current portraits; no new mass asset rollout in Phase 1 |
| Advanced medical treatment | Deliberately deferred | Preserve existing injury/recovery lifecycle |
| World Lock cron | Disabled / no authorization | Never activate during the rebuild |
| Production release | Held for user permission | No live advancement, reset, cron activation or deployment performed in Phase 1 |
| Phase 2 — Gorilla Position | Next unfinished phase | Only begin implementation in the agreed order; reuse actual staff, booking, incident/resolution and one World Lock. Do not create cosmetic-only Gorilla |

### Continuation contract

After each substantial verified implementation, update this table with commit hash, Actions run and relevant test counts, identify known failures and the **next unfinished milestone**. Phase 1 has passed CI; obtain release authorization before deploying. Phase 2 Gorilla Position is the next unfinished development phase; subsequent handovers must link this file and state actual branch/HEAD, CI and deployment state. Never invent a replacement roadmap.
