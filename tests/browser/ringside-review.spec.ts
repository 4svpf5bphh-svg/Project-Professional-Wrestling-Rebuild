import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
const images="test-results/presentation-screenshots";
mkdirSync(images,{recursive:true});
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN"},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:5000000,debt:0}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"fixture",
 overview,availablePromotions:[]};
const show={showId:"omega-night",showName:"Dynamite",bookingClass:"REGULAR",
 year:1,week:4,crowdResponse:84,matchCount:1,angleCount:1,entries:[
  {slotId:"omega-match",position:0,type:"MATCH",headline:"Kenny Omega def. Samoa Joe",
   summary:"Omega won by a clean pinfall",crowdResponse:89,outcome:"CLEAN_PIN",
   actorIds:["omega","joe"],targetIds:[],
   matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
    sides:[["Kenny Omega"],["Samoa Joe"]],winnerNames:["Kenny Omega"],
    championshipContested:false,isMainEvent:true},
   fallout:{ratingStars:4.5,actualMinutes:18,injuries:[],eliminations:[]},
   performerIdentities:[{personId:"omega",ringName:"Kenny Omega",character:"The Cleaner",
    style:"ALL_ROUNDER",signatureMoves:["V-Trigger","Snap Dragon Suplex"],
    finishingMoves:["One Winged Angel"],source:"WORLD_RECORD"}]},
  {slotId:"angle",position:1,type:"SEGMENT",headline:"Ringside confrontation",
   summary:"The challenge took place",outcome:"HAPPENS",crowdResponse:74,
   actorIds:[],targetIds:[],segmentKind:"PROMO"}
 ]};
const review={showHeadline:"Omega gives Dynamite its spark",
 opening:"The show built around a heated singles encounter with an undeniable main event.",
 closing:"The main event delivered where the early card occasionally lacked urgency.",
 slots:[{slotId:"omega-match",headline:"Omega takes the win",
  recap:"Joe threw heavy leather, but Omega's V-Trigger opened the door to the One Winged Angel and a clean pin."},
 {slotId:"angle",headline:"A challenge made",recap:"A pointed microphone exchange held the audience's attention."}]};
for(const width of [320,390]){
 test(`Ringside ${width}px: the editorial, canonical finish, crowd and Booker Breakdown coexist`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let resultReads=0,groqCalls=0;
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method;
   if(method==="results")resultReads++;
   return r.fulfill({json:method==="resultsArchive"?{
    items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
     bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
    nextCursor:null}:show});
  });
  await page.route("**/api/results-commentary",r=>{
   groqCalls++;
   const request=r.request().postDataJSON();
   expect(request).toMatchObject({worldId:"genesis",promotionId:"aew",
    showId:"omega-night"});
   return r.fulfill({json:{status:"ready",review}});
  });
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  await expect(page.getByRole("heading",{name:"Omega gives Dynamite its spark"})).toBeVisible();
  await expect(page.locator(".ppw-ringside-slot").first()).toContainText("One Winged Angel");
  await expect(page.locator(".ppw-finish-winner")).toContainText("Kenny Omega");
   await expect(page.locator(".ppw-verified-finish").first()).not.toHaveAttribute("open","");
  await expect(page.locator(".ppw-flow-track")).toHaveCount(2);
  await expect(page.locator(".ppw-booker-breakdown").first()).not.toHaveAttribute("open","");
  await expect(page.getByText("Generate AI Review")).toHaveCount(0);
  expect(resultReads).toBe(1);expect(groqCalls).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:images+"/ringside-"+width+".png",fullPage:true});
 });
}
test("Ringside unavailable: canonical facts are readable with no manual generation action",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>r.fulfill({json:r.request().postDataJSON().method==="resultsArchive"?
  {items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",crowdResponse:84,
   matchCount:1,angleCount:1}],nextCursor:null}:show}));
 await page.route("**/api/results-commentary",r=>r.fulfill({json:{status:"unavailable"}}));
 await page.goto("/#/results");
 await page.getByRole("button",{name:/Read ringside report/}).click();
 await expect(page.locator(".ppw-ringside-slot").first()).toContainText("Kenny Omega");
 await expect(page.locator(".ppw-booker-breakdown")).toHaveCount(2);
 await expect(page.getByText("Generate AI Review")).toHaveCount(0);
});
