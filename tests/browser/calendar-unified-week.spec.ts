import {test,expect} from "@playwright/test";
const tv={seriesId:"flagship",name:"CWA Ascension",role:"FLAGSHIP",
 eventType:"REGULAR",cadenceWeeks:2,anchorWeek:0,importance:70,active:true};
const ppv={seriesId:"premium",name:"Extreme Warfare",role:"PREMIUM",
 eventType:"MAJOR",cadenceWeeks:52,anchorWeek:32,importance:88,active:true};
const bookedTv={draftId:"week33-tv",year:1,week:33,bookingClass:"REGULAR",
 showSeriesId:"flagship",showName:"CWA Ascension",status:"DRAFT",
 day:4,venueName:"Home Arena",marketName:"Home",ready:true};
const bookedPpv={draftId:"week33-ppv",year:1,week:33,showSeriesId:"premium",
 showName:"The Lottery",status:"SUBMITTED",ready:true,certified:false};
const overview={world:{revision:6,name:"Genesis",year:1,week:30,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:2000000,debt:0}};
const yearPlan={tier:"LOCAL",policyStartYear:1,
 policy:{minimum:2,maximum:4,recommended:3,minGap:8},
 years:[
  {year:1,confirmed:true,events:[{seriesId:"premium",week:33,name:"Lottery Night"}],
   suggested:[{seriesId:"premium",week:33,name:"Lottery Night"}]},
  {year:2,confirmed:true,events:[{seriesId:"premium",week:33,name:"Future Finale"}],
   suggested:[{seriesId:"premium",week:33,name:"Future Finale"}]}]};
const calendar=(withBookings:boolean)=>({
 promotionId:"cwa",promotionName:"CWA",year:1,week:30,worldRevision:6,
 canEdit:true,series:[tv,ppv],annual:yearPlan,
 broadcastSlot:{offerCode:"deal",networkName:"VibeFlix",day:4,hour:20,
  startWeekIndex:0,endWeekIndex:51},
 bookings:withBookings?[bookedTv]:[],
 premiumEditions:withBookings?[bookedPpv]:[],
 weeks:[{year:1,week:30,offset:0,shows:[]},
  {year:1,week:31,offset:1,shows:[tv]},
  {year:1,week:32,offset:2,shows:[]},
  {year:1,week:33,offset:3,shows:[tv,ppv]}],worldWeeks:[]});
for(const width of [320,390]){
 test("Phase 60 Year 1 week shows actual TV and booked PPV without extra reads at "+width,
 async({page})=>{
  await page.setViewportSize({width,height:844});
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{worldId:"w",
   playerId:"owner",csrfToken:"csrf",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const method=(r.request().postDataJSON() as {method:string}).method;
   calls.push(method);
   if(method!=="calendar")throw Error("Unexpected "+method);
   return r.fulfill({json:calendar(true)});
  });
  await page.goto("/#/calendar");
  await expect(page.locator(".ppw-calendar-week-button")).toHaveCount(52);
  const week33=page.getByRole("button",{
   name:"Year 1 week 33 — The Lottery + CWA Ascension"});
  await expect(week33).toHaveAttribute("data-has-both","true");
  await week33.click();
  // The details sit in the selected quarter, not below the entire year.
  await expect(page.locator(".ppw-calendar-quarter").nth(2)
   .locator(".ppw-calendar-week-focus")).toBeVisible();
  const focus=page.getByRole("region",{name:"Week 33 shows and booking"});
  await expect(focus.locator(".ppw-calendar-week-focus-event")).toHaveCount(2);
  await expect(focus.locator('[data-event-type="REGULAR"]'))
   .toContainText("CWA Ascension");
  await expect(focus.locator('[data-event-type="REGULAR"]'))
   .toContainText("VibeFlix · Thu 20:00 · Contracted slot");
  await expect(focus.locator('[data-event-type="REGULAR"]'))
   .toContainText("Card ready");
  await expect(focus.locator('[data-event-type="REGULAR"]'))
   .toContainText("Home Arena");
  await expect(focus.locator('[data-event-type="MAJOR"]'))
   .toContainText("The Lottery");
  await expect(focus.locator('[data-event-type="MAJOR"]'))
   .toContainText("Card submitted");
  await expect(page.locator('.ppw-calendar-occurrence[data-week="1-33"] .ppw-calendar-event-major'))
   .toContainText("Submitted for lock");
  await expect(focus.getByRole("button",{name:"Review booking"})).toHaveCount(1);
  await expect(focus.getByRole("button",{name:"Book PPV"})).toHaveCount(0);
  // Real rendered calendar at actual iPhone widths, not generated mockups.
  await page.screenshot({path:"test-results/ppw-integrated-calendar-"+width+".png",
   fullPage:true,animations:"disabled"});
  await focus.screenshot({path:"test-results/ppw-integrated-calendar-week-"+width+".png",
   animations:"disabled"});
  await page.getByRole("button",{name:"Year 1 week 30 — no shows due"}).click();
  await expect(page.getByRole("region",{name:"Week 30 shows and booking"}))
   .toContainText("Off week");
  await expect(page.getByRole("button",{name:"Plan TV show"})).toHaveCount(0);
  await page.getByRole("button",{name:"Year 2",exact:true}).click();
  await page.getByRole("button",{name:"Year 2 week 33 — Future Finale + CWA Ascension"}).click();
  const future=page.getByRole("region",{name:"Week 33 shows and booking"});
  await expect(future).toContainText("Future Finale");
  await expect(future).not.toContainText("The Lottery");
  await expect(future.getByRole("button",{name:"Review booking"})).toHaveCount(0);
  expect(calls).toEqual(["calendar"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
for(const width of [320,390]){
 test("Phase 60 alternate TV is bookable only when due, without an extra Calendar query at "+width,
 async({page})=>{
  await page.setViewportSize({width,height:844});
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{worldId:"w",
   playerId:"owner",csrfToken:"csrf",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const method=(r.request().postDataJSON() as {method:string}).method;
   calls.push(method);
   if(method==="calendar")return r.fulfill({json:calendar(false)});
   if(method==="planner")return r.fulfill({json:{
    worldName:"Genesis",promotionName:"CWA",year:1,week:30,
    worldRevision:6,canEdit:true,homeMarketId:null,venues:[],
    activeProgrammes:[],weeks:[],venuePressure:[]}})
   throw Error("Unexpected "+method);
  });
  await page.goto("/#/calendar");
  await page.getByRole("button",{name:"Year 1 week 30 — no shows due"}).click();
  await expect(page.getByRole("region",{name:"Week 30 shows and booking"}))
   .toContainText("Off week");
  await page.getByRole("button",{name:"Year 1 week 31 — CWA Ascension"}).click();
  const focus=page.getByRole("region",{name:"Week 31 shows and booking"});
  await expect(focus.getByRole("button",{name:"Plan TV show"})).toBeVisible();
  expect(calls).toEqual(["calendar"]);
  await focus.getByRole("button",{name:"Plan TV show"}).click();
  await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
  await expect.poll(()=>calls).toEqual(["calendar","planner"]);
 });
}
