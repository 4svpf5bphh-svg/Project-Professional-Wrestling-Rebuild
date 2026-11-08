import {test,expect} from "@playwright/test";

for(const width of [320,390])test(`Phase 47 ${width}px injured wrestler pauses in-ring rivalry recommendations without rewriting history`,async({page})=>{
 await page.setViewportSize({width,height:width===320?720:844});
 const overview={world:{revision:14,name:"Genesis",year:1,week:6,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
   cash:800000,debt:0}};
 const session={worldId:"world",playerId:"owner",csrfToken:"secret",
  overview,availablePromotions:[]};
 const programme={programmeId:"joe-riddle",status:"ACTIVE",heat:73,repetition:3,
  activityCount:1,matchCount:1,segmentCount:0,sideAWins:1,sideBWins:0,draws:0,
  championshipId:null,startedWeekIndex:1,endedWeekIndex:null,
  sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
  sideB:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
  wrestlerOrigin:{requestId:"rival:1",initiatorId:"joe",opponentId:"riddle",
   acceptedWeekIndex:1,recordedWeekIndex:2,previousCertifiedMeetings:2},
  medicalHolds:[{personId:"joe",name:"Samoa Joe",clearedWeekIndex:9}],
  recentActivity:[{showId:"prev",slotId:"main",kind:"MATCH",weekIndex:4,
   crowdResponse:79,winnerSide:"A"}],
  plannedActivity:[],finale:null,latestFollowUp:null,
  eligibleCreativePeople:[],creativeAgreements:[]};
 const calls:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as {method:string};
  calls.push(req.method);
  if(req.method==="programmes")return r.fulfill({json:{
   year:1,week:6,worldRevision:14,canEdit:true,
   people:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
   teams:[],championships:[],programmes:[programme]}});
  return r.fulfill({json:{}});
 });
 await page.goto("/#/programmes");
 await expect(page.getByRole("heading",{name:"Programmes"})).toBeVisible();
 const hold=page.locator(".ppw-programme-medical-hold");
 await expect(hold).toContainText("Samoa Joe");
 await expect(hold).toContainText("Y1 W10");
 await expect(hold).toContainText("no result has been assumed");
 await expect(page.locator(".ppw-programme-glance-headline")).toContainText("Samoa Joe won");
 await page.getByRole("button",{name:"Plan",exact:true}).click();
 await expect(page.getByText(/medically unavailable\. Revisit the plan after clearance/)).toBeVisible();
 await expect(page.locator(".ppw-programme-story-actions button")).toHaveCount(0);
 await page.getByRole("button",{name:"Story",exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
 expect(calls).not.toContain("saveCard");
 await page.getByRole("button",{name:"Review safe next steps"}).click();
 await expect.poll(()=>page.evaluate(()=>location.hash)).toContain("planner");
 expect(calls).not.toContain("saveCard");
});
