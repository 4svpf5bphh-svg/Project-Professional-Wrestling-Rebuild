import {test,expect} from "@playwright/test";

const session={
 worldId:"build",playerId:"owner",csrfToken:"csrf",
 overview:{world:{revision:6,name:"PPW",year:1,week:1,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",
   tier:"LOCAL",cash:1000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}},
 availablePromotions:[]
};
const weekly={seriesId:"tv",name:"CWA Weekly",role:"FLAGSHIP",
 eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:70,active:true};
const premium={...weekly,seriesId:"ppv",name:"Spring Riot",
 role:"PREMIUM",eventType:"MAJOR"};
const venue={venueId:"hall",marketId:"home",marketName:"Home",
 name:"Hall",capacity:500,weeklyHireCost:3000,prestige:50,
 productionSuitability:60,awareness:50,liveStrength:50,loyalty:50,
 audiencePotential:50,wrestlingInterest:50,spendingIndex:50,
 strongestRival:null,home:true};
const show=(week:number,status:string,ready:boolean)=>({
 draftId:"card-"+week,year:1,week,status,
 eventType:"REGULAR",bookingClass:"REGULAR",showSeriesId:"tv",
 showName:"CWA Weekly",day:5,marketId:"home",venueId:"hall",
 marketName:"Home",venueName:"Hall",ticketStrategy:"STANDARD",
 ready,slots:2
});
const planner=()=>({
 worldName:"PPW",promotionName:"CWA",year:1,week:1,
 worldRevision:6,canEdit:true,homeMarketId:"home",
 venues:[venue],venuePressure:[],
 weeks:Array.from({length:7},(_,offset)=>({
  year:1,week:offset+1,offset,required:true,major:offset===5,canEdit:true,
  scheduled:offset===5?[weekly,premium]:[weekly],
  shows:offset===0?[show(1,"DRAFT",false)]:
   offset===1?[show(2,"DRAFT",true)]:
   offset===2?[show(3,"SUBMITTED",true)]:[]
 }))
});
for(const width of [320,390]){
 test("Phase 53D production board preserves real draft/PPV status at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const methods:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const q=r.request().postDataJSON();
   methods.push(q.method);
   if(q.method!=="planner")throw Error("Unexpected Planner method "+q.method);
   return r.fulfill({json:planner()});
  });
  await page.goto("/#/planner");
  const board=page.locator(".ppw-planner-production-board");
  await expect(board.getByRole("heading",{name:"Production board"})).toBeVisible();
  await expect(board).toContainText("Spring Riot");
  await expect(board).toContainText("In 5 weeks");
  await expect(board.locator(".ppw-planner-board-tile")).toHaveCount(7);
  await expect(board.locator(".ppw-planner-board-tile").nth(0))
   .toHaveAttribute("data-state","CARD_IN_PROGRESS");
  await expect(board.locator(".ppw-planner-board-tile").nth(1))
   .toHaveAttribute("data-state","READY_TO_SUBMIT");
  await expect(board.locator(".ppw-planner-board-tile").nth(2))
   .toHaveAttribute("data-state","SUBMITTED");
  await expect(board.locator(".ppw-planner-board-tile").nth(5))
   .toHaveAttribute("data-state","UNBOOKED");
  await expect(board).toContainText("Drafts are not submitted");
  await board.getByRole("button",{name:/Year 1 Week 6, PPV Spring Riot/}).click();
  await expect(page.locator("#ppw-planner-week-1-6")).toBeFocused();
  await expect(page.locator("#ppw-planner-week-1-6")).toContainText("Spring Riot");
  expect(methods).toEqual(["planner"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}


test("manager saves a seven-week PPV outline once, and it survives reload without phantom bookings",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let revision=6,stored:Array<{year:number;week:number;note:string}>=[];
 const calls:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {
   method:string;notes?:typeof stored;expectedRevision?:number;
  };
  calls.push(req.method);
  if(req.method==="planner")return route.fulfill({json:{
   ...planner(),worldRevision:revision,creativeOutline:stored
  }});
  if(req.method==="saveCreativeOutline"){
   expect(req.expectedRevision).toBe(revision);
   stored=req.notes??[];revision++;
   return route.fulfill({json:{status:"APPLIED",revision}});
  }
  throw Error("Unexpected method "+req.method);
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Plan future story beats"}).click();
 await page.getByLabel("Creative intention for Year 1 Week 3")
  .fill("Joe questions the champion");
 await page.getByLabel("Creative intention for Year 1 Week 6")
  .fill("Slow turn payoff at Spring Riot");
 // Typed thoughts are only plans: no new booking or fees.
 expect(calls).toEqual(["planner"]);
 await page.getByRole("button",{name:"Save six-week outline"}).click();
 await expect(page.locator(".ppw-planner-outline")).toContainText("Joe questions the champion");
 await expect(page.locator(".ppw-planner-outline")).toContainText("Slow turn payoff");
 expect(stored).toHaveLength(2);
 await page.reload();
 await expect(page.locator(".ppw-planner-outline")).toContainText("Spring Riot");
 await expect(page.locator(".ppw-planner-board-tile[data-state='UNBOOKED']")).toHaveCount(4);
 await page.getByRole("button",{name:"Edit 2 week notes"}).click();
 await page.getByLabel("Creative intention for Year 1 Week 3").fill("");
 await page.getByRole("button",{name:"Save six-week outline"}).click();
 await expect(page.locator(".ppw-planner-outline")).not.toContainText("Joe questions the champion");
 expect(stored).toEqual([{year:1,week:6,note:"Slow turn payoff at Spring Riot"}]);
 expect(calls.filter(x=>x==="saveCreativeOutline")).toHaveLength(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
