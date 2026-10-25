# Phase 5 — Canonical heritage and championship hierarchy

- Primary and secondary title roles are explicit in the relational schema; one active primary per promotion/division. Existing verified reigns, winners and title-contest receipts are never modified by the migration. An older World with multiple active belts in a division retains them, but ranks exactly one primary by original prestige.
- Secondary titles are not silently created, awarded or made live. Future promotion-scoped title activation must validate role, eligibility, contracts and existing World ownership before release.
- Championship prestige rises only after completed title contests; independent canonical match evidence supplies rating, actual headliner placement and verified transfer. No credit is taken from a planned card, Groq narrative, manually edited badge or an unsigned opponent. A long inactive streak slowly cools established prestige rather than wiping a lineage.
- Recurring event prestige is **not** the owner-entered show importance. Certified completed shows linked to the real, persisted series raise heritage and completed edition count. A missed scheduled date modestly cools it. Renaming/archiving the event cannot rewrite booked or resolved history. Zero edits are made to previously published scores.
- `ppw_heritage_week_settlements` ensures strict once-only application in the existing atomic World resolution transaction. One guard insert and two World-scoped set-based updates; no polling, separate cron, live AI or new World clock.
- Owner-controlled iPhone Championships and Calendar read bounded World-public prestige and tradition only; private rival booking plans, wages and wrestler consent stay undisclosed.
- Actual tournament bracket workflows and fuller faction warfare are not fabricated by treating ordinary multi-person matches as tournament rounds. They require explicit booking approvals and formal bracket/match-rights validation in a later controlled milestone.

Release gate: stacked draft onto Phase 4; no merge, Production deploy, live World advancement or staff/trust migrations without explicit owner permission.
