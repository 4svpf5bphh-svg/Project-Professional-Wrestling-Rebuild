import {test,expect} from "@playwright/test";
const weekly={seriesId:"flagship",name:"CWA Weekly",role:"FLAGSHIP",
 eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:70,active:true};
const premium={seriesId:"premium",name:"CWA Premium",role:"PREMIUM",
 eventType:"MAJOR",cadenceWeeks:4,anchorWeek:3,importance:88,active:true};
const suggested=[12,29,46].map(week=>({seriesId:"premium",week}));
const session=(week:number)=>({worldId:"annual",playerId:"owner",csrfToken:"csrf",
 overview:{world:{revision:4,name:"CWA Year",year:1,week,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
  cash:400000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}},
 availablePromotions:[]});
const calendar=(revision:number,confirmed:boolean,events:typeof suggested,
 week=1,canEdit=true)=>({
 promotionId:"cwa",promotionName:"CWA",year:1,week,worldRevision:revision,
 canEdit,series:[weekly,premium],bookings:[],worldWeeks:[],weeks:[{
  year:1,week,offset:0,shows:[weekly]}],
 annual:{tier:"LOCAL",policyStartYear:1,
  policy:{minimum:2,maximum:4,recommended:3,minGap:8},
  years:[{year:1,confirmed,events:confirmed?events:[],suggested},
   {year:2,confirmed:false,events:[],suggested}]}
});
for(const width of [320,390]){
 test("iPhone "+width+"px chooses real annual PPV weeks then confirms once without per-tap reads",
 async({page})=>{
  await page.setViewportSize({width,height:844});
  let revision=4,confirmed=false,events=suggested;
  const calls:string[]=[],saves:unknown[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:session(1)}));
  await page.route("**/api/card",route=>{
   const body=route.request().postDataJSON();
   calls.push(body.method);
   if(body.method==="calendar")return route.fulfill({json:
    calendar(revision,confirmed,events)});
   if(body.method!=="saveAnnualPremium")throw Error("Unexpected "+body.method);
   saves.push(body);revision++;confirmed=true;events=body.events;
   return route.fulfill({json:{status:"APPLIED",revision,
    result:{year:1,status:"CONFIRMED"}}});
  });
  await page.goto("/#/calendar");
  await expect(page.getByRole("heading",{name:"Show Calendar"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Plan your PPVs"})).toBeVisible();
  await expect(page.locator(".ppw-calendar-quarter")).toHaveCount(4);
  await expect(page.locator(".ppw-calendar-week-button")).toHaveCount(52);
  await expect(page.getByText("Suggested for Year 1")).toBeVisible();
  const week20=page.getByRole("button",{name:"Year 1 week 20 — available"});
  await week20.click();
  await page.locator(".ppw-calendar-year-picker").getByRole("button",
   {name:"CWA Premium"}).click();
  await expect(page.getByRole("button",{name:"Year 1 week 20 — CWA Premium"})).toBeVisible();
  await page.getByRole("button",{name:"Confirm Year 1"}).click();
  console.log("PPW YEAR CONFIRM",width,JSON.stringify(saves),
   await page.locator(".ppw-calendar-year-plan").innerText(),
   await page.locator(".ppw-calendar-error").allTextContents());
  await expect(page.getByText("Confirmed for Year 1")).toBeVisible();
  expect(saves).toHaveLength(1);
  const first=saves[0] as {year:number;events:{seriesId:string;week:number}[]};
  expect(first.year).toBe(1);
  expect(first.events.map(x=>x.week)).toEqual([12,20,29,46]);
  expect(calls,"No database calls from viewing or tapping week cells")
   .toEqual(["calendar","saveAnnualPremium","calendar"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
test("annual confirm retries a lost acknowledgement using exactly one idempotency key",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const saved:Array<{requestId:string;expectedRevision:number}>=[];
 await page.route("**/api/session",route=>route.fulfill({json:session(1)}));
 await page.route("**/api/card",route=>{
  const p=route.request().postDataJSON();
  if(p.method==="calendar")return route.fulfill({json:calendar(4,false,suggested)});
  if(p.method!=="saveAnnualPremium")throw Error("Unexpected "+p.method);
  saved.push({requestId:p.requestId,expectedRevision:p.expectedRevision});
  if(saved.length===1)return route.fulfill({status:503,body:"No acknowledgement"});
  return route.fulfill({json:{status:"REPLAYED",revision:5,
   result:{status:"CONFIRMED"}}});
 });
 await page.goto("/#/calendar");
 await page.getByRole("button",{name:"Confirm Year 1"}).click();
 console.log("PPW YEAR LOST RESPONSE",JSON.stringify(saved),
  await page.locator(".ppw-calendar-year-plan").innerText(),
  await page.locator(".ppw-calendar-error").allTextContents());
 await expect(page.getByText(/Booking request failed|Could not save the PPV year/i)).toBeVisible();
 await page.getByRole("button",{name:"Confirm Year 1"}).click();
 await expect.poll(()=>saved.length).toBe(2);
 expect(saved[0]).toEqual(saved[1]);
});
test("stale World revision preserves selected PPVs without falsely reporting success",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 let revision=4;const saves:Array<{requestId:string;expectedRevision:number;
 events:{seriesId:string;week:number}[]}>=[],calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session(1)}));
 await page.route("**/api/card",route=>{
  const p=route.request().postDataJSON();calls.push(p.method);
  if(p.method==="calendar")return route.fulfill({json:calendar(revision,false,suggested)});
  if(p.method!=="saveAnnualPremium")throw Error("Unexpected "+p.method);
  saves.push({requestId:p.requestId,expectedRevision:p.expectedRevision,events:p.events});
  if(saves.length===1){revision=5;return route.fulfill({json:{status:"STALE",revision}});}
  return route.fulfill({json:{status:"APPLIED",revision:6}});
 });
 await page.goto("/#/calendar");
 await page.getByRole("button",{name:"Year 1 week 20 — available"}).click();
 await page.locator(".ppw-calendar-year-picker").getByRole("button",{name:"CWA Premium"}).click();
 await page.getByRole("button",{name:"Confirm Year 1"}).click();
 console.log("PPW YEAR STALE",JSON.stringify(saves),
  await page.locator(".ppw-calendar-year-plan").innerText(),
  await page.locator(".ppw-calendar-error").allTextContents());
 await expect(page.getByText(/chosen PPV dates are preserved/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Year 1 week 20 — CWA Premium"})).toBeVisible();
 await page.getByRole("button",{name:"Confirm Year 1"}).click();
 expect(saves).toHaveLength(2);
 expect(saves.map(s=>s.expectedRevision)).toEqual([4,5]);
 expect(saves[0]?.requestId).not.toBe(saves[1]?.requestId);
 expect(saves.map(s=>s.events.map(x=>x.week))).toEqual([[12,20,29,46],[12,20,29,46]]);
});
test("ongoing save keeps its original year untouched and opens next-year PPV planning",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 let writes=0;
 await page.route("**/api/session",route=>route.fulfill({json:session(36)}));
 await page.route("**/api/card",route=>{
  const p=route.request().postDataJSON();
  if(p.method!=="calendar"){writes++;throw Error("Unexpected calendar mutation");}
  return route.fulfill({json:calendar(4,false,suggested,36)});
 });
 await page.goto("/#/calendar");
 await expect(page.getByRole("button",{name:"Year 2",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.getByText("Suggested for Year 2")).toBeVisible();
 await page.getByRole("button",{name:"Year 1",exact:true}).click();
 await expect(page.getByText(/This year's existing dates stay protected/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Confirm Year 1"})).toHaveCount(0);
 expect(writes).toBe(0);
});
