import {test,expect} from "@playwright/test";
for(const width of [320,390]){
 test("Home and Ratings War give two small human managers a real local rival at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});
  const calls:string[]=[];
  const competition={
   promotionId:"mate",name:"Rival Wrestling",tier:"LOCAL",humanManaged:true,
   reviewedWeekIndex:8,sinceWeekIndex:0,
   ownShowCount:6,rivalShowCount:6,
   ownAvgCrowd:71,rivalAvgCrowd:74,
   ownAvgAttendance:820,rivalAvgAttendance:940,
   ownReach:18,rivalReach:20,
   ownTvRating:null,rivalTvRating:null,
   targetName:"Regional Stars",targetTier:"RISING"
  };
  const overview={world:{id:"world",revision:18,name:"PPW",
   year:1,week:10,phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,
   serverEpoch:Date.now()/1000},membership:"ACTIVE",promotion:{
   id:"me",name:"CWA",tier:"LOCAL",cash:500000,debt:0,
   competition,lastWeeklyNet:5000,financialDistress:"HEALTHY",
   attention:{unpreparedShow:false,pendingBackstage:false,
    expiringTalent:false,pendingContractOffers:false,plannedShows:0}
  }};
  const business={
   name:"CWA",tier:"LOCAL",year:1,week:10,worldRevision:18,phase:"OPEN",
   competition,cash:500000,debt:0,homeMarketName:"Local",mediaReach:18,
   weeklyMediaIncome:10000,weeklySponsorIncome:2000,
   weeklyFixedOverhead:3000,weeklyGuarantees:2000,weeklyStaffPayroll:0,
   recurringMargin:7000,lastWeeklyNet:5000,runwayWeeks:null,
   financialDistress:"HEALTHY",territories:[],recentTransactions:[],
   standing:null,rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
   recentTvEpisodes:0,averageTvRating:null,recentAverageCrowd:71,
   shows:[],competitorBroadcasts:[],
   commercialAgreements:[],commercialQualified:[],commercialOffers:[],
   partnerInventory:[]
  };
  await page.route("**/api/session",route=>route.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview,
   availablePromotions:[]}}));
  await page.route("**/api/card",route=>{
   const {method}=route.request().postDataJSON() as {method:string};
   calls.push(method);
   if(method==="overview")return route.fulfill({json:overview});
   if(method==="business")return route.fulfill({json:business});
   return route.fulfill({json:{}});
  });
  await page.goto("/#/home");
  const home=page.locator(".ppw-home-competition");
  await expect(home).toContainText("Rival Wrestling");
  await expect(home).toContainText("HUMAN MANAGER");
  await expect(home).toContainText("820 vs 940");
  await home.getByRole("button",{name:"Open Ratings War"}).click();
  await expect(page).toHaveURL(/#\/business\/ratings$/);
  const desk=page.locator(".ppw-ratings-war-desk");
  await expect(desk.getByRole("heading",{name:"CWA vs Rival Wrestling"})).toBeVisible();
  await expect(desk.locator(".ppw-ratings-circuit")).toContainText("940");
  await expect(desk.locator(".ppw-ratings-circuit")).toContainText("leads by 120");
  await expect(desk.locator(".ppw-ratings-circuit")).toContainText("Regional Stars");
  await expect(desk.locator(".ppw-ratings-war-faceoff")).toContainText("No recent certified TV result");
  await expect(desk.getByText(/No certified TV broadcasts/)).toBeVisible();
  expect(calls).toEqual(["overview","business"],"No extra rival polling or RPC");
  const box=await desk.locator(".ppw-ratings-circuit").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(width);
 });
}
