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
| Programmes and storyline heat | Legacy modules | Canonical World resolver projection |
| Wrestler relationships, gimmicks, stables | Partial foundations | Restore original gameplay and durable consequences |
| Results | Canonical receipt writer, persisted segment stories and mobile broadcast | Deeper match commentary, fan reaction |
| Browser UI | Reusable card editor, adapters | New cohesive mobile-first app host |

## Prioritisation
1. Segment authoring + save + canonical World Lock resolution.
2. Programmes, repetition and wrestler consequences connected to resolved shows.
3. Backstage and roster/stable parity.
4. Full results pipeline.
5. New UI integrated in cohesive vertical slices.

Avoid full-World JSON loads. Use bounded reads/writes and preserve player-authored
scripted outcomes. No production deployment or scheduled World Lock during development.
