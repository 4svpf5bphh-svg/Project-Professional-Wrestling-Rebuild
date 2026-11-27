# Milestone 4 wrestling media review

Production baseline `27a45cc055596e8c6dc8fb6a5ebe66661604280a`. The draft is for independent review.

## Player experience

- Official News leads with one story selected from confirmed public receipts. A second substantial event can share the edition. The two managers see the same public hierarchy. Other certified stories are readable in the compact digest, including their saved or verified Hot Tag threads where available. Historical editions, public results and promotion-specific dispatches are still available.
- Published results distinguish an undiscovered foreign object from a referee's disqualification, retain opposing sides in tag and multi-person copy, and use the completed PPV's own name. The title report can name the previous holder from the recorded reign. Match results, title news and the PPV recap retain their own event identifiers.
- Dirt Sheets use the existing rumour receipts and continuity. A title story can set off rival entrance theories, a televised confrontation can invite competing storyline readings, and a quiet card can start an argument about presentation. Wild gossip needs a public cast and some weeks have none. A follow-up requires a later public development about the same subject at the same promotion. All of these reports are explicitly labelled in-game.
- Hot Tag replies address their parent. News rotates its existing accounts and adds event-specific and title-specific takes. The existing post-show Groq batch may use the precise certified finish clause from its own bout. Local wrestler posts respond to title changes, detected offences and concealed cheating using the already verified account.
- Terra still writes premium results. The request now omits suggested match spots, repertoire and dramatic cues from the event brief. The existing per-slot repair can replace an unrecorded kickout or near-fall while retaining other accepted slots. Final Bell offers a verdict on the card and leaves detailed match action to the individual recaps. Existing curated historical asides remain eligible through the normal evidence rules.
- Press questions speak about the actual result at the completed event. The stored answer options and saved-answer publication path preserve manager quotations.

## Offline editorial comparison

Eight chronological synthetic weeks used the same paired TV and PPV fixtures on the production baseline and the initial reviewed candidate at `9489cc78`. These are deterministic outputs and request estimates. No provider supplied any copy for the comparison.

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

## Independent-review acceptance pass

The weekly Groq request can contain the confirmed lead and one eligible Dirt Sheet item. The optional slot goes to the rumour ahead of a second official feature. An unsupported allegation, routine gossip or a week without a confirmed anchor gets no rumour slot. The existing Terra fallback receives official copy only when it replaces a Groq dispatch with a rumour in it.

The dispatcher and the archive apply the same SQL priority before their row limits. An established signing uses the existing public career-significance threshold of 75 for popularity or recognition. The published copy says headliner and omits numeric attributes and deal terms. An exceptional 4.50–5-star match can outrank a routine title change. An occupied World title still leads when it changes hands. The 45-title regression verifies that a stronger lead survives the 40-row dispatch limit and matches the archive. Historical editions use the public text they originally received.

### Creative evidence

The following lines come from deterministic projections or a supplied mock response. Live model writing remains for the owner comparison.

| Source | Before | After |
| --- | --- | --- |
| Weekly Hot Tag, world title | “I want to know what the division looks like with Cara Bell holding the World Crown.” The reply quoted that line and said it would judge Crown Wrestling on whether people tuned in again. | “I'd leave Cara Bell alone with the World Crown for a bit. Let the change sink in.” Reply “Leave Cara Bell alone and the division goes quiet. I want to hear who thinks that World Crown should be theirs.” |
| Weekly Hot Tag, headliner signing | “This week's wrestling discourse is already out of control.” The reply turned to television demand. | “I'd put Hana Reed on the first Crown Wrestling poster they can print.” Reply “A poster gets my eye. Give Hana Reed somebody with a reason to beat them and you've got my money.” |
| Terra's deterministic repair, strong tag match | “After 24 minutes, Alice Reed & Bob Ward secured a clean pinfall. The crowd responded strongly to the decision.” | “After 24 minutes, the match needed a finish worth the wait. Alice Reed & Bob Ward secured a clean pinfall. The finish gave a strong match the payoff it deserved.” |
| Terra's deterministic repair, weak singles match | “After 5 minutes, Hana Reed took the decision by disqualification. The response was noticeably quiet.” | “5 minutes was all this one had. Hana Reed took the decision by disqualification. The decision settled the result. It did little to rescue a flat match.” |
| Foreign-object fallback | “The referee missed the screwdriver strike.” | “The screwdriver came into play out of the referee’s sight.” The receipt supplies the object and finish, with no recorded manner of use. |
| Dirt Sheet mock | The deterministic inflatable mascot premise appeared without Groq opinion. | The same single mocked request accepted “I think Titan Wrestling could make that mascot the best part of the entrance” and “That mascot might be fun if Titan Wrestling saves it for the entrance.” |

The title desk can float a formal challenge or an open invitation, the showcase desk can debate a poster spot versus short appearances, and the wild pool can imagine a ridiculous shirt or inflatable mascot. A later public title result that actually names the original subject triggers a continuation. In the Alice Reed fixture the desk revisits her presentation rumour because Bob Ward takes the title and the certified report names Reed as the previous holder. The new result gives the desk a reason to revisit the subject. It leaves the earlier theory speculative, regardless of the legacy classification stored on the case.

The 21-edition comparison used varied championship changes, signings, programmes, good and poor matches, broadcasts and comic rumours, with a recurring television story as a deliberate stressor. Exact duplicates fell from **80/175 to 34/154**. Distinct near-duplicates at 0.72 token-set overlap rose from **3 to 7**, leaving combined repeats at **83/175 to 41/154**. Replies rose from **5 to 17**, while accounts went from **57 to 58** and the highest account count fell from **8 to 7**. Generic scaffolding is still visible, especially when the same kind of TV story recurs. The reader remembers at most 24 fallback lines from each of the last 12 editions in the existing read window. Fewer filler posts can appear when fresh material runs short. Archived AI replies retain their original voice mapping. New accepted copy stores the rotating cast version, and a rejected parent leaves no substitute reply attached to the generated conversation.

The recorded match evidence covers the finish category, winner and sides, elapsed match time, stipulation, crowd reception, critical rating and, where present, referee spot, named prop, interference outcome, elimination order and title change. The receipt has no move-by-move log, kickout count, sequence of legal tags, or named fall victim for every multi-side finish. Repertoire establishes a wrestler's move ownership. It does not establish that the move happened in a particular match. The mock assigning the Northbound Driver to its correct profile owner still receives a factual repair because the move is absent from the bout's evidence. Other accepted slots survive. Historical asides continue to use the curated historical list, with a relevant match format, performance or crowd condition and checks for overlapping names.

### Migration 0166 and rollback

Run only in the approved target's idle maintenance window. Use the approved isolated database first. Confirm the host and database identity against the review configuration, take the usual recovery snapshot, and pause application writers and manual advance. The migration locks Worlds, update runs/jobs and the affected editorial tables before checking that Worlds are open and no editorial work is pending. It runs in a transaction with a 3-second lock timeout and a 60-second statement timeout.

```sh
psql "$PPW_REVIEW_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f db/migrations/0166_weekly_editorial_inspection.sql
```

Check the command exits successfully before switching the application. Verify the nullable JSONB column, size constraint and valid partial index through PostgreSQL's catalogue. In the disposable rehearsal a concurrent writer lock timed out without creating the column. A deliberately incompatible same-name index triggered catalogue verification after the column DDL and rolled it back. Removing that test obstruction allowed two successful consecutive applications. The old application projection still reads its original columns. An application rollback can leave the additive schema in place. Reopen writers on the old application if maintenance cannot finish, then retry after clearing the observed blocker. No manual rewrite of published or pending editions is needed.

The transport records the actual sent model and allowlisted public context. Headers, keys and raw rejected prose stay out. Oversized UTF-8 inspection is omitted before saving, with a second database-side byte guard on the SQL update. Editorial copy and status settle through the original pending-row update.

### Two-player budget and isolated live comparison

The nine-slot mock Terra request reserved **9,690 tokens** and **£0.083638**. Four shows of that size would request 38,760 tokens and consume all four daily attempts. The mock reported 5,257 input and 1,450 output tokens, which the pessimistic ledger charges at £0.025014 per successful call. Four such settlements cost about £0.10 on that ledger. Thirty days at that volume reaches about £3, and headroom for the next reservation can disappear sooner. Four 15,000-token reservations cannot all fit the 50,000-token day if earlier usage remains at that level. The per-request limit is 25,000. Missing usage can retain the conservative reservation. These are metering scenarios, not a prediction of a live invoice.

World Updating protects a running claim. It then gives each promotion its first card before granting second cards, and rotates first priority by certified week. With three successful allowances for two cards each, the fourth card falls back and the first promotion alternates next week. Every manager retains certified results and local copy. Differences in card size and previous Lab usage can still affect which requests fit. Groq keeps the 40-call and 160,000-token daily ceilings. The two-feature synthetic weekly request was 4,138 bytes in one provider call. The shared paced gate can allow only one prompt during a burst of calls inside its normal 65-second interval. A pacing denial uses the existing fallback instead of retrying or buying an additional rumour.

For the owner comparison, obtain approval for the isolated benchmark host and two deliberate comparison calls. Pin the reviewed candidate on the existing guarded benchmark path `phase43-ai-benchmark-safe-preview`. Use a separate disposable database host and database name and a fictional benchmark World, with no production credentials or World clone. Confirm the exact branch, World and database environment settings from the existing guard and the designated operator ID. Confirm only AI Lab controls are available, and inspect fixtures and prompt previews before enabling any permitted provider credentials on that isolated host.

In AI Lab, run the same fictional show once on Terra and once on Groq with the same detail preference. Include a short weak match, a strong tag match, a recorded referee or interference finish, and a relevant stipulation if the chosen fixture supports them. Save the verified facts, accepted prose and repair labels side by side. Judge decisive action, legal finish, cast and ownership, contrast between performances, relevance of historical comparison, and stock phrases. Record sent model, token reports, charged ledger amount and any partial fallback. Stop at the approved allowance or on a pacing denial. The guarded Lab compares Ringside providers and can inspect fictional shortform output. Weekly rumour generation and two-manager allocation are covered by the separate offline fixture and remain outside this limited live comparison.
