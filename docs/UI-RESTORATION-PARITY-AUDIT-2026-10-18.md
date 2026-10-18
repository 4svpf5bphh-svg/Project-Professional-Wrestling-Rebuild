# PPW original → rebuild: screen and workflow parity audit
Source baseline: original repo **main** (18 October 2026), rebuild **main** (tracked through the latest restored screens and corresponding test evidence). Results excluded by explicit instruction.

Legend: **Restored** implemented, **Partial** important work remains, **Retain** a deliberate rebuild improvement, **Gap** not recreated. The original was inspected as gameplay evidence, not a mandate to copy obsolete architecture.

| Screen/workflow | Original behaviour confirmed in source | Rebuild state and action |
|---|---|---|
| World/Home | Promotion identity including home territory, attention items, readiness, weekly clock. Original has **two** World deadlines. | **Partial:** single World Lock remains intentionally (**Retain**); economy/clock present. Home market restored with existing 1-query projection. Home attention and readiness are restored using the existing bounded overview; targeted person-level deep links remain a gap. |
| Planner/show planning | Six-week timeline, show details/participants, market analysis (audience awareness, loyalty, rival presence, venue availability), card-edit flow. | **Partial:** six-week calendar and show editing exist; home territory and market-by-market venue chooser/awareness/live strength/loyalty restored from *existing* Planner payload. Strongest active local rival, live-show strength, audience potential, wrestling interest and spending power now come from the **existing four-query Planner**. Venue contention **restored** with anonymous, six-week provisional rival venue counts, live day/building alternatives and at-a-glance risk on existing shows. The original four-query, bounded Planner read does not expose rival cards or guarantee priority. |
| Calendar | Create/edit/archive recurring series; flagship/secondary/special/PPV roles, all-world calendar and big-event filtering. | **Mostly present:** recurrence editor, PPV and World filters. Needs polish and side-by-side recurrence and role validation. |
| Card Editor / booking | Authored outcomes, multi-sided participant slots, running order, style/finish/warnings, wrestler selector, segments. | **Partial:** broader match types and server-authoritative match booking retained; compact 40-keyset wrestler picker now uses shared quick-view wrestler cards with ratings, character and contract eligibility; open complete profile without abandoning card. Seven existing angle families now offer original-main detailed on-screen direction: promos, interviews, celebrations, confrontations, challenges, assaults and contract signings. Typed choices survive Card Editor saves and canonical resolution without further SQL; legacy generic scenes remain generic. Still missing original match-linked assaults and rescue types and richer match-consent affordances. |
| Roster / Talent Market | Role ordering, contract filters, sorting, availability, public and private metrics, wrestler expand/roster management, offers. | **Partial:** server-side roster/market filters, interest, payroll/date/appearance-fee sorting and original in-ring attribute threshold restored within two indexed directory reads. Shared wrestler card restored, plus full on-demand profile. Shared silhouette and ability-band identity cards and relationship/badge presentation are restored; real portrait media remains **Gap**. Roster now has Singles, Tag Teams and Stables departments, with Trios honestly disabled until available. |
| Wrestler profile | Character, skills, status, booking history, career, relationships, contract and affiliations. | **Partial:** authorised single-person dossier now includes ratings, portable persona, repertoire, active contracts (private salary only yours), alliances, relationships and persona eras. Restored edit of move names and style only on current roster with server rights, no unilateral change when another human controls the shared person. **Verified career scoreboard, recent matches, injuries and singles championship honours restored as a separate three-query on-demand read**; portrait media and richer historic archives remain **Gap**. |
| Contracts | Separate offer/renewals/date expansion workflow, expiration guidance, trusted roster links. | **Mostly present** in rebuild Contracts Desk; Home alerts now open **expiring contracts** or **pending negotiations** directly through safe URL routes, reusing the existing Contracts query. Archived offer outcomes and finer wrestler-specific notices remain **Gap**. |
| Backstage | Programme/story pitches, wrestler concern/proposal replies and conversations. | **Partial:** server-authoritative 30-message bounded conversations, read/archive, role pitches and mobile messenger visual already in rebuild. independent iPhone-style full-screen inbox and conversations, contextual reply choices and no-query local filters restored; shared wrestler dossiers now open from Backstage on demand; contextual notifications still require review. |
| Business | Home market, recurring cash lines, four-week actuals, company standing, recent shows, ledger drilldown. | **Partial:** business finances, runway and local territories exist; comparison for missing standing/economics depth remains. Don't touch Results presentation while restoring links. |
| Staff | Talent Manager hiring, releasing and manual renewal approvals. | **Restored:** Talent Manager recruitment, dismissal, salary and explicit renewals now use narrow, authorised database commands and the existing payroll settlement; emergency show cover remains. |
| Industry | Promotion tier/rank, rosters and featured wrestlers, championships, recent events and public privacy rules. | **Partial:** public promotion standings and broadcasts retained, with source-based tier/search filters and stronger public promotion identity cards. A rival promotion's top eight signed wrestlers now load only on deliberate expansion, with a cached two-query public projection and universal wrestler dossiers; private salary remains sealed. Never expose rivals' private contracts. |
| Championships | Singles and tag World lineage with active/inactive, holders and reign history. | **Mostly present:** bounded active and historic title queries, timeline view and filters. Premium title cards and lineage display now restored with cross-links to the shared wrestler profile. |
| Programmes | Active story line, heat/counters, sides and teams, linked championship, create/end programme and follow-up. | **Mostly present:** current heat/repetition, team participant inputs and programme resolution are in rebuild; premium feud scoreboards, heat/repetition visuals, participant conflict prevention across teams and age cues restored; post-show creative follow-up is saved and shown in Programmes and now carried into the booking card as read-only rivalry direction (no new API read). Active wrestler names now open the shared dossier without losing Programme selections. |
| Navigation/notifications | Drawer and sections plus notification items/deep links, pending actions and context. | **Improved:** five departmental drawers are opened from a **single header Menu**, with no permanent bottom dock, Escape/focus handling and iPhone scroll safety. Home → Contracts queue-specific deep links now work. Resolved contract updates have cross-device owner-scoped dismissal and now open the exact wrestler dossier on demand, returning to Home without losing the desk or refetching. Home now shows named pending wrestler concerns from the existing one-query overview. Resolved contract news still has cross-device owner-scoped dismissal; actionable locker-room concerns deliberately remain until answered. Other historical news types remain a **Gap**. |
| Results | Explicitly excluded. | **Do not modify.** |

## Neon and multiplayer invariants
- Keep one World Lock; no background polling for UI, no production deployment, no activation of scheduled resolution.
- No global JSON world hydration, whole-roster response, monolithic save or per-card profile queries.
- Quick wrestler summaries reuse narrow paginated roster and booking payloads (25 or 40 at a time).
- Expanded profile reads only when explicitly opened, is person-keyed and actor authorised; mutations revalidate controller, active contract, other human employer and revision server-side.
- Existing identity guide remains static build content rather than Neon blobs. Display-time portraits should be locally optimised static references, not fetched from DB.
- Separate Neon billing test branches and GitHub cost probe must not be modified or merged.

## Next implementation groups
1. Finish wrestler quick-view/expanded profile and booking mobile/browser integration, ensure PostgreSQL budgets and end-to-end tests pass.
2. Restore Home attention/readiness and Planner competitor/venue risk context using preexisting public data, adding only narrow bounded reads where necessary.
3. Finish high-trust Contracts and Staff recruitment flows, confirm all event/offer dismissals and deep-links.
4. Build Backstage as a fully separated iOS messenger context, then enrich Industry/championship presentation and notifications.
5. Verify iPhone Safari/PWA touch, safe areas, scroll traps, form zoom, privacy and international wrestling roster completeness.

Original screen decisions are restored by functionality, not by reinstating older two-clock logic or the original costly persistence model.

## Verified restoration milestones (18 October 2026)
- Original source reference is **original repository main exclusively**, not alpha-1a.
- Rebuild Directory, booking picker, on-demand wrestler dossier, full match-career drilldown, Home attention/readiness, Planner territory, Backstage messenger, Contracts renewals, Industry search, championship presentation and Programme scoreboards have received substantial integrated restorations.
- Career drilldown adds zero SQL to ordinary mobile sessions; it reads exactly one person on deliberate expansion, with bounded result rows and PostgreSQL budget assertions.
- Remaining high-priority feature work: cross-device dismissible notification history, original controversy-specific Programme post-show follow-ups (without changing Results), real licensed wrestler portraits and extra career archives, original venue contention guidance, and final iPhone/PWA playtesting.
- Results presentation and simulation remain untouched, as required.

## Identity and writing parity (18 October)
- All player-facing descriptions are written in the voice of a wrestling promotion, without explaining PPW simulation internals or referring to "PPW weeks" or "World resolution".
- Wrestler dossiers now open on demand from bookings, the Roster, Talent Market, championships, Programmes, Contracts, Backstage, tag teams, stables and professional connections; no extra list-rendering queries are introduced.
- The original **main** remains the exclusive reference. Results, original databases, scheduled World Lock and isolated Neon cost-testing branches remain untouched.

- **Industry:** each public promotion can now reveal up to eight prominently booked wrestlers using an explicitly opened, cached, two-query roster view. No salaries, private offers or card plans are included; each wrestler opens the common dossier. No additional Industry queries occur before opening the promotion.

## Restored and verified after initial source comparison

- The original **main** is the only source reference. Results source and UI remain untouched.
- Planner reveals home and rival territory strengths, audience potential, interest and spending indicators through the existing four SQL reads; the disposable PostgreSQL budget test proves the query count and bounded result transfer.
- Home alerts deep-link into exact Contracts queues using allowlisted routes (`#/contracts/expiring` and `#/contracts/pending`), without putting player or wrestler IDs in a URL. Browser tests prove no additional API request.
- The navigation dock was removed. A single header menu opens five drawer departments, supports compact iPhone safe areas and keyboard focus, and never fetches data simply to open the menu.
- Roster has distinct Singles, Tag Team and Stables paths and a disabled future Trios entry. The Tag Team partner picker reuses universal wrestler cards, limits DOM rendering to 35 at a time, filters division locally and prevents mixed-division pairs before submission.
- Wrestler dossiers open as true overlays from Roster, preserving search, current page, expanded cards and scroll position; closing them performs **no new directory request**.
- Targeted Playwright and PostgreSQL regression tests cover the restored journeys. The relevant main-branch CI checks were green through commit `81b0c15bed953ab6d5165c35894bd179ca02428a`.
- Existing unauthorised actions, World Lock rules, security checks, user-authored winners and original Neon cost-probe branches remain unchanged.

## Booking-screen parity restored in the latest development group

- The original `main` match-style simulation already existed in the rebuild, but its six UI controls had disappeared. Restored **competition, technical wrestling, storytelling, intensity, risk and spectacle** to singles booking, with existing original workload calculations and explicit player choice. Unsupported multi-team and battle-royal style controls remain unavailable rather than silently saving invalid cards.
- Angle booking has regained **creative direction → angle type**: Character, Rivalry, Challenge, Alliances, Arrival and Video group the exact segment kinds currently supported by the rebuild. Descriptions explain the wrestling story rather than its software implementation. Specific unsupported original segment subtypes are still parity gaps; no fictional choices are presented.
- Match and angle cards now display **casting readiness** before save, explaining missing performers, targets and faction decisions. This is a client preflight; the existing authoritative save remains responsible for contract, division and title checks.
- Restored performer-first collapsed card summaries. Matches display the named competitors and their planned duration/finish; angles identify the featured wrestlers. These are rendered from the Card Editor's already-loaded selections and do not request another wrestler profile.
- Match-style panels retain their open state while the booker adjusts sliders, avoiding repeat expansion on iPhone.
- No additional SQL was added for these booking presentation restorations. The normal card and wrestler picker transfer budgets remain as before.
- **Still outstanding:** original `main` live interference controls, the deeper specialised segment objectives and deliveries, match-by-match performance-readiness consent, richer post-show Programme feedback, real portrait assets with permissible licensing, and fully integrated iPhone playtesting. Restoring these requires confirming their associated authoritative rules, not merely redrawing control labels.


## Calendar recurrence restoration — source comparison to original main
- **Restored:** add/edit has broadcast-friendly weekly, alternate-week, four-week, quarterly, twice-yearly and annual presets. The same authoritative recurrence and collision rules now validate the form *before* saving.
- **Restored:** clear one-based annual show week and immediate next four appearances, including rollover to Year 2, shown without a network call or synthetic future events.
- **Prevented:** accidental overlapping normal broadcasts or simultaneous premium events produce a warning and disable Save; server validation still determines the final outcome.
- **Verified:** pure recurrence tests and iPhone browser test cover conflicting PPVs, switching cadence, annual continuity and exactly one save request.
- **Remaining:** original's venue/contention warning and wrestler reservation details require careful rights checks. The Results screen remains excluded, as do production deployment and any Neon-cost test branch.

## Venue contention and show-day guidance (18 October 2026)
- Venue choices now flag the number of other promotions provisionally intending to run in the same building on the same day, across the current six-week window. No rival identities, performer bookings or private card details are disclosed.
- On iPhone the chosen day and venue react immediately, with safer day and local venue shortcuts. Already-planned shows also show a conflict alert. These alerts are advisory: booking order conveys no priority and authoritative World arbitration is unchanged.
- The Planner retains **four** SQL reads: an anonymous, bounded 129-row venue contention aggregate is projected only once inside the existing venue query, capped at 128 entries, with a measured transfer ceiling of 24 KB in the disposable PostgreSQL test. No polling, per-venue queries, or persistent snapshots.
- Original reference: `main` only. Results, World Lock, production hosting and the isolated Neon measurement branches remain untouched.

## Creative continuity back inside the booking card (18 October 2026)
- Original `main` post-show follow-up intents—rematch, retaliation or leaving the result standing—are now projected inside the existing active-Programme query at booking time.
- The Card Editor displays the latest choice under a collapsed rivalry-brief section and beside any directly linked angle. An intervening performed beat suppresses stale advice.
- Promoters still author participants, match winners, finishes and scripted angle outcomes. No automatic booking, polling, extra Card Editor SQL command, or Results changes.
- Mobile Browser regression now also checks contested-venue guidance, selecting a different building, saved venue/day and the exact Planner request sequence.

## Specialist angle direction — original main (restoration)
- Restored purpose for promos; setting, topic and response for interviews; occasion and closing beat for celebrations; face-off ending; challenge answer; attack presentation and motivation; and televised contract-signing outcome.
- Existing segment families store an optional `creativeBeat` object inside the already-saved card slot JSON. Authoritative server and World-resolution validation reject mismatched families and forged/extra fields. Old generic segments remain as booked.
- The iPhone sheet offers detailed or simple direction without leaving the card. Summaries display authored details in the running order. The score and scripted outcome are not changed automatically; no additional Neon query, global state hydration, Results change or cron.
- A verified actual-victory celebration, match-linked post-match assault and rescue remain outstanding until their necessary factual evidence and participant relationships can be safely validated.

## Individual contract news access from Home
- Resolved-offer notices retain their player-scoped dismissal receipts. A separate "View wrestler" action opens the existing actor-authorised universal dossier in an overlay and returns to the unchanged Home state.
- This requires one bounded person read only after tapping the button. There are no extra Home queries, no exposed person IDs in URL routes and no change to actionable contract notices.
- iPhone browser flow verifies the exact person identity, modal dismissal, retained attention items and two total calls (overview then one profile). Results, World Lock and original database unchanged.

## Rivalry interruption, rescue and post-match assault restoration
- Original repository `main` remains the exclusive reference: restored interruption endings, a three-person rescue with explicit attacker/rescuer/victim parts and rescue ending, and a post-match attack with a player-authored ending.
- A post-match attack must follow an existing bout in this very card, and its victim must be a participant in that earlier bout. The authoritative card save re-checks the link with the same already-loaded slots. The World-resolution read includes match slots in its existing bounded query to check the link again. Neither step adds a Neon round trip.
- The compact iPhone booking editor supports these scenes and keeps wrestlers' scripted outcomes under the booker's control. No autonomous roster changes, match finish overrides, Results screen edits, cron changes or deployment.
- Richer original match-anchored dialogue and authenticated notification dismissal workflows remain for later restoration.

## Locker-room attention restoration
- Corrected Home's false-negative Backstage status check: unresolved wrestler requests have status `PENDING`, not `OPEN`.
- One authorised Home projection includes up to three named pending requests and their concern type; each opens the existing unread Backstage inbox. The desk makes no additional request or background poll and provides no dismissal of mandatory conversations.
- The disposable PostgreSQL test proves accurate status, player-scoped identities and the one-query / 2.4 KB cap. The original `main` remains the reference; Results and World Lock are unchanged.

## Direct wrestler follow-up from Home (18 October 2026)
- Named outstanding wrestler concerns open the exact, authorised Backstage conversation rather than the generic inbox. Resolved promise notices likewise lead to the wrestler's existing private thread.
- A wrestler identifier passes only through a one-shot in-memory navigation callback. It never enters the URL, browser history or persistent storage. The server still validates the person and the promotion.
- A direct conversation opens via the ordinary single-wrestler Backstage read. An explicit opening of an unread conversation may create the existing acknowledgement receipt, but no extra directory or inbox read is added. If the server cannot return the target conversation, the UI falls back to the inbox.
- iPhone browser checks cover targeted messages, read receipts, accurate history navigation and lack of URL disclosure. Original reference branch remains `main`; Results and deployments untouched.
