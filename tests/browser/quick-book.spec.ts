import {test,expect} from "@playwright/test";

const pairA=[
 {personId:"joe",contractId:"c-joe",name:"Samoa Joe"},
 {personId:"riddle",contractId:"c-riddle",name:"Matt Riddle"}
];
const pairB=[
 {personId:"alex",contractId:"c-alex",name:"Alex Shelley"},
 {personId:"chris",contractId:"c-chris",name:"Chris Sabin"}
];
const x={personId:"x",contractId:"cx"},y={personId:"y",contractId:"cy"};
const opening={matchType:"SINGLES",family:"INDIVIDUAL",participants:[x,y],
 sides:[{sideId:"A",participants:[x]},{sideId:"B",participants:[y]}],
 scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18};
const planner={worldName:"Genesis",promotionName:"Crown",year:1,week:5,canEdit:true,
 worldRevision:4,homeMarketId:"home",venues:[],venuePressure:[],
 weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,scheduled:[],
 shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",eventType:"REGULAR",
 day:5,marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
 ticketStrategy:"STANDARD",ready:false,slots:1,bookingClass:"REGULAR",
 showSeriesId:null,showName:"Friday Fights"}]}]};
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"crown",name:"Crown",tier:"LOCAL",cash:1000000,
 debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const session={worldId:"genesis",playerId:"owner",csrfToken:"csrf",overview,availablePromotions:[]};

test("Quick Book completes a team match and a tag-team turn using the ordinary save and reopen path",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let revision=4;
 let saves=0;
 let savedSlots:{slotId:string;kind:"MATCH"|"SEGMENT";position:number;payload:unknown}[]=[
  {slotId:"opening",kind:"MATCH",position:0,payload:opening}
 ];
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON(),method=String(req.method);
  methods.push(method);
  if(method==="save"){
   saves++;
   const matches=req.matches as {slotId:string;payload:{
    family:string;participants:{personId:string}[];scriptedWinnerSide:string;
    intent:string;plannedLengthMinutes:number}}[];
   const angles=req.segments as {slotId:string;payload:{
    kind:string;actorIds:string[];turnTargetAlignment?:string}}[];
   const tag=matches.find(x=>x.payload.family==="TEAMS");
   expect(tag?.payload.participants.map(x=>x.personId))
    .toEqual(["joe","riddle","alex","chris"]);
   expect(tag?.payload.scriptedWinnerSide).toBe("B");
   expect(tag?.payload.plannedLengthMinutes).toBe(22);
   expect(tag?.payload.intent).toBe("EPIC");
   const turn=angles.find(x=>x.payload.kind==="TURN");
   expect(turn?.payload.actorIds).toEqual(["joe","riddle"]);
   expect(turn?.payload.turnTargetAlignment).toBe("FACE");
   const order=req.runningOrder as string[];
   savedSlots=order.map((slotId:string,position:number)=>{
    const match=matches.find(x=>x.slotId===slotId);
    return {slotId,position,kind:match?"MATCH" as const:"SEGMENT" as const,
     payload:(match??angles.find(x=>x.slotId===slotId))!.payload};
   });
   revision++;
  }
  return route.fulfill({json:method==="planner"?planner:method==="load"?{
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:revision,
   day:5,venueId:"arena",showName:"Friday Fights",promotionName:"Crown",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
   bookableTeams:[{teamId:"pair-a",name:"The Rivals",members:pairA},
    {teamId:"pair-b",name:"Machine Guns",members:pairB}],
   selectedPeople:[{personId:"x",name:"X",division:"MEN"},
    {personId:"y",name:"Y",division:"MEN"}],
   slots:savedSlots
  }:method==="save"?{status:"APPLIED",result:{showId:"weekly"}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.getByRole("button",{name:"+ Add match"})).toHaveCount(1);
 await expect(page.getByRole("button",{name:"+ Add angle"})).toHaveCount(1);
 await page.getByRole("button",{name:"+ Add match"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByText("STEP 1 OF 4 · SETUP")).toBeVisible();
 await dialog.getByRole("button",{name:"Teams",exact:true}).click();
 await dialog.getByRole("button",{name:"Tag · 2v2"}).click();
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(dialog.getByText("STEP 2 OF 4 · CAST")).toBeVisible();
 await dialog.getByLabel("Choose tag team").first().selectOption("pair-a");
 await dialog.getByLabel("Choose tag team").nth(1).selectOption("pair-b");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByLabel("Stipulation")).toHaveCount(0);
 await expect(dialog.locator(".ppw-winner-choice")).toHaveCount(2);
 await dialog.locator(".ppw-winner-choice").nth(1).click();
 await dialog.getByLabel("Minutes").fill("22");
 await dialog.getByLabel("Minutes").press("Tab");
 await expect(dialog.locator(".ppw-guide-direction-tile")).toHaveCount(8);
 await dialog.getByRole("button",{name:"Epic",exact:true}).click();
 await expect(dialog.getByRole("button",{name:"Epic",exact:true}))
  .toHaveAttribute("aria-pressed","true");
 await expect(dialog.getByLabel("Intent")).toHaveCount(0);
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await expect(dialog.getByText("STEP 4 OF 4 · REVIEW")).toBeVisible();
 await dialog.getByRole("button",{name:"Complete match"}).click();

 await page.getByRole("button",{name:"+ Add angle"}).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.locator(".ppw-angle-category-tiles")
  .getByRole("button",{name:"Turns"}).click();
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByLabel("Cast a team, trio or faction").selectOption("team:pair-a");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByLabel("New alignment")).toBeVisible();
 await dialog.getByLabel("New alignment").selectOption("FACE");
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(saves).toBe(1);
 expect(methods.filter(x=>x==="talent")).toHaveLength(0);
 await page.reload();
 await expect(page.locator(".ppw-card-lineup").filter({hasText:"Samoa Joe"}).first())
  .toBeVisible();
 // Saved cards reopen in the same editor, without switching booking modes.
 await page.locator(".ppw-card-bar .ppw-expand").nth(1).click();
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByText("STEP 3 OF 4 · SCRIPT")).toBeVisible();
 await expect(dialog.getByRole("group",{name:"Booking approach"})).toHaveCount(0);
});

test("book a feud match and retaliation scene with signed participants, one save and no talent search",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let revision=4,saves=0;
 let saved:{slotId:string;kind:"SEGMENT"|"MATCH";position:number;payload:any}[]=[];
 const joe={personId:"joe",contractId:"c-joe",name:"Samoa Joe"};
 const mistico={personId:"mistico",contractId:"c-mistico",name:"Místico"};
 const feud={programmeId:"joe-mistico",label:"Samoa Joe vs Místico",
  heat:62,repetition:42,activityCount:2,segmentCount:1,
  lastChapter:{kind:"MATCH",weekIndex:3,segmentKind:null,crowd:76},
  latestFollowUp:{choice:"PLAN_RETALIATION",laterAngleRecorded:false},
  cast:[{...joe,side:"A",appearanceFee:1000,creativeControl:"NONE"},
   {...mistico,side:"B",appearanceFee:2000,creativeControl:"NONE"}]};
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON(),method=String(req.method);
  methods.push(method);
  if(method==="save"){
   saves++;
   const matches=req.matches as {slotId:string;payload:any}[];
   const segments=req.segments as {slotId:string;payload:any;programmeId?:string}[];
   const attack=segments.find(x=>x.payload.kind==="ATTACK");
   expect(attack?.programmeId).toBe("joe-mistico");
   expect(attack?.payload.actorIds).toEqual(["mistico"]);
   expect(attack?.payload.targetIds).toEqual(["joe"]);
   expect(attack?.payload.scene?.purpose).toBe("SEEK_REVENGE");
   expect(attack?.payload.scene?.location).toBe("BACKSTAGE");
   expect(attack?.payload.outcome).toBe("HAPPENS");
   const bout=matches.find(x=>x.payload.family==="INDIVIDUAL");
   expect(bout?.payload.sides.map((side:any)=>side.participants[0]?.personId))
    .toEqual(["joe","mistico"]);
   expect(bout?.payload.scriptedWinnerSide).toBe("B");
   const order=req.runningOrder as string[];
   saved=order.map((slotId:string,position:number)=>{
    const match=matches.find(x=>x.slotId===slotId);
    return {slotId,position,kind:match?"MATCH" as const:"SEGMENT" as const,
     payload:(match??segments.find(x=>x.slotId===slotId))!.payload};
   });
   revision++;
  }
  return route.fulfill({json:method==="planner"?{...planner,weeks:[
   {...planner.weeks[0],shows:[{...planner.weeks[0]!.shows[0],slots:saved.length}]}]}:
   method==="load"?{
    showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:revision,
    day:5,venueId:"arena",showName:"Friday Fights",promotionName:"Crown",
    venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
    ticketStrategy:"STANDARD",championships:[],programmes:[feud],
    programmeLinks:saved.filter(s=>s.kind==="SEGMENT")
     .map(s=>({slotId:s.slotId,programmeId:"joe-mistico"})),
    selectedPeople:[{personId:"joe",name:"Samoa Joe",contractId:"c-joe",division:"MEN"},
     {personId:"mistico",name:"Místico",contractId:"c-mistico",division:"MEN"}],
    slots:saved
   }:method==="save"?{status:"APPLIED",result:{showId:"weekly"}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 const stories=page.locator(".ppw-card-rivalry-ideas");
 await stories.locator("summary").click();
 await expect(stories.getByRole("button",{name:"+ Book feud match"})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
 await stories.getByRole("button",{name:"Add attack for Samoa Joe vs Místico"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit angle"});
 await expect(dialog.getByText("STEP 2 OF 4 · CAST")).toBeVisible();
 await expect(dialog.locator(".ppw-guide-angle-context")).toContainText("Attack");
 await dialog.getByRole("button",{name:"← Match or scene type"}).click();
 await expect(dialog.locator(".ppw-angle-type-tiles")
  .getByRole("button",{name:"Attack",exact:true})).toHaveAttribute("aria-pressed","true");
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByRole("button",{name:"Side B initiates"}).click();
 await expect(dialog.locator(".ppw-side").first().getByText("Místico",{exact:true})).toBeVisible();
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByLabel("Storytelling purpose")).toHaveValue("SEEK_REVENGE");
 await expect(dialog.getByLabel("Area")).toHaveValue("BACKSTAGE");
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 await expect(page.locator(".ppw-angle-card .ppw-card-booked-facts"))
  .toContainText("Samoa Joe vs Místico");
 await stories.getByRole("button",{name:"+ Book feud match"}).click();
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByText("STEP 3 OF 4 · SCRIPT")).toBeVisible();
 await expect(dialog.getByText(/default winner is not a creative recommendation/)).toBeVisible();
 await dialog.locator(".ppw-winner-choice").nth(1).click();
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await dialog.getByRole("button",{name:"Complete match"}).click();
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(saves).toBe(1);
 expect(methods.filter(x=>x==="talent")).toHaveLength(0);
 await page.reload();
 await expect(page.locator(".ppw-card-lineup").filter({hasText:"Samoa Joe"}).first())
  .toBeVisible();
});

const feudPlanner={
 worldName:"Genesis",promotionName:"Crown",year:1,week:5,canEdit:true,
 worldRevision:4,homeMarketId:"home",venues:[],venuePressure:[],
 weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
  scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
   eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
   marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",ready:false,
   slots:0,bookingClass:"REGULAR",showSeriesId:null,showName:"Friday Fights"}]}]
};
test("Programme Desk selects the real unfinished show before opening the focussed feud",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 const story={programmeId:"joe-mistico",status:"ACTIVE",heat:68,repetition:42,
  activityCount:2,matchCount:1,segmentCount:1,sideAWins:1,sideBWins:0,draws:0,
  championshipId:null,startedWeekIndex:1,endedWeekIndex:null,
  sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
  sideB:[{kind:"PERSON",refId:"mistico",name:"Místico"}],
  recentActivity:[],eligibleCreativePeople:[],creativeAgreements:[],
  latestFollowUp:{choice:"PLAN_RETALIATION",laterAngleRecorded:false,
   nextAngleWeekIndex:null}};
 const cast={programmeId:"joe-mistico",label:"Samoa Joe vs Místico",
  heat:68,repetition:42,activityCount:2,segmentCount:1,
  latestFollowUp:{choice:"PLAN_RETALIATION",laterAngleRecorded:false,
   nextAngleWeekIndex:null},
  cast:[{personId:"joe",contractId:"c-joe",name:"Samoa Joe",side:"A"},
   {personId:"mistico",contractId:"c-mistico",name:"Místico",side:"B"}]};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const request=r.request().postDataJSON();
  const method=String(request.method);
  calls.push(method);
  const data=method==="planner"?feudPlanner:method==="programmes"?{
   year:1,week:5,worldRevision:4,canEdit:true,
   people:[],teams:[],championships:[],programmes:[story]
  }:method==="load"?{
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:4,
   day:5,venueId:"arena",showName:"Friday Fights",promotionName:"Crown",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[cast],
   programmeLinks:[],bookableTeams:[],bookableTrios:[],selectedPeople:[],slots:[]
  }:{};
  return r.fulfill({json:data});
 });
 await page.goto("/#/programmes");
 await page.getByRole("button",{name:"Book next chapter"}).first().click();
 await expect(page.locator(".ppw-card-rivalry-ideas")).toHaveAttribute("open","");
 await expect(page.getByLabel("Rivalry")).toHaveValue("joe-mistico");
 await expect(page.getByRole("button",{name:"+ Add match"})).toHaveCount(1);
 expect(calls).toEqual(["programmes","planner","load"]);
});
test("an explicit programme creative choice opens an unsaved, editable matching scene",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 const story={programmeId:"joe-mistico",status:"ACTIVE",heat:68,repetition:42,
  activityCount:2,matchCount:1,segmentCount:1,sideAWins:1,sideBWins:0,draws:0,
  championshipId:null,startedWeekIndex:1,endedWeekIndex:null,
  sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
  sideB:[{kind:"PERSON",refId:"mistico",name:"Místico"}],
  recentActivity:[],eligibleCreativePeople:[],creativeAgreements:[],
  latestFollowUp:{choice:"PLAN_RETALIATION",laterAngleRecorded:false,
   nextAngleWeekIndex:null}};
 const cast={programmeId:"joe-mistico",label:"Samoa Joe vs Místico",
  heat:68,repetition:42,activityCount:2,segmentCount:1,
  latestFollowUp:{choice:"PLAN_RETALIATION",laterAngleRecorded:false,
   nextAngleWeekIndex:null},
  cast:[{personId:"joe",contractId:"c-joe",name:"Samoa Joe",side:"A"},
   {personId:"mistico",contractId:"c-mistico",name:"Místico",side:"B"}]};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const method=String(r.request().postDataJSON().method);
  methods.push(method);
  return r.fulfill({json:method==="planner"?feudPlanner:method==="programmes"?{
   year:1,week:5,worldRevision:4,canEdit:true,people:[],teams:[],
   championships:[],programmes:[story]
  }:method==="load"?{
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:4,
   day:5,venueId:"arena",showName:"Friday Fights",promotionName:"Crown",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[cast],
   programmeLinks:[],bookableTeams:[],bookableTrios:[],selectedPeople:[],slots:[]
  }:{}});
 });
 await page.goto("/#/programmes");
 await page.getByRole("button",{name:"Plan",exact:true}).click();
 await page.getByRole("button",{name:"Strike back"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await expect(dialog.getByText("STEP 2 OF 4 · CAST")).toBeVisible();
 await expect(dialog.locator(".ppw-guide-angle-context")).toContainText("Attack");
 await dialog.getByRole("button",{name:"← Match or scene type"}).click();
 await expect(dialog.locator(".ppw-angle-type-tiles")
  .getByRole("button",{name:"Attack",exact:true})).toHaveAttribute("aria-pressed","true");
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(page.getByText("Edits not saved")).toBeVisible();
 expect(methods).toEqual(["programmes","planner","load"]); // no write before save
});
