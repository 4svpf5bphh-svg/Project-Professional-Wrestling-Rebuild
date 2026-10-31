import {test,expect} from "@playwright/test";
import {STAFF_OFFICE_THEMES} from "../../src/domain/staff-office-themes.js";
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"CWA",tier:"LOCAL",
 cash:200000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}};
const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",overview,
 availablePromotions:[]};
const staffView=(theme:string|null)=>({
 year:1,week:5,worldRevision:4,canEdit:true,staffOfficeTheme:theme,
 allowUnfinishedFallback:false,allowLogisticsFallback:false,autoRenewSameTerms:false,
 permittedDays:[],permittedVenueIds:[],lockedLogisticsDelegated:false,
 talentManager:null,availableManagers:[],weeklyPayroll:950,promotionCash:200000,
 employees:[{staffId:"staff-1",name:"Morgan Stone",role:"ROAD_AGENT",
  employmentId:"employment-1",insight:77,craft:82,people:56,reliability:80,
  personality:"FRANK",specialism:"main events",weeklySalary:950,
  startWeekIndex:4,expiresWeekIndex:55,weeksRemaining:52,termWeeks:52,
  buyoutCost:49400,morale:74}],
 market:[],employmentHistory:[],venues:[],notices:[],
 meetings:[{role:"ROAD_AGENT",staffName:"Morgan Stone",personality:"FRANK",
  target:"staff",message:"The opener looks strong. Keep the finish."}]
});
for(const width of [320,390]){
 test("all nine owner-owned office themes preview, unlock and switch at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let balance=5000,activeStaffOfficeTheme:string|null=null;
  const entitlements:string[]=[],purchases:string[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const req=route.request().postDataJSON() as {method:string;kind?:string;sku?:string};
   if(req.method==="kpWorkspace")return route.fulfill({json:{
    balance,lifetimeEarned:5000,lifetimeSpent:5000-balance,worldYear:1,week:5,
    promotionName:"CWA",weeklyAward:100,claim:null,entitlements,
    activeBrand:null,activeBadge:null,activeResultsSkin:null,activeEventPoster:null,
    activeStaffOfficeTheme,staff:[],achievements:[],createdTalent:[],
    createOptions:{alignments:[],styles:[],gimmicks:[]},staffAliasPrice:350,
    createTalentPrice:3000,
    catalogue:STAFF_OFFICE_THEMES.map(t=>({...t,kind:"STAFF_OFFICE_THEME",price:1250}))
   }});
   if(req.method==="kpAction"){
    if(req.kind==="BUY"){
     expect(entitlements).not.toContain(req.sku);
     entitlements.push(req.sku!);purchases.push(req.sku!);balance-=1250;
     activeStaffOfficeTheme=STAFF_OFFICE_THEMES.find(t=>t.sku===req.sku)?.style??null;
    }else if(req.kind==="APPLY_STAFF_OFFICE_THEME"){
     expect(entitlements).toContain(req.sku);
     activeStaffOfficeTheme=STAFF_OFFICE_THEMES.find(t=>t.sku===req.sku)?.style??null;
    }else if(req.kind==="CLEAR_STAFF_OFFICE_THEME")activeStaffOfficeTheme=null;
    return route.fulfill({json:{balance}});
   }
   return route.fulfill({json:{}});
  });
  await page.goto("/#/kayfabe");
  const shop=page.locator(".ppw-kp-staff-themes");
  const picker=shop.getByRole("combobox",{name:"Choose Staff Office theme"});
  await expect(picker.locator("option")).toHaveCount(9);
  for(const [i,theme] of STAFF_OFFICE_THEMES.entries()){
   await picker.selectOption(String(i));
   const sample=shop.locator(".ppw-staff-theme-preview");
   await expect(sample).toHaveCount(1);
   await expect(sample).toHaveAttribute("data-staff-office-theme",
    theme.style.toLowerCase().replaceAll("_","-"));
   await expect(sample.locator(".ppw-staff-nav .ppw-staff-button")).toHaveCount(4);
   await expect(sample.locator(".ppw-staff-meeting-brief")).toHaveCount(1);
  }
  await picker.selectOption("0");
  await shop.getByRole("button",{name:"Unlock"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await picker.selectOption("2");
  await shop.getByRole("button",{name:"Unlock"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await picker.selectOption("0");
  await shop.getByRole("button",{name:"Apply"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await shop.getByRole("button",{name:"Use original Staff Office"}).click();
  await expect(shop.getByRole("button",{name:"Apply"})).toBeVisible();
  expect(purchases).toEqual(["STAFF_OFFICE_GORILLA_CONTROL","STAFF_OFFICE_EXECUTIVE_SUITE"]);
  expect(balance).toBe(2500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
for(const width of [320,390]){
 test("all four real Staff Office tabs respect the paid look and fit "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let activeTheme:string="GORILLA_CONTROL";
  let reads=0;
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const body=route.request().postDataJSON() as {method:string};
   if(body.method!=="staff")throw new Error("Unexpected call "+body.method);
   reads++;
   return route.fulfill({json:staffView(activeTheme)});
  });
  for(const theme of STAFF_OFFICE_THEMES){
   activeTheme=theme.style;
   if(reads===0)await page.goto("/#/staff");
   else await page.reload(); // A new Staff Office mount reads the newly selected theme.
   const office=page.locator(".ppw-staff").first();
   await expect(office).toHaveAttribute("data-staff-office-theme",
    theme.style.toLowerCase().replaceAll("_","-"));
   await expect(office.getByRole("heading",{name:"Staff Office"})).toBeVisible();
   await expect(office.locator(".ppw-staff-overview-metric")).toHaveCount(3);
   await expect(office.locator(".ppw-staff-nav .ppw-staff-button")).toHaveCount(4);
   for(const tab of ["Meetings","My Staff","Contracts","Staff Market"]){
    await office.getByRole("button",{name:tab,exact:true}).click();
    await expect(office.getByRole("button",{name:tab,exact:true}))
     .toHaveAttribute("aria-current","page");
    await expect(office).toHaveAttribute("data-staff-office-theme",
     theme.style.toLowerCase().replaceAll("_","-"));
   }
   const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   expect(horizontalOverflow,theme.label+" causes horizontal overflow").toBeLessThanOrEqual(1);
  }
  expect(reads).toBe(9);
 });
}
test("Staff Office themes honour reduced-motion settings",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>route.fulfill({json:staffView("NEON_CONTROL")}));
 await page.goto("/#/staff");
 const animation=await page.locator(".ppw-staff").evaluate(el=>getComputedStyle(el,"::before").animationName);
 expect(animation).toBe("none");
});
