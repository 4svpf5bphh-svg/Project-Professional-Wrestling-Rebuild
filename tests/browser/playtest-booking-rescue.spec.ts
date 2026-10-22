import {test,expect} from "@playwright/test";

test("expired booking offers the authorised Crown operator a shared recovery action",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const base=Date.now()/1000,expired={
  world:{revision:8,name:"PPW Rebuild Genesis",year:1,week:2,phase:"OPEN",
   nextLockEpoch:base-3600,serverEpoch:base},
  membership:"ACTIVE",promotion:{id:"crown",name:"Crown Wrestling",tier:"INDEPENDENT",
   cash:5000000,debt:0,lastWeeklyNet:-49034,attention:{unpreparedShow:true}}};
 const restored={...expired,world:{...expired.world,revision:9,
  nextLockEpoch:base+86400,serverEpoch:base}};
 let reopened=false,extensions=0,readCount=0;
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"genesis",playerId:"operator",csrfToken:"csrf",
  overview:expired,availablePromotions:[],canManualAdvance:true
 }}));
 await page.route("**/api/card",r=>{
  readCount++;
  return r.fulfill({json:reopened?restored:expired});
 });
 await page.route("**/api/playtest-booking",async r=>{
  const body=r.request().postDataJSON();
  expect(body).toMatchObject({confirm:"EXTEND_SHARED_BOOKING",year:1,week:2});
  expect(r.request().headers()["x-ppw-csrf"]).toBe("csrf");
  extensions++;reopened=true;
  await r.fulfill({json:{status:"OPEN",year:1,week:2}});
 });
 await page.goto("/#/home");
 await expect(page.getByText("Booking deadline reached · check World status")).toBeVisible();
 await expect(page.getByRole("button",{name:"Reopen booking for 24 hours"})).toBeVisible();
 await expect(page.locator(".ppw-bottom-navigation .ppw-bottom-tab")).toHaveCount(5);
 page.once("dialog",d=>d.accept());
 await page.getByRole("button",{name:"Reopen booking for 24 hours"}).click();
 await expect(page.getByText(/BOOKING OPEN/).first()).toBeVisible();
 await expect(page.getByRole("button",{name:"Reopen booking for 24 hours"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
 expect(extensions).toBe(1);
 expect(readCount).toBeGreaterThanOrEqual(2);
});
test("ordinary manager never sees a shared World booking extension control",async({page})=>{
 const now=Date.now()/1000;
 const overview={world:{revision:8,name:"Genesis",year:1,week:2,
  phase:"OPEN",nextLockEpoch:now-400,serverEpoch:now},membership:"ACTIVE",
  promotion:{id:"human",name:"Guest Promotion",tier:"LOCAL",
  cash:1000000,debt:0,lastWeeklyNet:null}};
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"genesis",playerId:"guest",csrfToken:"guest-csrf",
  overview,availablePromotions:[],canManualAdvance:false}}));
 await page.route("**/api/card",r=>r.fulfill({json:overview}));
 await page.goto("/#/home");
 await expect(page.getByText(/DEADLINE REACHED/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Reopen booking for 24 hours"})).toHaveCount(0);
});

test("iPhone cash remains on one line without overflow at 320px",async({page})=>{
 await page.setViewportSize({width:320,height:700});
 const t=Date.now()/1000;
 const overview={world:{revision:9,name:"Genesis",year:1,week:2,
  phase:"OPEN",nextLockEpoch:t+3600,serverEpoch:t},
  membership:"ACTIVE",promotion:{id:"crown",name:"Crown Wrestling",
   tier:"INDEPENDENT",cash:5950966,debt:0,lastWeeklyNet:-49034}};
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"genesis",playerId:"operator",csrfToken:"csrf",
  overview,availablePromotions:[],canManualAdvance:true}}));
 await page.route("**/api/card",r=>r.fulfill({json:overview}));
 await page.goto("/#/home");
 const tile=page.locator(".ppw-home-stat").first();
 const value=tile.locator("strong");
 await expect(value).toContainText("5,950,966");
 const info=await value.evaluate(element=>{
  const style=getComputedStyle(element);
  const rect=element.getBoundingClientRect();
  return {nowrap:style.whiteSpace==="nowrap",fits:element.scrollWidth<=rect.width+1,
   bodyOverflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 expect(info.nowrap).toBe(true);
 expect(info.fits).toBe(true);
 expect(info.bodyOverflow).toBe(false);
});
