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
 await page.getByRole("button",{name:"Staff Market"}).click();
 await page.getByText("View Morgan Stone's dossier").click();
 await expect(page.getByText(/A forthright voice/)).toBeVisible();
 await expect(page.getByText("No previous completed staff employment recorded in this World.")).toBeVisible();
 await page.getByRole("button",{name:"Offer contract"}).click();
 await expect(page.getByText("Staff contract signed. Weekly payroll now includes this employee.")).toBeVisible();
 await expect(page.locator(".ppw-staff-overview-metric")
  .filter({hasText:"WEEKLY PAYROLL"}).getByText("$950",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Contracts",exact:true}).click();
 await expect(page.getByText("Buyout $49,400")).toHaveCount(0);
 await page.getByRole("button",{name:"Release"}).click();
 await expect(page.getByText(/Buyout \$49,400/)).toBeVisible();
 await page.getByRole("button",{name:"Confirm buyout"}).click();
 await expect(page.getByText(/Employee released. The buyout was charged once/)).toBeVisible();
 expect(methods.filter(x=>x.method==="hireStaff")).toHaveLength(1);
 expect(methods.filter(x=>x.method==="releaseStaff")).toHaveLength(1);
 await page.getByRole("button",{name:"Meetings",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Around the table"})).toBeVisible();
});

test("320px iPhone Staff Market keeps nine readable department options",async({page})=>{
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
 await page.getByRole("button",{name:"Staff Market"}).click();
 const tabs=page.locator(".ppw-staff-departments button");
 await expect(tabs).toHaveCount(9);
 const boxes=await tabs.evaluateAll(els=>els.map(el=>{
  const box=el.getBoundingClientRect();return {top:Math.round(box.top),height:box.height,width:box.width};
 }));
 expect(new Set(boxes.map(b=>b.top)).size).toBe(5);
 expect(boxes.every(b=>b.height>=44&&b.width>=110)).toBe(true);
 const readability=await tabs.evaluateAll(els=>els.map(el=>{
  const style=getComputedStyle(el);
  return {text:el.textContent,break:style.wordBreak,wrap:style.overflowWrap,
   width:el.clientWidth,scroll:el.scrollWidth};
 }));
 expect(readability.filter(m=>m.break!=="normal"||m.wrap!=="normal"||
  m.scroll>m.width+1),"Department labels should never split or overflow")
  .toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await tabs.nth(7).click();
 await expect(tabs.nth(7)).toHaveAttribute("aria-pressed","true");
});

test("Gorilla policy is saved with actor-scoped World revision on a 320px iPhone, without going live",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 let revision=4,policy="STICK_TO_CARD";
 const overview={world:{revision,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",
   tier:"LOCAL",cash:200000,debt:0}};
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"genesis",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const body=route.request().postDataJSON();
  if(body.method==="setGorillaPolicy"){
   expect(body.policy).toBe("FOLLOW_THE_CROWD");
   expect(body.expectedRevision).toBe(4);
   expect(body.worldId).toBe("genesis");
   expect(body.promotionId).toBe("local");
   policy=body.policy;revision++;
   return route.fulfill({json:{status:"APPLIED",revision,result:{policy}}});
  }
  return route.fulfill({json:{year:1,week:5,worldRevision:revision,canEdit:true,
   gorillaPolicy:policy,allowUnfinishedFallback:false,autoRenewSameTerms:false,
   allowLogisticsFallback:false,permittedDays:[],permittedVenueIds:[],
   lockedLogisticsDelegated:false,talentManager:null,availableManagers:[],
   weeklyPayroll:0,promotionCash:200000,venues:[],employees:[],market:[],
   employmentHistory:[],notices:[]}}); 
 });
 await page.goto("/#/staff");
 await expect(page.getByRole("heading",{name:"Showtime instructions"})).toBeVisible();
 const follow=page.getByRole("button",{name:"Follow the crowd"});
 await follow.click();
 await expect(follow).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"Save Gorilla instructions"}).click();
 await expect(page.getByText(/Gorilla instructions saved before World Lock/)).toBeVisible();
 await expect(follow).toHaveAttribute("aria-pressed","true");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test("Talent Scout presents bounded named prospects and opens the existing Talent Market",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const overview={world:{revision:4,name:"Genesis",year:1,week:5,
  phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",
   tier:"LOCAL",cash:200000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}};
 const scout={staffId:"staff-scout-001",name:"Scout Example",role:"SCOUT",
  insight:76,craft:72,people:67,reliability:78,personality:"FRANK",
  specialism:"technical upside",weeklySalary:950,employmentId:"staff-employment-scout",
  startWeekIndex:1,expiresWeekIndex:52,weeksRemaining:48,termWeeks:52,
  buyoutCost:45600,morale:80};
 const called:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"genesis",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);called.push(method);
  if(method==="staff")return route.fulfill({json:{
   year:1,week:5,worldRevision:4,canEdit:true,
   allowUnfinishedFallback:false,allowLogisticsFallback:false,
   autoRenewSameTerms:false,permittedDays:[],permittedVenueIds:[],
   lockedLogisticsDelegated:false,talentManager:null,availableManagers:[],
   weeklyPayroll:950,promotionCash:200000,venues:[],employees:[scout],
   market:[],employmentHistory:[],notices:[],meetings:[{
    role:"SCOUT",staffName:scout.name,personality:"FRANK",target:"roster",
    message:"Two prospects deserve a closer look."
   }],scoutReport:[
    {personId:"young-1",name:"A Young Technician",division:"MEN",
     observation:"Strong fundamentals, but limited recognition. Potential, not a promise."},
    {personId:"young-2",name:"A Young Prospect",division:"WOMEN",
     observation:"Lots of personality. The audience still needs convincing."}]
  }});
  if(method==="wrestlerDirectory")return route.fulfill({json:{
   year:1,week:5,canEdit:true,people:[],total:0,hasMore:false}});
  return route.fulfill({json:overview});
 });
 await page.goto("/#/staff");
 await page.getByText("Full staff meeting · 9 departments").click();
 const meeting=page.locator(".ppw-staff-meeting-brief").filter({hasText:"Talent Scout"});
 await expect(meeting).toBeVisible();
 await meeting.locator("summary").click();
 await expect(meeting.getByText("A Young Technician")).toBeVisible();
 await expect(meeting.getByText("A Young Prospect")).toBeVisible();
 await meeting.getByRole("button",{name:"Browse Talent Market"}).click();
 await expect(page).toHaveURL(/#\/market$/);
 expect(called).toContain("staff");
});
