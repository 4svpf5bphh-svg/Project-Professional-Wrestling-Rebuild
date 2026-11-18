import {test,expect} from "@playwright/test";

/** Real match editor links an on-card performance to a selected non-rival
 * story. It never guesses the story from appearance and never changes the
 * canonical finish, title or existing rivalry matches.
 */
for(const width of [320,390]){
 test("owner explicitly links and reopens a solo title chase match at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
   overview:{world:{revision:8,name:"Genesis",year:1,week:6,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
    membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
     cash:1000000,debt:0}},availablePromotions:[]};
  const joe={personId:"joe",contractId:"joe-deal"};
  const champion={personId:"champion",contractId:"champion-deal"};
  const match={matchType:"SINGLES",family:"INDIVIDUAL",
   participants:[joe,champion],
   sides:[{sideId:"A",participants:[joe]},{sideId:"B",participants:[champion]}],
   scriptedWinnerSide:"B",plannedFinish:"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:18};
  const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:6,
   canEdit:true,worldRevision:8,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:6,offset:0,required:true,major:false,canEdit:true,
    scheduled:[],shows:[{draftId:"ascension",year:1,week:6,
     status:"DRAFT",eventType:"REGULAR",day:5,marketId:"home",
     venueId:"arena",marketName:"Home",venueName:"Arena",ready:false,slots:1,
     bookingClass:"REGULAR",showSeriesId:null,showName:"Ascension"}]}]};
  const solo={programmeId:"solo-joe",programmeFormat:"SOLO",
   label:"Samoa Joe · Solo journey",heat:41,repetition:0,activityCount:0,
   segmentCount:0,cast:[{...joe,name:"Samoa Joe",side:"A",
    appearanceFee:300,creativeControl:"NONE"}]};
  const irrelevant={...solo,programmeId:"unrelated",
   label:"Kevin Owens · Solo journey",cast:[{personId:"kevin",name:"Kevin Owens",
    contractId:"kevin-deal",side:"A",creativeControl:"NONE"}]};
  let savedStory:string|null=null;
  let revision=8,saveCount=0;
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const p=r.request().postDataJSON() as Record<string,unknown>;
   const method=String(p.method);calls.push(method);
   if(method==="planner")return r.fulfill({json:planner});
   if(method==="load")return r.fulfill({json:{
    showId:"ascension",year:1,week:6,canEdit:true,ready:false,
    worldRevision:revision,day:5,venueId:"arena",showName:"Ascension",
    promotionName:"CWA",venueName:"Arena",marketName:"Home",
    bookingClass:"REGULAR",ticketStrategy:"STANDARD",
    championships:[],programmes:[solo,irrelevant],programmeLinks:[],
    matchProgrammeLinks:savedStory?[{slotId:"main",programmeId:savedStory}]:[],
    selectedPeople:[
     {personId:"joe",name:"Samoa Joe",contractId:"joe-deal",
      division:"MEN",alignment:"FACE"},
     {personId:"champion",name:"The Champion",contractId:"champion-deal",
      division:"MEN",alignment:"HEEL"}],
    slots:[{slotId:"main",kind:"MATCH",position:0,payload:match}]
   }});
   if(method==="save"){
    const matches=p.matches as {slotId:string;payload:Record<string,unknown>;
     programmeId?:string|null}[];
    expect(matches).toHaveLength(1);
    expect(matches[0]!.slotId).toBe("main");
    expect(matches[0]!.programmeId).toBe("solo-joe");
    expect(matches[0]!.payload.scriptedWinnerSide).toBe("B");
    expect(matches[0]!.payload.plannedFinish).toBe("CLEAN_PIN");
    expect(matches[0]!.payload).not.toHaveProperty("programmeId");
    savedStory=matches[0]!.programmeId??null;revision++;saveCount++;
    return r.fulfill({json:{status:"APPLIED",revision,result:{showId:"ascension"}}});
   }
   if(method==="kpWorkspace")return r.fulfill({json:{entitlements:[]}});
   throw Error("Unexpected story match method "+method);
  });
  await page.goto("/#/planner");
  await page.getByRole("button",{name:"Edit card"}).click();
  await page.locator(".ppw-card-bar .ppw-expand").first().click();
  let dialog=page.getByRole("dialog",{name:"Edit match"});
  await expect(dialog).toBeVisible();
  const picker=dialog.getByLabel("Storyline (optional)");
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toHaveCount(2);
  await picker.selectOption("solo-joe");
  await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
  await dialog.getByRole("button",{name:"Complete match"}).click();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(saveCount).toBe(1);
  await page.reload();
  await page.locator(".ppw-card-bar .ppw-expand").first().click();
  dialog=page.getByRole("dialog",{name:"Edit match"});
  await expect(dialog.getByLabel("Storyline (optional)")).toHaveValue("solo-joe");
  expect(calls.filter(m=>m==="save")).toHaveLength(1);
  expect(calls).not.toContain("startProgramme");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
