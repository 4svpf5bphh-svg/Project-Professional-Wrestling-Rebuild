import {test,expect} from "@playwright/test";
const injury={id:"injury-report:"+"a".repeat(32),personId:"alice",name:"Alice",
 severity:"MAJOR",originalWeeksOut:6,year:1,week:5};
const base={world:{revision:4,name:"Genesis",year:1,week:6,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",
 cash:5000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY",
 attention:{plannedShows:0,unpreparedShow:true,pendingBackstage:false,
 expiringTalent:false,pendingContractOffers:false,injuryNews:[injury]}}};
test("iPhone shows verified match injury without fabricating current medical clearance",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",
 overview:base,availablePromotions:[]};
 const calls:string[]=[];let dismissed=false;
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string;attentionId?:string};
  calls.push(req.method);
  if(req.method==="dismissAttention"){
   expect(req.attentionId).toBe(injury.id);
   dismissed=true;
   return route.fulfill({json:{dismissed:true,firstDismissal:true}});
  }
  return route.fulfill({json:req.method==="overview"?{...base,
   promotion:{...base.promotion,attention:{...base.promotion.attention,
    injuryNews:dismissed?[]:[injury]}}}:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Recent match injuries"})).toBeVisible();
 await expect(page.getByText("Alice suffered an injury")).toBeVisible();
 await expect(page.getByText(/original report estimated 6 weeks out/)).toBeVisible();
 await expect(page.getByText(/Open the wrestler dossier for current medical clearance/)).toBeVisible();
 await expect(page.getByRole("button",{name:/Plan this week's show/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
 expect(calls).toEqual(["overview"]);
 await page.getByRole("button",{name:"Dismiss Alice's injury update"}).click();
 await expect(page.getByText("Alice suffered an injury")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
 await page.reload();
 await expect.poll(()=>calls).toEqual(["overview","dismissAttention","overview"]);
 await expect(page.getByText("Alice suffered an injury")).toHaveCount(0);
});
test("iPhone clears mixed injury and title news without touching mandatory actions",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const title={id:"title-reign:show:main:new-reign",championshipId:"world",
 titleName:"World Championship",winnerName:"Alice",holderType:"PERSON",
 personId:"alice",year:1,week:5};
 let dismissed=false;const methods:string[]=[];
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",
 overview:base,availablePromotions:[]};
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const request=route.request().postDataJSON() as {method:string;attentionIds?:string[]};
  methods.push(request.method);
  if(request.method==="dismissAttentionBatch"){
   expect(request.attentionIds).toEqual([title.id,injury.id]);
   dismissed=true;
   return route.fulfill({json:{dismissed:2,firstDismissals:2}});
  }
  return route.fulfill({json:request.method==="overview"?{...base,
   promotion:{...base.promotion,attention:{...base.promotion.attention,
    titleNews:dismissed?[]:[title],injuryNews:dismissed?[]:[injury]}}}:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByText("Alice won World Championship")).toBeVisible();
 await expect(page.getByText("Alice suffered an injury")).toBeVisible();
 await page.getByRole("button",{name:"Clear all resolved updates"}).click();
 await expect(page.getByText("Alice won World Championship")).toHaveCount(0);
 await expect(page.getByText("Alice suffered an injury")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
 expect(methods).toEqual(["overview","dismissAttentionBatch"]);
});

const clearance={id:"medical-clearance:12:"+"a".repeat(32),
 personId:"alice",name:"Alice",severity:"MAJOR",year:1,week:8};

test("iPhone lets a booker open and dismiss genuine return-to-ring clearance",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 const intro={...base,promotion:{...base.promotion,attention:{
  ...base.promotion.attention,injuryNews:[],medicalClearances:[clearance]
 }}};
 let dismissed=false;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"genesis",playerId:"owner",csrfToken:"opaque",
  overview:intro,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const r=route.request().postDataJSON() as {method:string;attentionId?:string};
  if(r.method==="dismissAttention"){
   expect(r.attentionId).toEqual(clearance.id);
   dismissed=true;return route.fulfill({json:{dismissed:true,firstDismissal:true}});
  }
  return route.fulfill({json:{...intro,promotion:{...intro.promotion,
   attention:{...intro.promotion.attention,medicalClearances:dismissed?[]:[clearance]}}}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Cleared to return"})).toBeVisible();
 await expect(page.getByText("Alice is available again")).toBeVisible();
 await expect(page.getByText(/Cleared at Year 1, Week 8/)).toBeVisible();
 await page.screenshot({path:"test-results/presentation-screenshots/medical-clearance-320.png",fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.getByRole("button",{name:"Dismiss Alice's clearance update"}).click();
 await expect(page.getByText("Alice is available again")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
});
