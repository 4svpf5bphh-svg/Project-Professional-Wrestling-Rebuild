import {test,expect} from "@playwright/test";

const overview={
 world:{revision:4,name:"Playtest",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+4000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"independent",name:"Independent",
  tier:"LOCAL",cash:1000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}
};
const session={worldId:"playtest",playerId:"owner",csrfToken:"csrf",
 overview,availablePromotions:[]};
const flagship={seriesId:"flagship",name:"Indie Weekly",role:"FLAGSHIP",
 eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:68,active:true};
const cup={seriesId:"cup",name:"Indie Cup",role:"SPECIAL",
 eventType:"MAJOR",cadenceWeeks:52,anchorWeek:10,importance:80,active:true};
const calendar=(revision:number,importance:number)=>({
 promotionId:"independent",promotionName:"Independent",
 year:1,week:5,worldRevision:revision,canEdit:true,
 series:[flagship,{...cup,importance}],bookings:[],
 weeks:[],worldWeeks:[]
});
for(const stale of [false,true]){
 test("recurring show changes survive "+(stale?
  "a rival revision without falsely confirming the edit":
  "an interrupted reply without adding another PPV"),async({page})=>{
  await page.setViewportSize({width:390,height:844});
  let revision=4,importance=80,requests=0;
  const attempts:Array<{id:string;revision:number;importance:number}>=[];
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",async route=>{
   const body=route.request().postDataJSON();
   if(body.method==="calendar")
    return route.fulfill({json:calendar(revision,importance)});
   if(body.method!=="saveCalendar")
    throw new Error("Unexpected calendar action "+body.method);
   requests++;
   attempts.push({id:body.requestId,
    revision:body.expectedRevision,importance:body.series.importance});
   if(requests===1){
    if(stale){
     revision=5;
     return route.fulfill({json:{status:"STALE",revision}});
    }
    importance=90;revision=5;
    return route.fulfill({status:503,contentType:"application/json",
     body:JSON.stringify({error:"Proxy network failed"})});
   }
   importance=90;revision=6;
   return route.fulfill({json:{status:stale?"APPLIED":"REPLAYED",revision,
    result:{seriesId:"cup",status:"UPDATED"}}});
  });
  await page.goto("/#/calendar");
  await expect(page.getByRole("heading",{name:"Show Calendar"})).toBeVisible();
  await page.getByRole("button",{name:"Edit"}).nth(1).click();
  await page.getByLabel("Event importance").fill("90");
  await page.getByRole("button",{name:"Save event"}).click();
  await expect(page.getByText(stale?/Your event choices are preserved/:
   /Booking request failed/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Save event"})).toBeVisible();
  await expect(page.getByLabel("Event importance")).toHaveValue("90");
  await page.getByRole("button",{name:"Save event"}).click();
  await expect(page.getByText(/Indie Cup/).first()).toBeVisible();
  await expect(page.getByText(/Importance 90/)).toBeVisible();
  expect(attempts.map(x=>x.importance)).toEqual([90,90]);
  expect(attempts.map(x=>x.revision)).toEqual(stale?[4,5]:[4,4]);
  if(stale)expect(attempts[0]?.id).not.toBe(attempts[1]?.id);
  else expect(attempts[0]?.id).toBe(attempts[1]?.id);
  expect(requests).toBe(2);
 });
}
