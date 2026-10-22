import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
const screenshots="test-results/presentation-screenshots";
mkdirSync(screenshots,{recursive:true});
const overview={world:{revision:4,name:"Genesis",year:2,week:1,phase:"OPEN"},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:5000000,debt:0}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"fixture",
 overview,availablePromotions:[]};
for(const width of [320,390]){
 test(`Medical roster ${width}px: injured talent stays visible but clearly unavailable`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let loads=0;
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const {method}=route.request().postDataJSON();
   if(method==="wrestlerDirectory"){
    loads++;
    return route.fulfill({json:{
     view:"ROSTER",year:2,week:1,currentWeekIndex:52,worldRevision:4,canEdit:true,
     hasMore:false,people:[{
      personId:"omega",name:"Kenny Omega",division:"MEN",popularity:87,
      recognition:86,momentum:82,inRingQuality:92,matchCraft:93,presentation:84,
      availability:"YOUR_ROSTER",medicalWeeksRemaining:1,
      family:"EXCLUSIVE",roleExpectation:"MAIN_EVENT",remainingDates:null,
      startsInWeeks:0,weeksRemaining:23,weeklyGuarantee:10000,appearanceFee:0,
      interest:"KEEN",pendingOffer:false
     },{
      personId:"joe",name:"Samoa Joe",division:"MEN",popularity:81,
      recognition:79,momentum:78,inRingQuality:87,matchCraft:89,presentation:86,
      availability:"YOUR_ROSTER",medicalWeeksRemaining:null,
      family:"EXCLUSIVE",roleExpectation:"MAIN_EVENT",remainingDates:null,
      startsInWeeks:0,weeksRemaining:24,weeklyGuarantee:8000,appearanceFee:0,
      interest:"KEEN",pendingOffer:false
     }]
    }});
   }
   return route.fulfill({json:{}});
  });
  await page.goto("/#/roster");
  const cards=page.locator(".ppw-directory-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("INJURED · 1 WEEK TO CLEARANCE");
  await expect(cards.nth(1)).toContainText("UNLIMITED DATES");
  await cards.first().locator("summary").click();
  await expect(cards.first()).toContainText("cannot be booked while injured");
  expect(loads).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:screenshots+"/medical-roster-"+width+".png",fullPage:true});
 });
}
