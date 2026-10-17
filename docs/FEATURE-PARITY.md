# PPW Rebuild feature parity — working inventory

Reference: original Project-Professional-Wrestling repository.
This is an implementation inventory, not a claim of complete gameplay parity.

| Feature | Rebuild status | Remaining integration |
| --- | --- | --- |
| World Lock and week progression | Backend foundation | Full end-to-end replay, production cron off |
| Contract offers, renewals and dates | Backend foundation | Full UI and cross-week parity |
| Economy and show markets | Backend foundation | Booking presentation and balance |
| AI promotion booking | Backend foundation | Long-running simulation parity |
| Singles, multi-person and team matches, battle royals | Backend engine | Complete show authoring and results |
| Angles/segments | Authenticated mobile creation/edit/save of 13 segment types; World resolution scores and persists narratives and intents; linked programme progression | Confirm deeper wrestler/stable consequences and results presentation |
| Programmes and storyline heat | Promotion-owned wrestler/team feud lifecycle, automatic match linking, angle associations, factual win/draw records, original ten-week heat/eight-week repetition windows, certified weekly inactivity decay, mobile desk and results navigation | Deeper rivalry consequences and longer-term feud presentation |
| Wrestler relationships, gimmicks, stables | Player-scripted turns now change shared alignment with durable history; other foundations partial | Relationship interactions, wrestler-owned gimmick choices, stable roster operations |
| Results | Immutable completed receipts, verified results and consequences; redesigned mobile Ringside with comprehensive deterministic non-AI reviews, Final Bell show editorial, verified match-finish replays, critic stars, execution quality, real match minutes, certified rivalry heat/repetition context, complete simulated injury facts, interference/eliminations, title-transfer headlines, audience responses, factual Crowd Noise editorial reactions, match/angle filtering and private paginated history | Optional AI editorial enhancement, deeper storyline context and richer fan/community voice without replacing the deterministic fallback |
| Browser UI | Reusable card editor, adapters | New cohesive mobile-first app host |

## Prioritisation
1. Segment authoring + save + canonical World Lock resolution.
2. Programmes, repetition and wrestler consequences connected to resolved shows.
3. Backstage and roster/stable parity.
4. Full results pipeline.
5. New UI integrated in cohesive vertical slices.

Avoid full-World JSON loads. Use bounded reads/writes and preserve player-authored
scripted outcomes. No production deployment or scheduled World Lock during development.

## Verified working partnerships

World Lock records only completed 2v2 teammate pairs. Two good shows in twelve weeks can develop professional familiarity and trust, on an eight-week cooldown. Three verified poor shows can strain **established** confidence, but a scripted rivalry, loss, attack or faction turn never invents personal dislike. Relationship changes are auditable and global to the wrestler, regardless of which promotion they worked for. All reads/writes are indexed and bounded.

## Portable wrestler-owned identity
Original PPW's complete 643-person move/gimmick editorial roster and alternate
persona references are static application data. Current persona, negotiations
and past eras are indexed per wrestler in PostgreSQL. Changes require signed
roster authority, the wrestler's independent consent, and a 12-week cooldown;
another human promotion's active contract blocks unilateral repackaging.
Personal character choice does not rewrite the match results or finishing moves.
The new mobile wrestler directory shows those distinctions explicitly.
