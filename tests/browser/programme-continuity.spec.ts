import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"Genesis",year:1,week:9,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"company",name:"CWA",tier:"LOCAL",cash:800000,
 debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"secret",overview,
 availablePromotions:[]};
const programme={programmeId:"joe-riddle",status:"ACTIVE",heat:68,repetition:5,
 activityCount:4,matchCount:3,segmentCount:1,sideAWins:2,sideBWins:1,draws:0,
 championshipId:null,startedWeekIndex:2,endedWeekIndex:null,
 sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
 sideB:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
 recentActivity:[{showId:"angle-show",slotId:"angle",kind:"SEGMENT",
  weekIndex:8,crowdResponse:72,winnerSide:null},
  {showId:"return-show",slotId:"match",kind:"MATCH",
   weekIndex:7,crowdResponse:81,winnerSide:"B"}],
 eligibleCreativePeople:[],creativeAgreements:[]};
test("iPhone Programmes reads certified winners and recognises completed rematch follow-through",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string};
  calls.push(req.method);
  return route.fulfill({json:{year:1,week:9,worldRevision:4,canEdit:true,
   people:[],teams:[],championships:[],programmes:[{...programme,
    latestFollowUp:{choice:"PURSUE_REMATCH",showId:"first-show",
     slotId:"first-match",weekIndex:4,nextMatchWeekIndex:7,
     nextAngleWeekIndex:8}}]}});
 });
 await page.goto("/#/programmes");
 await page.getByRole("button",{name:"History",exact:true}).click();
 await expect(page.locator(".ppw-programme-history-timeline")).toContainText("Matt Riddle won");
 await expect(page.locator(".ppw-programme-history-timeline")).toContainText(/On-screen angle/i);
 await page.getByRole("button",{name:"Story",exact:true}).click();
 await page.locator(".ppw-programme-next > summary").click();
 await expect(page.getByText("The return bout happened")).toBeVisible();
 await expect(page.getByText(/A later rivalry match was completed/)).toBeVisible();
 await expect(page.getByText(/That chapter is in the books/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Ask Creative · what next?"})).toHaveCount(0);
 await expect(page.getByText(/A newer match has taken place/)).toBeVisible();
 expect(calls).toEqual(["programmes"]); // Reading is not a booking command
});
test("iPhone makes an unfulfilled retaliation direction visible without pretending to book an angle",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string};
  calls.push(req.method);
  return route.fulfill({json:{year:1,week:9,worldRevision:4,canEdit:true,
   people:[],teams:[],championships:[],programmes:[{...programme,
    latestFollowUp:{choice:"PLAN_RETALIATION",showId:"first-show",
     slotId:"first-match",weekIndex:7,nextMatchWeekIndex:null,
     nextAngleWeekIndex:null},
    recentActivity:[programme.recentActivity[1]]}]}});
 });
 await page.goto("/#/programmes");
 await page.getByRole("button",{name:"Story",exact:true}).click();
 await page.locator(".ppw-programme-next > summary").click();
 await expect(page.getByText("An answer is still due")).toBeVisible();
 await expect(page.getByText(/No subsequent on-screen angle is recorded/)).toBeVisible();
 await expect(page.getByText(/Still open · 1 week since your decision/)).toBeVisible();
 await expect(page.getByText(/An answer is still due/)).toBeVisible();
 expect(calls).toEqual(["programmes"]);
});

test("completed feud remains a readable promotion archive instead of a forgotten name",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>route.fulfill({json:{
  year:1,week:9,worldRevision:4,canEdit:true,
  people:[],teams:[],championships:[],
  programmes:[{...programme,status:"COMPLETED",endedWeekIndex:8,
   latestFollowUp:null}]
 }}));
 await page.goto("/#/programmes");
 await expect(page.getByRole("heading",{name:"Recently concluded"})).toBeVisible();
 const archive=page.locator(".ppw-programme-archive-card");
 await expect(archive).toHaveCount(1);
 await archive.locator("summary").click();
 await expect(archive.getByText("Samoa Joe 2 — 1 Matt Riddle")).toBeVisible();
 await expect(archive.getByText("3 in-ring meetings · 1 on-screen chapter")).toBeVisible();
 await expect(archive.locator(".ppw-programme-feud-stars")).toHaveAttribute("aria-label",/out of five stars/);
 await expect(archive.getByText(/Matt Riddle won their latest recorded meeting/)).toBeVisible();
 await expect(archive.getByRole("button",{name:/Revisit the final chapter/})).toBeVisible();
});

test("iPhone plans and removes a real match or angle payoff without auto-ending the feud",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 let revision=4,finale:null|{showId:string;slotId:string;kind:"SEGMENT";
  payoff:string;plannedWeekIndex:number;resolvedWeekIndex:null}=null;
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(req.method);
  methods.push(method);
  if(method==="planProgrammeFinale"){
   expect(req.programmeId).toBe("joe-riddle");
   expect(req.expectedRevision).toBe(revision);
   if(req.payoff===null)finale=null;
   else{
    expect(req.targetShowId).toBe("ppv");
    expect(req.targetSlotId).toBe("faceoff");
    expect(req.payoff).toBe("FINAL_CONFRONTATION");
    finale={showId:"ppv",slotId:"faceoff",kind:"SEGMENT",
     payoff:"FINAL_CONFRONTATION",plannedWeekIndex:8,resolvedWeekIndex:null};
   }
   revision++;
   return route.fulfill({json:{status:"APPLIED",result:{planned:finale!==null}}});
  }
  return route.fulfill({json:{year:1,week:9,worldRevision:revision,canEdit:true,
   people:[],teams:[],championships:[],programmes:[{...programme,
    latestFollowUp:null,finale,
    plannedActivity:[{showId:"ppv",slotId:"faceoff",kind:"SEGMENT",
     segmentKind:"CONFRONTATION",titleMatch:false,stipulationMatch:false,
     year:1,week:9,showName:"Armageddon",status:"DRAFT"}]}]}});
 });
 await page.goto("/#/programmes");
 await expect(page.getByText(/Not booked yet/)).toHaveCount(0);
 await expect(page.locator(".ppw-programme-upcoming-compact")).toContainText("Armageddon");
 await page.getByRole("button",{name:/^Payoff/}).click();
 await expect(page.getByText(/Choose a specific booked match or angle/)).toBeVisible();
 await page.getByRole("button",{name:"Plan on-screen finale"}).click();
 await expect(page.getByText(/Finale planned · Armageddon/)).toBeVisible();
 await expect(page.getByText(/only the certified event can end this rivalry/i)).toBeVisible();
 await expect(page.locator(".ppw-programme-card")).toHaveCount(1);
 await expect(page.getByRole("heading",{name:"Recently concluded"})).toHaveCount(0);
 await page.getByRole("button",{name:"Remove planned finale"}).click();
 await expect(page.getByText(/Choose a specific booked match or angle/)).toBeVisible();
 expect(methods).toEqual(["programmes","planProgrammeFinale","programmes",
  "planProgrammeFinale","programmes"]);
 expect(methods).not.toContain("save");
 expect(methods).not.toContain("ready");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("four feuds are a compact switcher, not four 600-line creative cards",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 let reads=0;
 const feuds=Array.from({length:4},(_,i)=>({
  ...programme,programmeId:"feud-"+i,heat:32+i*18,repetition:i*11,
  sideA:[{kind:"PERSON",refId:"a-"+i,name:"Booker "+i}],
  sideB:[{kind:"PERSON",refId:"b-"+i,name:"Rival "+i}],
  recentActivity:[],latestFollowUp:null,plannedActivity:[],
  finale:null,eligibleCreativePeople:[],creativeAgreements:[]
 }));
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  expect(r.request().postDataJSON().method).toBe("programmes");
  reads++;return r.fulfill({json:{year:1,week:9,worldRevision:4,canEdit:true,
   people:[],teams:[],championships:[],programmes:feuds}});
 });
 await page.goto("/#/programmes");
 await expect(page.locator(".ppw-programme-switch")).toHaveCount(4);
 await expect(page.locator(".ppw-programme-card")).toHaveCount(1);
 await expect(page.getByRole("button",{name:"Story",exact:true})).toHaveAttribute("aria-current","page");
 await expect(page.locator(".ppw-programme-card")).toHaveCount(1);
 await expect(page.getByRole("button",{name:"History",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Payoff"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Story",exact:true})).toBeVisible();
 for(const name of ["Story","Payoff","History"]){
  const tab=page.getByRole("button",{name,exact:true});
  await expect(tab).toBeVisible();
  const clipped=await tab.evaluate(el=>el.scrollWidth>el.clientWidth+1);
  expect(clipped,"Full "+name+" tab text must fit on iPhone").toBe(false);
 }
 const heading=page.getByRole("heading",{name:"Programmes"});
 await expect(heading).toBeVisible();
 expect(await heading.evaluate(el=>el.scrollWidth>el.clientWidth+1)).toBe(false);
 const versus=page.locator(".ppw-programme-focused .ppw-programme-versus");
 await expect(versus).toHaveText("VS");
 const vsLayout=await versus.evaluate(node=>{
  const box=node.getBoundingClientRect(),css=getComputedStyle(node);
  return {width:box.width,height:box.height,whiteSpace:css.whiteSpace};
 });
 expect(vsLayout.whiteSpace).toBe("nowrap");
 expect(vsLayout.height).toBeLessThanOrEqual(36);
 expect(vsLayout.width).toBeLessThanOrEqual(36);
 await page.getByRole("button",{name:"Manage Booker 2 vs Rival 2"}).click();
 await expect(page.locator(".ppw-programme-broadcast")).toContainText("Booker 2");
 await expect(page.locator(".ppw-programme-broadcast")).not.toContainText("Booker 1");
 await page.screenshot({path:"test-results/presentation-screenshots/phase25-programmes-story.png",fullPage:true,animations:"disabled"});
 expect(reads).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("a wrestler dossier opens their own active feud rather than the first unrelated rivalry",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const calls:string[]=[];
 const dossier={personId:"joe",name:"Samoa Joe",division:"MEN",status:"ACTIVE",
  careerStage:"REGULAR",popularity:80,recognition:80,momentum:70,morale:75,
  inRingQuality:80,matchCraft:85,presentation:80,stamina:80,safety:75,
  fatigue:10,wear:5,alignment:"HEEL",canEdit:false,onYourRoster:true,
  sharedHuman:false,currentWeekIndex:8,worldRevision:4,
  persona:{personaName:"Samoa Joe",gimmickId:"AUTHENTIC",primaryStyle:"BRAWLER",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[{promotionId:"company",promotion:"CWA",isYours:true,
   family:"EXCLUSIVE",role:"MAIN_EVENT",remainingDates:null,
   startWeekIndex:0,expiresWeekIndex:51,weeklyGuarantee:1500,
   appearanceFee:0,creativeControl:"NONE"}],
  teams:[],stables:[],connections:[],history:[]};
 const other={...programme,programmeId:"unrelated",sideA:[
  {kind:"PERSON",refId:"other",name:"Other Wrestler"}],sideB:[
  {kind:"PERSON",refId:"stranger",name:"Stranger"}]};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);calls.push(method);
  if(method==="wrestlerDirectory")return route.fulfill({json:{
   view:"ROSTER",year:1,week:9,worldRevision:4,canEdit:true,hasMore:false,
   currentWeekIndex:8,people:[{personId:"joe",name:"Samoa Joe",
    ringName:"Samoa Joe",division:"MEN",availability:"YOUR_ROSTER",
    family:"EXCLUSIVE",remainingDates:null,startsInWeeks:0,weeksRemaining:44,
    weeklyGuarantee:1500,appearanceFee:0,popularity:80,recognition:80,
    momentum:70,inRingQuality:80,matchCraft:85,presentation:80,morale:75,
    roleExpectation:"MAIN_EVENT"}]}});
  if(method==="wrestlerProfile")return route.fulfill({json:dossier});
  if(method==="programmes")return route.fulfill({json:{
   year:1,week:9,worldRevision:4,canEdit:true,
   people:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"},
    {kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
   teams:[],championships:[],programmes:[other,programme]}});
  return route.fulfill({json:{}});
 });
 await page.goto("/#/roster");
 const wrestler=page.locator(".ppw-directory-card").first();
 await wrestler.locator("summary").click();
 await wrestler.getByRole("button",{name:"Wrestler profile →"}).click();
 const dialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dialog).toBeVisible();
 await dialog.locator(".ppw-profile-manage-more > summary").click();
 await dialog.getByRole("button",{name:"Manage programmes"}).click();
 await expect(page).toHaveURL(/#\/programmes$/);
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-programme-card")).toContainText("Samoa Joe");
 await expect(page.locator(".ppw-programme-card")).not.toContainText("Other Wrestler");
 expect(calls).toEqual(["wrestlerDirectory","wrestlerProfile","programmes"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
