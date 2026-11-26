import { expect, test } from "@playwright/test";

for (const width of [320, 390]) {
 test("a manager can follow a rival AI programme from News to Results at " + width + "px",
  async ({ page }) => {
   await page.setViewportSize({ width, height: 844 });
   const now = Date.now() / 1_000;
   const overview = {
    world: { revision: 5, name: "PPW", year: 1, week: 6, phase: "OPEN", nextLockEpoch: now + 6000, serverEpoch: now },
    membership: "ACTIVE",
    promotion: { id: "human", name: "Human Pro", tier: "LOCAL", cash: 1_000_000, debt: 0 },
   };
   const story = {
    year: 1, week: 5, id: "programme:official:ai-story-certified", promotionId: "ai",
    promotionName: "Rival Wrestling", showId: "completed-premium", desk: "OFFICIAL", certainty: "CONFIRMED",
    title: "Cara and June settle the title chase", summary: "Cara earned her shot and won the title at Final Clash.",
    sourceKind: "MATCH",
   };
   let resultRequests = 0;
   await page.route("**/api/session", route => route.fulfill({
    json: { worldId: "world", playerId: "owner", csrfToken: "opaque", overview, availablePromotions: [] },
   }));
   await page.route("**/api/card", route => {
    const { method } = route.request().postDataJSON() as { method: string };
    if (method === "industry") return route.fulfill({ json: {
     worldName: "PPW", year: 1, week: 6, phase: "OPEN", nextLockEpoch: now + 6000,
     ownPromotionId: "human", ownPromotionName: "Human Pro", promotions: [], headlines: [],
     broadcasts: [{ showId: "completed-premium", promotionId: "ai", promotionName: "Rival Wrestling",
      showName: "Final Clash", bookingClass: "PREMIUM", year: 1, week: 5, crowdResponse: 84,
      isYours: false, humanManaged: false, publicResults: true }],
    } });
    if (method === "industryNews") return route.fulfill({ json: { awards: [], annualAwards: [], voices: [], stories: [story] } });
    if (method === "publicResults") {
     resultRequests++;
     return route.fulfill({ json: {
      showId: "completed-premium", promotionName: "Rival Wrestling", showName: "Final Clash", year: 1, week: 5,
      crowdResponse: 84, entries: [
       { slotId: "angle", position: 0, type: "SEGMENT", headline: "Cara makes her final challenge",
        outcome: "HAPPENS", winner: null, ratingStars: null, crowdResponse: 80 },
       { slotId: "main", position: 1, type: "MATCH", headline: "Cara vs June", outcome: "SUBMISSION",
        winner: "Cara", ratingStars: 4.25, crowdResponse: 88, programme: "Road to the Championship · Finale" },
      ],
     } });
    }
    return route.fulfill({ json: method === "overview" ? overview : {} });
   });
   await page.goto("/#/news");
   await page.getByRole("button", { name: "Official News" }).click();
   await expect(page.getByText(story.title, { exact: true })).toBeVisible();
   await page.locator(".ppw-hot-tag-thread summary").click();
   await expect(page.locator(".ppw-hot-tag-news-copy p").first()).toBeVisible();
   expect(resultRequests).toBe(0);
   await page.getByRole("button", { name: "Read Results", exact: true }).click();
   await expect(page.getByRole("heading", { name: "Final Clash" })).toBeVisible();
   await expect(page.getByText("Road to the Championship · Finale")).toBeVisible();
   await expect(page.getByText("WINNER · Cara")).toBeVisible();
   await expect(page.getByText("Cara makes her final challenge")).toBeVisible();
   expect(await page.locator("body").evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(width);
   expect(resultRequests).toBe(1);
   await page.getByRole("button", { name: "Back to News" }).click();
   await expect(page.getByText(story.title, { exact: true })).toBeVisible();
  });
}
