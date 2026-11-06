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
    reachIncrease:15,startWeekIndex:4,endWeekIndex:29,source:"HUMAN",
    airingDay:5,airingHour:20,
    networkReview:{dealId:"broadcast-1",offerCode:"BROADCAST_GROWTH",
     reviewWeekIndex:4,target:0.11,rating:0.0,showId:"tv-4",
     status:"BELOW_TARGET",missedConsecutively:3,previousMisses:2,
     milestone:"WARNING",bonusEligible:false}}]:[],
   commercialOffers:signed?[]:[offer]
  }});
 });
 await page.goto("/#/business");
 await page.getByRole("button",{name:"Commercials",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Commercials"})).toBeVisible();
 await expect(page.getByText("VibeFlix",{exact:true})).toBeVisible();
 await expect(page.getByText("US$312,000/week")).toBeVisible();
 await expect(page.getByText("26 weeks")).toBeVisible();
 await expect(page.getByText("+15 distribution reach")).toBeVisible();
 expect(methods).toEqual(["business"]);
 page.once("dialog",dialog=>void dialog.dismiss());
 await page.getByRole("button",{name:"Sign VibeFlix"}).click();
 expect(methods).toEqual(["business"]);
 page.once("dialog",dialog=>void dialog.accept());
 await page.getByRole("button",{name:"Sign VibeFlix"}).click();
 await expect(page.getByText(/Commercial agreement signed/)).toBeVisible();
 await expect(page.getByText(/26 weeks left on this agreement/)).toBeVisible();
 await expect(page.locator(".ppw-commercial-partner-review")).toContainText("AT RISK");
 await expect(page.locator(".ppw-commercial-partner-review")).toContainText("0.0 TV");
 await expect(page.getByText("US$312,000 weekly guarantee")).toBeVisible();
 const catalogue=page.locator(".ppw-commercial-market-browser");
 await expect(catalogue).not.toHaveAttribute("open","");
 await catalogue.locator("summary").click();
 await expect(catalogue).toHaveAttribute("open","");
 await expect(page.locator(".ppw-commercial-slot")).toContainText("Friday at 20:00");
 await expect(page.getByRole("button",{name:"Sign VibeFlix"})).toHaveCount(0);
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
     expiringTalent:false,pendingContractOffers:false,
     businessUpdates:renewalDue?[{id:"business-update:103",kind:"COMMERCIAL_EXPIRED",
      year:1,week:31,prestigeDelta:null,before:null,after:null}]:[]}}
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
  await page.locator(".ppw-home-inbox-toggle").click();
  await expect(page.getByRole("heading",{name:"Company updates"})).toBeVisible();
  await expect(page.getByText("Previous broadcast deal ended")).toBeVisible();
  await expect(page.getByText("AGREEMENT ENDED")).toBeVisible();
  await page.getByRole("button",{name:"Open Commercials"}).click();
  await expect(page).toHaveURL(/#\/business$/);
  expect(calls.filter(method=>method==="overview")).toEqual(["overview"]);
  expect(calls.filter(method=>method==="business").length).toBeLessThanOrEqual(1);
  renewalDue=false;
  await page.goto("/#/home");
  await expect(page.getByText("Previous broadcast deal ended")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test(`World-exclusive partners and ratings-war coverage remain legible at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:780});
  const calls:string[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",
   overview:{world:{revision:7,name:"World",year:1,week:6,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
    membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"NATIONAL",
     cash:5_000_000,debt:0}},availablePromotions:[]
  }}));
  await page.route("**/api/card",route=>{
   const input=route.request().postDataJSON() as {method:string};
   calls.push(input.method);
   return route.fulfill({json:{
    name:"CWA",tier:"NATIONAL",year:1,week:6,worldRevision:7,phase:"OPEN",
    homeMarketName:"Midlands",mediaReach:85,cash:5_000_000,debt:0,
    standing:null,weeklyMediaIncome:250_000,weeklySponsorIncome:22_000,
    weeklyFixedOverhead:60_000,weeklyGuarantees:45_000,weeklyStaffPayroll:5_000,
    recurringMargin:162_000,lastWeeklyNet:23_000,runwayWeeks:null,
    financialDistress:"HEALTHY",territories:[],recentTransactions:[],
    rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
    remainingRosterPotential:2_000_000,remainingRosterGuaranteed:1_600_000,
    recentTvEpisodes:3,averageTvRating:2.2,recentAverageCrowd:82,
    shows:[{year:1,week:5,name:"Ascension",audience:{
     format:"TV",householdRating:2.7,estimatedViewers:4_200_000,ppvBuys:null}}],
    competitorBroadcasts:[
     {promotionId:"rival",name:"Rival Wrestling",showName:"Collision",
      day:5,year:1,week:6,householdRating:3.1,estimatedViewers:5_000_000,
      networkOfferCode:"BROADCAST_GROWTH",isYours:false},
     {promotionId:"mine",name:"CWA",showName:"Ascension",
      day:2,year:1,week:5,householdRating:2.7,estimatedViewers:4_200_000,
      networkOfferCode:"BROADCAST_TV",isYours:true}],
    partnerInventory:[
     {offerCode:"BROADCAST_GROWTH",promotionId:"rival",promotionName:"Rival Wrestling",
      endWeekIndex:27,kind:"BROADCAST"},
     {offerCode:"SPONSOR_LOCAL",promotionId:"rival",promotionName:"Rival Wrestling",
      endWeekIndex:20,kind:"SPONSOR"}],
    commercialAgreements:[],
    commercialQualified:[{code:"SPONSOR_GEAR",kind:"SPONSOR"}],
    commercialOffers:[{code:"SPONSOR_GEAR",kind:"SPONSOR",
     name:"Ironclad Workwear",description:"Reliable regional partner",
     weeklyIncome:24_000,reachIncrease:0,termWeeks:26,
     obligation:"Keep staging shows."}]
   }});
  });
  await page.goto("/#/business");
  await page.getByRole("button",{name:"Finances",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Financial position"})).toBeVisible();
  await expect(page.locator(".ppw-finance-bank")).toContainText("US$5,000,000");
  await page.getByRole("button",{name:"← Business"}).click();
  await page.getByRole("button",{name:"Ratings War",exact:true}).click();
  const war=page.locator(".ppw-ratings-war-desk");
  await expect(war.getByRole("heading",{name:"Ratings War"})).toBeVisible();
  await expect(war.locator(".ppw-ratings-war-faceoff")).toContainText("CWA");
  await expect(war.locator(".ppw-ratings-war-faceoff")).toContainText("Rival Wrestling");
  await expect(war.locator(".ppw-ratings-war-result")).toContainText(
   "Rival Wrestling leads by 0.4 rating points.");
  await expect(war.locator(".ppw-ratings-war-bar")).toHaveCount(1);
  await page.getByRole("button",{name:"← Business"}).click();
  await page.getByRole("button",{name:"Commercials",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Commercials"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Ratings war"})).toHaveCount(0);
  const v=page.locator('.ppw-commercial-offer[data-availability="TAKEN"]')
   .filter({has:page.locator('.ppw-commercial-brand[data-code="BROADCAST_GROWTH"]')});
  await expect(v.locator("svg")).toBeVisible();
  await expect(v).toContainText("Exclusive partner of Rival Wrestling");
  await expect(v.getByRole("button",{name:"Sign VibeFlix"})).toHaveCount(0);
  await page.getByRole("button",{name:"Sponsors"}).click();
  const iron=page.locator('.ppw-commercial-brand[data-code="SPONSOR_GEAR"]');
  await expect(iron.locator("svg")).toBeVisible();
  await expect(page.getByRole("button",{name:"Sign Ironclad Workwear"})).toBeVisible();
  const heldSponsor=page.locator(".ppw-commercial-offer[data-availability='TAKEN']");
  await expect(heldSponsor).toContainText("Jack's Crematorium");
  await expect(heldSponsor).toContainText("Rival Wrestling");
  expect(calls).toEqual(["business"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

test("Ratings war keeps a lower-ranked owner visible and ignores legacy PPV rows without buys",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 let calls=0;
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",
  overview:{world:{revision:6,name:"World",year:1,week:11,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",
    cash:1_000_000,debt:0}},availablePromotions:[]
 }}));
 await page.route("**/api/card",r=>{
  calls++;
  return r.fulfill({json:{
   name:"CWA",tier:"LOCAL",year:1,week:11,worldRevision:6,phase:"OPEN",
   cash:1_000_000,debt:0,homeMarketName:"Midlands",mediaReach:70,
   weeklyMediaIncome:12000,weeklySponsorIncome:3000,weeklyFixedOverhead:5000,
   weeklyGuarantees:2000,weeklyStaffPayroll:0,recurringMargin:8000,
   lastWeeklyNet:0,runwayWeeks:null,financialDistress:"HEALTHY",
   standing:null,territories:[],recentTransactions:[],
   rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
   commercialAgreements:[],commercialOffers:[],partnerInventory:[],
   recentTvEpisodes:1,averageTvRating:.3,recentAverageCrowd:70,
   shows:[{name:"Special",year:1,week:10,
    audience:{format:"PPV",householdRating:null,estimatedViewers:null,ppvBuys:null}}],
   competitorBroadcasts:[
    ...Array.from({length:8},(_,i)=>({promotionId:"r"+i,
     name:"Rival "+i,showName:"Weekly",day:5,year:1,week:10,
     householdRating:4-i*.4,estimatedViewers:100000,networkOfferCode:null,
     isYours:false})),
    {promotionId:"mine",name:"CWA",showName:"Ascension",day:2,year:1,
     week:10,householdRating:.3,estimatedViewers:20000,
     networkOfferCode:null,isYours:true}]
  }});
 });
 await page.goto("/#/business");
 await page.getByRole("button",{name:"Ratings War",exact:true}).click();
 await expect(page.getByText(/YOUR POSITION/)).toContainText("#9 OF 9");
 await expect(page.locator(".ppw-ratings-war-rival[data-own=true]")).toContainText("#9 · CWA");
 await expect(page.locator(".ppw-ratings-war-leaderboard")).toBeVisible();
 await expect(page.getByText(/PPV buys/)).toHaveCount(0);
 expect(calls).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
