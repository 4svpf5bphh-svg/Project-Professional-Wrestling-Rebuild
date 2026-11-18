import {test,expect} from "@playwright/test";
const weekly={seriesId:"flagship",name:"CWA Weekly",role:"FLAGSHIP",
 eventType:"REGULAR",cadenceWeeks:2,anchorWeek:0,importance:70,active:true};
const premium={seriesId:"premium",name:"Extreme Warfare",role:"PREMIUM",
 eventType:"MAJOR",cadenceWeeks:52,anchorWeek:32,importance:88,active:true};
const session={worldId:"annual",playerId:"owner",csrfToken:"csrf",
 overview:{world:{revision:4,name:"CWA Year",year:1,week:30,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
   cash:400000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}},
 availablePromotions:[]};
const events=[
 {seriesId:"premium",week:12,name:"CWA Spring Riot"},
 {seriesId:"premium",week:33,name:"The Lottery"},
 {seriesId:"premium",week:46,name:"CWA Year End"}
];
const years=[
 {year:1,confirmed:true,events,suggested:events},
 {year:2,confirmed:true,events:[
  {seriesId:"premium",week:12,name:"Future Riot"},
  {seriesId:"premium",week:33,name:"Future Storm"},
  {seriesId:"premium",week:46,name:"Future Finale"}],suggested:events}
];
const edition=(status:"DRAFT"|"SUBMITTED",certified=false,ready=false)=>({
 draftId:"week33-ppv",year:1,week:33,showSeriesId:"premium",
 showName:"Extreme Warfare",status,certified,ready
});
const calendar=(name:string,revision:number,status:"DRAFT"|"SUBMITTED",
 certified=false,ready=false)=>({
 promotionId:"cwa",promotionName:"CWA",year:1,week:30,worldRevision:revision,
 canEdit:true,series:[weekly,premium],bookings:[],
 premiumEditions:[{...edition(status,certified,ready),showName:name}],
 worldWeeks:[],weeks:[{year:1,week:30,offset:0,shows:[]},
  {year:1,week:31,offset:1,shows:[weekly]},
  {year:1,week:32,offset:2,shows:[]},
  {year:1,week:33,offset:3,shows:[{...premium,name:"The Lottery"},weekly]}],
 annual:{tier:"LOCAL",policyStartYear:1,
  policy:{minimum:2,maximum:4,recommended:3,minGap:8},years}
});
for(const width of [320,390]){
 test("actual booked Year 1 title wins over annual rename, explicit sync is owner-revision checked at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let name="Extreme Warfare",revision=4;const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const p=r.request().postDataJSON() as Record<string,unknown>;
   calls.push(String(p.method));
   if(p.method==="calendar")
    return r.fulfill({json:calendar(name,revision,"DRAFT")});
   if(p.method!=="renameBookedPremium")throw Error("Unexpected method "+p.method);
   expect(p).toMatchObject({year:1,week:33,draftId:"week33-ppv",
    name:"The Lottery",expectedRevision:4,promotionId:"cwa"});
   name=String(p.name);revision++;
   return r.fulfill({json:{status:"APPLIED",revision,result:{newName:name}}});
  });
  await page.goto("/#/calendar");
  await expect(page.getByRole("button",{
   name:"Year 1 week 33 — Extreme Warfare + CWA Weekly"})).toBeVisible();
  await page.getByRole("button",{
   name:"Year 1 week 33 — Extreme Warfare + CWA Weekly"}).click();
  await expect(page.locator(".ppw-calendar-year-name-warning"))
   .toContainText("The Lottery");
  await expect(page.locator(".ppw-calendar-year-name-warning"))
   .toContainText("Extreme Warfare");
  await expect(page.getByLabel("Rename booked PPV")).toHaveValue("Extreme Warfare");
  await expect(page.locator('.ppw-calendar-occurrence[data-week="1-33"] .ppw-calendar-compact-title'))
   .toHaveText("Extreme Warfare");
  await page.getByLabel("Rename booked PPV").fill("The Lottery");
  await page.getByRole("button",{name:"Save booked PPV title"}).click();
  await expect(page.getByRole("button",{
   name:"Year 1 week 33 — The Lottery + CWA Weekly"})).toBeVisible();
  await expect(page.locator(".ppw-calendar-year-name-warning")).toHaveCount(0);
  await expect(page.locator('.ppw-calendar-occurrence[data-week="1-33"] .ppw-calendar-compact-title'))
   .toHaveText("The Lottery");
  expect(calls).toEqual(["calendar","renameBookedPremium","calendar"]);
  await page.getByRole("button",{name:"Year 2",exact:true}).click();
  await expect(page.getByRole("button",{
   name:"Year 2 week 33 — Future Storm + CWA Weekly"})).toBeVisible();
  expect(calls,"Viewing another year cannot mutate or refetch the World")
   .toEqual(["calendar","renameBookedPremium","calendar"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
for(const [status,certified,ready] of [
 ["SUBMITTED",false,false],["DRAFT",true,false],["DRAFT",false,true]
] as const){
 test("a "+(certified?"certified":ready?"ready":"submitted")+" PPV preserves its real title and offers no rename",async({page})=>{
  await page.setViewportSize({width:320,height:844});
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const p=r.request().postDataJSON() as {method:string};
   calls.push(p.method);
   return r.fulfill({json:calendar("Extreme Warfare",4,status,certified,ready)});
  });
  await page.goto("/#/calendar");
  await page.getByRole("button",{name:"Year 1 week 33 — Extreme Warfare + CWA Weekly"}).click();
  await expect(page.getByText("PPV / special · Extreme Warfare")).toBeVisible();
  await expect(page.getByLabel("Rename booked PPV")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Leave week free"})).toHaveCount(0);
  expect(calls).toEqual(["calendar"]);
 });
}
