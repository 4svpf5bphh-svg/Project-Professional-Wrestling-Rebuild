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
| Programmes and storyline heat | Complete wrestler/team feud lifecycle, automatic match association, explicit segment links, ten-week indexed historical heat and repetition based on actual results | Full rivalry results history UI and cross-week decay |
| Wrestler relationships, gimmicks, stables | Player-scripted turns now change shared alignment with durable history; other foundations partial | Relationship interactions, wrestler-owned gimmick choices, stable roster operations |
| Results | Canonical receipts, persisted segment stories, varied verified match finishes, mobile broadcast and original-style factual highlights | Championships/injury-focused broadcasts, fuller fan response and complete results discovery |
| Browser UI | Reusable card editor, adapters | New cohesive mobile-first app host |

## Prioritisation
1. Segment authoring + save + canonical World Lock resolution.
2. Programmes, repetition and wrestler consequences connected to resolved shows.
3. Backstage and roster/stable parity.
4. Full results pipeline.
5. New UI integrated in cohesive vertical slices.

Avoid full-World JSON loads. Use bounded reads/writes and preserve player-authored
scripted outcomes. No production deployment or scheduled World Lock during development.
