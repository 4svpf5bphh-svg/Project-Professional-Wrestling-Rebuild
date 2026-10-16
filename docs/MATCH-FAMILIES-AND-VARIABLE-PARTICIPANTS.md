# PPW Match Families and Variable Participants — design checkpoint (16 October 2026)

## Player-requested direction
Do **not** implement Triple Threat, Four-Way, Trios, 4v4, 5v5 and
Battle Royal as isolated simulators. Two foundational match families
support varying participants:

1. **Individual (UI can say Singles / Multi-person)**: each wrestler is
   an independent side. 1v1, triple threat, fatal four-way, five-way,
   six-way, and Battle Royals.
2. **Teams (UI can say Tag / Teams)**: each side contains two or more
   wrestlers. Conventional tag 2v2, trios 3v3, 4v4, 5v5 and eventually
   multi-team variants (2v2v2, 3v3v3).

The *match family*, *side size*, *winning conditions*, *special rules*,
*stipulations* and *presentation name* are distinct facets. A 4-way
elimination match is an Individual 4-way with a specific elimination
rule; a battle royal is Individual with entry/elimination/last-person-
standing mechanics, not just a match with 20 participants. This avoids
multiple redundant match-scoring engines.

## Authoritative model (intended, NOT implemented yet)
- Each booked MATCH stores a typed list of sides; each side has one
  (Individual) or multiple (Teams) unique contracted wrestler IDs.
- Match rules describe standard finish, elimination, timed entrances,
  over-the-top rope, no-DQ, etc. Only compatible combinations are legal.
- Player authors the winning individual or team and any explicitly
  scripted elimination sequence / decisive fall. The simulation decides
  execution quality, injuries, psychology, momentum, crowd response and
  other CONSEQUENCES; it cannot substitute another winner for a written
  creative outcome except an explicitly modelled medical stoppage.
- Completed match evidence must verify every participant, side, planned
  outcome, actual outcome and medical exception. Title ownership is based
  on the verified side/winner, not assumed from 1v1 positional fields.
- Team chemistry belongs to team/pair relationships, with full
  participant exposure. Championship defenses/transfers are resolved
  from canonical reign and verified results in the SAME transaction.
- Appearance dates, exclusive rights, service capacity, fatigue, risk,
  injury and venue conflicts operate on the full unique participant set.
  Never double debit a person who appears in multiple angles and bouts
  at the same show, and never treat a wrestler in two match sides as
  legally bookable.
- The current **10-unique-wrestler cap per show** accommodates 5v5
  but is incompatible with conventional 20/30-person Battle Royals.
  Before supporting large fields, explicitly redesign scoped match-
  and show-level appearance limits and confirm the existing finance,
  conflict/clearance, query budget, simulation cost and user interface.
  Do not silently lift arbitrary caps everywhere.
- Each World resolution remains one bounded batch. No full World JSON,
  per-participant database roundtrips or idle polling. Apply a maximum
  scoped field size and set-based reads/writes.

## Safe integrated implementation order
A. Replace singles-specific **booking/evidence/score/medical/results**
   assumptions with variable participants and canonical sides. Keep
   existing 1v1 parity tests as regression fixtures.
B. Build 2v2 Tag with genuine side-based scripted finishes, real tag
   chemistry, four-person physical/medical consequences, tag-title
   settlements, AI team bookings and results.
C. Reuse Individual for 3- and 4-person matches, including multi-side
   titles with verified champion participation; introduce elimination
   as a separate supported ruleset.
D. Expand Teams to trios 3v3, 4v4, 5v5, and multiple opposing teams,
   retaining existing World service limits and fairness checks.
E. Implement Battle Royals with entry/last-remaining/elimination
   semantics, large-field caps and meaningful player-authored story.
F. Layer stipulations and richer result narration without duplicating
   underlying match types.

## Current state / limits
As of the green CI #274, the authoritative results/evidence and match
scoring contracts are **singles-only**. Canonical tag identity, current
singles championships, programme participants, and AI context are in
place. No claim that tag/triad/battle-royal scoring works yet.

The rebuild's core purpose remains reducing **actual Neon billed
transfer/compute** compared with the original, not introducing
unnecessary server-authority architecture. No production deployment or
scheduled cron until feature parity, real measured cost and end-to-end
staging tests pass.
