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
