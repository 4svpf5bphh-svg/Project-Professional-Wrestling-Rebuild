# PPW Rebuild — Playable iPhone alpha acceptance gate (19 October 2026)

**Objective:** One coherent, genuinely playable, two-manager week with the new
iPhone interface. This checklist is an acceptance contract, NOT a request to
reimplement features already restored. Original reference: original **main**
only, never alpha-1a.

## Already implemented — test rather than rebuild
- Independent invite-code sign-in, membership and authorised promotion claims.
  The client must examine the actual claim outcome, not merely APPLIED status.
- Player-owned Home, roster/dossiers, Talent Market, contracts and renewals,
  Backstage, Industry, Business and staff views in a drawer-based iPhone shell.
- Show Planner and Calendar, weekly plus independent premium cards, selected
  show identity preserved across browser history/reload, wrestler quick cards,
  match and angle casting, match scripts, creative agreements, card confirmation.
- Authored wrestler results and persistent World settlement, industry competition,
  contract dates, show finances, title records, Programme progression and the
  tape library. The established Results presentation is NOT part of UI parity
  work.
- Single authoritative World Lock. Managers cannot speed it up by logging in,
  refreshing, booking first or being on the game when it passes.
- Read-only World population gate, permission-gated offline genuine Genesis
  extraction/import, no synthetic fake roster or erased takeover restrictions.
- Mobile Home now exposes a **tap-only** deadline/status check and direct
  completed-show continuation after confirmed World advancement, without
  polling. A native browser Back/navigation cannot silently discard locally
  unsaved card work; there is explicit discard and an exit confirmation.

## Actual alpha release gates — objective pass/fail
1. **Content**: isolated migrated World from an authentic freshly generated
   original-main source. Verify full real roster, WWE/AEW/etc. promotion names
   and contract rights, initial tag teams, markets, titles, original standings,
   protected company controls and at least two legitimately claimable promotions.
   No test fixture presented as live content.
2. **Independent managers**: two separate invite codes on separate iPhones
   join and claim two eligible companies; unauthorised private card, backstage,
   contract and financial reads are rejected.
3. **Playable week**: each manager chooses a venue, scripts and saves a card,
   approves any creative consent, confirms readiness and returns on their own
   schedule. At least one PPV may be booked independently where available.
4. **Single deadline**: inspect a real locked World, run an explicitly authorised
   isolated due-week one-shot resolution ONCE, verify both authored outcomes,
   career and championship effects, finances, roster contract-date charges,
   separate completed shows and advancement to the next open week.
5. **iPhone use**: real Safari/Home Screen installation, drawer and screen
   transitions, saving versus discarding local edits, page reload, offline
   shell, loading/errors and text/touch targets. Use observed bugs to prioritise
   fixes, not invented screen parity tasks.
6. **Economics**: measure actual Neon transfer and compute during the
   two-person playtest. Existing bounded SQL/query-size tests are supporting
   evidence, not an exact billing extrapolation.

## Deliberately outside first playable alpha
- Full medical recovery lifecycle (existing partial history must stay truthful).
- Full historical career press/news archive, unlicensed wrestler portraits.
- Further match subtypes, larger story libraries, optional UI decoration.
- AI prose commentary and Results redesign.
- Production deployment, original-PPW database writes, automatic scheduled
  World Lock, or the separate Neon affordability branches.

## Change discipline
Do not reopen Roster, Contracts, Backstage, Programme, Booking or Business
simply because another checklist mentions that department. Treat existing
features as **tested candidates**. Reopen only on evidence that a specific
necessary original-main action, persistence effect, permission rule or mobile
interaction is missing or broken. Prefer a complete horizontal player journey
with browser + PostgreSQL regression to another isolated control or CI check.

## Preview operation
See `docs/alpha-pwa-host.md`. All Genesis/preflight/week tools are
deliberately operator-only and explicitly scoped to a fresh isolated database.
Release to real people requires an approved preview target and valid credentials;
a green automated workflow does not constitute deployment or a live iPhone test.


## Verified restoration pass — 20 October iPhone playtest fixes

**Source control:** rebuild Git `main` only, original reference `main` only. The
single existing rebuild Neon `main` World is `world-20261017` (Year 1,
Week 1). No extra alpha branch, alternative database timeline or production
deploy was made by this restoration pass.

**Confirmed implemented and covered in code/CI:**
- Installed-iPhone bottom drawer repositioned to a permanent thumb control;
  foreground match and wrestler editors sit above it. The old overlapping
  editor control bug has a passing iPhone regression.
- Booking Save/Confirm rail reduced to two compact actions; validation now
  identifies the slot and persists errors beside the Save control without
  discarding local authoring. Safe error categories and non-sensitive
  correlation references cover otherwise unknown server failures.
- Booking card highlights the final match as the main event, restores show
  duration contributions from every authored angle and prevents 120-minute
  broadcast overrun at both browser and server levels.
- Angle scene goals explain why one-person promos lack an on-screen target;
  challenge, attack, confrontation etc. have distinct target roles.
- Face/Heel/Tweener baseline is computed exactly as original-main's World
  seed/person ID algorithm when a canonical value is missing. Existing
  promotion-specific and canonical values still win. This is a *read-only
  presentation/booking* fallback, not a claim that all historical simulation
  modifiers have been restored. Labels and role meaning appear in quick cards.
- Gimmick picker surfaces original thematic families instead of stopping at
  generic hero/villain; the main World contains 643 personas and 58 distinct
  canonical gimmick types (read-only verification).
- Business shows fixed overhead and recurring costs. Backstage inbox has a
  visually separate Messages-inspired treatment and clearer contact rows.
- Static broadcast colour and constrained page transitions are stronger;
  no autoplay sequences or extra database reads are required.
- A preview-only, designated-operator manual Week control exists with explicit
  shared-World confirmation and its own permission gate. Stale actions cannot
  move the World deadline because the lock and cutoff are atomic. It is not
  enabled in the deployed preview by a Git commit.
- Disposable PostgreSQL integration verifies replacing wrestler assignments
  on a confirmed multi-match, multi-angle card, invalidating the previous
  confirmation and then reconfirming; legacy angles have five-minute defaults.
  The original-main authentic Genesis check remains green.

**Release status and remaining acceptance evidence:**
- Last completed standard CI on the final implemented code at this checkpoint:
  #39458769066 **passed**, commit `b51b1852`.
- The existing Vercel preview at
  `project-professional-wrestling-rebuild-5gubbp8le.vercel.app`
  was still deployed from `ba7eec13` when inspected; it does **not**
  contain this restoration batch. Building and passing CI is not deploying.
- Before another player tests, the reviewed commit must be expressly
  approved for a *preview* release with exact existing main World/database
  guard settings checked, then an operator must opt in to the manual Week
  feature. Do not auto-deploy or enable a cron.
- Perform real iPhone Home Screen smoke of the saved Week 1 card, save/revise
  and confirm a *separate* four-match three-angle show, Backstage inbox,
  roster alignment labels and screen visibility. Observe and correct failures.
- Only then do the explicitly authorised two-person lock/settlement scenario,
  and measure Neon transfer/compute with both users. No affordability claim
  before measured live network consumption.

These items must not be re-implemented from scratch merely because a generic
parity audit is reopened. Follow demonstrated defects and acceptance gates.
