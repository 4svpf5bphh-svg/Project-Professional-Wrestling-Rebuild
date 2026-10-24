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
 await page.route("**/api/admin",route=>route.fulfill({json:{
 plan:{year:1,week:2,action:"WAIT_FOR_WORLD_LOCK",blockers:[],
 ready:{phase:"OPEN",active:1,submitted:0,regularSubmitted:0,
 cleared:null,certified:null,legacyResolved:0,detailedResolved:0}},
 settings:{model:"openai/gpt-oss-120b",voice:"MARTY",detail:"BALANCED",
 creativity:0.92,reasoning:"low",additionalGuidance:"",version:0},
 groqConfigured:false,shows:[]
 }}));
 await page.goto("/#/admin");
 await expect(page.getByRole("heading",{name:"Control Room"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Keep booking open for 5 years"})).toBeVisible();
 await expect(page.locator(".ppw-bottom-navigation .ppw-bottom-tab")).toHaveCount(5);
 page.once("dialog",d=>d.accept());
 await page.getByRole("button",{name:"Keep booking open for 5 years"}).click();
 await expect(page.getByRole("heading",{name:"Control Room"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Keep booking open for 5 years"})).toBeVisible();
 await page.goto("/#/home");
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
 expect(extensions).toBe(1);
 expect(readCount).toBeGreaterThanOrEqual(1); // Admin GET is separate from World overview
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
 await expect(page.getByRole("button",{name:"Keep booking open for 5 years"})).toHaveCount(0);
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
