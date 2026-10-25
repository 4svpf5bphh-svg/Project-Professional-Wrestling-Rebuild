import {test,expect} from "@playwright/test";

test("320px Business commercial agreements are optional, readable and consented once",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 let revision=5,signed=false;
 const methods:string[]=[];
 const offer={
  code:"BROADCAST_GROWTH",kind:"BROADCAST",name:"Audience-first streaming",
  description:"Sacrifice some guaranteed income for a wider audience.",
  weeklyIncome:312000,reachIncrease:15,termWeeks:26,
  obligation:"Maintain your normal programme of shows."
 };
 const owner={world:{revision,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"indie",name:"Independent Wrestling",
   tier:"LOCAL",cash:500000,debt:0}};
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"genesis",playerId:"owner",csrfToken:"opaque",overview:owner,
  availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const data=route.request().postDataJSON() as Record<string,unknown>;
  methods.push(data.method as string);
  if(data.method==="signCommercial"){
   expect(data.offerCode).toBe("BROADCAST_GROWTH");
   expect(data.expectedRevision).toBe(5);
   expect(data.requestId).toMatch(/^[0-9a-f-]{36}$/);
   expect(data.playerId).toBeUndefined();
   revision=6;signed=true;
   return route.fulfill({json:{status:"APPLIED",revision,
    result:{accepted:true,weeklyIncome:312000}}});
  }
  return route.fulfill({json:{
   name:"Independent Wrestling",tier:"LOCAL",year:1,week:5,worldRevision:revision,
   phase:"OPEN",homeMarketName:"Territory 0",mediaReach:signed?105:90,
   cash:500000,debt:0,standing:null,
   weeklyMediaIncome:signed?312000:300000,weeklySponsorIncome:25000,
   weeklyFixedOverhead:60000,weeklyGuarantees:15000,weeklyStaffPayroll:0,
   recurringMargin:250000,lastWeeklyNet:0,runwayWeeks:null,
   financialDistress:"HEALTHY",shows:[],territories:[],recentTransactions:[],
   rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
   commercialAgreements:signed?[{dealId:"broadcast-1",kind:"BROADCAST",
    offerCode:"BROADCAST_GROWTH",weeklyIncome:312000,baselineIncome:300000,
    reachIncrease:15,startWeekIndex:4,endWeekIndex:29,source:"HUMAN"}]:[],
   commercialOffers:signed?[]:[offer]
  }});
 });
 await page.goto("/#/business");
 await page.getByRole("button",{name:"Deals"}).click();
 await expect(page.getByRole("heading",{name:"Broadcasting & sponsorship"})).toBeVisible();
 await expect(page.getByText("Audience-first streaming")).toBeVisible();
 await expect(page.getByText("US$312,000/week")).toBeVisible();
 await expect(page.getByText("26 weeks")).toBeVisible();
 await expect(page.getByText("+15 audience reach")).toBeVisible();
 expect(methods).toEqual(["business"]);
 page.once("dialog",dialog=>void dialog.dismiss());
 await page.getByRole("button",{name:"Sign agreement"}).click();
 expect(methods).toEqual(["business"]);
 page.once("dialog",dialog=>void dialog.accept());
 await page.getByRole("button",{name:"Sign agreement"}).click();
 await expect(page.getByText(/Commercial agreement signed/)).toBeVisible();
 await expect(page.getByText(/26 weeks remaining/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Sign agreement"})).toHaveCount(0);
 expect(methods).toEqual(["business","signCommercial","business"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

for(const width of [320,390]){
 test(`iPhone ${width}px Home alerts only after a commercial deal actually expires`,async({page})=>{
  await page.setViewportSize({width,height:780});
  let renewalDue=true;
  const calls:string[]=[];
  const overview=()=>({
   world:{revision:7,name:"Genesis",year:1,week:32,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"indie",name:"Independent Wrestling",
    tier:"LOCAL",cash:500000,debt:0,lastWeeklyNet:2000,financialDistress:"HEALTHY",
    attention:{plannedShows:1,unpreparedShow:false,pendingBackstage:false,
     expiringTalent:false,pendingContractOffers:false,commercialRenewalDue:renewalDue}}
  });
  await page.route("**/api/session",route=>route.fulfill({json:{
   worldId:"genesis",playerId:"owner",csrfToken:"opaque",
   overview:overview(),availablePromotions:[]
  }}));
  await page.route("**/api/card",route=>{
   const input=route.request().postDataJSON() as {method:string};
   calls.push(input.method);
   if(input.method==="overview")return route.fulfill({json:overview()});
   return route.fulfill({json:{}});
  });
  await page.goto("/#/home");
  const renewal=page.getByRole("button",{name:/A commercial deal has ended/});
  await expect(renewal).toBeVisible();
  await renewal.click();
  await expect(page).toHaveURL(/#\\/business$/);
  expect(calls).toEqual(["overview"]);
  renewalDue=false;
  await page.goto("/#/home");
  await expect(page.getByRole("button",{name:/A commercial deal has ended/})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
