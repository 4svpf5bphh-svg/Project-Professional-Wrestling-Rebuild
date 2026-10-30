import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"Genesis",year:1,week:6,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:500000,debt:0}};
const session={worldId:"world",playerId:"owner",csrfToken:"secret",overview,
 availablePromotions:[]};
test("iPhone Backstage remembers real rivalry wins, losses and scenes without fictional messages",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 let reads=0,writes=0;
 const contact={personId:"joe",name:"Samoa Joe",isCurrent:true,morale:69,
  momentum:71,lastMessage:null,latestIncoming:{request_id:"proposal",kind:"RIVALRY_PITCH",
   status:"ANSWERED",created_week_index:1,read_week_index:1,archived:false}};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as {method:string;personId?:string};
  if(req.method==="markBackstageRead")return r.fulfill({json:{readCount:0}});
  if(req.method!=="backstage"){writes++;return r.fulfill({json:{}});}
  reads++;
  return r.fulfill({json:{roster:[contact],personId:req.personId==="joe"?"joe":null,
   personName:req.personId==="joe"?"Samoa Joe":null,
   worldYear:1,worldWeek:6,worldRevision:4,canEdit:true,
   persona:null,history:[],recentRequests:[],archetypes:[],documentedAlternates:[],
   nextPitchWeek:0,conversations:[],
   memories:req.personId==="joe"?[
    {kind:"RIVALRY_ANGLE",sourceId:"feud:angle",weekIndex:3,importance:2,
     relatedName:"Matt Riddle",ownSide:"A",winnerSide:null},
    {kind:"RIVALRY_MATCH",sourceId:"feud:main",weekIndex:2,importance:2,
     relatedName:"Matt Riddle",ownSide:"A",winnerSide:"B"},
    {kind:"PROMISE_KEPT",sourceId:"promise",weekIndex:1,importance:4,
     relatedName:null,ownSide:null,winnerSide:null}
   ]:[]}});
 });
 await page.goto("/#/backstage");
 await page.getByRole("button",{name:/Samoa Joe/}).click();
 await expect(page.getByLabel("Conversation with Samoa Joe")).toBeVisible();
 await page.locator(".ppw-backstage-memories summary").click();
 const recall=page.locator(".ppw-backstage-memory");
 await expect(recall).toHaveCount(3);
 await expect(recall).toContainText([
  "A rivalry chapter with Matt Riddle played out on screen · Y1 W4",
  "They lost a recorded rivalry match against Matt Riddle · Y1 W3",
  "You followed through on a booking promise · Y1 W2"
 ]);
 expect(reads).toBe(2);
 expect(writes).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
test("Staff Meeting discusses a named verified feud with distinct department voices, no new writes",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let reads=0;
 const all=[{role:"CREATIVE",staffName:"Emilia Fox",personality:"ECCENTRIC",
  target:"programmes",message:"On Samoa Joe and Matt Riddle: Their latest chapter was an on-screen angle. Their previous recorded match went to Matt Riddle. A return bout was requested but has not been completed."},
 {role:"COMMENTATOR",staffName:"Lee Evans",personality:"FRANK",target:"programmes",
  message:"When we call Samoa Joe and Matt Riddle, their latest chapter was an on-screen angle."},
 {role:"ROAD_AGENT",staffName:"Alex Stone",personality:"PATIENT",target:"gorilla",
  message:"The recent story to keep straight is Samoa Joe and Matt Riddle. Their previous recorded match went to Matt Riddle."}];
 const staff={year:1,week:6,worldRevision:4,canEdit:true,allowUnfinishedFallback:false,
  allowLogisticsFallback:false,autoRenewSameTerms:false,permittedDays:[],permittedVenueIds:[],
  lockedLogisticsDelegated:false,talentManager:null,availableManagers:[],
  weeklyPayroll:0,promotionCash:500000,employees:[],market:[],employmentHistory:[],
  venues:[],meetings:all,scoutReport:[],notices:[{department:"Creative desk",
   target:"programmes",message:"Samoa Joe and Matt Riddle: A return bout was requested but has not been completed."}]};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  expect(r.request().postDataJSON().method).toBe("staff");
  reads++;return r.fulfill({json:staff});
 });
 await page.goto("/#/staff");
 await expect(page.locator(".ppw-staff-agenda-item")).toContainText(
  ["Creative deskSamoa Joe and Matt Riddle: A return bout was requested but has not been completed."]);
 await page.locator("summary").filter({hasText:"Full staff meeting"}).click();
 const briefs=page.locator(".ppw-staff-meeting-brief");
 await briefs.nth(0).locator("summary").click();
 await expect(briefs.nth(0)).toContainText("previous recorded match went to Matt Riddle");
 await briefs.nth(1).locator("summary").click();
 await expect(briefs.nth(1)).toContainText("Straight answer?");
 await briefs.nth(2).locator("summary").click();
 await expect(briefs.nth(2)).toContainText("Here's how I'd approach it.");
 expect(reads).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
