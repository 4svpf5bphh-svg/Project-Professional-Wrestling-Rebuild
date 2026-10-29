# Phase 17 — coordinated playtest release gate

**Owner instructions: develop first; no merge or Production deployment without explicit approval.** This is preparation, not authorisation.

1. Review the complete stacked diff of **PR #29 (Phase 15) -> #30 (Phase 16) -> #31 (Phase 17)**. No resets, premature merge to main or release from an old branch.
2. Require green latest-head ordinary PR verification: TypeScript, PWA build, authenticated 320px/390px browser journeys, unit tests, disposable PostgreSQL migrations and concurrent commands, and the authentic 52-week eight-AI-company World run.
3. Run the deliberately **manual** `Verify rebuild` workflow with `workflow_dispatch` on Phase 17 for the 156-week, three-year stress case. It is intentionally removed from automatic pushes because it exceeded seven minutes and obscured its progress. Diagnostic events now stream to stderr with elapsed time, every eight certified weeks, and fixture cleanup; do not call it passed without a successful run.
4. Inspect mobile screenshots for the full-screen Messages inbox and reply, title belt visuals, Home logo at 320px, Results, Road Agent, Staff and calendar. Automated width assertions cannot replace visual review.
5. The physical **129 Legend cards and 93 new portraits** have an automated WebP packaging check; separate owner image-to-identity, crop, attribution and rights review is required. Collectibles must stay separate from talent signings.
6. Before an expressly authorised release: preserve a recoverable backup of the existing two-player World, review any combined migrations and rollback, check both manager sessions and lock state; deploy the approved combined changes **once** to Vercel Production with no new cron, polling or unsanctioned World advancement.
7. After approved release, test both managers, World Lock, actual show results, championship names after promotion rebrand, Legends reveal/album/free-agent entry, Backstage Messages, iPhone PWA reopening and Neon usage.

**Known open gate:** The genuine 156-week simulation has not passed; its initial run hit the seven-minute test timeout. Ordinary development regression is independent and is expected to remain green.
