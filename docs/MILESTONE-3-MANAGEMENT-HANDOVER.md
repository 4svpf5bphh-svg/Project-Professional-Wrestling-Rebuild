# Milestone 3 staff and player consequences

Base `c8783ce377b036834692d379f8c464c1258b0b1f`. The development branch follows the standing instructions in onboarding PR #139.

## What changed

- Staff Office and Backstage share the same promotion-scoped case. A wrestler can approach the booker after repeated strong certified performances or when a deal is running out. The Road Agent, Creative and Talent Manager can act on the same evidence within their own remit. The office links to the existing conversation, contract and Programme workflows.
- The Talent Manager tests the signed service windows before suggesting a package. An overlapping exclusive deal can yield a shorter term or a workable one-night recruitment offer. The Market distinguishes legal dates, indicative interest and affordability. Same-terms renewal advice and delegated proposals check known contractual constraints. Wrestlers still answer offers through the existing settlement.
- Road Agents distinguish weak execution, a well-worked match with weak crowd response, a repeated Programme, a timing problem and an injury. More experienced agents can recognise cumulative workload and advise on pacing. The report uses certified finishes and existing match evidence. Retired staff can bring their earned identities and competencies into the card and show report.
- Medical identifies recorded absence and clearance weeks. Trainer discusses conditioning and cumulative wear. Scout uses the existing ranked shortlist and available divisional depth. Production uses the next pencilled-in event and venue, referees can brief complex finishes, and Commentary uses certified Programme continuity. The existing financial adviser compares dependable income with fixed commitments before recommending more spending.
- Booking promises carry a specific deadline within available terms. A draft preview checks the slot, including the position of a promised featured match and the authored outcome of a promised angle. Settlement uses completed results and the opportunity on each event date. A later injury no longer excuses a missed promise if there was an earlier bookable event. An injured performer, unavailable contract or a delivery window with zero completed events can produce an excusal with zero trust loss.
- The original message and the dated outcome stay visible. A certified reply can return a thread to the unread list. Stale unanswered requests free the inbox after 12 weeks and memory projections age out after 104 weeks. Original conversation records stay available through the existing private history. Existing promises, mediation, consent, contract follow-through and World Lock retain their authority.

## Controlled playtest chronology

The test uses two independent human-manager accounts, deterministic edited cards and certified PostgreSQL fixtures. The 13-week scenario exercises the real player commands, World publication and settlement. Separate canonical World Lock tests exercise match certification. Quay had four specialists. Riverside employed none.

| Week | Conversation and decision | Outcome |
| --- | --- | --- |
| 1 | Lee North said, “We need a chat. This isn't the run I imagined.” The booker replied, “I'll put you in a match by Y1 W3.” | The booker left North off the eligible shows. Week 3 recorded a broken promise. North said, “You made me a booking promise and didn't deliver. I won't forget.” Quay-specific trust fell from 50 to 47. |
| 1–2 | Medical's Reuben Stone said, “The fatigue warning is real. I won't call another demanding match safe just because the story needs one.” Creative's Tessa Singh said, “I can work around a lighter schedule. But we must find a fresh chapter for a rivalry that has started repeating.” The manager chose to prioritise health. | Fatigue dropped below the warning level and Medical morale rose from 70 to 72. Creative acknowledged the recovery and still asked for a meaningful next chapter. |
| 1 | Riverside asked about recruiting Kit Rook. The Talent Manager said the signed schedule left no room for a new appearance commitment. | The actual offer command refused the overlapping deal. No contract was created. In a separate regression, a future exclusive start left room for a five-week package and the authoritative validator accepted that shape for negotiation. |
| 3 | After two shows with strong certified execution and crowd response, prospect Kit Rook said, “Thanks for the run you've given me. The last few shows felt like a step forward. Could I show you what I can do with a bigger part?” Road Agent Pavel Quinn recommended a clearly purposed next appearance. Tessa Singh recommended an interview to advance the active Programme. Quay promised an in-ring appearance by Week 5. | The Week 3 certified match fulfilled the promise. Rook replied, “You kept your word. That match meant a lot to me.” The second account could neither read nor answer Quay's conversation. |
| 6–7 | Alix Vale asked how much further the run could go and what their Week 9 expiry meant for the story. Talent Manager Riley Cross linked the concern to Vale's active Programme and advised checking the remaining appearances. | The manager opened negotiations and submitted an eligible package. Vale accepted through the existing contract desk resolver. The thread recorded that negotiations had opened and Staff Office could see the successor term. |
| 7–9 | Casey Cruz asked for help with a strained tag partnership. The booker chose mediation. North replied, “Our recent tag work damaged trust. If you want to give us another chance, let me know. It will have to happen in the ring.” | North was cautious about trying again. A completed Week 8 tag match reached the verified execution threshold. North then said, “I had doubts about trying again with Casey Cruz, but that completed tag match was the kind of work we needed. We have something to build on.” |
| 9–11 | Jules Ember sought an appearance and Quay promised a match by Week 11. Quay ran a dark Week 9 and Ember was injured on the other promotion's certified show. | No eligible Quay show fell before the medical restriction in the delivery window. The promise was excused and applied zero trust loss. |
| 13 | Kit Rook had sustained certified bookings, including the earlier promise. | In-ring quality moved from 66 to 66.60 and experience from 35 to 36.30. Morale moved from 74 to 66.50 under the existing morale routine, which weighs usage, momentum, workload and promotion conditions. Clicking a reply awarded no additional skill. |

## Frequency, growth and local PostgreSQL cost

The controlled human fixture produced nine wrestler messages during the first 13 weeks across two promotions, or 0.35 per promotion-week. The mix was three morale, two creative, one contract, one momentum opportunity, one partnership and one trust check-in. It produced zero repeat person/promotion/category combinations in that window. The human choices covered three booking promises, resulting in one kept, one broken and one medically excused. The relevant staff and partner follow-ups are in the chronology above.

| Human fixture checkpoint | Conversation receipts | Memory projections | Recorded working relationships | Staff employment records |
| --- | ---: | ---: | ---: | ---: |
| Week 13 | 9 | 10 | 1 | 4 |
| Week 52 | 19 | 10 | 1 | 4 |
| Week 156 | 35 | 0 | 1 | 4 |

The last 143 weeks ran without manager interventions. Over 156 weeks the categories were 13 creative, seven contract, six momentum opportunity, four booking omission, three morale, one partnership and one trust check-in. Four person/promotion/category combinations recurred across three years. The retention assertion found zero out-of-window memories at all checkpoints. Data remained private. There were zero attempted provider calls in the controlled fixture.

The same 26-week two-human fixture ran against base and branch with SQL instrumentation. Encoded bytes are the UTF-8 size of returned JSON rows and include neither wire overhead nor billed Neon compute.

| Path | Base statements / bytes | Branch statements / bytes |
| --- | ---: | ---: |
| World publication fixture, including retry and final concurrent requests | 2,441 / 248,980 | 2,441 / 249,182 |
| Backstage write statements within publication | 468 / 1,717 | 468 / 1,929 |
| Staff Office, without a Scout | 2 / 874 | 2 / 1,299 |
| Backstage inbox | 5 / 850 | 5 / 872 |
| Separate 600-person Backstage inbox budget | 5 / 17,755 | 5 / 17,755 |
| Separate 600-person Contract Desk budget | 5 / 72,983 | 5 / 72,983 |

That fixture had two request rows on base and four on the branch. The extra rows were opportunity conversations. No new job, recurring request or statement was added to publish the cases. The longer human run recorded 14,690 publication/negotiation statements and 1,495,818 returned bytes, of which 2,809 Backstage write statements returned 13,452 bytes. Repeated advice appears when the same condition remains current. Most advice is projected on read and creates no writes.

## Verification and release procedure

- Use Node 24 and disposable PostgreSQL 16 with migrations through 0165. Run `npm run typecheck`, `npm test`, `npm run test:postgres`, `npm run web:build`, `node scripts/verify-legend-release-bundle.mjs` and the mobile Chromium suite. Run `npm run test:world-year` and `npm run test:world-three-years` for the eight-AI canonical simulations. Set `PPW_MILESTONE3_LONG_TEST=1` when running `tests/milestone-3-management-postgres.test.ts` for the three-year human fixture.
- Migration `0165_backstage_management_context.sql` adds nullable case and settlement fields, expands the allowed request kinds and adds an index for retention. Existing conversation rows need no backfill. The normal rollover applies the memory retention policy on the first certified week after rollout.
- After independent approval, verify migration 0164 is present and no World update or lock is in progress. Pause manual World advancement and booking traffic for the migration window. Apply 0165 against the direct database connection in one transaction with `psql -X -v ON_ERROR_STOP=1 -1 -f db/migrations/0165_backstage_management_context.sql`. Use deployment credentials from the authorised release workflow. Confirm both columns, the request kind constraint and the retention index. Resume play after the approved application is live and the read-only Backstage and Staff Office smoke checks pass.
- If migration fails, the transaction rolls back. If code must roll back after new requests have been published, the previous build cannot render the new request kind. Preserve request history and use a compatibility build that understands that kind before resuming. Keep the additive schema during an application rollback.
- Advice remains bounded by available game records. An offer forecast cannot predict a wrestler's decision or a show's receipts. Finance figures before release are local payload estimates. Dialogue varies by temperament, career stage and evidence. Human enjoyment remains a question for independent playtesting, which can review how often recurring advice feels useful before release.
