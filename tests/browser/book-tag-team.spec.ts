import {test,expect} from "@playwright/test";
const x={personId:"x",contractId:"cx"},y={personId:"y",contractId:"cy"};
const fallback={matchType:"SINGLES",family:"INDIVIDUAL",participants:[x,y],
 sides:[{sideId:"A",participants:[x]},{sideId:"B",participants:[y]}],
 scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18};
const roster=[
 {personId:"joe",contractId:"c-joe",name:"Samoa Joe"},
 {personId:"riddle",contractId:"c-riddle",name:"Matt Riddle"},
 {personId:"alex",contractId:"c-alex",name:"Alex Shelley"},
 {personId:"chris",contractId:"c-chris",name:"Chris Sabin"}];
const cardBase={showId:"weekly",year:1,week:5,canEdit:true,ready:false,
 day:5,venueId:"arena",showName:"Friday Fights",promotionName:"Crown",
 venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",ticketStrategy:"STANDARD",
 championships:[],programmes:[],programmeLinks:[],
 bookableTeams:[{teamId:"pair-a",name:"The Rivals",members:roster.slice(0,2)},
  {teamId:"pair-b",name:"Machine Guns",members:roster.slice(2)}],
 selectedPeople:[{personId:"x",name:"X",division:"MEN"},
  {personId:"y",name:"Y",division:"MEN"}]};
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
test("iPhone selects complete teams for a tag match and turns both partners with one saved card",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let revision=4,savedSlots:[{slotId:string;kind:"MATCH"|"SEGMENT";position:number;payload:unknown}]=
  [{slotId:"opening",kind:"MATCH",position:0,payload:fallback}];
 const methods:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON(),method=String(req.method);
  methods.push(method);
  if(method==="save"){
   const matches=req.matches as {slotId:string;payload:unknown}[];
   const segments=req.segments as {slotId:string;payload:unknown}[];
   const order=req.runningOrder as string[];
   const tag=matches.map(x=>x.payload as {family:string;participants:{personId:string}[];
    scriptedWinnerSide:string}).find(x=>x.family==="TEAMS");
   expect(tag?.participants.map(x=>x.personId)).toEqual(["joe","riddle","alex","chris"]);
   expect(tag?.scriptedWinnerSide).toBe("A");
   const turn=segments.map(x=>x.payload as {kind:string;actorIds:string[];
    turnTargetAlignment?:string}).find(x=>x.kind==="TURN");
   expect(turn?.actorIds).toEqual(["joe","riddle"]);
   expect(turn?.turnTargetAlignment).toBe("HEEL");
   savedSlots=order.map((id:string,position:number)=>{
    const match=matches.find(x=>x.slotId===id);
    return {slotId:id,position,kind:match?"MATCH" as const:"SEGMENT" as const,
     payload:(match??segments.find(x=>x.slotId===id))!.payload};
   }) as typeof savedSlots;
   revision++;
  }
  return route.fulfill({json:method==="planner"?planner:method==="load"?{
   ...cardBase,worldRevision:revision,slots:savedSlots
  }:method==="save"?{status:"APPLIED",result:{showId:"weekly"}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await page.locator('select[aria-label="Match format"]').selectOption("TAG");
 await page.getByRole("button",{name:"+ Add match"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByLabel("Choose tag team")).toHaveCount(2);
 await dialog.getByLabel("Choose tag team").first().selectOption("pair-a");
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByLabel("Choose tag team").nth(1).selectOption("pair-b");
 await expect(dialog).toContainText("Samoa Joe");
 await expect(dialog).toContainText("Matt Riddle");
 await expect(dialog).toContainText("Alex Shelley");
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await page.getByRole("button",{name:/Book a turn/}).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.getByLabel("Turn a complete tag team").selectOption("pair-a");
 await expect(dialog).toContainText("Samoa Joe");
 await expect(dialog).toContainText("Matt Riddle");
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await expect(page.locator(".ppw-match-broadcast")).toHaveCount(0);
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(methods.filter(x=>x==="talent")).toHaveLength(0);
 await page.reload();
 await expect(page.locator(".ppw-card-lineup").filter({hasText:"Samoa Joe"}).first()).toBeVisible();
});
