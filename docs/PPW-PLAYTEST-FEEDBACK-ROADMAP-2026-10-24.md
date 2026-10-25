# PPW — Playtest feedback, presentation audit and roadmap placement

**24 October 2026 · Planning only · No gameplay implementation, DB writes or Production deployment.**
Source of truth is [PPW-MASTER-ROADMAP.md](PPW-MASTER-ROADMAP.md). This document is the accepted development *proposal* awaiting owner review, not evidence that any fix has shipped. Audit targets rebuild `main` at `52afec431c9c43735d37264ba886a089543853f8`; original feature contracts from original PPW `main` only (never alpha-1a).

## Why this pass is needed

**TEW underneath, EWR on top.** Users should feel like bookers reading wrestling media and consulting genuine colleagues, not like they are examining execution metrics or game formulae. The latest iPhone playtest describes dull Groq tone, overly mechanical Road Agent, crowded graphics, dysfunctional tag creation, repeated Backstage complaints, invisible date-offer decisions, missing staff conversations and champion/ranking opportunities. Do **not** recreate systems that already exist.

## Verified implementation audit (source, not inferred absence)

- `src/domain/ringside-editorial.ts`: a substantial fictional columnist persona, 1–2 paragraph limits, signature moves, historical callbacks, banned sim terms and nonrepetition guidelines already exist. `src/db/ringside-commentary.ts` adds owner settings, valid receipts and a versioned, immutable READY cache. **Changed instructions do not rewrite published READY reports.** Evaluate future prose using a safe preview against certified facts, not by repeatedly reopening old shows.
- `src/ui/show-results.ts`: a headline-highlight section and `showReactionWire(show)` are **constructed but omitted from the final `root.replaceChildren(...)`**. They are hidden by the render assembly, not unimplemented concepts. `src/domain/show-reaction-wire.ts` additionally leaks numeric crowd/star scores, says `protected finish` / `simulation`-like vocabulary, and offers formulaic fan opinions. Must correct the UI assembly and the entire fan-facing voice, not add a competing feed.
- Results begin with a giant numerical crowd hero and Crowd Flow before the actual journalistic recap; staff/Gorilla then compete with the card. `src/ui/show-results.css`, `src/ui/results-archive.ts`, `src/domain/show-result-colour.ts` and original `docs/SHOW-RESULTS-WAVE4A-PRESENTATION-AUDIT-2026-10-13.md` show the dependency and prior design intent: wrestling/broadcast first, manager analytics optional; finish replay is mandatory.
- `src/domain/road-agent-report.ts`: the show debrief is deterministically generated from hardcoded `Card N`, `execution score`, `chemistry modifier`, numerically rated phrases and generic recommendations. `src/db/road-agent-report.ts` persists a named employee's assessment; retain certified evidence and identity but replace the *language* and provide concrete, characterful human advice. Road Agent is **not** a second Ringside journalist.
- `src/ui/staff-desk.ts` / `src/db/staff-workspace.ts`: eight hired positions, personality, contracts, salaries, renew/buyout and a small `Talk to X` disclosure for *some* current notices already exist. A fully topic-driven eight-department EWR-style staff meeting with useful responses and actions does **not** yet exist. Original EWR reference: https://hoganreviews.co.uk/2022/01/12/extreme-warfare-revenge-pc-review/.
- `src/ui/card-editor.ts`, `src/ui/match-broadcast.ts`: inline graphics and separate expand/collapse control already exist. The wrestler/angle graphics should show **complete portraits by default**; remove the enlarge toggle for ordinary singles, tags and small angles if all portraits fit after text compression, and keep an optional deeper lineup when the verified participants cannot fit (trios/large teams/battle royals). Preserve booking-edit expansion *separately*.
- `src/ui/persona-desk.css` has multiple late `!important` override blocks for chat tabs, buttons and dark/light styling. The gimmick selector is a long variable-height list (`src/ui/persona-desk.ts`). Audit 320/390px touch reachability, selected indication and a stable `Suggest gimmick` primary action. No sounds/haptics.
- `src/domain/backstage-conversations.ts` already has nine structural request types, but fixed templates (some reveal numeric scores), and `src/db/backstage-conversations.ts` chooses the same high-priority eligible type by CASE each week, one request per promotion/week. Expand **evidence-led eligibility, message variety and nonrepeat selection**, not random ungrounded chatter. Ties to Phase 3 memory/promises.
- `src/db/contract-date-decisions.ts`: accepted additional dates really update entitlement, and an event is written only when extra payment > 0. `src/db/contract-desk-workspace.ts` only returns **pending** date requests plus recent contract offers; `src/db/player-world-overview.ts` announces regular contract offer decisions but not settled additional-date requests. Provide durable owner-only ACCEPTED/REJECTED extra-date notice, amount/date delta, timestamp/week and contract link, once/dismissible, including zero-payment acceptance.
- `src/ui/tag-team-desk.ts` does render a `Form team` command, but **after up to 35 large wrestler-card choices** (the list has a 410px scroll cap). Audit action discoverability, ability to enable it and whether the authenticated mutation succeeds, especially for a 320px keyboard/touch viewport. The actual `src/db/tag-team-workspace.ts` creation and persistent World team/chemistry are implemented; do **not** recreate them. Include saved/reloaded team, uniqueness, division and two-player privacy tests.
- `src/ui/roster-market.ts` has Singles/Tag Teams/Stables navigation, not an owner-only champions area. `src/ui/championship-desk.ts` is a World-wide public directory, with a `viewerPromotionId` distinction. Add a **My Champions** section or entry filtered by promotion on My Roster, reusing existing active reigns and bios; retain the World history directory.
- `src/db/championship-history.ts` exposes title `division` (SINGLES/TAG) and `prestige`, but no formal `PRIMARY/SECONDARY` role. Original original-main `docs/PPW-FEATURE-DEPENDENCY-AUDIT.md` §3 warns that AI and automatic setup frequently assume one singles and one tag belt per division. **Do not** make a secondary title just by editing its name.
- Current product has no designated comprehensive wrestler **promotion and World rankings**. Separate win/loss records, wrestler ability, crowd response, momentum, competition level and champions; rankings should derive from verified history and published scope, not a popularity-only table or hidden private booking.

## Binding delivery order

### Stage A — Immediate playtest remediation (before Phase 3)

A1. Confirm and fix tag-team `Form team` reachability and successful World persistence. Keep the submit control next to the selected pair (sticky only if iPhone keyboard-safe). Verify newly created team appears in the actual roster, booking picker and subsequent weeks. **Blocker**.
A2. Fix Backstage gimmick controls/lighting, overlapping styles and 320/390px layout. Separate proposal actions from chat reply controls. **Visible usability defect**.
A3. Surface *additional-date* ACCEPTED/REJECTED decisions on Home attention and Contract Desk using durable owner-scoped notifications, with a direct link to the affected deal and dismissal; no duplicate announcements when revisiting. **Missing player feedback**.
A4. Make normal match/angle graphics fully legible **without an extra expand tap**, provided their portrait count fits; dense formats alone retain a more-information control. Preserve the compact graphic, portrait scale, main-event distinction and independent editor-detail controls.
A5. Expose My Champions on My Roster as a scoped view of real belts and titleholders, **not** new title logic.
**Gate:** tested on 320px and 390px PWA, controls never obscured by nav/keyboard, no broken editing flows, two-player access control, no new periodic Neon reads.

### Stage B — PPW Results & editorial presentation pass (after Stage A; before full Phase 3)

B1. Repair Highlights and Crowd Noise not actually being rendered, with factual headline priority and tap-to-open relevant match/angle. Put the **show headline and a lead wrestling moment ahead of analytics**. Keep live title changes/turns/injuries, stars and finish replay obvious; crowd flow, detailed ratings and finance are explicitly optional manager analysis.
B2. Groq columnist: smark reporter voice with actual wrestling terminology, occasional earned humour/sass, **no mechanics/numeric crowd scores in prose**. Test variety across multiple differently rated shows, matches, angles, wrestlers and repeat articles; check for repetitive templates, duplicate endings, nonsensical moves, history hallucinations. Change the *input selection and writing evaluation* as well as the prompt, not only wording. One factual receipt drives everything and a published story remains frozen. Use operator preview (or an editorial test harness) with no published result rewrite. Cache/version changes explicit and bounded, with no extra model call for every fan reaction.
B3. Fan reactions: rename/refine `The Noise After the Bell` into a clearly **fictional in-World fan/social commentary** presentation. Distinct voices (excited fan, sceptical smark, fan of the heel, sceptical rival, critic), 3–5 contrasting *short* reactions grounded in specific certified moments. No actual-platform impersonation or real accounts; avoid pretending sourced posts. No stat talk, no duplicate posts, no spoilers of unrevealed booking, no endless thread generation. Click through to the exact moment. Longer-lived fan narratives may follow in Phase 7.
B4. Road Agent: true signed human debrief by employee, identifying one genuinely strong match/segment, one actual concern and a **specific actionable suggestion**, with personality changes affecting tone, not factual recommendations. Critique uses verified evidence and can show advanced measurements under an optional "Why?" drawer, never a public-style commentator article; when no concerns, allow brief "nothing to fix" rather than inventing criticism. Preserve author name at show time.
**Gate:** Golden certified fixtures/owner-view privacy, winners/finishes/title/injuries never altered; show quality varies naturally, reports use at most the agreed Groq budget; accessibility, portrait layout and editor/history routes remain intact.

### Phase 3 — Persistent memories & real Backstage variety (existing original phase)

Build the already-approved durable trust/promises/omissions/history foundation. Then broaden authentic private wrestler requests: preferred opponent/team, more in-ring time, title shot, character/repackage, frustration at losses, contract treatment, overlooked programme, challenge to another wrestler, medical support, creative usage. Weighted by **actual individual context**, preference and prior conversations; bounded frequency and avoidance of repeated type/speaker; no universal random promo-time request and no unsupported kayfabe events. Preserve decision consequences and private scope. Richer in-World fan context can use these memories only when details are publicly knowable.

### Phase 4 — Earned reputations **and EWR-style Staff Meetings** (existing original phase enhanced)

After Phase 3 yields authentic histories, make Staff Office meetings useful rather than eight decorative biographies. EWR-style named departmental topics/actions from all eight roles: Talent Manager (contract risk/options), Creative (Programmes and stale angles), Road Agent (match structure and working chemistry), Medical (actual availability/recovery), Scout (bounded uncertainty/rising prospects), Trainer (fatigue/development), Commentator (presentation/readability), Referee (complex bout risk and rule enforcement). Exact role labels to match the actual installed `STAFF_ROLES`. Named characters can disagree modestly and speak in natural concise dialogue. **Never** allow conversation alone to change an authored card, or grant staff omniscience about rival contracts. Show advice only when grounded, linked and actionable. Integrate earned wrestler reputations and staff succession already in Phase 4.

Start **promotion-only competitive rankings** here once verified career/match evidence is sufficient: separate men's/women's singles and tag standings where applicable, recent/form vs career distinctions, earned movement and next-title-challenger context. Show how movement arose from real results, not invisible leaderboard buffs. Champions have a titleholder distinction rather than automatically occupying every #1 contender slot. Keep a stable low-read projection reused on roster/champions/booking.

### Phase 5 — Secondary championships, then earned prestige/traditions (existing original phase amended)

**Before** new title creation, add an explicit championship role/level (primary singles, secondary singles, tag, specialty if later needed), identity, division, holder and lineage checks. Secondary singles belt (Intercontinental/TV-style) should be meaningfully lower-status initially; eligibility, defenses, title match booking, AI plans, role-specific prestige growth and show prominence must reflect that hierarchy. Allow the owner to activate/name a belt with guarded limits and canonical inaugural title assignment. Do not accidentally create duplicate world titles or write off previous reigns. Only after title-role semantics settle should organic title/event prestige and tournaments deepen.

### Phase 6 — Business and international expansion

No reordering: negotiated media/sponsorship, training/campaigns, loans/excursions, working agreements, joint shows and regional market affinity remain the established dependency pipeline.

### Phase 7 — World rankings, public press history and long-term fandom

Build **World** rankings from enough cross-promotion historic evidence (separate public division/format as appropriate, time-windowed trends, major-event calibre), contrasting with Phase 4 promotion rankings and avoiding private owner-only data. Expand fan reactions into durable public press/headlines, year-end awards and earned legacy milestones only from canonical facts. An in-app social-feed aesthetic must never represent fabricated messages as real posts or create an extra World turn/clock.

## Cross-cutting release conditions

- No broad wrestler portrait rollout, medical rewrite, automatic World Lock/cron, second World deadline, AI editorial on AI-run promotions, simulated score language in wrestling-world media, or reruns of published shows.
- One iPhone-first five-root bottom nav; Backstage keeps its own Messages-style Back navigation. No audio/haptic. Preserve matched real wrestler names, show graphics and valid portraits.
- Respect World ownership/private results; no hidden rival card/contracts/facts in public rankings or fictional fan posts.
- No speculative polling or unbounded scans; reuse existing owner-scoped result and history projections; limited Groq calls per completed human-run show.
- Regression criteria for **every** stage: actual signed-in iPhone flows, DOM screenshot at 320px/390px, real disposable PostgreSQL fixture, World Lock/retry, two-controller isolation, existing future cards and published match outcomes.
- Document and verify fixed items before scheduling a recreation; keep a single source of truth in this roadmap.

## External references (concepts to reinterpret, never blindly copy)

- EWR Staff Meeting screenshot and game overview: https://hoganreviews.co.uk/2022/01/12/extreme-warfare-revenge-pc-review/
- TEW 2020 match descriptions and road agent roles: https://tew2020.fandom.com/wiki/Booking_And_Running_Shows
- TEW 2020 critique of overly dense/non-immersive numeric results presentation: https://gmgames.org/total-extreme-wrestling-2020-tew2020/review/
- 2026 All Your Wrestling show-report update on actionable reports: https://steamdb.info/patchnotes/25286474/
