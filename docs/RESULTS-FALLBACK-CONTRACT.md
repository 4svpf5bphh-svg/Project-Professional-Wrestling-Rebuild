# PPW Results: deterministic fallback and future AI commentary

The standard Ringside report is a complete first-class feature, not a
temporary placeholder or an AI loading state. AI must never be required to
open a saved result, understand its decisive moments, or revisit past shows.

## Immutable source-of-truth facts

- The World resolver persists scripted match winners and completed finishes in
  the canonical show receipt. Simulation may only apply verified medical and
  interference outcomes permitted by those booking rules.
- The original match kernel also produces critical rating stars, execution quality, actual
  minutes worked and injuries, including mild singles injuries. The resolver
  writes these once, in one relational batch, to the completed match report
  facts table alongside the sealed completed-show receipt.
- Existing match evidence, title contest decisions and career injury receipts
  remain authoritative; no headline infers a title transfer just because a
  championship contest was booked.
- One bounded Results enrichment read joins the completed match ledger, verified
  evidence, title transfers, score/time facts and injuries. Older shows without
  detail display only what can be proved. Results are never re-simulated on open.
- Private show history uses twelve lightweight rows per page.

## Editorial output

Every match receives a deterministic multi-paragraph recap with billed
competitors, format, booking intention, official finish and winner, critic
rating, execution quality, actual running time, audience response and a wrestling-style verdict.
Confirmed championship transfers, injuries, run-ins and eliminations receive
distinct factual bulletins and may lead the headlines. Player-scripted
angle refusals are never rewritten as successes.

The original simulation does not record a move-by-move action log. The fallback
cannot claim unrecorded suplexes, finishers, near falls, unannounced wrestlers
or particular ringside incidents. A character's known finishing moves are
identity data, not proof that a move happened.

## Future optional AI

AI can extend the editorial voice on top of sealed match facts; it must not
author new winners, outcomes, injury reports, title holders or match times.
The deterministic report remains available if AI is disabled, slow or fails.
A future cached AI review should be keyed by show ID and immutable fact digest
and must never trigger resimulation on reads.

## Match credibility signals

Where the resolver already records it, Ringside identifies the last booked
match as the main event, names the actual recorded singles cheater on dirty
finishes and differentiates positive or negative scored chemistry. Chemistry
does **not** prove friendship, a backstage dispute or an unrecorded spot.
Missing historical match metadata stays omitted instead of being guessed.

## Scripted-angle reports

The same deterministic broadcast now covers every supported angle type with
author-specific colour derived from completed outcome, recorded roles and
locked purpose/decision. Refused or interrupted turns, attacks and arrivals
never use copy implying successful execution. A staged faction invitation or
television contract signing is not automatically a roster/contract write.
No further Neon reads are required.

## Crowd Noise: fan and press-box reaction flavour

The Ringside **Crowd Noise** panel presents short, varied, deterministic,
clearly-labelled *editorial* reactions. It is **not** a feed of genuine users
or verified third-party social posts. Every reaction links back to one
certified result within the currently loaded broadcast, and reacts only to
established facts: a title transfer, recorded medical consequence, booked
angle outcome, dirty finish, critic–crowd disagreement, match rating, or
certified programme heat/repetition.

At most four reactions are displayed, chosen from distinct recorded card
slots. Cards are mobile first and keyboard accessible, and opening one
expands the original result without any further network request.
It does not invent backstage opinions, unperformed moves, wrestler quotes,
or crowd events. The future full social/Pulse feature can have its own
simulation; this panel does not pretend to implement it.
