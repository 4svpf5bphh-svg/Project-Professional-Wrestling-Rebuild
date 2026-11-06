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
  const vsBounds=await war.locator(".ppw-ratings-war-faceoff").boundingBox();
  expect(vsBounds).not.toBeNull();
  expect(vsBounds!.y).toBeLessThan(390);
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

/** The screenshot regression: results must be an integrated broadcast
 * performance panel, and its CTA must open the same certified Ratings War. */
const editorialShow={
 showId:"ascension-week19",showName:"Ascension",bookingClass:"REGULAR",
 year:1,week:19,crowdResponse:82,matchCount:1,angleCount:1,
 staffReport:{reporter:"Road Agent",staffId:"agent",headline:"Strong finish",
  praise:"The main event worked.",concern:"Keep building the next programme.",
  recommendation:"Follow the crowd.",strongestMatchId:"bout",reviewedMatches:1},
 entries:[{
  slotId:"bout",position:0,type:"MATCH",headline:"Samoa Joe defeats Matt Riddle",
  summary:"Joe won by a clean pinfall.",crowdResponse:87,outcome:"CLEAN_PIN",
  actorIds:["joe","riddle"],targetIds:[],
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:17,
   sides:[["Samoa Joe"],["Matt Riddle"]],winnerNames:["Samoa Joe"],
   championshipContested:false,isMainEvent:true},
  fallout:{ratingStars:4.25,actualMinutes:18,injuries:[],eliminations:[]}
 },{
  slotId:"promo",position:1,type:"SEGMENT",headline:"Title challenge",
  summary:"The challenge went out.",outcome:"HAPPENS",
  crowdResponse:73,actorIds:["joe"],targetIds:[],segmentKind:"PROMO"
 }]
};
for(const width of [320,390]){
 test("TV Results has a compact certified audience panel and opens Ratings War at "+width+"px",async({page},info)=>{
  await page.setViewportSize({width,height:width===320?568:844});
  const methods:string[]=[];
  const owner={world:{revision:44,name:"World",year:1,week:20,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"NATIONAL",
    cash:5_000_000,debt:0}};
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"fixture",overview:owner,
   availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const method=String((r.request().postDataJSON() as {method:string}).method);
   methods.push(method);
   if(method==="resultsArchive")return r.fulfill({json:{
    items:[{showId:"ascension-week19",year:1,week:19,showName:"Ascension",
     crowdResponse:82,matchCount:1,angleCount:1}],nextCursor:null}});
   if(method==="results")return r.fulfill({json:{
    ...editorialShow,audience:{format:"TV",householdRating:2.4,
     estimatedViewers:3_800_000,ppvBuys:null}}});
   if(method==="business")return r.fulfill({json:{
    name:"CWA",homeMarketName:"Midlands",year:1,week:20,
    competitorBroadcasts:[{promotionId:"mine",name:"CWA",showName:"Ascension",
     householdRating:2.4,estimatedViewers:3_800_000,day:2,year:1,week:19,
     isYours:true,humanManaged:true,networkOfferCode:null}],
    shows:[{year:1,week:19,name:"Ascension",
     audience:{format:"TV",householdRating:2.4,estimatedViewers:3_800_000,
      ppvBuys:null}}],
    recentTvEpisodes:1,averageTvRating:2.4,
    commercialAgreements:[],commercialOffers:[],partnerInventory:[]
   }});
   return r.fulfill({json:{}});
  });
  await page.route("**/api/results-commentary",r=>
   r.fulfill({json:{status:"unavailable"}}));
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  const audience=page.getByRole("region",{name:"Broadcast performance"});
  await expect(audience).toContainText("BROADCAST PERFORMANCE");
  await expect(audience).toContainText("TV RATING");
  await expect(audience).toContainText("2.4");
  await expect(audience).toContainText("3.8M");
  await expect(audience.locator(".ppw-audience-metric").last())
   .toHaveAttribute("aria-label","3,800,000 estimated viewers");
  const panelBounds=await audience.boundingBox();
  expect(panelBounds).not.toBeNull();
  expect(panelBounds!.height).toBeLessThan(130);
  await page.screenshot({path:info.outputPath("phase33-tv-results-"+width+".png")});
  await audience.getByRole("button",{name:"Compare TV ratings in Ratings War"}).click();
  await expect(page).toHaveURL(/#\/business\/ratings$/);
  await expect(page.getByRole("heading",{name:"Ratings War"})).toBeVisible();
  await expect(page.locator(".ppw-ratings-war-score[data-side='OWNER']")).toContainText("2.4");
  expect(methods).toEqual(["resultsArchive","results","business"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
test("PPV results preserve buys and do not show misleading household ratings",async({page})=>{
 await page.setViewportSize({width:320,height:568});
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"fixture",
  overview:{world:{revision:44,name:"World",year:1,week:20,phase:"OPEN"},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"NATIONAL",
    cash:5_000_000,debt:0}},availablePromotions:[]}}));
 await page.route("**/api/card",r=>r.fulfill({json:
  (r.request().postDataJSON() as {method:string}).method==="resultsArchive"?
  {items:[{showId:"ascension-week19",year:1,week:19,showName:"Armageddon",
   crowdResponse:82,matchCount:1,angleCount:1}],nextCursor:null}:
  {...editorialShow,showName:"Armageddon",bookingClass:"PREMIUM",
   audience:{format:"PPV",householdRating:null,estimatedViewers:null,ppvBuys:825000}}}));
 await page.route("**/api/results-commentary",r=>r.fulfill({json:{status:"unavailable"}}));
 await page.goto("/#/results");
 await page.getByRole("button",{name:/Read ringside report/}).click();
 const audience=page.getByRole("region",{name:"Broadcast performance"});
 await expect(audience).toContainText("EST. PPV BUYS");
 await expect(audience).toContainText("825,000");
 await expect(audience).not.toContainText("TV RATING");
 await expect(audience.getByRole("button",{name:"Compare TV ratings in Ratings War"})).toHaveCount(0);
});
