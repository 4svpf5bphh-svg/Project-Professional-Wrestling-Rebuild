# Milestone 8 verification

The comparison starts at the accepted Milestone 7 release `0b2c5f940169d120811915eeff7cf603925698a3`. The tests used the production web bundle, invite authentication, HTTP adapter and manual World controls with PostgreSQL 16.16 and migrations 0001–0170 in separate disposable databases. Node.js 24.22.3 and Chromium 156.0.8078.79 ran in the Personal Codex workspace. The worlds used disposable data and the harness disabled external provider credentials.

## Recorded play

The [four-week browser journey](four-weeks-430.mp4) uses a 430px Chromium touch viewport with reduced motion. Buttons were operated with the keyboard. It shows quick booking and confirmation, an advanced Steel Cage title match, the Week 2 PPV report and the two certified event listings, a dark Week 3 and a subsequent championship defence. The recording is sped up to reduce waiting time.

| Screen | Evidence |
| --- | --- |
| Promoter’s Office | [Milestone 7 at 390px](baseline-promoters-office.webp) · [Milestone 8 at 390px](candidate-promoters-office.webp) · [320px](candidate-320-promoters-office.webp) |
| A real backstage commitment and the booking context | [Promoter’s decision](candidate-contextual-decision.webp) · [Booking Room](candidate-booking-room.webp) |
| Quick booking and the confirmed running order | [Outcome entry](candidate-quick-booking.webp) · [Run sheet](candidate-run-sheet.webp) |
| Advanced booking | [Steel Cage match](candidate-advanced-editing.webp) |
| Showtime | [World readiness](candidate-week-1-readiness.webp) |
| Certified result and continuity | [PPV Ringside](candidate-certified-premium-result.webp) · [TV Ringside and title change](candidate-certified-tv.webp) · [After the Bell](candidate-after-the-bell.webp) · [Week 2 Home](candidate-next-week-home.webp) |
| Wrestler profile | [Samoa Joe dossier](candidate-wrestler-dossier.webp) |
| Desktop and cosmetics | [Desktop Office](candidate-desktop-office.webp) · [Retro Booker ’02 and Inferno](candidate-cosmetic-skin.webp) |

Two separately migrated databases began with World ID `m8-branch-comparison`, seed `8213`, the same cards, contracts, programme and initial championship lineage. In one, Will Ospreay won the Week 2 title match and defended in Week 4. In the other, Samoa Joe retained and completed two defences. Both produced four seals, four Crown events in weeks 1, 2, 2 and 4, and certified programme chapters in weeks 2 and 4. Alex Shelley’s existing appearance promise closed as fulfilled on Week 1 certification. A separate 320px journey signed in a new player, joined, claimed Crown Wrestling, booked, manually advanced and reached the new week. The 13-week PostgreSQL regression certified eight simulated promotions.

A separate commercial fixture enabled the existing market and show economics before Week 1. The operator certified Ascension and The Lottery in the same Week 2. Ascension recorded a 0.11 TV household rating, 185,000 estimated viewers and $110,400 net. The Lottery recorded 510 estimated PPV buys and $101,400 net. The cosmetic follow-up bought and applied Retro Booker ’02 on the certified PPV and checked the wallet across reload. It opened the certified TV report from the PPV, returned through the same-week link and verified the Inferno poster under the applied skin. [Commercial PPV](candidate-certified-premium-result.webp) · [After the Bell](candidate-after-the-bell.webp) · [Selected skin and event poster](candidate-cosmetic-skin.webp)

## Scenario coverage

| Required scenario | Verification |
| --- | --- |
| New account and existing save | Real invite authentication, World join, promotion claim and first-show certification at 320px. Established Crown save checked at 390 and 430px. |
| Ordinary booking and advanced freedom | Matched ordinary three-match trial. Steel Cage, authored finish, title and existing programme in the four-week run. Existing booking suites cover team, interference, longer matches and angles. |
| Different creative choices and title lineage | Same starting title programme twice. One certified change of champion and a later defence. Alternative certified two defences by the original champion. |
| Backstage consequences | Existing appearance promise fulfilled by the certified opener. Scoped promise and contract tests cover alternate outcomes, expiry, medical and renewal. |
| Event calendar and competition | Two owner events in Week 2, distinct certified TV and PPV performance in the commercial fixture, no owner event in Week 3. |
| Multiplayer ownership and resource clearance | Two signed browser contexts, a shared venue conflict, independent readiness and publication after authorised arbitration. [Multiplayer journey](../../tests/browser/milestone8-multiplayer.spec.ts) |
| Refresh, retries and recoverability | Certified PPV reopened without a second wallet or result settlement. Stale booking and interruption scenarios covered by existing browser and resolver regressions. |
| Existing cosmetics and press | Applied Retro Booker ’02 with an assigned Inferno poster, retained through browser reload. Results and press regressions cover optional presentation and immediate full-show access. |
| Accessibility and presentation | 320, 390 and 430px mobile widths, desktop capture and four weeks with keyboard and reduced motion. |

## Comparative workloads

Each World size has three sequential baseline and candidate pairs using the same IDs, seed, roster sizes, scheduled card and operator request sequence. Counts below are medians. Database bytes are JSON-encoded result rows measured at the PostgreSQL client. The changed-row count is the command tag row count for INSERT, UPDATE, DELETE and MERGE. It omits affected rows inside statements whose top-level command is SELECT. Network protocol overhead, internal scanned tuples and hosted Neon billing were outside the local test.

| Companies | API advance requests | SQL statements | Returned rows | Changed rows | SQL response bytes | API response bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 4 → 4 | 505 → 505 | 532 → 532 | 199 → 199 | 91,676 → 91,676 | 877 → 877 |
| 8 | 4 → 4 | 797 → 797 | 2,084 → 2,084 | 709 → 709 | 427,395 → 427,395 | 933 → 933 |
| 13 | 4 → 4 | 1,080 → 1,080 | 3,481 → 3,481 | 1,134 → 1,134 | 718,758 → 718,758 | 1,045 → 1,045 |

The measured certified-week counts and bytes changed by 0%. The quieter sequential pairs had wall-clock medians of 729 → 670 ms (−8.1%) at two companies, 1,142 → 1,297 ms (+13.6%) at eight and 1,723 → 1,928 ms (+11.9%) at thirteen. The largest median difference was 206 ms. The manual advancement engine and measured SQL workload were identical. Earlier trials on the shared machine varied substantially with concurrent browser and regression tests. [Baseline samples](baseline-workload.ndjson) · [Candidate samples](candidate-workload.ndjson)

| Matched request | SQL statements | Returned rows | SQL response bytes | API response bytes |
| --- | ---: | ---: | ---: | ---: |
| Home session, 2 or 8 companies | 3 → 3 | 3 → 3 | 1,718 → 1,732 (+0.8%) | 1,699 → 1,699 |
| Home session, 13 companies | 3 → 3 | 3 → 3 | 1,720 → 1,734 (+0.8%) | 1,702 → 1,702 |
| Booking Room load, all sizes | 6 → 6 | 1 → 1 | 584 → 584 | 698 → 698 |

Each measured authenticated Home open and direct card open used one API request. The Home payload includes the bounded promoter context. Both builds made zero external provider requests during the measured workloads. The harness blocked and counted outbound provider requests, separately from static assets and archive navigation.

Three matched 390px Chromium runs loaded Home from fresh browser contexts and then reloaded it with the browser cache. Median time to the rendered World status was **942 → 788 ms cold (−16.3%)** and **311 → 338 ms warm (+8.7%, 27 ms)**. The warm ranges overlapped (238–362 ms baseline, 283–362 ms candidate). Each opening used one signed session request with a median 1,719-byte response and three SQL statements. Initial gzip JS/CSS decreased from **528,479 to 473,896 bytes (−10.3%)**, comprising JS 387,088 → 352,397 and CSS 141,391 → 121,499. Warm reloads transferred zero JS/CSS bytes in all six trials. These local timings include the signed session request and rendering. [Baseline repetitions](baseline-frontend-390.json) · [Candidate repetitions](candidate-frontend-390.json)

The authenticated single-match journey took 12 → 8 interactions (−33%) from the Home event through confirmation. Measured browser task times on the shared machine were 12.4 → 8.3 seconds. In three matched ordinary three-match trials, taps fell from 30 to 18 (−40%), duration entries from 3 to 0, API requests from 8 to 6 (−25%), SQL statements from 55 to 51 (−7%) and median API bytes from 33,135 to 19,281 (−42%). Median task time was 10.5 → 3.4 seconds. Timing varied with concurrent tests. Both builds saved equivalent participants, finishes, minutes and running order. [Booking comparison](../../tests/browser/milestone8-booking-comparison.spec.ts)

## Regression results

- The unit run passed 1,326 tests, with 225 PostgreSQL-dependent cases skipped in that run. The PostgreSQL suite was run separately. The first full run passed 229 of 230 cases. Its one failure was 27 excess encoded bytes in an existing Home-plus-roster budget. The Home projection was compacted and the original threshold then passed without an allowance change. The six-desk full-roster run used 15 SQL statements, 86 returned rows and 43,416 encoded result bytes.
- Signed browser tests covered two independent managers, a missing readiness confirmation, authorised same-day venue arbitration, owner-only cards and reports, and a repeated publication request with unchanged receipt digests, ledger count and remaining dates.
- Targeted Chromium regressions passed 47 Ringside cases including four account skins, 20 booking cases plus the final keyboard/touch pass, 11 dossier cases, eight shell and booking-finance cases and 10 final Home, Ratings War, spectator and World history cases.
- The approved prototype assessment, source, evidence and both interactive branches were reviewed. The earlier standalone gameplay assessment was unavailable. The released game’s exact source SHA was used for comparison after the live-site browser proxy denied access.

## Repeat locally

Set `PPW_M8_DATABASE_URL` to a migrated loopback PostgreSQL database named `ppw_m8` or `ppw_m8_<scenario>`. The browser harness requires a built `dist/web`, optionally overridden with `PPW_M8_STATIC_ROOT`, and opens a temporary loopback HTTPS server. It uses the same signed session and manually gated advance endpoints as the application. If the installed browser comes from the operating system, set `PPW_M8_CHROMIUM` to its executable.

```sh
PPW_M8_FULL_JOURNEY=1 npm exec -- playwright test --config playwright.milestone8.config.ts milestone8-authenticated.spec.ts
npm exec -- tsx scripts/measure-milestone8.ts /path/to/baseline 2 one
npm exec -- tsx scripts/measure-milestone8.ts . 2 one
npm exec -- tsx scripts/measure-milestone8-browser.ts . one
```

Use separate databases with fresh Worlds for matched baseline and candidate replicates. Repeat the benchmark with sizes 8 and 13 and replicate labels such as `two` and `three`. Set `PPW_M8_TITLE_WINNER=champion` to book the alternative title outcome or `PPW_M8_COMMERCIAL=1` to add the existing market and commercial settlement to the full journey. For a measured account onboarding run, use a fresh database and set `PPW_M8_COLD_START=1`.

The validation environment used Node 24.22.3, Chromium 156.0.8078.79, Playwright 1.64.1 and disposable PostgreSQL 16.16. The mobile results describe Chromium emulation at 320, 390 and 430px. Playwright’s WebKit archive returned HTTP 403 from every configured mirror. There was no physical iPhone verification.
