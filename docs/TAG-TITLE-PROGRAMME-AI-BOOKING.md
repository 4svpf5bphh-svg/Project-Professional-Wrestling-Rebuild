# PPW tag identity, singles championship and programme booking integration

## Source parity and smallest complete slice
The original booking engine first considers active singles champions, tag
champions, then existing programmes and established teams. The rebuilt
simulator currently supports only two-wrestler singles matches through its
medical, interference, alignment and completed evidence contract.

This milestone adds normalized World-owned tag teams and memberships,
promotion-owned singles/tag championship definitions, current/recent reigns
and recorded contests, and explicitly sided programme participants. These
are relational records, never duplicated full World-state JSON.

The AI reads all hot active programme pairs, active singles champions and
established teams in three bounded World-scoped queries per weekly generation
stage. When a genuine eligible programme pairing exists, it can headline
the card and writes a canonical match-programme activity link. A major event
can book an actual singles championship bout with a valid defending champion
and eligible challenger. The author still picks the match winner.

The authoritative resolved singles title bout now changes a reign ONLY for
a clean, flash or submission challenger victory. A successful titleholder
victory increments defenses. A protected or injury-stoppage finish retains
the belt without a fraudulent successful-defense count. All title writes,
contest ledger and completed show receipt occur in one World transaction;
identical show resolution retries do not apply a second title change.
Booking more than one defense of the same belt in a show is rejected.

World-owned active tag-team partners are never casually booked as singles
opponents when other legal options exist. The tag-team roster and current
title holders have canonical SQL identities ready for later first-class
tag simulation; no fake tag bouts or impossible tag-title results are
created in this phase. Titles do not spring into existence unless imported
or created legitimately. A human booking is never overridden.

## Remaining parity dependencies
1. Four-person tag match cards, side-based scripted winners, tag chemistry,
   style, medical outcomes, four-person careers, results evidence and title
   settlements must land together. The current singles result proof cannot
   safely be repurposed as a tag result.
2. Historical team, title/reign and programme participant import from the
   ORIGINAL live World will require a trusted verified once-only projection
   before enabling those features in a migrated World. An absent record
   means absent known context, not a fictional title or feud.
3. Original title-defense due intervals (not only major-event title matches),
   explicit championship creation/retirement, title vacating, contender
   rankings, long-running programme evolution and AI tag booking follow.
4. Neon billed transfer will be measured separately on staging; bounded SQL
   query results here are a proxy only.

No deployment, old cron activation or production database mutation.
