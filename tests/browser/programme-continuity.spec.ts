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
 await expect(page.getByText(/Matt Riddle won their latest recorded meeting/)).toBeVisible();
 await expect(page.getByText(/Latest chapter: an on-screen angle/)).toBeVisible();
 await page.getByRole("button",{name:"Creative",exact:true}).click();
 await expect(page.getByText("The return bout happened")).toBeVisible();
 await expect(page.getByText(/A later rivalry match was completed/)).toBeVisible();
 await page.getByRole("button",{name:"Ask Creative · what next?"}).click();
 await expect(page.getByText(/That chapter is in the books/)).toBeVisible();
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
 await page.getByRole("button",{name:"Creative",exact:true}).click();
 await expect(page.getByText("An answer is still due")).toBeVisible();
 await expect(page.getByText(/No subsequent on-screen angle is recorded/)).toBeVisible();
 await page.getByRole("button",{name:"Ask Creative · what next?"}).click();
 await expect(page.getByText(/Give the response a moment on screen/)).toBeVisible();
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
 await expect(page.getByText(/Already booked · Armageddon/)).toBeVisible();
 await page.getByRole("button",{name:/^Finale/}).click();
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
