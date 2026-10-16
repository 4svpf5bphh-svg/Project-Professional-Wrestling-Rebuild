# PPW 2v2 tag integration — AI, titles, careers (16 October 2026)

Implementation below the agreed INDIVIDUAL / TEAMS match families. No
entire-World JSON is transferred; AI reads active World teams and title
holders once per weekly batch, indexed by World/promotion, bounded to
512/256 rows. Human-authored cards stay untouched.

- The AI reserves two active contracted same-division two-person teams
  as one 2v2 card. The wrestler identities, contracts, sides and winner side
  are explicit. A real active tag champion may defend on a major event,
  with deterministic title/main-event selection and safe roster caps.
- The World title settlement checks canonical active team membership,
  reign ownership, booked side identities and verified result in the same
  transaction as the completed show. Clean challenger victory changes the
  reigning TEAM, a holder victory records a defense, and protected,
  disqualification or medical finishes do not automatically move the belts.
  Unique contest rows prevent duplicate title resolution.
- All four tag performers receive individual fatigue, wear, momentum,
  recognition and popularity effects (plus durable injury severity/weeks-out
  evidence), stored in compact normalized records. The writer verifies
  the exact scored baseline and applies all four in a bounded SQL UPDATE
  followed by one batch INSERT, inside the completed World transaction.
  No routine read scans old career effects or pulls full histories.
- Canonical resolution retries skip secondary championship and wrestler
  mutations. Failure updating any wrestler or defending title rolls back
  the entire show result rather than publishing partial effects.
- The first 2v2 kernel retains the user's authored winning team; only
  serious medical stoppage can force the explicitly modelled override.

Known follow-up: injured wrestler availability/recovery rules, more
complete tag-specific psychology, tag title defense cadence, all singles
career persistence (previous kernel only previews it), and extension of
match-side scoring to triple threats, four ways, trios, 4v4, 5v5,
elimination and battle royals. Career snapshots are unique per wrestler
within one tag-show; multiple matches for the same wrestler intentionally
fail until cumulative show-scoped effects are implemented.

No live deployment, Neon production migration or cron activation.
Measured real Neon billed transfer/compute is still a separate acceptance
gate; query-result byte proxies do not demonstrate actual savings.
