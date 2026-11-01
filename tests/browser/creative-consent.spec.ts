import {test,expect} from "@playwright/test";
test("mobile booker asks for one saved wrestler agreement and sees the actual answer",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 let approved=false,revision=4,askedAboutDraft=false;
 const session={worldId:"genesis",playerId:"booker",csrfToken:"browser-csrf",
  availablePromotions:[],overview:{world:{revision:4,year:1,week:5,
   name:"Genesis",phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,
   serverEpoch:Date.now()/1000},membership:"ACTIVE",
   promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:1000000,debt:0}}};
 const a={personId:"alice",contractId:"deal-a"};
 const b={personId:"bob",contractId:"deal-b"};
 const match={matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[a]},{sideId:"B",participants:[b]}],
  participants:[a,b],scriptedWinnerSide:"A",
  plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18};
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  canEdit:true,worldRevision:4,homeMarketId:"home",venues:[],venuePressure:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
    eventType:"REGULAR",day:5,marketId:"home",venueId:"hall",
    marketName:"Home",venueName:"Hall",ticketStrategy:"STANDARD",
    ready:false,slots:1,bookingClass:"REGULAR",showSeriesId:null,
    showName:"Friday Night Live"}]}]};
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const req=route.request().postDataJSON() as Record<string,unknown>;
  calls.push(String(req.method));
  if(req.method==="creativeConsent"){
   expect(req.slotId).toBe("main");expect(req.personId).toBe("bob");
    expect(req.expectedRevision).toBe(req.proposedMatch===undefined?4:5);
    if(req.proposedMatch!==undefined){
     const draft=req.proposedMatch as {plannedFinish:string;participants:unknown[]};
     expect(draft.plannedFinish).toBe("PROTECTED_FINISH");
     expect(draft.participants).toHaveLength(2);
     askedAboutDraft=true;
    }
   expect(req.playerId).toBeUndefined();
   approved=true;revision++;
  }
  const card={showId:"weekly",year:1,week:5,worldRevision:revision,
   canEdit:true,ready:false,day:5,venueId:"hall",
   showName:"Friday Night Live",promotionName:"AEW",marketName:"Home",
   venueName:"Hall",bookingClass:"REGULAR",ticketStrategy:"STANDARD",
   championships:[],programmes:[],programmeLinks:[],
   selectedPeople:[{personId:"alice",name:"Alice",division:"MEN"},
    {personId:"bob",name:"Bob",division:"MEN",creativeControl:"FULL_APPROVAL",contractId:"deal-b",appearanceFee:500}],
   creativeConcerns:[{showId:"weekly",slotId:"main",personId:"bob",
    contractId:"deal-b",name:"Bob",reason:"PROTECTED_LOSS",
    signature:"saved-script-only",requiresConsent:true,
    decision:approved?"APPROVED":"NOT_REQUESTED"}],
   slots:[{slotId:"main",kind:"MATCH",position:0,payload:match}]};
  await route.fulfill({json:req.method==="planner"?planner:
   req.method==="load"?card:
   req.method==="creativeConsent"?{status:"APPLIED",result:{decision:"APPROVED"}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.getByText("1 match approval to resolve")).toBeVisible();
 await page.getByRole("button",{name:"Edit this match"}).click();
 await page.getByRole("dialog",{name:"Edit match"}).getByRole("button",{name:"Ask Bob"}).click();
 await expect(page.getByText("AGREED",{exact:true})).toBeVisible();
 await expect(page.getByText(/wrestler has agreed/)).toBeVisible();
 expect(calls).toEqual(["planner","load","creativeConsent","load"]);
 await page.getByRole("button",{name:"Edit this match"}).click();
 const editor=page.getByRole("dialog",{name:"Edit match"});
 await editor.getByLabel("Finish").selectOption("PROTECTED_FINISH");
 await expect(editor.getByText("Recheck needed")).toBeVisible();
 await expect(page.getByText("RECHECK AFTER SAVE")).toBeVisible();
 await editor.getByRole("button",{name:"Ask Bob about this draft"}).click();
  await expect(page.getByText(/agreed to this draft/)).toBeVisible();
  expect(askedAboutDraft).toBe(true);
  expect(calls.filter(x=>x==="creativeConsent")).toHaveLength(2);
  expect(calls.filter(x=>x==="save")).toHaveLength(0);
  await expect(page.getByText("Unsaved changes")).toBeVisible();
 expect(page.url()).not.toContain("bob");
});
