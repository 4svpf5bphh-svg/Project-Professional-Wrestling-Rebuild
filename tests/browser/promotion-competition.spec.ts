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
  expect(calls).toEqual(["overview","business"]);
  const box=await desk.locator(".ppw-ratings-circuit").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(width);
 });
}

for(const width of [320,390]){
 test("Home previews real certified rival shows and Ratings War never defaults to WWE at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const provisional={promotionId:"revolution",name:"Revolution Pro",
   tier:"INDEPENDENT",humanManaged:false,provisional:true,
   reviewedWeekIndex:23,sinceWeekIndex:23,ownShowCount:4,rivalShowCount:5,
   ownAvgCrowd:70,rivalAvgCrowd:74,ownAvgAttendance:520,rivalAvgAttendance:810,
   ownReach:22,rivalReach:30,ownTvRating:0.10,rivalTvRating:null,
   targetName:null,targetTier:null,
   ownLatestShow:{year:1,week:23,showName:"Ascension",crowdResponse:74,tvRating:0.1},
   rivalLatestShow:{year:1,week:23,showName:"Uprising",crowdResponse:81,tvRating:null}};
  const overview={world:{id:"w",revision:35,name:"PPW",year:1,week:24,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"INDEPENDENT",
   cash:550000,debt:0,lastWeeklyNet:2000,financialDistress:"HEALTHY",
   competition:provisional,attention:{unpreparedShow:false,pendingBackstage:false,
    expiringTalent:false,pendingContractOffers:false,plannedShows:0}}};
  const business={name:"CWA",year:1,week:24,worldRevision:35,phase:"OPEN",
   tier:"INDEPENDENT",cash:550000,debt:0,homeMarketName:"River Market",
   mediaReach:22,weeklyMediaIncome:2000,weeklySponsorIncome:1200,
   weeklyFixedOverhead:3000,weeklyGuarantees:2000,weeklyStaffPayroll:0,
   recurringMargin:-1800,lastWeeklyNet:2000,runwayWeeks:null,
   financialDistress:"HEALTHY",territories:[],recentTransactions:[],
   standing:null,rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
   recentTvEpisodes:1,averageTvRating:.1,recentAverageCrowd:74,
   competition:provisional,shows:[],commercialAgreements:[],
   commercialQualified:[],commercialOffers:[],partnerInventory:[],
   competitorBroadcasts:[
    {promotionId:"wwe",name:"WWE",showName:"RAW",day:1,year:1,week:23,
     householdRating:3,estimatedViewers:4000000,isYours:false,humanManaged:false},
    {promotionId:"cwa",name:"CWA",showName:"Ascension",day:5,year:1,week:23,
     householdRating:.1,estimatedViewers:50000,isYours:true,humanManaged:true}]};
  const methods:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"w",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const method=(r.request().postDataJSON() as {method:string}).method;
   methods.push(method);
   return r.fulfill({json:method==="business"?business:method==="overview"?overview:{}});
  });
  await page.goto("/#/home");
  const card=page.locator(".ppw-home-competition");
  await expect(card).toContainText("Revolution Pro");
  await expect(card).toContainText("Ascension");
  await expect(card).toContainText("Uprising");
  await expect(card).toContainText("0.10 TV rating");
  await expect(card).toContainText("TV rating pending");
   await expect(card.locator(".ppw-home-ratings-score")).toHaveCount(0);
  await expect(card).toContainText("Provisional peer");
  await card.getByRole("button",{name:"Open Ratings War"}).click();
  const war=page.locator(".ppw-ratings-war-desk");
  await expect(war.locator(".ppw-ratings-circuit")).toContainText("CWA vs Revolution Pro");
  await expect(war.locator(".ppw-ratings-war-score[data-side=RIVAL]")).toContainText("Revolution Pro");
  await expect(war.locator(".ppw-ratings-war-score[data-side=RIVAL]")).not.toContainText("WWE");
  await expect(war.locator(".ppw-ratings-war-result")).toContainText("has no recent certified TV");
  await war.getByRole("button",{name:"Compare against WWE"}).click();
  await expect(war.locator(".ppw-ratings-war-score[data-side=RIVAL]")).toContainText("WWE");
  expect(methods).toEqual(["overview","business"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
