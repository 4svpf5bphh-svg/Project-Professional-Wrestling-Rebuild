import {test,expect} from "@playwright/test";
for(const width of [320,390]){
 test("non-rival story lets the owner select its real on-screen lead and save an actual angle at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const joe={personId:"joe",contractId:"joe-deal"};
  const champion={personId:"champion",contractId:"champion-deal"};
  const match={matchType:"SINGLES",family:"INDIVIDUAL",participants:[joe,champion],
   sides:[{sideId:"A",participants:[joe]},{sideId:"B",participants:[champion]}],
   scriptedWinnerSide:"B",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
   plannedLengthMinutes:18};
  const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
   overview:{world:{revision:4,name:"Genesis",year:1,week:7,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
    membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
     cash:100000,debt:0}},availablePromotions:[]};
  const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:7,
   canEdit:true,worldRevision:4,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:7,offset:0,required:true,major:false,canEdit:true,
    scheduled:[],shows:[{draftId:"weekly",year:1,week:7,status:"DRAFT",
     eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
     marketName:"Home",venueName:"Arena",ready:false,slots:1,
     bookingClass:"REGULAR",showName:"Ascension"}]}]};
  const story={programmeId:"solo-joe",programmeFormat:"SOLO" as const,
   label:"Samoa Joe · Solo journey",heat:null,repetition:0,
   activityCount:0,segmentCount:0,
   cast:[{...joe,name:"Samoa Joe",side:"A",appearanceFee:300,
    creativeControl:"NONE"}]};
  let revision=4,saveCount=0;
  let saved:{slotId:string;payload:Record<string,unknown>;programmeId:string|null}|null=null;
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const body=r.request().postDataJSON() as Record<string,unknown>;
   const method=String(body.method);calls.push(method);
   if(method==="programmes")return r.fulfill({json:{
    year:1,week:7,worldRevision:revision,canEdit:true,people:[],teams:[],
    championships:[],programmes:[{programmeId:"solo-joe",programmeFormat:"SOLO",
     status:"ACTIVE",heat:null,repetition:0,activityCount:0,matchCount:0,
     segmentCount:0,sideAWins:0,sideBWins:0,draws:0,championshipId:null,
     startedWeekIndex:6,endedWeekIndex:null,creativeIntent:null,
     blueprintProgress:null,sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
     sideB:[],recentActivity:[],plannedActivity:[],medicalHolds:[],
     eligibleCreativePeople:[],creativeAgreements:[],wrestlerChanges:[],
     latestFollowUp:null,finale:null}]
   }});
   if(method==="planner")return r.fulfill({json:planner});
   if(method==="load")return r.fulfill({json:{
    showId:"weekly",year:1,week:7,canEdit:true,ready:false,worldRevision:revision,
    day:5,venueId:"arena",showName:"Ascension",promotionName:"CWA",
    venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
    ticketStrategy:"STANDARD",championships:[],programmes:[story],
    programmeLinks:saved?[{slotId:saved.slotId,programmeId:"solo-joe"}]:[],
    selectedPeople:[{...joe,name:"Samoa Joe",division:"MEN",alignment:"FACE"},
     {...champion,name:"The Champion",division:"MEN",alignment:"HEEL"}],
    slots:[{slotId:"main",kind:"MATCH",position:0,payload:match},
     ...(saved?[{slotId:saved.slotId,kind:"SEGMENT",position:1,payload:saved.payload}]:[])]
   }});
   if(method==="save"){
    const segments=body.segments as {slotId:string;payload:Record<string,unknown>;
     programmeId:string|null}[];
    expect(segments).toHaveLength(1);
    expect(segments[0]!.programmeId).toBe("solo-joe");
    expect(segments[0]!.payload.kind).toBe("INTERVIEW");
    expect(segments[0]!.payload.actorIds).toEqual(["joe"]);
    expect(segments[0]!.payload.targetIds).toEqual([]);
    expect((body.matches as unknown[])).toHaveLength(1);
    saved=segments[0]!;revision++;saveCount++;
    return r.fulfill({json:{status:"APPLIED",result:{showId:"weekly"}}});
   }
   if(method==="talent")return r.fulfill({json:{
    talent:[{...champion,name:"The Champion",available:true,
     division:"MEN",alignment:"HEEL",popularity:75,reason:"AVAILABLE"}],
    cursor:null
   }});
   if(method==="kpWorkspace")return r.fulfill({json:{entitlements:[]}});
   throw Error("Unexpected method "+method);
  });
  // Programme Desk is the one source of creative chapter starters now;
  // the Card no longer repeats its recommendations above actual booking.
  await page.goto("/#/programmes");
  await page.getByRole("button",{name:"Plan",exact:true}).click();
  await page.getByRole("button",{name:"Introduce their ambition"}).click();
  let dialog=page.getByRole("dialog",{name:"Edit angle"});
  await expect(dialog.getByText("CAST YOUR STORY")).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Samoa Joe leads"})).toBeVisible();
  await dialog.getByRole("button",{name:"Samoa Joe leads"}).click();
  // A solo programme has no Side B, but an optional interview subject
  // must be searchable across the entire roster rather than only the
  // protagonist's own story cast.
  await dialog.getByRole("button",{name:"+ Add subject"}).click();
  const rosterSheet=page.getByRole("dialog",{name:"Choose wrestler"});
  await expect(rosterSheet).toContainText("Solo stories have no Side B");
  await expect(rosterSheet).toContainText("The Champion");
  await rosterSheet.getByRole("button",{name:"×"}).click();
  // The authenticated save below verifies the actual Joe actor ID.
  // Avoid matching a hidden <option> label in the optional Storyline selector.
  await expect(dialog.getByRole("button",{name:"Next · Script outcome"})).toBeEnabled();
  await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
  await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
  await dialog.getByRole("button",{name:"Complete angle"}).click();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(saveCount).toBe(1);
  await page.reload();
  await expect(page.locator(".ppw-card-bar")).toHaveCount(2);
  expect(calls.filter(x=>x==="save")).toHaveLength(1);
  expect(calls).not.toContain("groq");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
