import {test,expect} from "@playwright/test";

/** A quick scene travels through the original authenticated card editor.
 * Its why/where/how can change and the saved payload stays standard PPW. */
for(const width of [320,390])for(const moment of ["betrayal-turn","jealous-ambush"] as const){
 test("Phase 59 "+moment+" is customisable and saved with one Programme at "+width+"px",async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  let revision=8,saved:Record<string,unknown>|null=null,slotId:string|null=null;
  const calls:string[]=[];
  const joe={personId:"joe",contractId:"joe-deal"};
  const riddle={personId:"riddle",contractId:"riddle-deal"};
  const match={matchType:"SINGLES",family:"INDIVIDUAL",
   participants:[joe,riddle],
   sides:[{sideId:"A",participants:[joe]},{sideId:"B",participants:[riddle]}],
   scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
   plannedLengthMinutes:18};
  const overview={world:{id:"world",revision:8,name:"Genesis",year:1,week:6,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
    cash:1000000,debt:0}};
  const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:6,
   worldRevision:8,canEdit:true,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:6,offset:0,required:true,major:false,
    canEdit:true,scheduled:[],shows:[{draftId:"ascension",year:1,week:6,
     status:"DRAFT",eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
     marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
     ready:false,slots:0,bookingClass:"REGULAR",showSeriesId:null,
     showName:"Ascension"}]}]};
  const story={programmeId:"joe-riddle",label:"Samoa Joe vs Matt Riddle",
   heat:55,repetition:4,activityCount:2,segmentCount:1,
   cast:[{personId:"joe",name:"Samoa Joe",side:"A",contractId:"joe-deal"},
    {personId:"riddle",name:"Matt Riddle",side:"B",contractId:"riddle-deal"}]};
  const load=()=>({
   showId:"ascension",year:1,week:6,canEdit:true,ready:false,
   worldRevision:revision,day:5,venueId:"arena",showName:"Ascension",
   promotionName:"CWA",venueName:"Arena",marketName:"Home",
   bookingClass:"REGULAR",ticketStrategy:"STANDARD",championships:[],
   programmes:[story],programmeLinks:slotId?
    [{slotId,programmeId:"joe-riddle"}]:[],
   selectedPeople:[{personId:"joe",name:"Samoa Joe",division:"MEN",
     contractId:"joe-deal",alignment:"FACE"},
    {personId:"riddle",name:"Matt Riddle",division:"MEN",
     contractId:"riddle-deal",alignment:"HEEL"}],
   slots:[{slotId:"bout",kind:"MATCH",position:0,payload:match},
    ...(saved&&slotId?[{slotId,kind:"SEGMENT",position:1,payload:saved}]:[])]
  });
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"booker",csrfToken:"csrf",overview,
   availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const body=r.request().postDataJSON() as Record<string,unknown>;
   const method=String(body.method);calls.push(method);
   if(method==="planner")return r.fulfill({json:planner});
   if(method==="load")return r.fulfill({json:load()});
   if(method==="kpWorkspace")return r.fulfill({json:{entitlements:[]}});
   if(method==="save"){
    const segments=body.segments as {slotId:string;programmeId:string;
     payload:Record<string,unknown>}[];
    expect(segments).toHaveLength(1);
    expect(segments[0]!.programmeId).toBe("joe-riddle");
    saved=segments[0]!.payload;slotId=segments[0]!.slotId;
    expect(body.matches).toHaveLength(1);
    expect(saved.actorIds).toEqual(["joe"]);
    expect(saved.targetIds).toEqual(["riddle"]);
    expect(saved.scene).toMatchObject(moment==="betrayal-turn"?
     {purpose:"EXPLAIN_TURN",location:"LOCKER_ROOM"}:
     {purpose:"SEEK_REVENGE",location:"PARKING_LOT"});
    expect(saved.creativeBeat).toMatchObject(moment==="betrayal-turn"?
     {kind:"TURN",presentation:"ATTACK_ALLY"}:
     {kind:"ATTACK",presentation:"PREMEDITATED_AMBUSH"});
    revision++;
    return r.fulfill({json:{status:"APPLIED",result:{performers:2}}});
   }
   throw Error("Unexpected authenticated RPC "+method);
  });
  await page.goto("/#/planner");
  await page.getByRole("button",{name:"Edit card"}).click();
  await page.getByRole("button",{name:"+ Add angle"}).click();
  let dialog=page.getByRole("dialog",{name:"Edit angle"});
  await expect(dialog.locator(".ppw-angle-moment-panel")).toBeVisible();
  await expect(dialog.locator(".ppw-story-blueprint-panel")).toBeVisible();
  await dialog.locator(".ppw-angle-moment-links")
   .getByRole("button",{name:"Samoa Joe vs Matt Riddle"}).click();
  await dialog.locator(".ppw-angle-moment-families")
   .getByRole("button",{name:moment==="betrayal-turn"?"Relationships":"The Fall"}).click();
  await testInfo.attach("phase59-moment-"+moment+"-"+width,{
   body:await page.screenshot(),contentType:"image/png"
  });
  await dialog.locator('.ppw-angle-moment-option[data-moment-id="'+moment+'"]').click();
  await expect(dialog.getByRole("button",{name:"Next · Script outcome"})).toBeVisible();
  await dialog.getByRole("button",{name:"Side A initiates"}).click();
  await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
  await dialog.locator('.ppw-guide-script-choice[data-field="Storytelling purpose"]')
   .getByRole("button",{name:moment==="betrayal-turn"?
    "Explain the change of heart":"Settle an old score"}).click();
  if(moment==="betrayal-turn"){
   await dialog.locator('.ppw-guide-script-choice[data-field="How the turn is shown"]')
    .getByRole("button",{name:"Attack an ally"}).click();
   await dialog.locator('.ppw-guide-script-choice[data-field="Area"]')
    .getByRole("button",{name:"Backstage",exact:true}).click();
   await dialog.locator('.ppw-guide-script-choice[data-field="Exact location"]')
    .getByRole("button",{name:"Locker room"}).click();
  }else{
   await dialog.locator('.ppw-guide-script-choice[data-field="Area"]')
    .getByRole("button",{name:"Outside the arena",exact:true}).click();
  }
  await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
  await expect(dialog.locator(".ppw-angle-script-overview")).toBeVisible();
  await testInfo.attach("phase59-script-review-"+moment+"-"+width,{
   body:await page.screenshot(),contentType:"image/png"
  });
  expect(calls.filter(x=>x==="save")).toHaveLength(0);
  await dialog.getByRole("button",{name:"Complete angle"}).click();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(calls.filter(x=>x==="save")).toHaveLength(1);
  await page.locator(".ppw-card-bar .ppw-expand").last().click();
  dialog=page.getByRole("dialog",{name:"Edit angle"});
  await expect(dialog).toBeVisible();
  if(await dialog.getByRole("button",{name:"← Revise script"}).count())
   await dialog.getByRole("button",{name:"← Revise script"}).click();
  await expect(dialog.locator('.ppw-guide-script-choice[data-field="Storytelling purpose"]')
   .locator('button[aria-pressed="true"]')).toContainText(moment==="betrayal-turn"?
     "Explain the change of heart":"Settle an old score");
  expect(calls).not.toContain("groq");
  expect(calls).not.toContain("overview");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
