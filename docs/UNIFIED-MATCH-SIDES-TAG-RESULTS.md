# PPW unified match side representation + first actual 2v2 simulation
Progressive delivery following MATCH-FAMILIES-AND-VARIABLE-PARTICIPANTS.md.

A match uses a single canonical format with FAMILY (INDIVIDUAL/TEAMS),
ordered sideIds A..F, side rosters of contract-backed real wrestlers, and
an authored winner SIDE. A flat ordered participant list remains intentionally
present for existing contract, capacity and World conflict checks, and MUST
exactly equal the concatenated side rosters. It cannot duplicate performers,
invent contracts or promote a teammate across sides. Legacy 1v1 cards are
accepted unchanged and normalized into two single-person sides.

The first two enabled formats are 1v1 and 2v2. Triple threats, four-ways,
trios, 4v4, 5v5, multi-team and Battle Royals validate at the representation
layer only; the scoring gate deliberately refuses them until their rule and
evidence contracts are implemented. No false "solo" participant used as a
proxy to prove a real tag win.

2v2 results use both complete sides and per-wrestler attributes, side-average
skill/audience profiles with the archived quality and crowd equation, real
World-owned TAG pair chemistry, original-format seeded four-person medical
risk and severity and four per-performer physical load summaries. The scripted
winning team is never rerolled; a severe/major injury to the intended winning
team can require a medically stopped result. The finished evidence contains
all four identities and the verified winning SIDE; canonical show recording
cross-checks it against booked side rosters before inserting immutable
results. Completed match crowd response, style readiness and future show
settlement all accept the two-side result.

Limitations: this is the initial two-team scoring ruleset, not an assertion
of exact archived 2v2 engine numerical parity. Advanced tag psychology,
individual fall/decisive pin authorization, per-person authoritative career
consequence writes, tag-title transfers and AI booking established teams
need separate integration and test evidence. Historic show-level FACE/HEEL
clarity and dirty finish readmodels are disabled rather than falsely reduced
to one representative wrestler when a tag match is present; match pacing
still uses the actual tag score. All queries remain World/scoped and bounded,
without serialized World JSON reads.

Production remains undeployed; cron disabled; measure actual Neon billed
transfer/compute in controlled staging before any cost-savings claim.
