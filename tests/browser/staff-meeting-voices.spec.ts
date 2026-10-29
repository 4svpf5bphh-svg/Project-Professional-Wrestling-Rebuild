import {test,expect} from "@playwright/test";
test("Staff Office sounds like distinct named colleagues, and opening advice never refetches",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",
   tier:"LOCAL",cash:200000,debt:0}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",
  overview,availablePromotions:[]};
 const roles=[
  {role:"CREATIVE",staffName:"Emilia Fox",personality:"ECCENTRIC",
   message:"One active story has repeated its recent beats. We need a fresh chapter.",
   target:"programmes"},
  {role:"MEDICAL",staffName:"Dr Hart",personality:"PATIENT",
   message:"No contracted wrestlers currently have an active medical restriction on record.",
   target:"roster"},
  {role:"ROAD_AGENT",staffName:null,personality:null,
   message:"We have no recent completed match to assess.",target:"gorilla"}
 ];
 const staff={year:1,week:5,worldRevision:4,canEdit:true,
  allowUnfinishedFallback:false,allowLogisticsFallback:false,
  autoRenewSameTerms:false,permittedDays:[],permittedVenueIds:[],
  lockedLogisticsDelegated:false,talentManager:null,
  availableManagers:[],weeklyPayroll:0,promotionCash:200000,
  employees:[],market:[],employmentHistory:[],venues:[],
  meetings:roles,scoutReport:[],notices:[]};
 let reads=0;
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  expect(r.request().postDataJSON().method).toBe("staff");reads++;
  return r.fulfill({json:staff});
 });
 await page.goto("/#/staff");
 await page.locator("summary").filter({hasText:"Full staff meeting"}).click();
 const notes=page.locator(".ppw-staff-meeting-brief");
 await notes.first().locator("summary").click();
 await expect(notes.first().locator(".ppw-staff-dialogue")).toContainText(
  "Here's the part that caught my eye.");
 await expect(notes.first().locator(".ppw-staff-dialogue")).toContainText(
  "One active story has repeated");
 await expect(notes.first().locator(".ppw-staff-voice")).toContainText("Emilia Fox");
 await notes.nth(1).locator("summary").click();
 await expect(notes.nth(1).locator(".ppw-staff-dialogue")).toContainText(
  "For now, let's keep it steady.");
 await notes.nth(2).locator("summary").click();
 await expect(notes.nth(2).locator(".ppw-staff-dialogue")).toContainText(
  "House office note");
 expect(reads).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
