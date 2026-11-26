# Milestone 4 wrestling media review

Production baseline `27a45cc055596e8c6dc8fb6a5ebe66661604280a`. The draft is for independent review.

## Player experience

- Official News leads with one story selected from confirmed public receipts. A second substantial event can share the edition. The two managers see the same public hierarchy. Other certified stories are readable in the compact digest. Historical editions, public results and promotion-specific dispatches are still available.
- Published results distinguish an undiscovered foreign object from a referee's disqualification, retain opposing sides in tag and multi-person copy, and use the completed PPV's own name. The title report can name the previous holder from the recorded reign. Match results, title news and the PPV recap retain their own event identifiers.
- Dirt Sheets use the existing rumour receipts and continuity. A title story can set off rival entrance theories, a televised confrontation can invite competing storyline readings, and a quiet card can start an argument about presentation. Wild gossip needs a public cast and some weeks have none. A follow-up requires a later public development about the same subject at the same promotion. All of these reports are explicitly labelled in-game.
- Hot Tag replies address their parent. News rotates its existing accounts and adds event-specific and title-specific takes. The existing post-show Groq batch may use the precise certified finish clause from its own bout. Local wrestler posts respond to title changes, detected offences and concealed cheating using the already verified account.
- Terra still writes premium results. The request now omits suggested match spots, repertoire and dramatic cues from the event brief. The existing per-slot repair can replace an unrecorded kickout or near-fall while retaining other accepted slots. Final Bell offers a verdict on the card and leaves detailed match action to the individual recaps. Existing curated historical asides remain eligible through the normal evidence rules.
- Press questions speak about the actual result at the completed event. The stored answer options and saved-answer publication path preserve manager quotations.

## Offline editorial comparison

Eight chronological synthetic weeks used the same paired TV and PPV fixtures on the baseline and this branch. These are deterministic outputs and request estimates. No provider supplied any copy for the comparison.

| Measure | Baseline | Milestone 4 |
| --- | ---: | ---: |
| AI features requested across eight weeks | 24 | 16 |
| Mean weekly request bytes | 5,166 | 4,173 |
| Mean estimated token envelope | 4,122 | 3,591 |
| Exact duplicate Hot Tag posts beyond their first appearance | 9 of 28 | 8 of 28 |

The intentionally repetitive fixture uses the same two cards throughout. The modest change in exact duplicate count leaves repetition for owner review, especially across quieter editions. Some lower-priority local voices still draw on the existing reaction pools.

- **Week 1 lead** changed from “Final Clash takes centre stage” to “Final Clash closes with Cara Bell vs Drew King.” The new headline identifies the match that closed the show. The fight itself remains separately readable.
- **Week 2 title lead** reads “Cara Bell captures World Crown at Final Clash.” The foreign-object finish also gets a factual brief: “Cara Bell took the decision with a foreign object at Final Clash. The result stood.”
- **Week 2 Dirt Sheets** replaces “Backstage heat after Cara Bell's title victory? Conflicting reports surface” with “How far will Cara Bell take the champion’s entrance?” The rival theories pitch a velvet rope and belt-first introduction versus stripping the entrance back to the music.
- **Week 3 Final Bell** can say “Final Clash had trouble getting a reaction. A card can make sense on paper and still leave the room cold.” It can then single out the best bout even when the audience was quiet.
- **Results fallback** for a recorded chair finish can say “The referee missed the steel chair strike. The decision stood. Cara Bell took the decision.” The certification still supplies the winner and method. The write-up does not add a kickout or pretend the referee awarded a disqualification.
- **Show-results Hot Tag** for concealed cheating has a fan defend the value of arguing about a dirty win. The reply identifies the disputed point: “A dirty win is worth arguing about, sure. The referee missing it is exactly why I'm still annoyed.”
- **Press** anchors a question to the event and decision: “At Final Clash, Cara Bell got the decision with a foreign object. What do you say to the fans arguing over how that result was earned?”

The disposable PostgreSQL fixture recorded a fully accepted Groq response, a partially accepted Terra response with a rejected off-topic reply, two provider-failure editions and one dark edition with zero calls. The fully accepted response carried synthetic usage of 900 input and 350 output tokens with a 3,241-byte request. The synthetic Terra response reported the same usage and an estimated list cost of US$0.00265. These are fixtures for acceptance and failure paths. Real provider quality and real costs require owner playtesting.

## Database and budget

The certified-news writer still uses its existing batched statements, with a larger set of relevant facts in the same insert. The title-holder lookup runs inside the existing week-scoped query. Weekly editorial still uses the existing row per world/week, four bounded input queries at most, one final update and the existing provider ledger and fence. Recent fan context is bounded to 18 rows across three weeks. Dirt Sheets inspect up to 12 unresolved reports across six weeks, and update a case only when a later public development qualifies. Owner inspection adds public request data to that same row on dispatch. The owner read returns eight summaries and the most recent dispatch detail in that window.

For the two-manager synthetic News fixture, the local adapter recorded five SQL statements, five returned rows, 1,829 bytes of JSON-encoded database results and a 1,759-byte API result per measured read. These are application measurements. Live Neon transfer, compute and billing remain unmeasured.

Groq retains its configured shared ceiling of 40 calls and 160,000 reserved tokens per UTC day, with eight calls and 32,000 tokens kept available to higher-priority short-form work. The paced editorial path can cool down for at least 65 seconds after dispatch, and provider retry headers can extend that interval. Terra retains four daily attempts, 50,000 reserved daily tokens, 25,000 per request and the existing £3 monthly ledger. In a week with TV plus PPV for both managers, four Terra attempts can exhaust the daily allowance before an owner preview or weekly fallback can run. Back-to-back game weeks can hit pacing and daily limits even sooner. The deterministic edition remains available. Check actual usage in the existing Lab during approval playtesting.

Migration `0166_weekly_editorial_inspection.sql` adds a nullable, size-bounded diagnostic field and an index for recent unresolved rumour cases. It needs no backfill. Apply it before running this branch against an approved review database. Existing rows remain valid. Previous application code can run with the column present.

## Owner playtest after independent approval

1. In a review World, capture the public facts for an ordinary TV card and a PPV in the same game week. Include a supported dirty win, a detected disqualification, a title change and a poor performance. Keep the completed result receipts as the comparison.
2. In the existing AI Lab, use the same fictional benchmark and settings for comparisons. Preview one Terra article and one Groq sample within the displayed limits. Compare the article with the known results and deterministic recap. Flag invented action, wrong ownership of a move, repeated copy and unsupported crowd or title claims.
3. Use the normal manual week flow in the review World. Read Official News, Dirt Sheets, Hot Tag and each event from both accounts. Check that the public lead is identical, results links point to the right event and every quoted manager line came from a saved answer. Leave one PPV scrum unopened to check absence of coverage.
4. In the Lab, inspect the weekly dispatch context, acceptance reasons, reported tokens and ledger. Compare the observed usage after two TV-plus-PPV promotions with the daily limits. Record prose observations by section and distinguish published model copy, local repair and complete fallback.

Release recommendation is to hold production until independent review, the full verification gates and the approved live quality comparison are complete.
