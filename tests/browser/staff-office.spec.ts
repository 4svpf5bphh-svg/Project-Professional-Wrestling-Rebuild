import {test,expect} from "@playwright/test";
const employee={staffId:"staff-road-agent-001",name:"Morgan Stone",role:"ROAD_AGENT",
 insight:77,craft:82,people:56,reliability:80,personality:"FRANK",
 specialism:"main events",weeklySalary:950};
test("iPhone Staff Office hires a unique Road Agent, exposes dossier and confirms exact buyout",async({page})=>{
 const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",
 tier:"LOCAL",cash:200000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]};
 const methods:Array<Record<string,unknown>>=[];
 let hired=false,revision=4;
 const staffView=()=>({
  year:1,week:5,worldRevision:revision,canEdit:true,
  allowUnfinishedFallback:false,allowLogisticsFallback:false,autoRenewSameTerms:false,
  permittedDays:[],permittedVenueIds:[],lockedLogisticsDelegated:false,
  talentManager:null,availableManagers:[],weeklyPayroll:hired?950:0,
  promotionCash:hired?200000:200000,venues:[],
  employees:hired?[{...employee,employmentId:"employment-1",
   startWeekIndex:4,expiresWeekIndex:55,weeksRemaining:52,termWeeks:52,
   buyoutCost:49400,morale:74}]:[],
  market:hired?[]:[employee],employmentHistory:[],
  notices:[{department:"Medical desk",message:"One contracted wrestler is medically unavailable.",
    target:"roster"}]
 });
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const request=route.request().postDataJSON() as Record<string,unknown>;
  methods.push(request);
  if(request.method==="staff")return route.fulfill({json:staffView()});
  if(request.method==="hireStaff"){
   expect(request.staffId).toBe(employee.staffId);
   expect(request.termWeeks).toBe(52);
   expect(request.weeklySalary).toBe(950);
   expect(request.expectedRevision).toBe(revision);
   hired=true;revision++;
   return route.fulfill({json:{status:"APPLIED",result:{accepted:true,employmentId:"employment-1"}}});
  }
  if(request.method==="releaseStaff"){
   expect(request.employmentId).toBe("employment-1");
   expect(request.expectedRevision).toBe(revision);
   hired=false;revision++;
   return route.fulfill({json:{status:"APPLIED",result:{buyoutCost:49400}}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/staff");
 await expect(page.getByRole("heading",{name:"Staff Office"})).toBeVisible();
 await page.getByText("View Morgan Stone's dossier").click();
 await expect(page.getByText(/A forthright voice/)).toBeVisible();
 await expect(page.getByText("No previous completed staff employment recorded in this World.")).toBeVisible();
 await page.getByRole("button",{name:"Offer contract"}).click();
 await expect(page.getByText("Staff contract signed. Weekly payroll now includes this employee.")).toBeVisible();
 await expect(page.locator(".ppw-staff-overview-metric")
  .filter({hasText:"WEEKLY PAYROLL"}).getByText("$950",{exact:true})).toBeVisible();
 await expect(page.getByText("Buyout $49,400")).toHaveCount(0);
 await page.getByRole("button",{name:"Release"}).click();
 await expect(page.getByText(/Buyout \$49,400/)).toBeVisible();
 await page.getByRole("button",{name:"Confirm buyout"}).click();
 await expect(page.getByText(/Employee released. The buyout was charged once/)).toBeVisible();
 expect(methods.filter(x=>x.method==="hireStaff")).toHaveLength(1);
 expect(methods.filter(x=>x.method==="releaseStaff")).toHaveLength(1);
 await page.getByRole("button",{name:"Open roster ↗"}).click();
 await expect(page).toHaveURL(/#\/roster$/);
});

test("320px iPhone Staff Market uses four readable rows of two departments",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",tier:"LOCAL",
  cash:200000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]};
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>route.fulfill({json:{
  year:1,week:5,worldRevision:4,canEdit:true,
  allowUnfinishedFallback:false,allowLogisticsFallback:false,autoRenewSameTerms:false,
  permittedDays:[],permittedVenueIds:[],lockedLogisticsDelegated:false,
  talentManager:null,availableManagers:[],weeklyPayroll:0,promotionCash:200000,
  employees:[],market:[],employmentHistory:[],venues:[],notices:[]
 }}));
 await page.goto("/#/staff");
 const tabs=page.locator(".ppw-staff-departments button");
 await expect(tabs).toHaveCount(8);
 const boxes=await tabs.evaluateAll(els=>els.map(el=>{
  const box=el.getBoundingClientRect();return {top:Math.round(box.top),height:box.height,width:box.width};
 }));
 expect(new Set(boxes.map(b=>b.top)).size).toBe(4);
 expect(boxes.every(b=>b.height>=44&&b.width>=110)).toBe(true);
 const readable=await tabs.evaluateAll(els=>els.every(el=>{
  const style=getComputedStyle(el);
  return style.wordBreak==="normal"&&style.overflowWrap==="normal"&&
   el.scrollWidth<=el.clientWidth+1;
 }));
 expect(readable,"Department names must wrap at whole words").toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await tabs.nth(7).click();
 await expect(tabs.nth(7)).toHaveAttribute("aria-pressed","true");
});
