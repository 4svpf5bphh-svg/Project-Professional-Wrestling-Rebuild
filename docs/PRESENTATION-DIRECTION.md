# PPW Rebuild — Presentation Direction (locked for design stage)

Recorded 2026-10-15. This is a **future design requirement**, not authorization to begin UI work before the server-authoritative domain and data contracts are stable.

## Whole-game visual redesign
- The rebuild must have a fresh, cohesive visual identity rather than simply reproducing the old game's interface.
- Mobile-first, especially iPhone/PWA: readable information density, touch targets, compact navigation, no accidental input zoom, accessible contrast.
- Keep **TEW underneath, EWR on top**: rich simulation, clear presentation. Replace unwieldy grey dropdowns with searchable, contextual pickers where appropriate.
- Treat visual design as a coherent pass once core game flows and information architecture are sufficiently established; don't repeatedly rebuild screens while systems are still changing.

## Backstage as a messenger
- Present talent/staff conversations as a modern messaging app: conversation list, distinct chat bubbles, sender and timestamp context, unread state and deep links.
- Questions, proposals, negotiations, consequences and follow-ups appear as contextual messages with clear player choices.
- Do not require the player to be online at message arrival. Responses obey World Lock and asynchronous fairness.
- Distinguish **scripted player decisions** from simulation-generated reactions. The player authors wrestling outcomes; the simulation supplies credible constraints and consequences.
- Underlying message, proposal, response and deadline data must be persisted independently of the UI.

## Results as a signature experience
- Results should be a standout, entertaining part of PPW, with a unique visual style, hierarchy, icons, colours and meaningful match/segment storytelling.
- Write varied, context-sensitive descriptions of **matches and events/angles** that use wrestling vernacular naturally, avoid generic repetition and reflect participants, stipulations, programmes, finishes, crowd reaction, stakes and consequences.
- Display outcomes and important signals clearly without revealing all hidden simulation calculations. Support first-read highlights and optional detail.
- Segment results must appear alongside matches; do not present them as inert placeholders or automatically negative.
- Retain historical results and meaningful narratives as bounded per-show records, not huge World-wide blobs.
- Future fan/social reactions can amplify notable moments, but must not block a complete first results experience.

## Build dependency contract
1. Define durable domain events and result data needed for each view.
2. Implement smallest complete server-authoritative feature and tests.
3. Build mobile-first presentation against stable read models.
4. Measure page payloads and Neon transfer; no whole-World fetches.

Do not interpret this document as a request to deploy or to change the archived PPW application.
