# Milestone 6 review corrections

The running app served authenticated reports from disposable PostgreSQL 16. Chromium captured both certified shows at a 390px viewport with reduced motion. Ascension used the Lucha Fiesta opening and showed a submission. The Lottery retained its equipped Inferno poster and showed a clean pinfall. Each sheet shows the TV report above the PPV report, with the Full show, recorded fallback, cached article and Post-show brief.

| Results skin | TV and PPV captures |
| --- | --- |
| Default | [Default](default.webp) |
| Territory TV | [Territory TV](territory-tv.webp) |
| Fight Night | [Fight Night](fight-night.webp) |
| Underground Zine | [Underground Zine](underground-zine.webp) |
| Retro Booker ’02 | [Retro Booker ’02](retro-booker-02.webp) |

All ten combinations kept the event artwork and visibly changed the selected report section. In the reported Retro Booker ’02 case, fallback text contrast rose from **1.04:1 to 14.54:1**. Playwright checks a minimum of 4.5:1 for fallback and cached narratives, the article close and status, post-show counts and both navigation states. The live captures used the recorded fallback and fixture articles seeded in the local commentary cache from the same certified result. [Retro Booker ’02 before and after](retro-contrast.webp)

Cancelling a finish change kept Foreign Object selected and retained the focus and scroll position. Saving and reloading the disposable card confirmed the winner, finish, chair, referee spot, selected wrestler and successful run-in. Accepting the change saved Clean Pin and cleared the finish-specific details while retaining the winner, duration and run-in. The browser suite also covers cancelling and accepting a match rules change. [Booking after cancellation](booking-cancel.webp)

Home uses the certified audience format for completed reports and a matching active broadcast obligation for scheduled television. A regular card with insufficient evidence shows **Regular event**. The owner projection also covers a mixed TV and PPV week, an off-slot card and a rival’s agreement. The same signed-in Home-to-card comparison still used **2 API requests and 9 SQL statements**, down from **4 and 14** on Milestone 5. The response payload in this sample was **3,554 bytes**, down from **7,838**. [Home with TV and PPV, and a regular event](home.webp)

Physical iPhone Safari and the hosted Admin advance control remain release smoke tests.
