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
 const readsOnHome=methods.length;
 await nav.getByRole("button",{name:"More"}).click();
 await expect(page.getByRole("heading",{name:"Promotion office"})).toBeVisible();
 expect(methods.length,"Opening the local office menu never reads Neon").toBe(readsOnHome);
 await nav.getByRole("button",{name:"Home"}).click();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await page.getByRole("button",{name:/Talent Market/}).click();
 await expect(page).toHaveURL(/#\/market$/);
 await nav.getByRole("button",{name:"Home"}).click();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await nav.getByRole("button",{name:"More"}).click();
 await expect(page).toHaveURL(/#\/more$/);
 await expect(page.getByRole("heading",{name:"Promotion office"})).toBeVisible();
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

test("compact iPhones retain legible touch navigation and no horizontal shell overflow",async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=route.request().postDataJSON().method;
  await route.fulfill({json:method==="overview"?overview:{}});
 });
 await page.goto("/#/home");
 const nav=page.getByRole("navigation",{name:"Promotion navigation"});
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await expect(page.locator(".ppw-shell-logo")).toHaveText("PPW");
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("AEW");
 await expect(nav.locator(".ppw-tab")).toHaveCount(5);
 const audit=()=>page.evaluate(()=>{
  const tabs=[...document.querySelectorAll<HTMLElement>(".ppw-navigation .ppw-tab")];
  return {overflow:document.documentElement.scrollWidth-innerWidth,
   tabWidths:tabs.map(b=>Math.round(b.getBoundingClientRect().width)),
   tabHeights:tabs.map(b=>Math.round(b.getBoundingClientRect().height))};
 });
 let sizes=await audit();
 expect(sizes.overflow).toBeLessThanOrEqual(1);
 expect(Math.min(...sizes.tabHeights)).toBeGreaterThanOrEqual(44);
 await nav.getByRole("button",{name:"More"}).click();
 await expect(page.getByRole("heading",{name:"Promotion office"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Creative"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"The business"})).toBeVisible();
 sizes=await audit();
 expect(sizes.overflow).toBeLessThanOrEqual(1);
 await page.getByRole("button",{name:"Contracts"}).click();
 await expect(page).toHaveURL(/#\/contracts$/);
 await expect(nav.getByRole("button",{name:"More"})).toHaveAttribute("aria-current","page");
 await page.setViewportSize({width:390,height:844});
 await nav.getByRole("button",{name:"Home"}).click();
 await expect(nav.getByRole("button",{name:"Home"})).toHaveAttribute("aria-current","page");
 expect((await audit()).overflow).toBeLessThanOrEqual(1);
});

test("verified player can join, claim and reach World without bypassing session authority",async({page})=>{
 let stage=0;
 const mutated:string[]=[];
 await page.route("**/api/session",async route=>{
  const snapshot={...current,overview:{...overview,
   world:{...overview.world,revision:stage},
   membership:stage===0?"NONE":"ACTIVE",
   promotion:stage===2?overview.promotion:null},
   availablePromotions:stage===1?[{id:"aew",name:"AEW",tier:"GLOBAL"}]:[]};
  await route.fulfill({json:snapshot});
 });
 for(const path of ["/api/join","/api/claim"]){
  await page.route("**"+path,async route=>{
   const body=route.request().postDataJSON();
   expect(route.request().headers()["x-ppw-csrf"]).toBe(current.csrfToken);
   expect(body.expectedRevision).toBe(stage);
   expect(body.playerId).toBeUndefined();
   expect(body.requestId).toBeTruthy();
   if(path==="/api/claim")expect(body.promotionId).toBe("aew");
   mutated.push(path);
   stage++;
   await route.fulfill({json:{status:"APPLIED"}});
  });
 }
 await page.route("**/api/card",async route=>route.fulfill({json:overview}));
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Join Genesis"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeHidden();
 await page.getByRole("button",{name:"Join World"}).click();
 await expect(page.getByRole("heading",{name:"Pick a promotion"})).toBeVisible();
 await page.getByRole("button",{name:"Run this promotion"}).click();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeVisible();
 expect(mutated).toEqual(["/api/join","/api/claim"]);
});

test("slow abandoned results cannot overwrite the next mobile workspace",async({page})=>{
 let releaseShow!:()=>void;
 const gate=new Promise<void>(resolve=>{releaseShow=resolve;});
 let showStarted!:()=>void;
 const requested=new Promise<void>(resolve=>{showStarted=resolve;});
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const p=route.request().postDataJSON();
  if(p.method==="resultsArchive")return route.fulfill({json:{
   items:[{showId:"show-one",year:1,week:4,
    matchCount:2,angleCount:1,crowdResponse:72,showName:"Saturday Spectacle"}],
   nextCursor:null
  }});
  if(p.method==="results"){
   showStarted();
   await gate;
   return route.fulfill({json:{bad:"incomplete receipt"}});
  }
  return route.fulfill({json:p.method==="overview"?overview:{}});
 });
 await page.goto("/#/results");
 await expect(page.getByRole("button",{name:/Saturday Spectacle/})).toBeVisible();
 await page.getByRole("button",{name:/Saturday Spectacle/}).click();
 await requested;
 const nav=page.getByRole("navigation",{name:"Promotion navigation"});
 await nav.getByRole("button",{name:"More"}).click();
 await expect(page.getByRole("heading",{name:"Promotion office"})).toBeVisible();
 releaseShow();
 await page.waitForTimeout(250);
 await expect(page.getByRole("heading",{name:"Promotion office"})).toBeVisible();
 await expect(page.locator("#game > .ppw-workspace")).toHaveCount(1);
 await expect(page.locator("#game .ppw-archive-hero")).toHaveCount(0);
 expect(await page.evaluate(()=>
  document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
