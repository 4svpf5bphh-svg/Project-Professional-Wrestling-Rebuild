# Two-side team-family expansion: 2v2, trios 3v3, 4v4 and 5v5

The canonical MATCH format remains the *Teams family* with two ordered
sides, A and B. Each side now admits between 2 and 5 distinct contracted
wrestlers with equal side sizes; all participants remain in the flat list
used by World availability and financial/resource checks. Arbitrary
asymmetric teams, multi-team formats and battle royals are NOT supported.

## Scoring and outcome

All 2–10 participants contribute to the show's true team scoring through
per-side average skill/momentum/popularity/recognition. The first 2v2
formula and chemistry behaviour are preserved. For 3v3–5v5, every
unordered teammate pair contributes real or deterministically initialised
TAG working chemistry, averaged **per side** to avoid scaling chemistry
up merely because a team has more members. The requested winner is a team
(A/B), never an automatically selected participant.

Each athlete receives their own deterministic injury exposure, fatigue,
wear, popularity, recognition and momentum change. A severe/major injury
to the *authored winning side* can medically end the bout; otherwise the
simulation cannot choose another winner. The complete side rosters and
real results are verified and persisted with the completed show.

All World career mutations are batched and guarded by exact pre-match
wrestler snapshots within the same transaction as results. Retry does
not reapply progression. 5v5 uses the pre-existing 10-unique-performers
show limit; no global service limit is silently lifted. Each athlete can
participate in only one career-mutating match in this slice.

## Championship boundary

Current tag championship reigns are held by a **World tag team** with
exactly two active members, so only 2v2 can contest them. A 3v3/4v4/5v5
with a championshipId is rejected. Trio/championship/stable identity,
vacancy, and multi-team titles require a separate verified domain step.
This keeps title outcomes truthful rather than pretending a 5-person
team fits a two-person champion record.

## Verification and next

CI covers legacy 2v2 and three disposable PostgreSQL journeys:
3v3, 4v4 and 5v5 scored, readiness assessed, completed, evidence
written, all careers advanced, and results replayed without double
settlement. Follow-on: roster/UI booking of these formats, team chemistry
social effects, 3+ opposing teams, elimination rules and battle royals.

No production deployment, cron, Neon production mutation or claim of
measured Neon billing reductions.
