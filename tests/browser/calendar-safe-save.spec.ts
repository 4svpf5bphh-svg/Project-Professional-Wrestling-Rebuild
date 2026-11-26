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
 await expect(page.getByText(/No PPVs or specials are due in this six-week window/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Across the World"})).toHaveAttribute("aria-pressed","false");
 await page.getByRole("button",{name:"Across the World"}).click();
 await expect(page.getByText(/No rival premium events or specials have been announced/)).toBeVisible();
 await page.getByText("Manage recurring events",{exact:true}).click();
 await expect(page.getByRole("button",{name:"+ Add event"})).toBeVisible();
 expect(calls).toEqual(["calendar"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("owned PPV and television use compact calendar rows; authentic show art stays on show/results",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const methods:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const input=r.request().postDataJSON() as {method:string};
  methods.push(input.method);
  if(input.method!=="calendar")throw Error("Unexpected call "+input.method);
  return r.fulfill({json:{
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
 const compact=page.locator(".ppw-calendar-event-compact");
 await expect(compact).toHaveCount(1);
 await expect(compact.first()).toContainText("Indie Cup");
 await expect(page.locator(".ppw-calendar-owned-poster")).toHaveCount(0);
 await page.getByRole("button",{name:"Across the World"}).click();
 await expect(page.getByText("Rival Night").first()).toBeVisible();
 await expect(page.locator(".ppw-calendar-owned-poster")).toHaveCount(0);
 expect(methods).toEqual(["calendar"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
test("applied weekly TV package stays in actual results, not a giant repeated planner poster",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>r.fulfill({json:{
  ...calendar(4,80),broadcastPackage:"MIDNIGHT_FREQUENCY",
  weeks:[{year:1,week:5,offset:0,shows:[flagship]}],worldWeeks:[]
 }}));
 await page.goto("/#/calendar");
 const tile=page.locator(".ppw-calendar-event-compact").first();
 await expect(tile).toBeVisible();
 await expect(tile.locator(".ppw-calendar-compact-title")).toHaveText("Indie Weekly");
 await expect(page.locator(".ppw-calendar-owned-poster")).toHaveCount(0);
 const size=await tile.evaluate(e=>({width:e.getBoundingClientRect().width,
  height:e.getBoundingClientRect().height}));
 expect(size.width).toBeGreaterThan(200);
 expect(size.height).toBeLessThan(230);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

for(const width of [320,390]){
 test("contracted television fills the mobile calendar at "+width+"px without scheduling 52 drafts",async({page})=>{
  await page.setViewportSize({width,height:844});
  const calls:string[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const body=route.request().postDataJSON();
   calls.push(body.method);
   if(body.method!=="calendar")throw Error("Unexpected "+body.method);
   return route.fulfill({json:{
    ...calendar(4,80),
    broadcastSlot:{offerCode:"BROADCAST_GROWTH",networkName:"VibeFlix",
     day:5,hour:20,startWeekIndex:4,endWeekIndex:15},
    weeks:[5,6,7].map((week,offset)=>({year:1,week,offset,shows:[flagship]})),
    worldWeeks:[]
   }});
  });
  await page.goto("/#/calendar");
  await expect(page.locator(".ppw-calendar-network-term")).toContainText("VibeFlix");
  await expect(page.locator(".ppw-calendar-network-term")).toContainText("Friday");
  await expect(page.locator(".ppw-calendar-tv-slot")).toHaveCount(3);
  await expect(page.locator(".ppw-calendar-tv-slot").first()).toContainText("Fri 20:00");
  await expect(page.locator(".ppw-calendar-occurrence")).toHaveCount(3);
  expect(calls,"Reading recurring TV weeks must not cause more RPC calls").toEqual(["calendar"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test("unified year calendar shows only due alternate-week TV with PPVs at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const calls:string[]=[];
  const alternate={...flagship,cadenceWeeks:2,anchorWeek:0};
  const weeks=Array.from({length:16},(_,i)=>{
   const week=5+i;
   const due=(week-1)%2===0;
   return {year:1,week,offset:i,shows:[
    ...(due?[alternate]:[]),...(week===11?[cup]:[])
   ]};
  });
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=String(r.request().postDataJSON().method);
   calls.push(method);
   if(method!=="calendar")throw Error("Unexpected "+method);
   return r.fulfill({json:{...calendar(4,80),series:[alternate,cup],weeks,
    annual:{tier:"LOCAL",policyStartYear:1,
     policy:{minimum:2,maximum:4,recommended:3,minGap:8},
     years:[{year:1,confirmed:true,events:[{seriesId:"cup",week:11}],suggested:[]},
      {year:2,confirmed:false,events:[],suggested:[]}]},
    broadcastSlot:{offerCode:"BROADCAST_TV",networkName:"Regional Sports",
     day:5,hour:20,startWeekIndex:0,endWeekIndex:52}}});
  });
  await page.goto("/#/calendar");
  await expect(page.locator(".ppw-calendar-four-week")).toHaveCount(0);
  await expect(page.locator(".ppw-calendar-week-button")).toHaveCount(52);
  const tvWeek=page.getByRole("button",{name:"Year 1 week 5 — Indie Weekly"});
  // The 52-week tiles stay readable: the full show name is in their
  // accessible label and the real selected-week programme detail.
  await expect(tvWeek).toContainText("TV");
  await expect(tvWeek).toContainText("Fri");
  const noTv=page.getByRole("button",{name:"Year 1 week 6 — no shows due"});
  await expect(noTv).not.toContainText("Indie Weekly");
  const both=page.getByRole("button",{name:"Year 1 week 11 — Indie Cup + Indie Weekly"});
  await expect(both).toContainText("Indie Cup");
  await expect(both).toContainText("TV");
  await both.click();
  await expect(page.getByRole("region",{name:"Week 11 shows and booking"}))
   .toContainText("Indie Weekly");
  await expect(page.getByRole("region",{name:"Week 11 shows and booking"}))
   .toContainText("Indie Cup");
  await expect(page.locator(".ppw-calendar-year-picker")).toContainText("WEEK 11");
  await expect(page.locator(".ppw-calendar-year-picker")).toContainText("Indie Cup");
  await expect(page.locator(".ppw-calendar-event-compact")).toHaveCount(5);
  // The agenda includes the current plus six future weeks, so W11 is
  // now actionable both here and on the actual annual TV/PPV grid.
  await expect(page.locator(".ppw-calendar-owned-poster")).toHaveCount(0);
  expect(calls).toEqual(["calendar"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
