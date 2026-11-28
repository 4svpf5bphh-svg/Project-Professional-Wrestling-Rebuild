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
    latestShow:{year:1,week:25,showName:"Extreme Warfare",crowdResponse:82},
    upcomingShows:[
     {showId:"ascension-next",year:1,week:26,showName:"Ascension",bookingClass:"REGULAR",
      broadcastFormat:"TV",showDay:4,hasVenue:true,ready:false,status:"DRAFT"},
     {showId:"lottery-next",year:1,week:26,showName:"The Lottery",bookingClass:"PREMIUM",
      broadcastFormat:"PPV",showDay:6,hasVenue:true,ready:true,status:"DRAFT"}
    ],
    latestShows:[
     {showId:"ascension-week25",year:1,week:25,showName:"Ascension",bookingClass:"REGULAR",
      broadcastFormat:"TV",showDay:4,crowdResponse:72},
     {showId:"extreme-week25",year:1,week:25,showName:"Extreme Warfare",bookingClass:"PREMIUM",
      broadcastFormat:"PPV",showDay:6,crowdResponse:82}
    ],
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
  await expect(page.locator(".ppw-home-phase-tag")).toHaveText("WORLD OPEN");
  await expect(page.locator(".ppw-home-period")).toHaveText("Y1 W26");
  await expect(page.getByText("Your World")).toHaveCount(0);
  await expect(page.locator(".ppw-home-promotion-mark")).toHaveCount(0);
  await expect(page.locator(".ppw-home-promotion-name")).toHaveText("Chaotic Wrestling Alliance");
  await expect(page.locator(".ppw-home-prestige-small .ppw-prestige-crest-shield")).toBeVisible();
  await expect(page.locator(".ppw-home-achievement-badge")).toHaveText("4 / 47");
  const crest=page.locator(".ppw-home-prestige-small");
  await expect(crest.locator(".ppw-home-prestige-header")).toBeVisible();
  // Real 320px browser capture: rank and eyebrow should each fit one line.
  for(const selector of [".ppw-prestige-crest-eyebrow",".ppw-prestige-crest-rank"]){
   const label=crest.locator(selector);
   const metrics=await label.evaluate(el=>({
    height:el.getBoundingClientRect().height,
    scrollWidth:el.scrollWidth,clientWidth:el.clientWidth
   }));
   expect(metrics.height).toBeLessThan(20);
   expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth+1);
  }
  const tv=page.locator(".ppw-home-show-spotlight .ppw-tv-frame");
  await expect(tv).toHaveAttribute("data-broadcast-package","luchafiesta");
  await expect(tv.locator(".ppw-tv-title")).toHaveText("Ascension");
  await expect(tv.locator(".ppw-tv-red-label")).toHaveText("LIVE BROADCAST");
  await expect(page.getByRole("button",{name:/Ascension TV · Edit card/})).toBeVisible();
  await expect(page.getByRole("button",{name:/The Lottery PPV · Ready/})).toBeVisible();
  await expect(page.getByRole("button",{name:"Read Ascension · TV"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Read Extreme Warfare · PPV"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Results archive"})).toBeVisible();
  await expect(page.getByRole("button",{name:/Show calendar/})).toBeVisible();
  await expect(page.locator(".ppw-home-show-head")).toHaveCount(0);
  await expect(page.locator(".ppw-home-show-controls .ppw-home-tile-copy small")).toHaveCount(0);
  await expect(page.locator(".ppw-home-certified-score")).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Open Backstage, 5 unread messages/})).toBeVisible();
  const war=page.getByRole("region",{name:"Your current promotional competition"});
  await expect(war.locator(".ppw-home-vs-mark")).toHaveText("VS");
  await expect(war.locator(".ppw-home-ratings-score")).toHaveCount(0);
  await expect(war.locator(".ppw-home-ratings-label")).toHaveCount(0);
  await expect(war.locator(".ppw-home-ratings-tv")).toHaveText(["0.10 TV rating","0.10 TV rating"]);
  await expect(war).not.toContainText("Extreme Warfare");
  await expect(war.locator(".ppw-home-ratings-promotion"))
   .toHaveText(["Chaotic Wrestling Alliance","Revolution Pro"]);
  await expect(page.getByRole("heading",{name:"Notifications"})).toBeVisible();
  const notificationHead=page.locator(".ppw-home-brief-title");
  const count=notificationHead.locator(".ppw-home-notification-count");
  await expect(count).toHaveText("ALL CLEAR");
  const decisions=page.getByRole("region",{name:"At your desk"});
  await expect(decisions.getByRole("button",{name:"Review Jay Lethal's contract"})).toBeVisible();
  await expect(page.locator(".ppw-home-brief")).not.toContainText("Jay Lethal");
  if(width===320){
   const metrics=await notificationHead.evaluate(header=>{
    const title=header.querySelector("h3")!.getBoundingClientRect();
    const count=header.querySelector(".ppw-home-notification-count")!.getBoundingClientRect();
    const titleEl=header.querySelector("h3")!;
    return {titleCentre:title.top+title.height/2,
     countCentre:count.top+count.height/2,
     titleHeight:title.height,
     titleLineHeight:parseFloat(getComputedStyle(titleEl).lineHeight),
     titleScrollWidth:titleEl.scrollWidth,titleClientWidth:titleEl.clientWidth,
     titleRight:title.right,countLeft:count.left,
     countRight:count.right,headerRight:header.getBoundingClientRect().right};
   });
   expect(Math.abs(metrics.titleCentre-metrics.countCentre)).toBeLessThanOrEqual(4);
   expect(metrics.titleHeight).toBeLessThanOrEqual(metrics.titleLineHeight+1);
   expect(metrics.titleScrollWidth).toBeLessThanOrEqual(metrics.titleClientWidth+1);
   expect(metrics.titleRight+4).toBeLessThanOrEqual(metrics.countLeft);
   expect(metrics.countRight).toBeLessThanOrEqual(metrics.headerRight+1);
  }
  await expect(page.getByRole("button",{name:/Jay Lethal/})).toBeVisible();
  const notifications=page.locator(".ppw-home-brief");
  await expect(notifications).not.toContainText("Joe");
  await expect(notifications).not.toContainText("locker room");
  await expect(notifications).not.toContainText("The agreement expires");
  await expect(notifications.locator(".ppw-home-tile-copy small")).toHaveCount(0);
  await expect(page.locator(".ppw-home-backstage-action")).toBeVisible();
  expect(calls).toEqual([]);
  // Screenshot is captured from the real running PPW browser component.
  // No generated interface art, and all displayed data is fixture-labelled.
  await page.screenshot({path:"test-results/ppw-home-actual-"+width+".png",
   fullPage:true,animations:"disabled"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

test("Home uses neutral regular-event labels without a television schedule or receipt",
 async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const overview={world:{id:"world",name:"PPW",revision:2,year:1,week:12,day:3,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:5000,debt:0,
   lastWeeklyNet:0,financialDistress:"HEALTHY",
   broadcastPackageStyle:"LUCHA_FIESTA" as string|null,
   nextShow:{year:1,week:13,showName:"Ascension",ready:false,status:"DRAFT"},
   flagshipName:"Ascension",
   upcomingShows:[{showId:"next",year:1,week:13,showName:"Ascension",
    bookingClass:"REGULAR",showDay:4,hasVenue:true,ready:false,status:"DRAFT"}],
   latestShows:[{showId:"last",year:1,week:11,showName:"Ascension",
    bookingClass:"REGULAR",showDay:4,crowdResponse:72}],
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
 const spotlight=page.getByRole("region",{name:"Your shows"});
 await expect(spotlight.locator(".ppw-tv-red-label")).toHaveText("LIVE EVENT");
 await expect(spotlight).not.toContainText(/TELEVISION|ON AIR/);
 await expect(spotlight.getByRole("button",{name:/Ascension Regular event · Edit card/})).toBeVisible();
 await expect(spotlight.getByRole("button",{name:"Read Ascension · Regular event"})).toBeVisible();
 overview.promotion.broadcastPackageStyle=null;
 await page.reload();
 await expect(spotlight)
  .toHaveAttribute("data-broadcast-package","standard");
 await expect(spotlight.locator(".ppw-home-standard-opening small")).toHaveText("PPW / LIVE EVENTS");
 await expect(page.locator(".ppw-home-standard-opening strong")).toHaveText("Ascension");
 await expect(page.locator(".ppw-home-show-spotlight .ppw-tv-frame")).toHaveCount(0);
 await expect(page.locator(".ppw-home-ratings-pending")).toHaveCount(2);
 expect(reads).toBe(0);
});
