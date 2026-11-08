# PPW — Live Delivery Plan

**Established:** 8 November 2026  
**Scope:** remaining PPW development after the Phases 38–44 release, including the pending Phase 45 release candidate.  
**Authority:** this file is the *current delivery and status register*. Older phase roadmaps and GitHub issues remain historical evidence, not automatically outstanding work. Match proposals to current code and tested behaviour before implementation.  
**Update rule:** revise this same document *as part of each completed milestone*, in the same pull request as that milestone's implementation, before reporting completion. Never silently move or delete a requirement. Preserve dated decisions and evidence links.

## 1. Non-negotiable product and release rules

1. Game name throughout the player experience: **PPW**, never “PPW Rebuild”. Use the exact owner-approved Phase 45 logos: cinematic showcase #1 for start/loading, compact #3 for the header, badge #4 for PWA; approved news/award graphics must be the shipped originals, not lookalike AI placeholders.
2. Keep the original wrestling simulation, scripted finishes, real wrestler identities/approved artwork, multiplayer fairness, World Lock authority, contractual rights, canonical results, title lineages, economy, career outcomes and persisted saved World. **Reuse and adapt the existing source.**
3. One shared World, two human managers supported, privacy and fair resource arbitration. The user remains the author of matches, angles and decisions. No Groq output may silently change official results, money, titles, contracts or private story facts.
4. Economical Neon Free operation: bounded indexed reads, projections reused across screens, no page-load polling, no binary poster storage in Neon; benchmark real two-manager usage, database compute and transfer. Do not assert Free-tier consumption is zero from an unavailable metric.
5. Existing Groq Free usage is bounded by the service budget, cached and failure-safe. No extra call per match, message, feed item, page visit or World Lock. **No OpenAI paid image API** is planned.
6. iPhone-first: validate 320px and 390px Safari/PWA, scroll recovery, keyboard and safe areas, readable text, touch targets and loading/error states. Keep interfaces concise, not instructional essays.
7. The **1,825-day advance booking window is intentional during testing**. Do not “fix” or shorten it without separate authorisation.
8. **No production merge/deployment, live Neon schema/data mutation, automatic advance or World Lock cron activation without explicit owner approval.** Cron activation requires its *own* separate authorisation even after all features are complete.
9. An implementation milestone means one **end-to-end playable feature** and connected regression tests, not a small isolated commit or cosmetic page. Group coherent changes, verify, then update this document.

## 2. Verified starting position and terminology

- Production base at plan creation: Phases 38–44, Git/main commit `0096d35de5ff6a2f0472a828093e780f709db397`. Current production deployment was verified in the prior release record; do not infer its current state indefinitely.
- Phase 45: PR [#84](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/pull/84), development head `2fe948d0cbbb7c84652a39a52367a9d7e91bcb88` before this documentation addition. Implements Business direct navigation, Home relevance, matching PPW art, approved Official News/Dirt Sheet/award assets and Planner→Commercials route. [CI run 42466940263](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/actions/runs/42466940263) passed: 277 browser cases, isolated PostgreSQL, and 52-week AI World. Exact final-head protected Preview/live iPhone inspection and production GO remain outstanding.
- Current source already includes: guided match/angle booking, canonical simulation and stipulated results, Programme history/creative/booking starters, private wrestler-driven Backstage pitches and memories, 9 staff roles with named voices, contract presets and forecasts, Ratings War and Commercials, PPV press, news/HOT TAG, tournament and championship creation, deterministic and bounded Groq editorial, 18 reusable CSS/SVG premium poster styles and the active 129-Legend catalogue. These are **foundations to integrate/improve**, not features to recreate.
- Current KP: `KP_WEEKLY_AWARD=100` and reusable `EVENT_POSTER_KP_PRICE=1250`; player-uploaded posters will cost **zero KP** and are separate from purchased skins.
- Old bugs documented as issues are *retest obligations*, not proof they still exist at this latest source: [Gunn future contracts #52](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/issues/52), [Undertaker/Riddle tournament–consent #53](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/issues/53), [AI inaugural belts #51](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/issues/51), [iPhone profile scroll #49](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/issues/49). The source now explicitly includes vacant AI championship booking candidates; actual outcome still requires lifecycle QA.

**Statuses:** PLANNED · ACTIVE · CODE COMPLETE · VERIFIED · RELEASED · BLOCKED · DEFERRED. “Verified” requires the milestone's own end-to-end acceptance tests, not merely code review. “Released” requires owner approval and confirmation of the expected production state. A milestone may be verified but not released.

## 3. Master milestone register

| ID | Milestone | Why it matters / delivered player outcome | Depends on | Status |
| --- | --- | --- | --- | --- |
| 45 | Finish current release gate | Unchanged playable World with correct PPW identity, useful Home and Business access | Phase 45 candidate | **VERIFIED CODE — RELEASE GATE OPEN** |
| 46 | Real player-journey integrity | Future contracts, tournament/creative consent, title settlement and mobile actions actually work together | 45 baseline | PLANNED |
| 47 | Living wrestler stories and Programmes | A wrestler's request can meaningfully progress from Backstage to booking and certified follow-through | 46 | PLANNED |
| 48 | Booking, staff and financial decisions | Useful in-flow staff advice and real show affordability without UI clutter | 46–47 | PLANNED |
| 49 | Contenders, championships and credible rival promotions | Earned title opportunities, meaningful divisions and sustainable AI title programmes | 46–48 | PLANNED |
| 50 | Living wrestling media and Groq refinement | Distinct journalism, truthful press reactions and evolving stories without excessive AI calls | 47, 49 | PLANNED |
| 51 | Commercials, Ratings War and economic competition | Network, sponsor and financial decisions react believably to performance and rivals | 48–50 | PLANNED |
| 52 | Player-uploaded PPV posters | Bring personally created artwork into the full PPV lifecycle, free, persistent and safely stored | 45, verified media/storage design | PLANNED |
| 53 | Wider industry and multi-season depth | Rankings, working agreements, loans/excursions, joint events, regional growth and long-run career balance | 49–51 | PLANNED; phase internally sequenced |
| 54 | World Updating and future scheduled operation | Truthful lock status and recoverable settlement, with cron still OFF unless separately authorised | real-world workload/operational tests | DEFERRED; **NOT AUTHORISED TO ACTIVATE** |

**Execution order:** 45 release gate → 46 → 47 → 48 → 49 → 50 → 51 → 52 → 53 → 54. Phase 52 is relatively self-contained and may be brought forward *only by recording an owner-approved reorder here*; no silent deviations. Testing and Neon efficiency are continuous across all phases, not deferred to Phase 54.

## 4. Milestone delivery specifications

### Phase 45 — Complete the current release decision

**Existing:** approved artwork, News/Dirt mastheads and award backgrounds, authenticated PPW header/loading treatment, new Business destinations, Home information hierarchy, Planner-to-Commercials route; integrated source CI green.

**Do:** match a protected Preview to the final commit and check actual visual output in Safari/PWA; inspect image cropping/legibility, mobile navigation, Home alerts, News/Dirt Sheets, award background and key business entry points. Reproduce the most serious historical booking regressions against the current code using disposable data. Check schema and live-save preservation plans if any SQL is needed; none is planned by Phase 45 itself.

**Why:** deployment should not introduce styling/identity regressions or hide a known booking failure behind cosmetic improvements.

**Pass:** final-head CI, screenshots and authenticated flow at 320/390, known regression outcomes documented, production and backup preflight, explicit owner production GO. No merge/production change before GO.

### Phase 46 — One trustworthy player journey

**Existing:** functional components for Roster, Market, contracts, Planner, booking, Programmes, consent, tournaments, show certification and Results.

**Build/change:** repair only demonstrated seams. Test accepted future renewals → correct availability in next-week card (including stale cached contract IDs); tournament slot with one participant in an unrelated feud → correct programme linking and safe *pre-save* creative approval, without bypassing FULL_APPROVAL; 2v2v2 and other titles → actual title eligibility/settlement; roster profile open, scroll and return; completed/abandoned cards, Back navigation, error recovery and double-submit idempotency. Resolve duplicate/stale Home decisions by authoritative source as needed.

**Why:** every sophisticated system is weakened when a common player journey can dead-end.

**Pass:** at least one real-data-shaped continuous journey from contract negotiation to booked weekly/PPV card to manually certified result and next-week eligibility; precise regression tests for issues #49/#51/#52/#53; two-manager privacy/conflict, 320/390 browser tests; no regressions to historical show receipts. No live World advance without approval.

### Phase 47 — Living wrestler intentions → Programme → booking → consequences

**Existing:** wrestler ambitions, certified relationship/morale memories, Backstage requests, rival/team pitches, Programmes, editable match/angle starters, storyline context and show/press fallout.

**Build/change:** define a small versioned *story spine* carrying initiator, motivation, target/opponent, relevant last certified event, proposed stakes, accepted/amended/declined decision and optional linked programme ID. Reuse authoritative existing memories/receipts and player-owned choice endpoints. Accepted pitches open a prefilled editable Programme or Who/What/Where/Why booking flow; they do **not** auto-book. Record certified actual delivery and unmet promises, offer genuinely different next chapters, and distinguish storyline hostility from real professional relationships. Preserve character and gimmick identity, team chemistry, consent and manager privacy.

**Why:** turn isolated dialogue, promos and matches into an unfolding wrestling story.

**Pass:** multi-week fixtures for a requested challenge, successful escalation, failed promise, feud payoff, alliance/turn, injury disrupting plans, and refusal; specific next-week advice must cite the correct certified event and never hallucinate an outcome. 320/390 flows and no per-pitch Neon query storms.

### Phase 48 — Better booking UI, staff and finance at the decision point

**Existing:** guided match/angle screens, selectable participants, contextual safety/medical/crew advice, staff meetings, preset/advanced contracts, cash and contingent appearance forecasts.

**Build/change:** deliver concise unified controls for wrestler choice/filters and match/angle parameters; remove redundant dropdowns, duplicated actions, unnecessary explanations, poor contrast or unreachable buttons. Surface named Road Agent/Medical/Creative guidance *only when applicable* to card composition (fatigue, chemistry, 30-minute interview, high-risk match, relationship, working time), with actionable alternatives and clear risk, never automatic creative restrictions. Show this actual card's pay-when-used appearances distinct from guaranteed wages; compare 4/8-week spending outlook using explicit assumptions, avoid double count. Connect Staff to the real edit/preflight action instead of another static advisory page.

**Why:** offer powerful options without turning the editor into a spreadsheet or a chain of vague warnings.

**Pass:** 320/390 one-handed real-device journey, multiple match types and 7+ angle categories; staff advice varies correctly across safe/risky examples; money recomputes once from already loaded context and matches show settlement; booking still succeeds with permissible manager overrides.

### Phase 49 — Contender credibility, championships, AI promotions

**Existing:** My Champions, championship creation, division and role, tournament draws, AI vacant-belt candidates and championship settlement, momentum/record histories, AI programme/booking engines.

**Build/change:** promotion-level recent-form contender lists by division and format (men's/women's singles and tag), using verified wins/losses, opposition quality, competition level and relevant championship record; no arbitrary popularity-only ranking or fabricated placements. Make ranking → possible title challenge/tournament → approved booking → title result → ranking update a complete flow. AI promotions book actual inaugural contests from vacant belts and then credible defenses, rotate contenders, maintain women/tag divisions and recruit/renew appropriately. Avoid AI pretending title holders exist before official settlement.

**Why:** championships and rival promotions should have competitive meaning beyond an inventory of belts and match ratings.

**Pass:** named champion/contender changes proven by sealed fixtures; tournament final creates only its legally defined prize opportunity; no title change before recorded result; 52-week World and targeted multi-season AI fixtures for challenger variety, financial survival and no vacant-title deadlock; two-player ownership checks.

### Phase 50 — Media, manager identity and economical Groq storytelling

**Existing:** PPV media scrum, certifiable player answers, public official/dirt-sheet news, HOT TAG, awards, post-show 20B short-form and 120B Ringside caching/fallback, staff voices and approved visual mastheads.

**Build/change:** let saved public manager identity, actual press answers and certified matches produce publication-specific Official News, speculative Dirt Sheets, recognisably different HOT TAG voices, concise Road Agent advice and meaningful follow-up for subsequent weeks. Explicitly distinguish declined, evasively answered, skipped and absent press interactions; never invent a quotation. Improve standard singles/tag/multi-person stipulation IQ and story continuity with typed canonical evidence rather than prompts alone. Reuse the same bounded factual evidence across outlets; one cached batch where appropriate, deterministic local alternatives, instrumentation and per-day/provider limits. Make Match and Angle of the Week art frame real dynamic award data and links.

**Why:** a living wrestling press must have memory, distinct viewpoints and no knowledge of private future cards.

**Pass:** fixed golden cases for Cage, I Quit, tag hot tags, decisive finishes, PPV no-comment, rival rumour and multi-week fallout; no invented injuries, stipulations, contracts, hidden plans or results; explicit Groq usage and fallback evidence; no fresh model call on reopen, tap, notification or AI-run show.

### Phase 51 — Connected finances, networks, sponsors and ratings rivalry

**Existing:** Business Finances/Commercials/Ratings War, broadcaster slot changes, exclusive network inventory, sponsor offers, contract economics, cash forecasting and yearly standings.

**Build/change:** make growth/decline in true certified ratings and PPV audience affect believable one-of-a-kind network and sponsor opportunities, contract review and renewals, day/time requests and competitive pressure. Define each partner's constraints and distinct written voice; rivals cannot occupy the same exclusive slot or network rights inconsistently. Surface guaranteed payroll vs discretionary appearance fees, projected deal income, event settlement, Accountant/Talent Manager Strict/Stable/Risky scenarios and suitable warnings. Do not invent pay-per-view buys for streaming-included events or double-post commercial income. Staff and Home link to exactly the actionable deal.

**Why:** commercial consequences should reward good booking while remaining legible and economically sustainable.

**Pass:** realistic week-by-week fixtures for competing broadcasters, sponsor replacement, network exclusivity, ratings improvements/falls, day changes, deal expiry and finance reconciliation; no false expired-contract notifications; no extra per-view SQL or silent World changes.

### Phase 52 — Free player-uploaded custom PPV poster

**Existing:** 18 animated reusable CSS/SVG poster themes, KP purchasing, owner-controlled PPV series, Planner/Calendar/Results and completed history. No paid image-generation service needed.

**Build/change:** a mobile-first **Custom Poster → Upload** choice on a specific event/edition (not just its repeating series); Photos/Files picker for JPG/PNG/WebP with optional iPhone HEIC conversion when supported, preview, non-destructive fit/reposition, replace/remove before certification and built-in poster fallback. Players may generate artwork themselves anywhere, including normal ChatGPT, and upload it for **0 KP**. Optional **Copy poster prompt** uses only manager-selected event name, promotion, featured wrestlers and visual direction. Never call OpenAI, expose private draft data to an external service or charge KP for an uploaded image.

**Storage/authority:** choose a real CDN/object storage provider after comparing available Vercel Blob/R2-like pricing and authenticated upload capabilities. Server issues short-lived authenticated upload authorisation; validate content signatures, size/dimensions and ownership; reject SVG/executable types, cap storage/version churn and generate one optimised display asset. **Store only the key/metadata in Neon, never binary images or large base64.** Identify by World + promotion + actual event occurrence/show ID (year/week identity before draft exists); protect against conflicting reschedules, two-manager overwrites and replays. Snapshot poster reference at completed-show certification; later yearly editions may use different art but published history stays unchanged. Reuse the same CDN image throughout Calendar, Planner, event, Results, news and archive; do not obscure authored image with duplicated mandatory text.

**Why:** personal creative freedom with negligible API expenditure and predictable low hosting cost, while keeping existing paid permanent skins worthwhile.

**Pass:** iPhone Photos/Files real tests, unsupported/oversized upload, server MIME-signature rejection, unauthorised rival upload, replace/removal, reschedule, failed upload rollback, correct certified archive, cache, 320/390 fitting and bandwidth cap. No OpenAI API key and no KP deduction.

### Phase 53 — Industry depth, multi-season consequences (sub-milestones)

**53A: World rankings and heritage.** Derive public World ranking/form/major-event reputation from actual cross-promotion certified results (separate from Phase 49 owner-promotion rankings), annual winners and World Moments. No private records leak. Test multi-year trends.

**53B: Working agreements, loans, excursions and development.** Extend existing working-relationship and market/contract systems with explicit negotiated rights, dates, permission, appearances, medical/workload checks, consequences and safe ownership. No involuntary player talent transfer; a loan is not a free contract rewrite. Test two-human conflict and finances.

**53C: Joint shows and market expansion.** Only after 53B rights exist: co-promoted/guest events with authoritative promoter/fee/venue/TV responsibilities, one official result and agreed credit, then targeted territory/international expansion. Separate user-visible choices from deep simulation. No accidental second World week.

**Why:** broaden long-term strategies without losing the simplicity of the immediate weekly booker experience.

**Pass:** separate end-to-end acceptances for A/B/C, 52-week plus longer-world evidence, correct financial settlement and title/contract permissions. Each sub-milestone gets its own status/evidence row before declaring Phase 53 done.

### Phase 54 — World Updating/recovery and future automation (hold)

**Existing:** one server-authoritative cutoff, OPEN→LOCKED→RESOLVING, checkpointed resolver, Manual Advance Week, recovery paths. No production cron.

**Build/change (authorisation needed):** trustworthy mobile states when booking closes, during genuine World resolution and when the new week is available. Light wrestling-themed progress/humour without Groq calls, false countdown or mandatory ten-minute pause. Bounded resumable/idempotent steps, stage-accurate privacy, lock/retry recovery and operational metrics. A nominal ten-minute window is a target, **never a forced delay**.

**Why:** eventually support a reliable shared-world rhythm without hurting a working playtest World.

**Pass:** deliberate interruption/retry, deadline fairness, two-human conflict resolution, production-safe recovery drills, realistic Vercel schedule constraints and full World simulation. **Deploying this UI does not grant permission to activate cron. Cron and automatic weekly progression remain OFF until an explicit separate owner GO.**

## 5. Cross-milestone validation gates

For every milestone's pull request:
- Specify exact original code paths reused; do not duplicate existing authority or create a second narrative/finance source of truth.
- Typecheck, build, relevant unit tests, authenticated browser smoke at 320 and 390 pixels, actual card/navigation error paths.
- Run disposable PostgreSQL with numbered migrations and transaction concurrency/rollback/idempotency tests when server behaviour changes.
- Run certified 52-week World regression when altering World settlement, AI booking, economy or contracts; add longer simulations for multi-season balancing claims, and label skipped gates honestly.
- Verify both managers' privacy, genuine rights and fair resource access; no automated World advance or mutation of production saves.
- Measure query count/read volume, relevant compute/transfer and external model/image-storage costs; preserve efficient caching and no polling.
- Confirm public text has no debug jargon, repeated empty advice, false press quotations or unsupported story facts.
- Document release boundary explicitly. A green PR is **not** a production release.

## 6. Delivery tracking: required update at the end of every milestone

Edit this file **before claiming a phase is finished**. A milestone report MUST state:

1. **Completed / changed:** exact player journeys delivered and original modules extended, with PR, commit and CI references.
2. **Verified:** specific browser/integration/World outcomes, widths, two-manager privacy, Groq/Neon/storage measurements, and tests *not run*.
3. **Not completed / residual defects:** any gap, playtest uncertainty, blocked dependency or deliberate deferment; never silently call it done.
4. **Release state:** development-only, verified, authorised and live are distinct. Record production SHA and date only after independent verification.
5. **Updated master table:** set that phase's precise status and update downstream scope/dependencies. New work must be incorporated into the right upcoming milestone with a reason and owner decision.
6. **Next action:** identify the next whole milestone and its acceptance gate. Don't stop after a trivial CI/commit checkpoint or treat a progress narration as completion.

### Standard user-facing milestone handover

**PPW Delivery Plan — Update N / date**  
**Completed:** [specific working functionality].  
**Tests & evidence:** [CI/browser/Postgres/long-run/actual device, failures or skips].  
**Still outstanding:** [remaining milestones + defects + dependencies].  
**Plan changes:** [added/removed/reordered items and why; owner decision if required].  
**Deployment:** [not deployed / approved and verified; cron always stated].  
**Next:** [the next complete milestone, scope and exit criteria].

Each future chat can read this document from the repository first rather than reconstructing our intentions from multiple conversations.

## 7. Baseline decision log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-11-08 | One maintained source-of-truth plan, progress register and dated completion reports | Prevent old roadmaps and interrupted sessions losing or duplicating approved work |
| 2026-11-08 | Link existing wrestler, Backstage, Programmes, booking, staff, finance, Results and press before building disconnected new menus | Most mechanical breadth already exists; player experience needs meaningful continuity |
| 2026-11-08 | Player uploads their own PPV image; **no OpenAI image-generation integration and no KP charge** | Users can generate poster art elsewhere; predictable low-cost PPW operation |
| 2026-11-08 | Preserve built-in paid permanent PPV skins alongside free event-specific image upload | Protect existing KP purchases and creative choice |
| 2026-11-08 | Phase 45 not merged/deployed without final QA and owner GO | Current production World and saved gameplay remain safe |
| 2026-11-08 | Keep 1,825-day test booking window and World Lock cron disabled | Explicit playtest constraint and release safety |

## 8. Current completion record

**08 Nov 2026 — Master delivery plan established.** Reconciled current source/PR #84 against old roadmaps; recorded verified code features, remaining integrations, historical bug retests, free poster-upload decision, milestones 45–54 and release/measurement gates. This record is **planning only**: no gameplay code, uploaded assets, Neon state, Vercel production, World progress, cron or OpenAI API changed.

**NEXT:** owner review of this complete plan. Phase 45 remains a separate pending release decision. No subsequent milestone should silently begin before the plan has been considered.
