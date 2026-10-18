# PPW original → rebuild: screen and workflow parity audit
Source baseline: original repo **main** (18 October 2026), rebuild **main** (tracked through the latest restored screens and corresponding test evidence). Results excluded by explicit instruction.

Legend: **Restored** implemented, **Partial** important work remains, **Retain** a deliberate rebuild improvement, **Gap** not recreated. The original was inspected as gameplay evidence, not a mandate to copy obsolete architecture.

| Screen/workflow | Original behaviour confirmed in source | Rebuild state and action |
|---|---|---|
| World/Home | Promotion identity including home territory, attention items, readiness, weekly clock. Original has **two** World deadlines. | **Partial:** single World Lock remains intentionally (**Retain**); economy/clock present. Home market restored with existing 1-query projection. Home attention and readiness are restored using the existing bounded overview; targeted person-level deep links remain a gap. |
| Planner/show planning | Six-week timeline, show details/participants, market analysis (audience awareness, loyalty, rival presence, venue availability), card-edit flow. | **Partial:** six-week calendar and show editing exist; home territory and market-by-market venue chooser/awareness/live strength/loyalty restored from *existing* Planner payload. Rival presence and reservation risk context remain **Gap**. |
| Calendar | Create/edit/archive recurring series; flagship/secondary/special/PPV roles, all-world calendar and big-event filtering. | **Mostly present:** recurrence editor, PPV and World filters. Needs polish and side-by-side recurrence and role validation. |
| Card Editor / booking | Authored outcomes, multi-sided participant slots, running order, style/finish/warnings, wrestler selector, segments. | **Partial:** broader match types and server-authoritative match booking retained; compact 40-keyset wrestler picker now uses shared quick-view wrestler cards with ratings, character and contract eligibility; open complete profile without abandoning card. Remaining detailed style/finish/readiness affordance audit **Gap**. |
| Roster / Talent Market | Role ordering, contract filters, sorting, availability, public and private metrics, wrestler expand/roster management, offers. | **Partial:** server-side roster/market filters, interest, payroll/date/appearance-fee sorting and original in-ring attribute threshold restored within two indexed directory reads. Shared wrestler card restored, plus full on-demand profile. Portraits and relationship/badge polish still **Gap**. |
| Wrestler profile | Character, skills, status, booking history, career, relationships, contract and affiliations. | **Partial:** authorised single-person dossier now includes ratings, portable persona, repertoire, active contracts (private salary only yours), alliances, relationships and persona eras. Restored edit of move names and style only on current roster with server rights, no unilateral change when another human controls the shared person. **Verified career scoreboard, recent matches, injuries and singles championship honours restored as a separate three-query on-demand read**; portrait media and richer historic archives remain **Gap**. |
| Contracts | Separate offer/renewals/date expansion workflow, expiration guidance, trusted roster links. | **Mostly present** in rebuild Contracts Desk; check notices deep-link and archived offer outcomes, consolidate high-priority actions. |
| Backstage | Programme/story pitches, wrestler concern/proposal replies and conversations. | **Partial:** server-authoritative 30-message bounded conversations, read/archive, role pitches and mobile messenger visual already in rebuild. independent iPhone-style full-screen inbox and conversations, contextual reply choices and no-query local filters restored; shared wrestler dossiers now open from Backstage on demand; contextual notifications still require review. |
| Business | Home market, recurring cash lines, four-week actuals, company standing, recent shows, ledger drilldown. | **Partial:** business finances, runway and local territories exist; comparison for missing standing/economics depth remains. Don't touch Results presentation while restoring links. |
| Staff | Talent Manager hiring, releasing and manual renewal approvals. | **Restored:** Talent Manager recruitment, dismissal, salary and explicit renewals now use narrow, authorised database commands and the existing payroll settlement; emergency show cover remains. |
| Industry | Promotion tier/rank, rosters and featured wrestlers, championships, recent events and public privacy rules. | **Partial:** public promotion standings and broadcasts retained, with source-based tier/search filters and stronger public promotion identity cards. Featured roster depth remains **Gap**. Never expose rivals' private contracts. |
| Championships | Singles and tag World lineage with active/inactive, holders and reign history. | **Mostly present:** bounded active and historic title queries, timeline view and filters. Premium title cards and lineage display now restored with cross-links to the shared wrestler profile. |
| Programmes | Active story line, heat/counters, sides and teams, linked championship, create/end programme and follow-up. | **Mostly present:** current heat/repetition, team participant inputs and programme resolution are in rebuild; premium feud scoreboards, heat/repetition visuals, participant conflict prevention across teams and age cues restored; post-show creative follow-up presentation remains a **Gap**. Active wrestler names now open the shared dossier without losing Programme selections. |
| Navigation/notifications | Drawer and sections plus notification items/deep links, pending actions and context. | **Partial:** rebuild retains five-section drawer; do not add permanent nav buttons. Persistent action inbox and context-specific deep links remain **Gap**. |
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
- Remaining high-priority feature work: Home actionable notification dismissal/deep links; original Programme post-show follow-ups; remaining roster profiles and media; deeper Business/Industry public information; mobile scroll and touch playtesting.
- Results presentation and simulation remain untouched, as required.

## Identity and writing parity (18 October)
- All player-facing descriptions are written in the voice of a wrestling promotion, without explaining PPW simulation internals or referring to "PPW weeks" or "World resolution".
- Wrestler dossiers now open on demand from bookings, the Roster, Talent Market, championships, Programmes, Contracts, Backstage, tag teams, stables and professional connections; no extra list-rendering queries are introduced.
- The original **main** remains the exclusive reference. Results, original databases, scheduled World Lock and isolated Neon cost-testing branches remain untouched.
