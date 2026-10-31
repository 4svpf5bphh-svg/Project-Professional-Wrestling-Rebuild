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
  await page.getByText("Manage recurring events",{exact:true}).click();
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

test("a lost response for a newly generated PPV replays the same one-time creation",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const seen:string[]=[];
 let exists=false;
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON();
  if(input.method==="calendar"){
   await route.fulfill({json:{...calendar(4,80),series:[
    flagship,cup,...(exists?[{seriesId:"new-autumn-slam",name:"Autumn Slam",
     role:"SPECIAL",eventType:"MAJOR",cadenceWeeks:52,anchorWeek:4,
     importance:90,active:true}]:[])
   ]}});
   return;
  }
  if(input.method!=="saveCalendar")throw Error("Unexpected "+input.method);
  expect(input.series.seriesId).toBe("NEW");
  expect(input.series.name).toBe("Autumn Slam");
  seen.push(String(input.requestId));
  if(seen.length===1){
   exists=true; // saved but Vercel acknowledgement was lost.
   await route.fulfill({status:503,body:"",contentType:"text/plain"});
  }else await route.fulfill({json:{status:"REPLAYED",revision:5,
   result:{status:"CREATED",seriesId:"new-autumn-slam"}}});
 });
 await page.goto("/#/calendar");
 await page.getByText("Manage recurring events",{exact:true}).click();
 await page.getByRole("button",{name:"+ Add event"}).click();
 await page.getByLabel("Event name").fill("Autumn Slam");
 await page.getByLabel("Event importance").fill("90");
 await page.getByRole("button",{name:"Save event"}).click();
 await expect(page.getByText(/Booking request failed/)).toBeVisible();
 await expect(page.getByLabel("Event name")).toHaveValue("Autumn Slam");
 await page.getByRole("button",{name:"Save event"}).click();
 await expect(page.getByText("Autumn Slam",{exact:true})).toHaveCount(1);
 expect(seen).toHaveLength(2);
 expect(seen[0]).toBe(seen[1]);
});

test("Calendar prioritises announced fixtures, and empty premium view explains itself without another read",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  calls.push(method);
  if(method!=="calendar")throw Error("Unexpected calendar read "+method);
  return route.fulfill({json:{
   ...calendar(4,80),
   weeks:[{year:1,week:5,offset:0,shows:[flagship]},
    {year:1,week:6,offset:1,shows:[flagship]}],
   worldWeeks:[]
  }});
 });
 await page.goto("/#/calendar");
 await expect(page.getByRole("heading",{name:"Upcoming weeks"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Edit recurring schedule"})).toBeVisible();
 await expect(page.locator(".ppw-calendar-management")).not.toHaveAttribute("open");
 await expect(page.getByText("Indie Weekly").first()).toBeVisible();
 await page.getByRole("button",{name:"PPVs & specials"}).click();
 await expect(page.getByText(/No premium events or specials are announced/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Across the World"})).toHaveAttribute("aria-pressed","false");
 await page.getByRole("button",{name:"Across the World"}).click();
 await expect(page.getByText(/No rival premium events or specials have been announced/)).toBeVisible();
 await page.getByText("Manage recurring events",{exact:true}).click();
 await expect(page.getByRole("button",{name:"+ Add event"})).toBeVisible();
 expect(calls).toEqual(["calendar"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("owned premium calendar event uses the purchased animated poster; rivals do not",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const input=route.request().postDataJSON() as {method:string};
  methods.push(input.method);
  if(input.method!=="calendar")throw Error("Unexpected call "+input.method);
  return route.fulfill({json:{
   ...calendar(4,80),eventPosterStyle:"ECLIPSE",
   weeks:[{year:1,week:11,offset:6,shows:[cup]}],
   worldWeeks:[{year:1,week:11,offset:6,events:[
    {promotionId:"independent",promotionName:"Independent",seriesId:"cup",
     name:"Indie Cup",role:"SPECIAL",eventType:"MAJOR",importance:80},
    {promotionId:"rival",promotionName:"Rival",seriesId:"other",
     name:"Rival Night",role:"PREMIUM",eventType:"MAJOR",importance:79}
   ]}]
  }});
 });
 await page.goto("/#/calendar");
 await page.getByRole("button",{name:"PPVs & specials"}).click();
 const poster=page.locator(".ppw-calendar-owned-poster");
 await expect(poster).toHaveCount(1);
 await expect(poster).toHaveAttribute("data-poster","eclipse");
 await expect(poster.locator(".ppw-ep-title")).toHaveText("Indie Cup");
 await expect(poster.locator(".ppw-ep-main")).toHaveText("TO BE ANNOUNCED");
 await page.getByRole("button",{name:"Across the World"}).click();
 await expect(page.getByText("Rival Night")).toBeVisible();
 await expect(page.locator(".ppw-calendar-owned-poster")).toHaveCount(1);
 expect(methods).toEqual(["calendar"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("applied weekly TV graphics fill the calendar card instead of collapsing into a 49px label",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>r.fulfill({json:{
  ...calendar(4,80),broadcastPackage:"MIDNIGHT_FREQUENCY",
  weeks:[{year:1,week:5,offset:0,shows:[flagship]}],worldWeeks:[]
 }}));
 await page.goto("/#/calendar");
 const tile=page.locator(".ppw-calendar-event[data-has-artwork=true]").first();
 await expect(tile).toBeVisible();
 const graphic=tile.locator(".ppw-calendar-owned-poster.ppw-tv-frame");
 await expect(graphic).toBeVisible();
 await expect(graphic.locator(".ppw-tv-title")).toHaveText("Indie Weekly");
 const sizes=await page.evaluate(()=>{
  const tile=document.querySelector(".ppw-calendar-event[data-has-artwork=true]")!;
  const poster=tile.querySelector(".ppw-calendar-owned-poster")!;
  const title=poster.querySelector(".ppw-tv-title")!;
  return {tile:tile.getBoundingClientRect().width,
   poster:poster.getBoundingClientRect().width,
   title:title.getBoundingClientRect().width,
   writingMode:getComputedStyle(title).writingMode};
 });
 expect(sizes.tile).toBeGreaterThan(220);
 expect(sizes.poster/sizes.tile).toBeGreaterThan(.85);
 expect(sizes.title).toBeGreaterThan(100);
 expect(sizes.writingMode).toBe("horizontal-tb");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
