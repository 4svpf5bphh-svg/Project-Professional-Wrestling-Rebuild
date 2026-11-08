import {test,expect} from "@playwright/test";

const overview={world:{revision:4,name:"Genesis",year:1,week:9,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"company",name:"CWA",tier:"LOCAL",
 cash:800000,debt:0}};
const session={worldId:"world",playerId:"owner",csrfToken:"secret",
 overview,availablePromotions:[]};
const veteran={personId:"joe",name:"Samoa Joe",isCurrent:true,status:"ACTIVE",
 careerStage:"PRIME",fatigue:14,morale:72,momentum:71,lastMessage:null,
 latestIncoming:{request_id:"rival:1",kind:"RIVALRY_PITCH",status:"ANSWERED",
  created_week_index:2,read_week_index:3,archived:false}};
const opponent={personId:"riddle",name:"Matt Riddle",isCurrent:true,status:"ACTIVE",
 careerStage:"PRIME",fatigue:9,morale:70,momentum:65,lastMessage:null,
 latestIncoming:null};
const accepted={conversationId:"rival:1",kind:"RIVALRY_PITCH",
 status:"ANSWERED",decision:"EXPLORE_RIVALRY",createdWeekIndex:2,
 respondedWeekIndex:3,relatedPersonId:"riddle",
 followThroughWeekIndex:null,followThroughKind:null,verifiedSinglesShows:3,
 professionalTrust:76,averageCrowd:82,verifiedTagShows:null,
 averageExecution:null,observedMatchShows:null,observedFeaturedShows:null,
 promisedRole:null,dueWeekIndex:null,assessmentReason:null,trustDelta:0,
 workingVerifiedShows:null,workingTrustDelta:null,observedAbsentWeeks:null,
 observedLosses:null,relevantTitle:null,careerStageAtRequest:"PRIME"};
const existing={programmeId:"joe-riddle",status:"ACTIVE",heat:67,repetition:0,
 activityCount:0,matchCount:0,segmentCount:0,sideAWins:0,sideBWins:0,draws:0,
 championshipId:null,startedWeekIndex:8,endedWeekIndex:null,
 sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
 sideB:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
 recentActivity:[],eligibleCreativePeople:[],creativeAgreements:[],
 plannedActivity:[],finale:null,latestFollowUp:null,
 wrestlerOrigin:{requestId:"rival:1",initiatorId:"joe",opponentId:"riddle",
  acceptedWeekIndex:3,recordedWeekIndex:null,previousCertifiedMeetings:3}};

for(const width of [320,390]){
 test(`Phase 31 ${width}px: accepted wrestler rivalry opens the named programme pair but books nothing until confirmed`,
 async({page})=>{
  await page.setViewportSize({width,height:750});
  let revision=4,created=false;
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const req=r.request().postDataJSON() as Record<string,unknown>;
   calls.push(String(req.method));
   if(req.method==="backstage")return r.fulfill({json:{
    roster:[veteran,opponent],personId:req.personId==="joe"?"joe":null,
    personName:req.personId==="joe"?"Samoa Joe":null,
    worldYear:1,worldWeek:9,worldRevision:revision,canEdit:true,
    persona:null,history:[],recentRequests:[],memories:[],archetypes:[],
    documentedAlternates:[],nextPitchWeek:0,
    conversations:req.personId==="joe"?[accepted]:[]}});
   if(req.method==="markBackstageRead")return r.fulfill({json:{readCount:0}});
   if(req.method==="programmes")return r.fulfill({json:{
    year:1,week:9,worldRevision:revision,canEdit:true,
    people:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"},
     {kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
    teams:[],championships:[],programmes:created?[existing]:[]}});
   if(req.method==="startProgramme"){
    expect(req.sideA).toEqual([{kind:"PERSON",refId:"joe"}]);
    expect(req.sideB).toEqual([{kind:"PERSON",refId:"riddle"}]);
    expect(req.championshipId).toBeNull();
    expect(req.expectedRevision).toBe(4);
    expect(req.playerId).toBeUndefined();
    created=true;revision=5;
    return r.fulfill({json:{status:"APPLIED",result:{programmeId:"joe-riddle"}}});
   }
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:/Samoa Joe/}).click();
  const thread=page.getByLabel("Conversation with Samoa Joe");
  const link=thread.getByRole("button",{name:"Build rivalry with Matt Riddle →"});
  await expect(link).toBeVisible();
  expect(calls.filter(c=>c==="startProgramme")).toHaveLength(0);
  await link.click();
  await expect.poll(()=>page.evaluate(()=>location.hash)).toBe("#/programmes");
  await expect(page.getByRole("heading",{name:"Programmes"})).toBeVisible();
  const create=page.locator(".ppw-programme-create-fold");
  await expect(create).toHaveAttribute("open","");
  const sides=create.getByRole("combobox",{name:"Choose rivalry participant"});
  await expect(sides).toHaveCount(2);
  await expect(sides.nth(0)).toHaveValue("PERSON:joe");
  await expect(sides.nth(1)).toHaveValue("PERSON:riddle");
  expect(calls.filter(c=>c==="startProgramme")).toHaveLength(0);
  expect(calls.filter(c=>c==="programmes")).toHaveLength(1);
  expect(calls.filter(c=>c==="backstage")).toHaveLength(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
  await create.getByRole("button",{name:"Start rivalry"}).click();
  await expect(page.locator(".ppw-programme-switch")).toContainText(["Samoa Joe vs Matt Riddle"]);
  await expect(page.locator(".ppw-programme-wrestler-idea"))
   .toContainText("Wrestler idea accepted — no on-screen chapter yet");
  await expect(page.locator(".ppw-programme-wrestler-idea"))
   .toContainText("Samoa Joe suggested this rivalry with Matt Riddle");
  expect(calls.filter(c=>c==="startProgramme")).toHaveLength(1);
  expect(calls.filter(c=>c==="programmes")).toHaveLength(2);
  expect(calls).not.toContain("saveCard");
 });
}

test("existing programme for the exact pitched opponents is reused, never duplicated",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const calls:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as Record<string,unknown>;
  calls.push(String(req.method));
  if(req.method==="backstage")return r.fulfill({json:{
   roster:[veteran,opponent],personId:req.personId==="joe"?"joe":null,
   personName:req.personId==="joe"?"Samoa Joe":null,
   worldYear:1,worldWeek:9,worldRevision:4,canEdit:true,
   persona:null,history:[],recentRequests:[],memories:[],archetypes:[],
   documentedAlternates:[],nextPitchWeek:0,
   conversations:req.personId==="joe"?[accepted]:[]}});
  if(req.method==="markBackstageRead")return r.fulfill({json:{readCount:0}});
  if(req.method==="programmes")return r.fulfill({json:{
   year:1,week:9,worldRevision:4,canEdit:true,
   people:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"},
    {kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
   teams:[],championships:[],programmes:[existing]}});
  return r.fulfill({json:{}});
 });
 await page.goto("/#/backstage");
 await page.getByRole("button",{name:/Samoa Joe/}).click();
 await page.getByRole("button",{name:"Build rivalry with Matt Riddle →"}).click();
 await expect(page.getByRole("button",{name:"Manage Samoa Joe vs Matt Riddle"}))
  .toHaveAttribute("aria-pressed","true");
 await expect(page.locator(".ppw-programme-create-fold")).not.toHaveAttribute("open","");
 expect(calls.filter(c=>c==="startProgramme")).toHaveLength(0);
});
