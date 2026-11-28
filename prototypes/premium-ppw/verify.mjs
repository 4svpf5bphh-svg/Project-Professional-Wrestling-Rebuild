import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { expect } from "@playwright/test";

const url = process.env.PPW_PROTOTYPE_URL ?? "http://127.0.0.1:4181/";
const directory = resolve(process.env.PPW_PROTOTYPE_EVIDENCE ?? "prototypes/premium-ppw/evidence");
const capture = process.env.PPW_PROTOTYPE_CAPTURE === "1";
const record = process.env.PPW_PROTOTYPE_VIDEO === "1";
if (capture || record) await mkdir(directory, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.PPW_CHROMIUM ? { executablePath: process.env.PPW_CHROMIUM } : {}),
});
const pageErrors = [];
const sizes = [];
const offline = new Set();
const origin = new URL(url).origin;
const screen = async (page, filename) => {
  await page.locator("h1").waitFor();
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode()));
  });
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    brokenImages: [...document.images].some(image => !image.complete || image.naturalWidth === 0),
  }));
  assert.equal(layout.width, layout.viewport, "Document must fit the mobile viewport");
  assert.equal(layout.brokenImages, false);
  sizes.push({ filename, ...layout });
  if (capture) await page.screenshot({ path: resolve(directory, filename), animations: "disabled" });
  if (record && page.video()) await page.waitForTimeout(2200);
};

async function mobile(width, height, reducedMotion = "no-preference", video = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion,
    ...(video ? { recordVideo: { dir: directory, size: { width, height } } } : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    const target = new URL(request.url());
    if (request.isNavigationRequest() || target.protocol === "data:") return;
    if (target.origin !== origin || target.pathname.startsWith("/api/")) offline.add(request.url());
  });
  page.on("response", response => {
    if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url);
  return { page, context };
}

try {
  const { page: regular, context: regularContext } = await mobile(390, 844, "no-preference", record);
  await expect(regular.getByRole("heading", { name: "The first defence." })).toBeVisible();
  assert.equal(await regular.getByRole("button", { name: "Sound" }).getAttribute("aria-pressed"), "false");
  await screen(regular, "01-week-390.png");
  await regular.getByRole("link", { name: "Book the closing segment" }).tap();
  await expect(regular.getByRole("heading", { name: "The run sheet." })).toBeFocused();
  await screen(regular, "02-card-390.png");
  await regular.getByText("Script and running order", { exact: true }).tap();
  await regular.getByLabel("Scripted finish").selectOption("vera");
  await regular.getByRole("button", { name: "Move Ivy Knox vs Vera Night up" }).tap();
  await expect(regular.locator(".warning")).toContainText("pacing penalty");
  await regular.getByRole("button", { name: "Move Ivy Knox vs Vera Night down" }).tap();
  await expect(regular.locator(".warning")).toHaveCount(0);
  await expect(regular.getByLabel("Scripted finish")).toHaveValue("vera");
  if (record) await regular.waitForTimeout(1600);
  await regular.getByRole("button", { name: "Confirm this episode" }).tap();
  await expect(regular.getByRole("heading", { name: "Foundry Hall." })).toBeVisible();
  await screen(regular, "03-before-the-bell-390.png");
  await regular.getByRole("button", { name: "Ring the bell" }).tap();
  await expect(regular.getByRole("heading", { name: "Vera Night takes the belt." })).toBeFocused();
  await expect(regular.getByText(/Coastline lost the slot/)).toBeVisible();
  await screen(regular, "04-title-change-390.png");
  await regular.getByRole("link", { name: "Carry it into the season" }).tap();
  await expect(regular.getByRole("heading", { name: "Vera Night", exact: true })).toBeVisible();
  await regular.getByRole("button", { name: /Reserve Ivy’s title match/ }).tap();
  await expect(regular.getByRole("heading", { name: "Next chapter set" })).toBeVisible();
  await regular.evaluate(() => window.scrollTo(0, 0));
  await screen(regular, "05-season-390.png");
  await regular.reload();
  await expect(regular.getByText(/Ivy is booked to challenge Vera/).first()).toBeVisible();
  const dossier = regular.getByRole("button", { name: "Champion’s dossier" });
  await dossier.focus();
  await dossier.press("Enter");
  await expect(regular.getByRole("dialog", { name: "Vera Night" })).toBeVisible();
  await screen(regular, "06-dossier-390.png");
  await regular.keyboard.press("Escape");
  await expect(dossier).toBeFocused();
  const video = regular.video();
  await regularContext.close();
  if (video) {
    const source = await video.path();
    await video.saveAs(resolve(directory, "mobile-journey.webm"));
    const { unlink } = await import("node:fs/promises");
    await unlink(source);
  }

  const { page: small, context: smallContext } = await mobile(320, 744, "reduce");
  await small.getByRole("link", { name: "Book the closing segment" }).tap();
  const hold = small.getByRole("radio", { name: /Save the rematch for PPV/ });
  await hold.check();
  await expect(small.getByText("35 min", { exact: true })).toBeVisible();
  await expect(hold).toBeFocused();
  await screen(small, "07-alternate-card-320.png");
  await small.getByRole("button", { name: "Confirm this episode" }).tap();
  await small.getByRole("button", { name: "Skip to the result" }).tap();
  await expect(small.getByRole("heading", { name: "Vera makes it personal." })).toBeVisible();
  await expect(small.getByText(/Coastline won the slot/)).toBeVisible();
  assert.ok(await small.locator(".aftermath").evaluate(node =>
    Number.parseFloat(getComputedStyle(node).animationDuration) <= 0.001));
  await screen(small, "08-alternate-result-320.png");
  await small.getByRole("link", { name: "Carry it into the season" }).tap();
  await expect(small.getByRole("heading", { name: "Ivy Knox", exact: true })).toBeVisible();
  await small.getByRole("button", { name: "Keep the contender slot open" }).tap();
  await expect(small.getByText(/Vera’s televised challenge remains unresolved/).first()).toBeVisible();
  await small.getByRole("button", { name: "Change the next chapter" }).tap();
  await small.getByRole("button", { name: "Reserve Vera’s title match" }).tap();
  await expect(small.getByText(/Vera is booked to challenge Ivy/).first()).toBeVisible();
  await small.getByRole("button", { name: "Restart episode" }).tap();
  await expect(small.getByRole("heading", { name: "The first defence." })).toBeVisible();
  await small.getByRole("button", { name: "Sound" }).tap();
  await expect(small.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "true");
  await small.getByRole("button", { name: "Sound" }).tap();
  await expect(small.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
  await smallContext.close();

  // A separate reload on a shaped mobile connection gives a local reference point.
  const performanceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const performancePage = await performanceContext.newPage();
  const cdp = await performanceContext.newCDPSession(performancePage);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 120, downloadThroughput: 200_000, uploadThroughput: 100_000,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await performancePage.addInitScript(() => {
    new PerformanceObserver(list => {
      window.lastContentPaint = list.getEntries().at(-1)?.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await performancePage.goto(url, { waitUntil: "load" });
  await performancePage.waitForFunction(() => Number.isFinite(window.lastContentPaint));
  const performance = await performancePage.evaluate(() => {
    const navigation = window.performance.getEntriesByType("navigation")[0];
    const resources = window.performance.getEntriesByType("resource");
    return {
      lcpMs: Math.round(window.lastContentPaint),
      loadMs: Math.round(navigation.loadEventEnd),
      responseBodyBytes: [navigation, ...resources].reduce((total, entry) => total + entry.encodedBodySize, 0),
      resources: resources.length + 1,
    };
  });
  await performanceContext.close();
  assert.deepEqual([...offline], [], "The preview should issue no API or third-party requests");
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ state: "passed", sizes, performance, apiOrThirdPartyRequests: offline.size }, null, 2));
} finally {
  await browser.close();
}
