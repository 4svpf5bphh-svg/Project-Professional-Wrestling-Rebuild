import {test,expect} from "@playwright/test";

/** This is the real PPW World component, rendered by the Vite/Playwright host.
 * The only substitutions are server responses, not mock HTML or generated art.
 */
for(const width of [320,390]){
 test("actual Home dashboard honours broadcast KP style, certified ratings and no duplicate Backstage alerts at "+width+"px",
 async({page})=>{
  await page.setViewportSize({width,height:844});
  const calls:string[]=[];
  const overview={world:{id:"world",name:"PPW",revision:42,year:1,week:26,
   phase:"OPEN",day:3,nextLockEpoch:Date.now()/1000+200000,
   serverEpoch:Date.now()/1000},membership:"ACTIVE" as const,
   promotion:{id:"company",name:"Chaotic Wrestling Alliance",
    tier:"LOCAL",cash:100000,debt:0,lastWeeklyNet:1000,financialDistress:"HEALTHY",
    homeMarketName:"River Market",broadcastPackageStyle:"LUCHA_FIESTA",
    promoterPrestige:{rank:"RISING PROMOTER",earnedCount:4,total:47,prestigeScore:62},
    nextShow:{year:1,week:27,showName:"Ascension",ready:false,status:"DRAFT"},
    latestShow:{year:1,week:25,showName:"Ascension",crowdResponse:72},
    competition:{name:"Revolution Pro",humanManaged:false,tier:"LOCAL",
     provisional:false,reviewedWeekIndex:24,
     ownAvgAttendance:350,rivalAvgAttendance:310,targetName:null,
     ownLatestShow:{showName:"Ascension",year:1,week:25,crowdResponse:72,tvRating:.10},
     rivalLatestShow:{showName:"Revolution Night",year:1,week:25,crowdResponse:70,tvRating:.10}},
    attention:{plannedShows:0,unpreparedShow:false,pendingBackstage:true,
     backstageUnreadCount:5,expiringTalent:true,pendingContractOffers:false,
     contractAlerts:[{contractId:"contract",personId:"jay",name:"Jay Lethal",
      kind:"EXPIRING",weeksRemaining:0,waiting:false}],
     backstageRequests:[{personId:"joe",name:"Joe",kind:"CREATIVE"}],
     offerResults:[],dateDecisions:[],backstageResults:[],businessUpdates:[],
     injuryNews:[],medicalClearances:[],titleNews:[],worldStories:[]}}};
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview,
   availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const input=r.request().postDataJSON() as {method:string};
   calls.push(input.method);
   if(input.method==="overview")return r.fulfill({json:overview});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/home");
  await expect(page.getByRole("button",{name:/BOOKING OPEN/})).toBeVisible();
  const tv=page.locator(".ppw-home-show-spotlight .ppw-tv-frame");
  await expect(tv).toHaveAttribute("data-broadcast-package","luchafiesta");
  await expect(tv.locator(".ppw-tv-title")).toHaveText("Ascension");
  await expect(page.getByRole("button",{name:/Last show/})).toBeVisible();
  await expect(page.getByRole("button",{name:/Next show/})).toBeVisible();
  await expect(page.getByRole("button",{name:/Open Backstage, 5 unread messages/})).toBeVisible();
  const war=page.getByRole("region",{name:"Your current promotional competition"});
  await expect(war.locator(".ppw-home-vs-mark")).toHaveText("VS");
  await expect(war.locator(".ppw-home-ratings-score")).toHaveText(["72/100","70/100"]);
  await expect(war.locator(".ppw-home-ratings-promotion"))
   .toHaveText(["Chaotic Wrestling Alliance","Revolution Pro"]);
  await expect(page.getByRole("heading",{name:"Notifications"})).toBeVisible();
  await expect(page.getByRole("button",{name:/Jay Lethal/})).toBeVisible();
  const notifications=page.locator(".ppw-home-brief");
  await expect(notifications).not.toContainText("Joe");
  await expect(notifications).not.toContainText("locker room");
  expect(calls).toEqual(["overview"]);
  // Screenshot is captured from the real running PPW browser component.
  // No generated interface art, and all displayed data is fixture-labelled.
  await page.screenshot({path:"test-results/ppw-home-actual-"+width+".png",
   fullPage:true,animations:"disabled"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

test("clearing the KP broadcast selection restores standard Home show graphics without extra reads",
 async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const overview={world:{id:"world",name:"PPW",revision:2,year:1,week:12,day:3,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:5000,debt:0,
   lastWeeklyNet:0,financialDistress:"HEALTHY",broadcastPackageStyle:null,
   nextShow:{year:1,week:13,showName:"Ascension",ready:false,status:"DRAFT"},
   attention:{plannedShows:0,unpreparedShow:true,pendingBackstage:false,
    backstageUnreadCount:0,expiringTalent:false,pendingContractOffers:false}}};
 let reads=0;
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",r=>{
  if(r.request().postDataJSON().method==="overview")reads++;
  return r.fulfill({json:overview});
 });
 await page.goto("/#/home");
 await expect(page.locator(".ppw-home-show-spotlight"))
  .toHaveAttribute("data-broadcast-package","standard");
 await expect(page.locator(".ppw-home-standard-opening strong")).toHaveText("Ascension");
 await expect(page.locator(".ppw-home-show-spotlight .ppw-tv-frame")).toHaveCount(0);
 expect(reads).toBe(1);
});
