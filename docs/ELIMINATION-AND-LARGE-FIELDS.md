# Elimination and large-field rules

The existing Individuals/Teams engine supports 3/4-way matches, 2v2–5v5,
three to six equal-size teams, and 6–30 entrant individual battle royals.
All competitors occupy a single typed slot with real contract IDs.
An authored `scriptedWinnerSide` must point to a booked side.

Optional `ruleset: "ELIMINATION"` requires a chronological
`eliminationOrder` listing **every losing side once**, with the winner
absent. In team elimination a side represents the eliminated team,
not every teammate separately. Battle royals must declare
`matchType: "BATTLE_ROYAL"`, `family: "INDIVIDUAL"`,
`ruleset: "ELIMINATION"`, and `plannedFinish: "OVER_THE_TOP_ROPE"`.
Sided IDs map A–Z then AA–AD for 30 entrants.

The World resolver scores everyone in one bounded identity SQL lookup;
the original quality and audience formulas are reused without broad
World hydration. The server writes complete match evidence and each
entrant's per-person effects with transactional retry protection.
A serious injury to the scripted winner can stop a match early; in that
case `completedEliminationOrder` is empty, never a fabricated full sequence.
Multi-team run-ins and large-field championship changes are explicitly
unavailable until their booking and settlement rules are built.
The human show already permits up to 100 unique contracted appearances,
while AI currently targets smaller normal weekly cards (~10 performers).

All tests and schema changes operate on disposable CI PostgreSQL only.
