import {test,expect} from "@playwright/test";
const x={personId:"x",contractId:"cx"},y={personId:"y",contractId:"cy"};
const fallback={matchType:"SINGLES",family:"INDIVIDUAL",participants:[x,y],
 sides:[{sideId:"A",participants:[x]},{sideId:"B",participants:[y]}],
 scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18};
const roster=[
 {personId:"joe",contractId:"c-joe",name:"Samoa Joe",
  workingConnections:[{personId:"riddle",professionalTrust:37,
   familiarity:22,lastChangeType:"STRAIN"}]},
 {personId:"riddle",contractId:"c-riddle",name:"Matt Riddle"},
 {personId:"alex",contractId:"c-alex",name:"Alex Shelley",
  workingConnections:[{personId:"chris",professionalTrust:65,
   familiarity:28,lastChangeType:"IMPROVEMENT"}]},
 {personId:"chris",contractId:"c-chris",name:"Chris Sabin"}];
const cardBase={showId:"weekly",year:1,week:5,canEdit:true,ready:false,
 day:5,venueId:"arena",showName:"Friday Fights",promotionName:"Crown",
 venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",ticketStrategy:"STANDARD",
 championships:[],programmes:[],programmeLinks:[],
 advisers:[{role:"ROAD_AGENT",name:"Derek James",staffId:"road"}],
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
 await page.getByRole("button",{name:"+ Add match"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByRole("button",{name:"Teams",exact:true}).click();
 await dialog.getByRole("button",{name:"Tag · 2v2"}).click();
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(dialog.getByLabel("Choose tag team")).toHaveCount(2);
 await dialog.getByLabel("Choose tag team").first().selectOption("pair-a");
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByLabel("Choose tag team").nth(1).selectOption("pair-b");
 await expect(dialog).toContainText("Samoa Joe");
 await expect(dialog).toContainText("Matt Riddle");
 await expect(dialog).toContainText("Alex Shelley");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 const briefing=dialog.locator(".ppw-guide-staff-review");
 await expect(briefing).toContainText("Derek James");
 await expect(briefing).toContainText("Known partnership strain");
 await expect(briefing).toContainText("Samoa Joe and Matt Riddle");
 await expect(briefing).toContainText("Partnership developing");
 await expect(briefing).toContainText("Alex Shelley and Chris Sabin");
 await dialog.getByRole("button",{name:"Complete match"}).click();
 await page.getByRole("button",{name:"+ Add angle"}).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.getByLabel("Creative direction").selectOption("TURN");
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByLabel("Turn a complete tag team").selectOption("pair-a");
 await expect(dialog).toContainText("Samoa Joe");
 await expect(dialog).toContainText("Matt Riddle");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 await expect(page.locator(".ppw-match-broadcast")).toHaveCount(0);
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(methods.filter(x=>x==="talent")).toHaveLength(0);
 await page.reload();
 await expect(page.locator(".ppw-card-lineup").filter({hasText:"Samoa Joe"}).first()).toBeVisible();
});


test("iPhone books a complete named trio against another in one certified 3v3 card",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 const six=[...roster,
  {personId:"dax",contractId:"c-dax",name:"Dax Harwood"},
  {personId:"cash",contractId:"c-cash",name:"Cash Wheeler"}];
 const booked=[{trioId:"first",name:"The Lightning Trio",members:six.slice(0,3)},
  {trioId:"second",name:"The Steel Trio",members:six.slice(3)}];
 let revision=4,saves=0;
 let slots:{slotId:string;kind:"MATCH";position:number;payload:unknown}[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON(),method=req.method;
  if(method==="save"){
   saves++;
   const matches=req.matches as {slotId:string;payload:{
    family:string;participants:{personId:string}[];sides:{participants:{personId:string}[]}[]}}[];
   const trio=matches.find(x=>x.payload.participants.length===6);
   expect(trio?.payload.family).toBe("TEAMS");
   expect(trio?.payload.sides.map(s=>s.participants.map(p=>p.personId))).toEqual([
    ["joe","riddle","alex"],["chris","dax","cash"]]);
   slots=matches.map((x,i)=>({slotId:x.slotId,kind:"MATCH",position:i,payload:x.payload}));
   revision++;
  }
  return route.fulfill({json:method==="planner"?planner:method==="load"?{
   ...cardBase,worldRevision:revision,slots,
   bookableTeams:[],bookableTrios:booked
  }:method==="save"?{status:"APPLIED",result:{showId:"weekly"}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await page.getByRole("button",{name:"+ Add match"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByRole("button",{name:"Teams",exact:true}).click();
 await dialog.getByRole("button",{name:"Trios · 3v3"}).click();
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(dialog.getByLabel("Choose trio")).toHaveCount(2);
 await dialog.getByLabel("Choose trio").first().selectOption("first");
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByLabel("Choose trio").nth(1).selectOption("second");
 await expect(dialog).toContainText("Samoa Joe");
 await expect(dialog).toContainText("Dax Harwood");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 const triosBrief=dialog.locator(".ppw-guide-staff-review");
 await expect(triosBrief).toContainText("Known partnership strain");
 await expect(triosBrief).toContainText("Samoa Joe and Matt Riddle");
 await expect(triosBrief).not.toContainText("Alex Shelley and Chris Sabin");
 await dialog.getByRole("button",{name:"Complete match"}).click();
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(saves).toBe(1);
 await page.reload();
 await expect(page.locator(".ppw-card-lineup")).toContainText("Trios · 3v3");
 const matchup=page.locator(".ppw-card-matchup");
 for(const name of ["Samoa Joe","Matt Riddle","Alex Shelley",
  "Chris Sabin","Dax Harwood","Cash Wheeler"])
  await expect(matchup).toContainText(name);
 await expect(matchup.locator(".ppw-card-extra-people")).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("iPhone books an Iron Man match with legal fall finish, minimum airtime and explicit injury warning",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let revision=4,saved:Record<string,unknown>={...fallback};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as {method:string;matches?:{payload:Record<string,unknown>}[]};
  if(req.method==="save"){
   saved=req.matches![0]!.payload;revision++;
   expect(saved.stipulation).toBe("IRON_MAN");
   expect(saved.plannedFinish).toBe("MOST_FALLS");
   expect(saved.plannedLengthMinutes).toBe(30);
  }
  return r.fulfill({json:req.method==="planner"?planner:
   req.method==="load"?{...cardBase,worldRevision:revision,
    slots:[{slotId:"opening",kind:"MATCH",position:0,payload:saved}]}:
   req.method==="save"?{status:"APPLIED",result:{showId:"weekly"}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await page.locator(".ppw-card-bar .ppw-expand").first().click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByLabel("Stipulation").selectOption("IRON_MAN");
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByLabel("Finish")).toHaveValue("MOST_FALLS");
 await expect(dialog.getByLabel("Minutes")).toHaveValue("30");
 await expect(dialog).toContainText("Performance depends on wrestler suitability");
 const selectBox=await dialog.getByLabel("Stipulation").boundingBox();
 const noteBox=await dialog.locator(".ppw-stipulation-impact").boundingBox();
 expect(selectBox).not.toBeNull();expect(noteBox).not.toBeNull();
 expect(selectBox!.height).toBeLessThan(75);
 expect(noteBox!.width).toBeGreaterThan(285);
 await dialog.getByLabel("Stipulation").scrollIntoViewIfNeeded();
 await page.screenshot({path:"test-results/presentation-screenshots/phase22-iron-man-booking-390.png",
  animations:"disabled"});
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await page.getByRole("button",{name:/Save card|Save changes/}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 await expect(page.locator(".ppw-card-bar strong").first()).toContainText("Iron Man Match");
 await page.locator(".ppw-card-bar .ppw-expand").first().click();
 dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByLabel("Stipulation")).toHaveValue("IRON_MAN");
 await dialog.getByLabel("Stipulation").selectOption("FALLS_COUNT_ANYWHERE");
 await expect(dialog.getByLabel("Finish")).toHaveValue("CLEAN_PIN");
 await expect(dialog).toContainText("HIGH injury exposure");
});
