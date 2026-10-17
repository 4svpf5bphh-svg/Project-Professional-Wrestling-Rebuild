import {test,expect} from "@playwright/test";
const overview={
 world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",
  cash:5000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}
};
const current={worldId:"genesis",playerId:"test-owner",
 csrfToken:"opaque-browser-csrf",overview,availablePromotions:[]};
test("iPhone sign in, persistent navigation and deep-linked desks",async({page})=>{
 let signedIn=false;const methods:string[]=[];
 await page.route("**/api/session",async route=>{
  await route.fulfill(signedIn?{json:current}:{status:401,json:{error:"Sign in required"}});
 });
 await page.route("**/api/auth",async route=>{
  signedIn=route.request().method()==="POST";
  await route.fulfill({json:{ok:true}});
 });
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON();
  expect(route.request().headers()["x-ppw-csrf"]).toBe(current.csrfToken);
  expect(request.worldId).toBe(current.worldId);
  expect(request.promotionId).toBe(overview.promotion.id);
  expect(request.playerId).toBeUndefined();
  methods.push(request.method);
  await route.fulfill({json:request.method==="overview"?overview:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Enter the locker room"})).toBeVisible();
 const nav=page.getByRole("navigation",{name:"Promotion navigation"});
 await expect(nav).toBeHidden();
 await page.getByLabel("Player ID").fill("test-owner");
 await page.getByLabel("Private access code").fill("test-code-123456789");
 await page.getByRole("button",{name:"Sign in"}).click();
 await expect(nav.getByRole("button",{name:"Home"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await nav.getByRole("button",{name:"More"}).click();
 await expect(page).toHaveURL(/#\/more$/);
 await expect(page.getByRole("heading",{name:"Every corner of your World"})).toBeVisible();
 await page.getByRole("button",{name:/Contracts/}).click();
 await expect(page).toHaveURL(/#\/contracts$/);
 await expect(nav.getByRole("button",{name:"Roster"})).toBeVisible();
 await nav.getByRole("button",{name:"Plan"}).click();
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await expect(page).toHaveURL(/#\/planner$/);
 await page.goto("/#/home");
 await expect(nav).toBeVisible();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 expect(methods).toContain("overview");
 expect(methods).toContain("planner");
});
test("PWA manifest, service worker and explicit offline shell",async({page,request})=>{
 const manifest=await request.get("/manifest.webmanifest");
 expect(manifest.ok()).toBeTruthy();
 expect((await manifest.json()).display).toBe("standalone");
 const worker=await request.get("/sw.js");
 expect(worker.ok()).toBeTruthy();
 expect(await worker.text()).toContain('url.pathname.startsWith("/api/")');
 const offline=await request.get("/offline.html");
 expect(offline.ok()).toBeTruthy();
 expect(await offline.text()).toContain("Bookings, results and contracts are not available offline");
 await page.goto("/");
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href","/manifest.webmanifest");
});
