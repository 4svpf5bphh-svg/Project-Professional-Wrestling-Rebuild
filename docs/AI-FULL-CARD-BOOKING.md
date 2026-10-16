# PPW full AI singles card: original booking progression, not a placeholder
Replaces the one-match AI emergency stopgap with 2-5 independent singles
matches using no more than 10 unique contracted wrestlers. The existing
one-match delegated-staff emergency path is deliberately unchanged.

From original sim-core booking.ts: ranked appearances use recognition,
popularity, momentum and match craft; final card order uses the original
momentum*0.4 + popularity*0.3 + recognition*0.2 + presentation*0.1
push score. Strongest average star-pull match closes the show. From original
matches.ts: AI risk, quality and star preferences influence technical,
high-risk and showcase intents; major-event mains use EPIC. Planned match
durations and finish probabilities preserve the original intent equations.
The AI, not result simulation, scripts a winner using relative drawing
power plus reproducible seed variation. No AI winner is overwritten by sim.

Wrestler safety, multiplayer fairness and coverage:
- One scheduled World show, and max ten unique wrestlers. Same-division
  pairs only, including a guaranteed women's showcase when both divisions
  have sufficient eligible workers; larger divisions do not erase smaller
  division undercards.
- Used-up weekly capacities, same-day conflicts, existing venue claims,
  missing signed contract and unbookable talent never enter the card.
  The deterministic pre-lock World batch chooses venues/days without giving
  extra power to online promotions; no player booking is changed.
- Recent completed pairs within two weeks are a single World-scoped narrow
  bounded read, preventing rote rematches when an alternative exists.
- The full five-match card is inserted in a SINGLE SQL batch and its
  commercial demand counts every booked wrestler. No per-match database
  roundtrip. Existing original match and results simulation processes each
  match as an authored singles card, including rating, fatigue and injury
  handling. Staff consent/authority and World retry receipts remain intact.
- Imported original Genesis AI risk, star and match-quality preferences are
  mandatory; do not silently default all promotions to one personality.

Limits / future features:
- Tag matches, trios, programme/title defenses, contract creative-control
  consequences and real PPV headliner logic require first-class compatible
  simulation state. They must not be disguised as singles or guessed here.
- This is not a UI deployment or cron activation. Real Neon billed network
  transfer still needs staging measurement before scaling claims.
