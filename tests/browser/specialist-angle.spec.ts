import {test,expect} from "@playwright/test";

const alice={personId:"alice",contractId:"contract-alice"};
const bob={personId:"bob",contractId:"contract-bob"};
const match={
 matchType:"SINGLES",family:"INDIVIDUAL",participants:[alice,bob],
 sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[bob]}],
 scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
 plannedLengthMinutes:18
};
const planner={
 worldName:"Genesis",promotionName:"AEW",year:1,week:5,canEdit:true,
 worldRevision:4,homeMarketId:"home",venues:[],venuePressure:[],
 weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,scheduled:[],
  shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",eventType:"REGULAR",
   day:5,marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
   ticketStrategy:"STANDARD",ready:false,slots:2,bookingClass:"REGULAR",
   showSeriesId:null,showName:"Dynamite"}]}]
};
const overview={
 world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",
  cash:5000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}
};
const session={worldId:"genesis",playerId:"test-owner",
 csrfToken:"opaque-browser-csrf",overview,availablePromotions:[]};

test("iPhone scripts, saves and reopens a specialist angle without another roster read",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let saved={
  kind:"PROMO",outcome:"HAPPENS",actorIds:["alice"],targetIds:[],
  participants:[alice]
 } as Record<string,unknown>;
 let revision=4;
 const methods:string[]=[];
 await page.route("**/api/session",async route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(request.method);methods.push(method);
  if(method==="save"){
   const angles=request.segments as {slotId:string;payload:Record<string,unknown>}[];
   expect(angles).toHaveLength(1);
   saved=angles[0]!.payload;
   expect(saved.outcome).toBe("REFUSED");
   expect(saved.creativeBeat).toEqual({kind:"PROMO",purpose:"AIR_GRIEVANCE"});
   expect(saved.actorIds).toEqual(["alice"]);
   expect(saved.participants).toEqual([alice]);
   revision++;
  }
  const card={
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:revision,
   day:5,venueId:"arena",showName:"Dynamite",promotionName:"AEW",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
   selectedPeople:[{personId:"alice",name:"Alice",division:"MEN"},
    {personId:"bob",name:"Bob",division:"MEN"}],
   slots:[{slotId:"bout",kind:"MATCH",position:0,payload:match},
    {slotId:"speech",kind:"SEGMENT",position:1,payload:saved}]
  };
  await route.fulfill({json:method==="planner"?planner:method==="load"?card:
   method==="save"?{status:"APPLIED",result:{performers:2}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 await page.locator(".ppw-card-bar .ppw-expand").nth(1).click();
 let dialog=page.getByRole("dialog",{name:"Edit angle"});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole("button",{name:"Script the exact angle"})).toBeVisible();
 await dialog.getByRole("button",{name:"Script the exact angle"}).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.getByLabel("The message").selectOption("AIR_GRIEVANCE");
 await dialog.getByLabel("Scripted outcome").selectOption("REFUSED");
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await page.getByRole("button",{name:"Save card"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 await expect(page.locator(".ppw-card-lineup").filter({hasText:"Air a grievance"}))
  .toBeVisible();
 expect(methods.filter(x=>x==="save")).toHaveLength(1);
 expect(methods.filter(x=>x==="load")).toHaveLength(2);
 expect(methods).not.toContain("talent");
 expect(methods).not.toContain("wrestlerProfile");
 // The server-returned slot drives the next edit, not a local unsaved draft.
 await page.locator(".ppw-card-bar .ppw-expand").nth(1).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await expect(dialog.getByLabel("The message")).toHaveValue("AIR_GRIEVANCE");
 await expect(dialog.getByLabel("Scripted outcome")).toHaveValue("REFUSED");
});
