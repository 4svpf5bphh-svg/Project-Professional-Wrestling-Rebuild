import {test,expect} from "@playwright/test";

/** Public certified TV metrics are shared World facts, but the Business read
 * remains promotion-authenticated. Filters are client-only and never poll. */
for(const width of [320,390]){
 test("Phase 33 direct Ratings War compares real companies without another Neon read at "+width+"px",async({page},info)=>{
  await page.setViewportSize({width,height:width===320?568:844});
  const methods:string[]=[];
  const owner={world:{revision:25,name:"PPW",year:1,week:19,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"NATIONAL",cash:5000000,debt:0}};
  await page.route("**/api/session",route=>route.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview:owner,availablePromotions:[]}}));
  await page.route("**/api/card",route=>{
   const method=String((route.request().postDataJSON() as {method:string}).method);
   methods.push(method);
   if(method!=="business")return route.fulfill({json:{}});
   return route.fulfill({json:{
    name:"CWA",tier:"NATIONAL",year:1,week:19,worldRevision:25,phase:"OPEN",
    cash:5000000,debt:0,homeMarketName:"Midlands",mediaReach:80,
    weeklyMediaIncome:250000,weeklySponsorIncome:18000,
    weeklyFixedOverhead:55000,weeklyGuarantees:20000,weeklyStaffPayroll:0,
    recurringMargin:193000,lastWeeklyNet:0,runwayWeeks:null,
    financialDistress:"HEALTHY",territories:[],recentTransactions:[],
    standing:null,rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
    recentTvEpisodes:3,averageTvRating:2.3,recentAverageCrowd:76,
    shows:[
     {year:1,week:19,name:"Ascension",audience:{format:"TV",householdRating:2.4,estimatedViewers:3800000,ppvBuys:null}},
     {year:1,week:18,name:"Ascension",audience:{format:"TV",householdRating:2.1,estimatedViewers:3500000,ppvBuys:null}},
     {year:1,week:17,name:"Ascension",audience:{format:"TV",householdRating:2.3,estimatedViewers:3650000,ppvBuys:null}}
    ],
    competitorBroadcasts:[
     {promotionId:"other",name:"North Wrestling",showName:"Uprising",day:5,year:1,week:19,
      householdRating:3.0,estimatedViewers:4300000,networkOfferCode:"BROADCAST_GROWTH",
      isYours:false,humanManaged:false},
     {promotionId:"mine",name:"CWA",showName:"Ascension",day:2,year:1,week:19,
      householdRating:2.4,estimatedViewers:3800000,networkOfferCode:"BROADCAST_TV",
      isYours:true,humanManaged:true},
     {promotionId:"rival",name:"Another Wrestling Company",showName:"Rumble",day:4,year:1,week:18,
      householdRating:1.9,estimatedViewers:2500000,networkOfferCode:null,
      isYours:false,humanManaged:true}
    ],
    commercialAgreements:[],commercialQualified:[],commercialOffers:[],partnerInventory:[]
   }});
  });
  await page.goto("/#/business/ratings");
  await expect(page).toHaveURL(/#\/business\/ratings$/);
  const war=page.locator(".ppw-ratings-war-desk");
  await expect(war.getByRole("heading",{name:"Ratings War"})).toBeVisible();
  await expect(war.locator(".ppw-ratings-war-score").first()).toContainText("2.4");
  await expect(war.locator(".ppw-ratings-war-score").last()).toContainText("1.9");
  await expect(war.locator(".ppw-ratings-war-human-label")).toContainText("HUMAN MANAGER");
  await expect(war.locator(".ppw-ratings-war-result")).toContainText("You're ahead by 0.5 rating points.");
  await expect(war.locator(".ppw-ratings-war-bar")).toHaveCount(3);
  await expect(war.getByText("3 recent broadcasts · 2.3 average TV rating")).toBeVisible();
  await page.screenshot({path:info.outputPath("phase33-ratings-war-"+width+".png")});
  await expect(war.locator('.ppw-ratings-war-rival[data-selected="true"]')).toContainText("Another Wrestling Company");
  await expect(war.locator('.ppw-ratings-war-rival[data-human="true"]')).toContainText("HUMAN MANAGER");
  await war.getByRole("button",{name:"Compare against North Wrestling"}).click();
  await expect(war.locator(".ppw-ratings-war-result")).toContainText("North Wrestling leads by 0.6 rating points.");
  await expect(war.locator('.ppw-ratings-war-rival[data-selected="true"]')).toContainText("North Wrestling");
  await war.getByRole("button",{name:"Networks & sponsors"}).click();
  await expect(page.getByRole("heading",{name:"Broadcasting & sponsorship"})).toBeVisible();
  expect(methods).toEqual(["business"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
