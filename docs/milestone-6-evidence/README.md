# PPW Milestone 6 verification

See the updated [independent review captures and regression results](review/README.md) for the corrected presentation, booking confirmation and Home event labels.

The application commit is `5edfcc413abd0e18d34502ba2a3ab90c8cdd66a2`. The comparison uses the accepted Milestone 5 commit `354a7147cc1d51fc6ccfc454024067c6ef71afba`. Both builds used their corresponding API code and the same disposable PostgreSQL 16 data. [Milestone 5 review](https://github.com/4svpf5bphh-svg/Project-Professional-Wrestling-Rebuild/pull/144#issuecomment-7228893214)

## Screens from the running application

| Journey | Milestone 5 | Milestone 6 |
| --- | --- | --- |
| 390px Home after TV and PPV certification | [Home](baseline-weekly-home-390.webp) | [Home](candidate-weekly-home-390.webp) |
| Certified PPV with Inferno poster and Retro Booker ’02 selected | [PPV Results](baseline-ppv-results-390.webp) | [PPV Results](candidate-ppv-results-390.webp) |
| Programme authoring and match casting | | [Cast pop-out](candidate-programme-picker-390.webp) · [Booking availability](candidate-talent-picker-390.webp) |
| Event settlement | | [Event Accounts](candidate-event-accounts-390.webp) |
| 1280px dashboard | | [Desktop Home](candidate-weekly-desktop.webp) |

The playtests used separately authenticated Local and Global promotion managers. Both booked and confirmed cards in the running application. Crown Wrestling booked Ascension and The Lottery in the same week. Atlas Wrestling confirmed its own television card. Each manager could see their own bookings, private screens and selected cosmetics. Cross-promotion Backstage, Business and show-confirmation requests were rejected for both sessions. The disposable resolver advanced the World from Year 1 Week 1 to Week 2. The browser journey then opened both Crown reports independently, checked play-by-play, press, Programme follow-up, Event Accounts, Ratings War, Official News and Hot Tag, and reopened the next card after reload.

The commercial replay recorded a 0.06 TV rating and $57,920 event net for Ascension, 300 estimated PPV buys and $48,920 event net for The Lottery, and a 3.20 TV rating and $5,437 event net for Atlas Live. Ascension’s certified finish was a submission. The Lottery’s was a clean pin. The picker showed an exhausted contract and named the other show when the same wrestlers were cast on television and PPV.

## Local request measurements

The 390px journey opened authenticated Home and then opened the same Year 1 Week 2 Ascension card. The counts include API response bodies and SQL statements issued by those requests. Authentication and static assets are outside the measurement.

| Interaction | API requests | SQL statements | JSON response bytes |
| --- | --- | --- | --- |
| Open Home | 2 → 1 | 4 → 3 | 3,905 → 2,236 |
| Open the card from Home | 2 → 1 | 10 → 6 | 3,934 → 1,318 |
| Combined | 4 → 2 | 14 → 9 | 7,839 → 3,554 |

The signed session already contains the Home overview. Direct event links also remove the intervening Planner request when a show has a venue. Returning to Home still reads current state. These measurements describe the local application workload. Neon billing and production latency were outside the playtest.

## Verification scope

- Node.js 24, TypeScript, production PWA build and all 95 approved Legends assets passed. The baseline and candidate used 168 numbered schema migrations on PostgreSQL 16.16.
- The local PostgreSQL suite passed 226 cases, including contract renewals, unavailable talent, ownership, and certified multi-show settlement. The accepted baseline completed 52 weeks. The candidate passed the 13-week mixed human and AI Programme replay and the 156-week eight-promotion World run. The mixed replay exercised 52 dual-show workers and six injuries, with zero matches or angles assigned during a certified absence.
- Chromium covered iPhone-sized 320px, 390px and 430px viewports, desktop and reloads. The installed-PWA navigation case was included in Playwright. Physical iPhone Safari remains unverified. The cloud network blocked the Playwright WebKit download.
- The workspace-provided build and database helpers were available. The published PPW start skill was absent from the accessible skill catalogues and checkouts. Manual advance in the local browser was covered by the existing browser regression. The real PostgreSQL playtest used the same resolver directly because the browser’s operator control is gated to a hosted configuration.
- The candidate carries no new migration. Provider credentials and paid calls were unnecessary for the local runs.
