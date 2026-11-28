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

test("Quick singles and Advanced booking keep the same cast and scripted finish",async({page})=>{
 await page.setViewportSize({width:320,height:780});
 await page.emulateMedia({reducedMotion:"reduce"});
 const talent=[
  {personId:"alice",contractId:"deal-alice",name:"Alice",division:"WOMEN"},
  {personId:"bea",contractId:"deal-bea",name:"Bea",division:"WOMEN"},
  {personId:"chris",contractId:"deal-chris",name:"Chris",division:"MEN"},
 ].map(person=>({...person,available:true,reason:"AVAILABLE",remainingDates:8,appearanceFee:1000}));
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  return route.fulfill({json:method==="planner"?planner:method==="talent"?{talent,cursor:null}:{
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:4,
   day:5,venueId:"arena",showName:"Friday Fights",promotionName:"Crown",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],selectedPeople:[],slots:[]
  }});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await page.getByRole("button",{name:"Quick singles",exact:true}).click();
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.getByRole("button",{name:/^Alice · Women/}).click();
 await expect(picker.getByRole("button",{name:/^Chris.*Match division mismatch/})).toBeDisabled();
 await picker.getByRole("button",{name:/^Bea · Women/}).press("Enter");
 const editor=page.getByRole("dialog",{name:"Edit match"});
 await expect(editor.getByRole("button",{name:"Add match to card"})).toBeDisabled();
 await editor.getByRole("button",{name:"Bea",exact:true}).click();
 await editor.getByRole("button",{name:"Finish · Clean Pin"}).click();
 await page.getByRole("dialog",{name:"Finish",exact:true}).getByRole("button",{name:"Submission"}).click();
 await editor.getByRole("button",{name:"Advanced booking"}).click();
 await expect(editor.getByText("STEP 1 OF 4 · SETUP")).toBeVisible();
 await editor.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(editor.locator(".ppw-side").filter({hasText:"Alice"})).toHaveCount(1);
 await expect(editor.locator(".ppw-side").filter({hasText:"Bea"})).toHaveCount(1);
 await editor.getByRole("button",{name:"Quick singles",exact:true}).click();
 await expect(editor.getByRole("button",{name:"Bea",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(editor.getByRole("button",{name:"Finish · Submission"})).toBeVisible();
 await editor.getByRole("button",{name:"Add match to card"}).click();
 await expect(page.locator(".ppw-card-lineup")).toContainText("Submission");
 await expect(page.locator(".ppw-card-booked-facts")).toContainText("Planned winner · Bea");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

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
 await expect(dialog.getByRole("group",{name:"New alignment choices"})).toBeVisible();
 await dialog.locator('.ppw-guide-script-choice[data-field="New alignment"] .ppw-guide-script-tile[data-value="FACE"]').click();
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

test("book an actual retaliation scene from Programme Desk with signed participants, one save and no talent search",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let revision=4,saves=0;
 let saved:{slotId:string;kind:"SEGMENT"|"MATCH";position:number;payload:any}[]=[];
 const joe={personId:"joe",contractId:"c-joe",name:"Samoa Joe"};
 const mistico={personId:"mistico",contractId:"c-mistico",name:"Místico"};
 // Keep an already-booked match on the card: PPW correctly refuses to save
 // an angle-only weekly show, and should not invent an extra match for us.
 const joePick={personId:joe.personId,contractId:joe.contractId};
 const misticoPick={personId:mistico.personId,contractId:mistico.contractId};
 saved=[{slotId:"already-booked-bout",position:0,kind:"MATCH",payload:{
  matchType:"SINGLES",family:"INDIVIDUAL",participants:[joePick,misticoPick],
  sides:[{sideId:"A",participants:[joePick]},
   {sideId:"B",participants:[misticoPick]}],
  scriptedWinnerSide:"B",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18
 }}];
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
   expect(matches).toHaveLength(1);
   expect(matches[0]?.payload.scriptedWinnerSide).toBe("B");
   expect(matches[0]?.payload.sides.map((side:any)=>side.participants[0]?.personId))
    .toEqual(["joe","mistico"]);
   const attack=segments.find(x=>x.payload.kind==="ATTACK");
   expect(attack?.programmeId).toBe("joe-mistico");
   expect(attack?.payload.actorIds).toEqual(["mistico"]);
   expect(attack?.payload.targetIds).toEqual(["joe"]);
   expect(attack?.payload.scene?.purpose).toBe("SEEK_REVENGE");
   expect(attack?.payload.scene?.location).toBe("BACKSTAGE");
   expect(attack?.payload.outcome).toBe("HAPPENS");
   const order=req.runningOrder as string[];
   saved=order.map((slotId:string,position:number)=>{
    const match=matches.find(x=>x.slotId===slotId);
    return {slotId,position,kind:match?"MATCH" as const:"SEGMENT" as const,
     payload:(match??segments.find(x=>x.slotId===slotId))!.payload};
   });
   revision++;
  }
  return route.fulfill({json:method==="programmes"?{
   year:1,week:5,worldRevision:revision,canEdit:true,people:[],teams:[],
   championships:[],programmes:[{
    programmeId:"joe-mistico",status:"ACTIVE",heat:62,repetition:42,
    activityCount:2,matchCount:1,segmentCount:1,sideAWins:1,sideBWins:0,
    draws:0,championshipId:null,startedWeekIndex:1,endedWeekIndex:null,
    sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
    sideB:[{kind:"PERSON",refId:"mistico",name:"Místico"}],
    recentActivity:[],plannedActivity:[],medicalHolds:[],
    eligibleCreativePeople:[],creativeAgreements:[],wrestlerChanges:[],
    latestFollowUp:{choice:"PLAN_RETALIATION",laterAngleRecorded:false,
     nextAngleWeekIndex:null},creativeIntent:null,blueprintProgress:null,finale:null
   }]
  }:method==="planner"?{...planner,weeks:[
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
 await page.goto("/#/programmes");
 await page.getByRole("button",{name:"Plan",exact:true}).click();
 await page.getByRole("button",{name:"Strike back"}).click();
 await expect(page.locator(".ppw-card-rivalry-launch")).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
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
 await expect(dialog.locator('.ppw-guide-script-choice[data-field="Storytelling purpose"] .ppw-guide-script-tile[data-value="SEEK_REVENGE"]')).toHaveAttribute("aria-pressed","true");
 await expect(dialog.locator('.ppw-guide-script-choice[data-field="Area"] .ppw-guide-script-tile[data-value="BACKSTAGE"]')).toHaveAttribute("aria-pressed","true");
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 await expect(page.locator(".ppw-angle-card .ppw-card-booked-facts"))
  .toContainText("Samoa Joe vs Místico");
 await expect(page.getByRole("button",{name:"+ Add match"})).toBeVisible();
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
 await expect(page.locator(".ppw-card-rivalry-launch")).toHaveCount(0);
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
