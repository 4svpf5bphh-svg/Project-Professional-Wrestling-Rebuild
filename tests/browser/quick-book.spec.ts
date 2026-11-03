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
 await page.locator('select[aria-label="Match format"]').selectOption("TAG");
 await page.getByRole("button",{name:"Quick match"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByText("STEP 1 OF 2 · CAST")).toBeVisible();
 await dialog.getByLabel("Choose tag team").first().selectOption("pair-a");
 await dialog.getByLabel("Choose tag team").nth(1).selectOption("pair-b");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByLabel("Stipulation")).toBeVisible();
 await dialog.getByLabel("Winner").selectOption("1");
 await dialog.getByLabel("Minutes").fill("22");
 await dialog.getByLabel("Minutes").press("Tab");
 await dialog.locator(".ppw-guide-extra > summary").click();
 await dialog.getByLabel("Intent").selectOption("EPIC");
 await dialog.getByRole("button",{name:"Finish editing"}).click();

 await page.getByRole("button",{name:"Quick angle"}).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.getByLabel("Creative direction").selectOption("TURN");
 await dialog.getByLabel("Cast a team, trio or faction").selectOption("team:pair-a");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByLabel("New alignment")).toBeVisible();
 await dialog.getByLabel("New alignment").selectOption("FACE");
 await dialog.getByRole("button",{name:"Finish editing"}).click();
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(saves).toBe(1);
 expect(methods.filter(x=>x==="talent")).toHaveLength(0);
 await page.reload();
 await expect(page.locator(".ppw-card-lineup").filter({hasText:"Samoa Joe"}).first())
  .toBeVisible();
 // Old cards can switch into guided booking without changing their saved data.
 await page.locator(".ppw-card-bar .ppw-expand").nth(1).click();
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByRole("button",{name:"Quick Book"}).click();
 await expect(dialog.getByText("STEP 1 OF 2 · CAST")).toBeVisible();
 await expect(dialog.locator(".ppw-guide-context")).toContainText("Samoa Joe");
});
