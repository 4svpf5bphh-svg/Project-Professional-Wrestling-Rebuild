# PPW Rebuild — Master Roadmap

**Authoritative roadmap, updated 27 October 2026.** Historical phase descriptions below document earlier work and are not a list of missing features. The currently active development covers **Phases 9–10 on branch `phase9-booking-results-consolidation-2026-10-26` (PR #21)**; it has **not been merged or deployed**. Verify the latest branch and checks before further work. Do not reimplement completed systems from earlier handovers. Only change priorities with the owner's direction.

## Contracts and primary references

- [Original feature dependency audit, main](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling/blob/main/docs/PPW-FEATURE-DEPENDENCY-AUDIT.md) — §§9.1–9.12 describe the eventual living World.
- [Original navigation blueprint, main](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling/blob/main/docs/FUTURE-NAVIGATION-BLUEPRINT-2026-10-12.md) — task-first, bottom-navigation architecture.
- Original repository **main only**, never `alpha-1a`. The rebuild repository is the only writable game source.

TEW underneath, EWR on top; existing server-authoritative World state is the truth. One World Lock, no second clock, no attendance bonus for a human manager, no ownership or privacy bypass. Keep current gameplay and five-root bottom navigation. Neon usage must remain bounded: no speculative polling or full-World scans.

**Production guard:** preserve both managers, live World, cards, outcomes, contracts and history. Never reset or advance the live World, activate automatic World Lock, or deploy to Production without express permission. Development happens on a branch until release authorization.

## Phase 9 — 26 October 2026: Booker usability and public results (DEVELOPMENT ONLY)

Owner-approved direction: compact text-first draggable Edit Card entries with no large match/angle graphics; Results instead present verified wrestler portraits, labels and match outcomes. Established signed tag teams can be selected atomically for 2v2 booking and scripted together for a Face/Heel/Tweener turn; retain individual choices and the existing authored finish authority. The Road Agent's verified assessment belongs inside one post-show Management Brief alongside grounded decisions, not on a separate screen. Remove duplicate Home news shortcuts; preserve the dedicated Official and Dirt Sheets news desks and weekly awards, plus iPhone-first five-root bottom navigation. World completed-show viewing for fellow human managers is **results only after completion**; no private cards, editorial, backstage, staff notes, loans or crossover events.

**Implementation branch:** `phase9-booking-results-consolidation-2026-10-26`, draft PR #21. Gameplay changes, read-only rival completed-results view, revised tests and UI developed there. CI must be verified as a whole before any merge or Production release. No live World advance, reset, second deadline or World Lock cron. Legends roster remains subject to owner list approval; do not autonomously select or expand it.

### Phase 9 implementation checkpoint — 27 October 2026

**Implemented on the Phase 9 development branch (not Production):**
- Atomic tag-team selection and collective turns, compact Edit Card tickets, photographs on Results, and Road Agent commentary included in the post-show Management Brief.
- Injured participants retain human-readable Programme names; the Promotion drawer and angle authoring have been simplified; distinct World destinations and a dedicated two-desk News screen replaced duplicated Industry navigation.
- Fellow human managers may read **only certified completed public results**, with no private cards, booking, staff, contracts or Backstage information. No live spectator subsystem.
- Programme story progression from existing heat/results; nine employable departments including the owner-approved Talent Scout; bounded prospect recommendations; actionable, compact Staff Meeting agenda.
- Career-stage-specific private Backstage voices, with the stage fixed to the wrestler's career state **at request creation** so archived dialogue never changes when careers evolve.
- Existing saved World, user-authored results, two-manager privacy, manual World progression and deliberately extended test deadline are protected. One World Lock; automatic cron stays disabled.

**Owner decisions:** No player loans/excursions, no shared or cross-promotion events, no live spectating. The Legends catalogue may grow substantially, but the owner must **approve the complete inclusion list before any new Legend is created** and will provide the approved photographs. Do not add new Legends autonomously, manufacture portraits, or infer a numerical quota. Do not modify the extended booking deadline: the owner uses manual Advance Week for testing.

**Verification:** The previous Phase 9 checkpoint through `c9a4cbd` passed CI; later Career/Staff changes remain subject to fresh combined verification before any merge or deployment. Always review the latest actual CI status. The next high-value gameplay work is meaningful promotion identity, rival strategies, sustainable financial and regional competition, then tournament brackets, while avoiding redundant management or speculative micro-systems. Retain all previous implemented functionality.

### Phase 10 initial milestone — competitive booking and territories (27 October 2026)

**Implemented on the existing staged branch, not merged or deployed:**
- AI promotion identity is derived from its already-saved risk, match-quality and star preferences (workrate, spectacle, star power or story focus); player-controlled promotions have no enforced AI identity.
- AI has a deterministic, promotion-specific **13-week creative objective**: build credible emerging talent, develop rivalry-driven shows or present star-led headline matches. The chosen objective and signature match style materially influence generated regular cards, while major-event EPIC, actual title holders, validated programmes, wrestler availability, contracts and scripted World outcomes remain authoritative.
- The public Promotions directory describes the known AI creative tendency but never projects unreleased cards or exposes private negotiations.
- The owner's existing Business → Territories screen shows the strongest active rival's **recorded live-audience strength** in each market, and the gap against the owner's own recorded following. This uses the existing bounded three-query Business read and the already implemented same-market ticket-demand competition and loyalty settlement. No arbitrary financial bonuses/penalties or speculative territory currency.
- New domain, card-generator, public-directory and real PostgreSQL territory tests. The full rebuild workflow passed on commit `28144d8` (CI run 40497205612); no Production deployment.

**Not yet claimed or implemented:** emergent long-run player promotion style determined from certified match composition; broader strategic AI recruitment and cash discipline beyond the existing systems; deeper financial balance testing over long saves. These are future work, not labels to reimplement the milestone above.

**Owner boundaries remain unchanged:** no wrestler loans or excursions, no cross-promotion cards or agreements, no live spectator system; rival completed public Results only. Legends candidates require explicit owner approval and owner-supplied photographs. Booking deadline stays deliberately extended for manual playtest advancement. No cron, World mutation or Production deployment without instruction.

### Phase 10 second milestone — earned identity, sustainable AI recruitment and trading intelligence (27 October 2026)

**Verified gameplay checkpoint:** `93a0065eb7c72439d72b2ae6dd4469dfa2da2e52`. Both complete **Verify rebuild** workflows passed, including real disposable PostgreSQL, iPhone browser, unit and World regression checks: [run 40500375510](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40500375510), [run 40500382313](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40500382313). All work remains in PR #21, **not merged/deployed**.

- **Earned player promotion identity:** a factual, non-binding descriptor (workrate, spectacle, star showcases, storytelling or varied) inferred only from the existing last-twelve-show Business receipt query, matching completed/certified bouts to stored match intentions. A meaningful sample of **at least 6 classified completed matches across 3 completed shows** is required. No new SQL request, persisted identity currency, booking choice, restrictions, reputation bonuses or penalties. The result appears inside **Business → Standing**, not a new screen.
- **Business trading position:** displays real recurring surplus/shortfall alongside the average incremental cash contribution from up to four latest completed show receipts. This is historical evidence **not a forecast**; no invented profitability thresholds, revenue manipulation or new data reads.
- **Financially solvent AI roster development:** during the **existing World Lock only**, after the initial quarter and then at most once every 13 weeks, an AI promotion with genuine roster scarcity and adequate cash plus recurring surplus may sign **one** affordable unattached wrestler. Its persisted creative preference drives selection, with bounded candidates (256) and promotions (128). Contract IDs make same-week replays idempotent. Contracts are real eight-date, 26-week limited non-exclusive deals, so signed talent, finances and permissions remain canonical.
- **Safety/compatibility:** distressed AI emergency signings are unchanged; player-controlled promotions never sign automatically; no wrestler poaching; Legends must retain their full **human-first free-agent window**, confirmed by corrected eligibility comparison. No new scheduler, cron, additional World Lock, data migration or realtime polling. The legal one-submitted-weekly-show constraint is preserved; an initial fixture violation was corrected, not bypassed.
- **Testing:** new pure-domain identity and strategy tests, an expanded certified-three-show Business PostgreSQL test, and real healthy-AI hiring/replay/affordability tests. Existing mobile Business queries remain bounded to three reads.

**Future high-value work:** evaluate multi-season difficulty and finances with both owners and generated talent, refine AI decisions only from actual recurring evidence, and develop tournaments when appropriate. Do not make the above milestone a new task list. No loans, crossover cards, cross-promotion events or live spectator mode. Human managers may read only fellow players' completed public Results. Legends roster candidates and artwork require the owner's separate approval.

### Phase 10 long-run balance verification — 27 October 2026

**Verified development-only checkpoint:** commit `dc3b290d82aa3854759d0a48c771084df743d979`, workflow [40527088825](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40527088825) successful. New `tests/multi-season-balance-postgres.test.ts` is included in the standard disposable PostgreSQL CI suite, **not** run against Neon Production or the saved World.

**What the new controlled three-year stress test actually measures:**
- 156 consecutive weekly finance and survival settlements with **two human-controlled promotions and three AI rivals**, feeding deliberately constructed profit/loss scenarios into canonical ledger and finance classification.
- The solvent workrate and star-oriented AI rivals hire at most once every 13 weeks from legitimately unsigned candidates. A 27-week downturn blocks the star-oriented rival's recruiting, and subsequent profitable weeks permit it again; across all three years the fixture made 19 AI signings (11 workrate, 8 star-oriented). Signed people remain real `PROSPECT` workers with valid contracts, not invented potential scores.
- The distressed AI remains in the canonical CRISIS/survival rules; neither human manager loses ownership or has an automatic signing. A recurring-cost reconciliation fix includes **active staff salaries**, plus wrestler guarantees and overhead, when AI assesses signing affordability; salary-heavy firms no longer qualify merely because their bank balance is positive.
- At the measured quarterly recruitment checkpoint: **4 SQL queries, 78 result rows, 18,753 encoded result bytes**. This is a disposable-fixture query budget, **not** a claim about production monthly Neon transfer. No new scheduler, polling, materialised World blob, migration or cron.
- Pure original-market drift was exercised over 156 weeks: permanently exceptional vs permanently poor ticket/show results produced the expected boundary saturation by Year 1. **Follow-up design observation:** do not extrapolate those deliberately extreme conditions to real manager play. The original market formula is unchanged; investigate varied multi-season completed-show mixes before considering any diminishing-returns revision.

**Existing complementary coverage preserved, not rebuilt:** three-year genuine career retirement/prospect generation, 26 completed weeks of two human managers' authored winners, and 100-year indexed financial history checks. These independently test capabilities the new synthetic affordability fixture does not claim to replace.

**Remaining balance work:** larger varied certified-card scenarios with realistic show economics and organic AI rivalry, review whether territory ratings plateau under normal bookings, and check AI's long-term market and staff wage load at larger player counts. Prefer evidence-driven tuning to additional management screens or arbitrary financial penalties. All owner exclusions and Legends approval requirements remain in force; the code is staged on PR #21 and is not approved for Production.

### Phase 10 four-season territory-market diagnostic — 27 October 2026

**Test-only checkpoint:** `d6369afdb51837ac8ea3610f3c7fcad1fb19c9d5`; the full [Verify rebuild workflow 40541866972](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40541866972) passed. New automated `tests/market-seasonal-balance.test.ts` runs through the normal unit suite. **No gameplay formula changed** and no live World was queried, settled, deployed or mutated.

**Test method:** Four years (208 weekly shows **per promotion**) of varied match ratings, crowd reactions, regular/major shows, same-market rival schedules, actual original expected-demand calculation, same-market competition factor, original ticket prices, seeded deterministic original attendance/show settlement and original market drift. Promotion A has a lower-quality **entire second season**. Compare two venue choices: dynamically select the nearest adequate venue from a fixed 1,800–10,000-seat catalogue, versus a strict 3,500-seat maximum. This is a controlled modeled scenario, **not** imported actual certified cards and **not** a forecast or an assertion that all player bookings will behave this way.

**Measured results (promotion A / promotion B, live audience strength 0–100):**

| Venue policy | Year 1 | Year 2 | Year 4 | First reaches 100 |
| --- | --- | --- | --- | --- |
| Adaptively sized | 81.5 / 85.0 | 100 / 100 | 100 / 100 | Week 91 / 75 |
| Fixed 3,500-seat venue | 79.1 / 82.6 | 84.6 / 97.1 | 99.8 / 99.7 | Week 171 / 122 |

During promotion A's weaker Year 2, adaptive venues still yielded **39 rising, 0 falling and 13 flat weeks** of strength (compared with 25 rising, 12 falling and 15 flat under the seat limit). Adaptive scheduling produced effectively no Year-4 differentiation in `liveStrength`, even while awareness and loyalty remained distinct. Restricting capacity delays but does not eliminate upper-bound saturation. Year 4 adaptive average rivalry strength gap was 0.0 versus 0.4 under fixed capacity. These outcomes provide evidence that current reward for attendance is strong relative to negative creative response.

**Design recommendation, not approval for a formula rewrite:** Evaluate a bounded, original-compatible change that keeps successful crowd-drawing valuable, but gives persistently weaker match quality and negative fan response meaningful downside and preserves differentiation between promotions over years. Before deploying any formula change, compare existing extreme-case tests, this varied four-season fixture, tier differences, attendance/venue choices, shared-World fairness and downstream business/territory regression metrics. Do not silently change the formula or force predetermined results. Existing owners' exclusions and long-run Neon limits remain.

### Phase 10 quality-sensitive territorial strength — staged, not Production (27 October 2026)

**Reason for the change:** the original, preserved market function paid its full +1.1 strength attendance bonus for >=95% of expected demand, even when actual matches and crowd response were poor. The preceding 208-week controlled diagnostic demonstrated both rivals hitting 100 under adaptive venues and erasing useful long-run differentiation.

**Staged branch implementation:** `balancedMarketAfterEvent` is called exclusively from the existing World Lock market settlement; `originalMarketAfterEvent` stays untouched and directly tested for source parity. Above-zero attendance credit is scaled by actual certified match quality and crowd response. Exceptional wrestling still receives the full original credit. At liveStrength above 75, a bounded quadratic retention challenge (maximum 1.15 points per completed show) prevents average shows from permanently compounding a top-market reputation; it **does not** impose a ceiling on exceptional shows. Negative attendance effects remain intact. Original awareness, loyalty, competition, ticket yield, attendance, revenue, financial ledger and booking snapshots are unchanged. Both human and AI companies use the same rules. No new SQL, persistence field, jobs, cron or World reads.

**Modeled four-year comparison** (two competing companies, 208 weekly shows each; A has one weak season; seeded venue/ticket/competition and assorted quality):
 
| Venue policy | Original Year 4 A / B | Revised Year 4 A / B | Original A declining weeks in weak Year 2 | Revised A declining weeks in weak Year 2 |
| --- | --- | --- | --- | --- |
| Adaptive capacity | 100 / 100 | 93.9 / 92.0 | 0 | 28 |
| Fixed 3,500 seats | 99.8 / 99.7 | 85.3 / 83.5 | 12 | 28 |

After A's weak year it resumes growth when shows improve (adaptive 76.3 at end of Year 2 to 93.9 at Year 4; fixed 73.1 to 85.3). This compares **the same controlled scenarios**, not saved certified cards or a production forecast. Exactly the same seeded demand/attendance function is used in both policies. The stronger market's advantage is earned, not guaranteed. Baseline and revised functions are regression-tested together; the full CI and disposable PostgreSQL check remain release gates.

**Next evidence gate:** run longer realistic certified-show mixes and validate income, promotion-tier dynamics and large-population AI staffing before making stronger market or financial changes. In particular, do not create additional income sinks just to punish successful bookers. No merge, Production deployment, live World advancement, deadline change or cron is authorised.

### Phase 10 larger-World recruitment cost and authority gate — 27 October 2026

**New test-only coverage, no new game feature or World mutation:** a 12-promotion disposable-PostgreSQL World with two real human controllers, ten AI companies, 128 varied unsigned prospects, healthy and cash-poor firms, plus an otherwise profitable firm burdened by an expensive Road Agent. Three sequential quarterly recruitment windows and an immediate duplicate replay exercise the **existing** bounded strategic hiring path, actual signed contracts, candidate exclusivity, authentic salaries, fair AI creative preferences and human-manager protection. The staff-heavy firm is unable to hire until a real salary reduction restores surplus. No speculative AI income, fake roster scores, second scheduler or override of Legend release priority.

Recruitment SQL calls are metered at the first quarter and required to stay constant as the number of promotions grows; query results and generated contracts must remain bounded. This is not a 12-player live stress test, proof of monthly Neon usage or a realistic attendance forecast. The test is added to the standard real PostgreSQL suite and must pass along with full browser/unit verification.

### Phase 10 earned tournament heritage — staged, not Production

**Implementation scope (CI pending):** Tournament prestige is **display-only, earned and entirely evidence-derived**, not another numerical status, business modifier, currency or automatic scheduling mechanic. The owner-only Championships → Tournaments desk groups multiple editions by promotion-local normalized name and booking division. A cup earns `RETURNING CUP`, `ESTABLISHED TRADITION`, `ANNUAL FIXTURE` and `LONG-RUNNING CLASSIC` descriptions only from actual **completed tournaments in distinct in-game years**, with a three-year consecutive streak required before a cup is called annual. Multiple tournaments in one year cannot falsely establish a tradition. Cancelled or incomplete draws never count toward wins, years or accolades.

The visible record book displays verified winners, repeat cup holders, most recent final rating **only if immutable verified match facts are available**, and completed edition/year counts. History reads are **one promotion-scoped SQL query**, with existing owner/membership authorization, last 200 tournament records for evidence and last 20 browsable brackets; 201+ results are explicitly labelled as a partial archive, not all-time statistics. The 20-draw bug that previously refused to load old promotions is removed. Previous completed/cancelled brackets collapse by default on iPhone. The manager may `Plan another edition` with the historic name/division/draw size prefilled and last winner tentatively seeded **only if signed and eligible**; the player must still select the entire field and create/book all bouts manually. No changes to the World Lock, certified result settlement, revenue, AI, contracts, booking deadline, world ownership, cron or Neon polling.

**Regression gate:** pure heritage grouping/streak/winners tests, 320px/390px iPhone repeat-draw and archive tests, and real disposable PostgreSQL 200+ tournament history, cancelled-winner exclusion, auth isolation, and older 4/8 bracket compatibility. Do not call verified until the full combined suite passes. No Production deployment without the owner's separate approval.

**Next candidate after verification:** examine optional annual premium-event identity linked to genuinely repeated tournament finals and certified World News coverage, only if those materially improve the playing experience. This is not an authorization to auto-create shows or invent trophies/Legends.

### Phase 10 tournament expansion — four- and eight-person singles (development-only)

**Current staged scope:** Extend the verified first-class four-person tournament to a selected eight-person seeded draw using **the same** Championships workspace, ordinary six-week show planner and certified World Lock. New schema `0106_eight_person_tournaments.sql` adds only an entrants-count column with a default of four and extends the existing bout number bound to seven, preserving past three-bout records without a backfill.

- **Seed order:** 1 v 8, 4 v 5, 2 v 7, 3 v 6; quarterfinal winners 1+2 and 3+4 meet in semifinals, semifinal winners meet in the final. Both semifinal winners must be certified before the final unlocks; neither a drafted script nor unsaved edit advances the bracket.
- **Player control:** Choose four or eight contracted, same-division wrestlers in Championships. All bouts go on normal player-authored cards and use the same match and championship settlement. Vacant singles belt is an optional final prize. **Non-title final booking remains legal** (fixed a legacy null-vs-undefined mismatch). No automatic appointment, alternative outcomes, extra World Lock, polling, additional deadlines, event restrictions, loans or interpromotional shows.
- **Bounded storage/reads:** Seven fixture rows per eight-person tournament, the existing active-bracket cap, bounded 20-tournament history and one current-card read with at most four immediately eligible fixtures. No extra SQL on ordinary card opens/saves. Existing verified four-person behaviour must stay intact.
- **Verification gate:** include pure seeded-draw tests, 320px/390px authenticated mobile booking tests and a real disposable PostgreSQL quarterfinal → semifinal → final sequence, including non-title awards and certified winner integrity. Full existing suite must pass before claiming verified. The feature is *not Production-authorized*.
- **After this:** choose whether tag-team tournaments, AI-run competitions and the earned annual tournament/event tradition system materially improve play before expanding systems. Legends catalogue approval remains separately held by the owner.

### Phase 10 tournament bracket implementation — 27 October 2026 (development-only)

**The next milestone:** first-class four-person singles tournaments under the controlled promotion's existing Championships hub, using current cards and the single World Lock. The manager seeds four signed wrestlers (1 v 4, 2 v 3), with matching gender division; one active tournament per promotion. A vacant active singles title may optionally be selected as the final's real prize. A non-title tournament creates a historic winner, not an invented championship. No crossover entrants, shared shows or wrestler loans.

**Booking:** semifinals are booked on ordinary promotion shows via the new "Add tournament bout" action; no separate tournament show or deadline. A tournament bout stores an explicit round/fixture tag in the same validated match payload, reserves the fixture to one show, respects actual wrestler contract availability, and must match the two seeded entrants. Normal match finishes, scripted winner authority, creative consent and championship settlement remain intact. Brackets cannot progress by merely saving, previewing or editing a draft. The final opens only after *both certified semifinals* and uses their recorded actual winners; certification of the final finishes the tournament. Replay is covered by existing immutable completed-show World resolution. A card may be resaved without leaving orphaned fixture reservations. An owner may cancel a stalled tournament only after removing unfinished booked bouts, preserving certified results and allowing a fresh draw.

**User interface:** iPhone-first Championships → Tournaments, with a compact draw form, certified progression history and winner reveal; the Card Editor displays bookable bracket bouts but does not auto-book wrestlers behind the player's back. World rankings, secondary titles, tag-team tournaments, AI-generated tournaments and earned event traditions remain later extensions after the basic human four-person loop is verified. One active tournament at a time is a usability and query bound, not a permanent limitation.

**Validation / release gate:** `tests/tournament-bracket.test.ts` (pure semantics) and `tests/tournament-postgres.test.ts` (real disposable PostgreSQL: manager authorization, 4 licensed entrants, fixture reservation, certified semifinal advancement, final and idempotent rebooking). Schema `0105_promotion_tournaments.sql` runs **only in disposable CI** while on PR #21. Complete TypeScript, unit, mobile browser, PostgreSQL and multi-manager World regression before release. Never apply to live Neon, merge, deploy, alter the deadline or activate a cron without explicit approval.

## Phase 1 — Immediate UI and advance-booking polish (VERIFIED IN CI; COMBINED PLAYTEST RELEASE AUTHORISED)

1. Match/angle graphics remain automatically visible; markedly compress the default iPhone ticket, centre branding/logos, retain wrestler portraits/event identity and offer larger artwork on demand.
2. Staff selector must show **two readable columns on phones** for all eight departments. Maintain personality, dossier, contracting, renewal and buyout.
3. Verify venue and card creation/edit/save during the current week and six future weeks, persistence through advancement, saved valid submissions when a player misses World Lock, results handoff, revision conflicts, and independent manager isolation. Use disposable CI data only.
4. Regression 320px/390px iPhone navigation, keyboard and tap controls, scroll width, save controls and presentation.

**Baseline:** `f75361ca20d863b0a994df67a369d0a6eba69839` (previous Production release, authentic two-manager Genesis check passed before this work). **Development branch:** `phase1-iphone-polish-2026-10-24`. UI milestone `affc688910beb4589c1b499dc141645f83a6a014`, readability refinement `11e2cdde200c9e7389fe4a786cde2fcfc1e6fac5`, seven-week two-human PostgreSQL regression `53e7f26bedc8a16db5dd76495b0efd9180367f65`, and certified future-card preservation `bdb8b51442734c520edb0f09032e7e91445b40dc` are **verified together** by [CI run 40099023813](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40099023813): TypeScript and Vite build PASS; **105/105 browser tests**, **558 unit passes, 0 failures, 115 expected skips without disposable DB**, and **106/106 real PostgreSQL tests**. The DB suite includes saved valid unconfirmed cards being taken at the one World Lock, confirmed and changed-draft behaviour, 26 certified weeks with two human managers and authored winners, the new current-plus-six-week advance card/venue isolation test, and a Week 7 pre-authored result retained through six **real certified World publications**. This is CI verification, **not** live-device sign-off, new Production Genesis verification or permission to deploy.

## Phase 2 — Gorilla Position (PLAYTEST SCOPE IMPLEMENTED AND VERIFIED)

Reuse booking, appointed staff, weekly resolution and the one World Lock. A pre-show standing policy chooses **Stick to the card / Use judgement / Follow the crowd / Protect key plans**. Player-authored protected finishes, critical constraints and explicit alternatives are authoritative; handle genuine injury/unavailability, exceptional crowd response and severe time overruns with a legal decision set. A present human may author one of **the same** legal decisions a competent delegated staff member could select — never a superior option or modifier for being online. All unresolved decisions auto-resolve at the deadline; the World never waits or replays canonical outcomes. Persistent scoped post-show **Gorilla Log** records the incident, legal options, protection and decision rationale. First design the pre-lock vs resolution boundary; then implement end-to-end and validate two-manager concurrency and idempotency.

**Verified v1 milestone, development branch `phase2-gorilla-2026-10-24`:** `9f2895144170c13b8f330ef8e2094bd640f1b985`. [CI run 40101152270](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40101152270) passed TypeScript, Vite, **106/106** mobile Chromium tests, **561** unit passes, and **107/107** disposable real PostgreSQL tests with zero failures. Includes actual one-World-Lock PPV and regular-show resolution, two human manager privacy and policy replay checks, immutable winner/finish protection, independent AI promotion, and persisted single-owner show logs. One installed Road Agent with verified attributes may resolve a narrow crowd-reaction decision; only the show-level crowd recovery changes, capped at 1.0/100. The promotion controller authors policy **before** World Lock. The Results page displays the resulting owner-scoped Gorilla Log beside the existing Road Agent Report. No polling, second clock, online bonus or live World mutation.

**Verified complete playtest scope:** commit `d0b8170dbb5cd7bfdda0b209282826ab6e6454d6`. [Rebuild CI 40103811562](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40103811562) passed TypeScript, Vite, **107/107 mobile browser tests**, **563 passed unit tests with 117 expected no-database skips**, and **108/108 real disposable PostgreSQL tests**, with zero failures. [Authentic original Genesis verification 40103811489](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40103811489) passed. The standing instructions now connect to a second, private iPhone Gorilla clipboard: the controller can protect exact authored match scripts, pre-authorise conditional crowd and major-runtime-overrun alternatives, and view verified medical availability alerts. A saved decision is bound to the current card payload signature; edited cards lose stale authority automatically. The server checks the exact owner, active membership, World revision, show and one deadline. The true overrun uses recorded minutes **versus booked duration** rather than an arbitrary 45-minute threshold. Human/AI outcomes, scripted finishes, verified injuries, appearance rights, backstage dialogue, financial ledgers and World publication remain authoritative. Results show the immutable production log; no player must attend the resolution.

**Conservative limits retained for this release:** a wrestler who is medically unavailable must be rebooked through existing authoritative booking rules **before** World Lock; Gorilla warns but deliberately never invents a substitute, a new winner or an injury waiver. It is an asynchronous pre-authorisation and post-show production feature, **not** an online live-choice pause during certification, an emergency card rewriting engine or a second World clock. Deeper lawful substitute proposals and live spectator presentation can be considered later without disturbing this safe first complete scope. Phase 3 memory implementation has now been verified; production release is staged.

## Playtest feedback insertion — immediate defects and Results presentation

**Implementation completed and verified in CI by 25 October 2026; Production release staged.** See the detailed [playtest feedback roadmap](PPW-PLAYTEST-FEEDBACK-ROADMAP-2026-10-24.md) and its source-code audit, release criteria and preserved features.

**Stage A, ahead of Phase 3:** tag-team Form button and persistence; Backstage gimmick-button/touch styling; missing additional-dates acceptance/decline attention; match graphic portraits legible without expanding except dense fields; owner's My Champions roster section.

**Stage B, ahead of full Phase 3:** restore existing but inadvertently hidden Results highlight and Crowd Noise sections; redesign the show-first reading hierarchy; improve Groq's smark column, nonrepetition/evaluation and immutable preview workflow; remove mechanical score talk from all fan-facing prose; give named Road Agents a grounded human debrief.

**Place new depth without displacing existing dependencies:** Phase 3: differentiated Backstage requests and wrestler memories; Phase 4: complete EWR-style eight-department Staff Meetings plus owner-promotion rankings built from career evidence; Phase 5: explicit primary/secondary title roles **before** secondary title activation and organic title prestige; Phase 7: wider World rankings and long-lived public fan/press reactions. Phase 6 unchanged. AI-run rival promotions retain cheap minimal results; all title/ranking/social history derives from certified World facts.

## Phase 3 — Persistent memories and living-world depth

**Already foundational:** Backstage requests, relationship/trust consequences, promises, tag/rivalry pitches, persona carry-over, bounded historical Groq context. **To extend:** durable high-signal memories of honoured/broken promises, title chances, omissions, forced losses, injury support/treatment, contract conduct and promoter relationships. They explain and shape morale, negotiation, future requests and working relationships, with retention/decay rules. Scope private intent to the relevant promotion; public World history is separate.

## Phase 4 — Earned reputations and staff succession

**Already foundational:** appearances/match evidence, career progression/retirement trajectory, eight staffed departments, contracts, named characters, salaries, morale, simple buyouts/renewals, road-agent feedback. **To build:** verified-evidence-derived reputations like Big Match Performer and Tag Specialist, with thresholds and change over time; eligible retirees may enter the competitive staff market as agents/trainers/commentators etc., with competencies based on actual career evidence rather than celebrity auto-bonuses. Keep person identity/history continuous.

## Phase 5 — Organic prestige and traditions

**Already foundational:** championship prestige and lineages, recurring premium-event identity, calendars, teams/stables and Programmes. **To build:** earned prestige for long-running titles/events from canonical matches, headliners, significant moments, continuity/neglect; deeper faction competition and actual tournament structures when scheduling, title rights and history support them. Do not give arbitrary manual prestige boosts.

## Phase 6 — Commercial and international expansion

In dependency order: negotiable streaming/TV and sponsorship terms; campaigns and facilities; expanded academies; local market history and affinity. **Explicit exclusions:** no wrestler loans or excursions, no cross-promotion/joint shows. Existing promotions operate independently; preserve current contract and multiplayer rules. All must work fairly with both AI and humans, respect contracts, private booking, player ownership and scarce venues.

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
| Compact graphics/brand and staff grid | Verified in disposable CI; not deployed | `affc688910beb4589c1b499dc141645f83a6a014` + `11e2cdde200c9e7389fe4a786cde2fcfc1e6fac5`; [run 40099023813](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40099023813), 105/105 Chromium mobile browser tests (320px included) |
| Six-week booking across missed deadline and canonical results | Verified in disposable CI; not deployed | `53e7f26bedc8a16db5dd76495b0efd9180367f65`, 106/106 SQL tests, `prepared-show-postgres` for saved valid cards at Lock, `world-resolution-journey-postgres` for authored results, and `living-world-two-human-postgres` for certified 26-week progression. The advance-planner test exercises the bounded 7-week window; `bdb8b51442734c520edb0f09032e7e91445b40dc` additionally proves a separate advance-authored Week 7 card and scripted winner survive six genuine certified publications in a two-human World |
| Portrait catalogue expansion | Deliberately deferred | Preserve good current portraits; no new mass asset rollout in Phase 1 |
| Advanced medical treatment | Deliberately deferred | Preserve existing injury/recovery lifecycle |
| World Lock cron | Disabled / no authorization | Never activate during the rebuild |
| Production release | Held for user permission | No live advancement, reset, cron activation or deployment performed in Phase 1 |
| Phase 2 — Gorilla Position | Core playtest scope verified; release authorised | `d0b8170dbb5cd7bfdda0b209282826ab6e6454d6`; [run 40103811562](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/40103811562): 107 mobile browser, 563 unit, 108 PostgreSQL pass. Individual match clipboard, protected scripts, conditional crowd/timing choices, injury warning, private log and one-lock World path. No unsafe substitute rewrites |

### Continuation contract

After each substantial verified implementation, update this table with commit hash, Actions run and relevant test counts, identify known failures and the **next unfinished milestone**. Phase 1 and the safe Phase 2 Gorilla playtest implementation passed CI and received release authorisation on 24 October 2026. Verify the exact merged Production commit and Vercel deployment before calling the release live. Phase 5 organic prestige is the next separate unreleased gameplay phase; subsequent handovers must link this file and state actual branch/HEAD, CI and deployment state. Never invent a replacement roadmap.

## Release ledger — 25 October 2026

- Pre-Phase-5 release includes Results/UI feedback Stages A–B, Phase 3 private memories and Phase 4 reputations, Staff Meetings, rankings and succession. Phase 5 prestige is excluded.
- Phase 4 aggregate implementation verified at 5a0e990d6b6964d8e2965c120e3f3a79eff87bdb (114 mobile browser tests, 570 unit passes, 112 PostgreSQL tests).
- Migrations 0093 and 0094 rehearsed on a separate Neon live-World fork without changing people, promotion or Backstage request counts.
- Pre-release Neon snapshot preserved. Verify release main SHA, Actions and Vercel Production after actual deployment.
- World advancement, automatic lock cron and live reset are not part of this release.
