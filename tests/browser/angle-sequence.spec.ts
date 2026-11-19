import {test,expect} from "@playwright/test";

const alice={personId:"alice",contractId:"contract-alice"};
const bob={personId:"bob",contractId:"contract-bob"};
const match={matchType:"SINGLES",family:"INDIVIDUAL",
 participants:[alice,bob],sides:[{sideId:"A",participants:[alice]},
 {sideId:"B",participants:[bob]}],scriptedWinnerSide:"A",
 plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18};
const initial={
 kind:"ATTACK",actorIds:["alice"],targetIds:["bob"],outcome:"HAPPENS",
 participants:[alice,bob],durationMinutes:5,
 creativeBeat:{kind:"ATTACK",presentation:"BLINDSIDE",objective:"GENERATE_HEAT"},
 scene:{location:"BACKSTAGE",visual:"NONE",purpose:"BUILD_RIVALRY",
  intensity:"BEATDOWN"}
};
for(const width of [320,390]){
 test("one real PPW feud segment sequences speech, reply and attack at "+width+"px",
 async({page})=>{
  await page.setViewportSize({width,height:844});
  const calls:string[]=[];let saved:Record<string,unknown>={...initial};
  let revision=5;
  const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:5,
   worldRevision:5,canEdit:true,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
    scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
     eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
     marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",ready:false,
     slots:2,bookingClass:"REGULAR",showSeriesId:null,showName:"Ascension"}]}]};
  const overview={world:{revision:5,name:"Genesis",year:1,week:5,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:1000000,debt:0}};
  const session={worldId:"genesis",playerId:"booker",
   csrfToken:"opaque-browser-csrf",overview,availablePromotions:[]};
  const story={programmeId:"feud",label:"Alice vs Bob",heat:52,repetition:2,
   activityCount:1,segmentCount:0,cast:[{personId:"alice",name:"Alice",
    side:"A",contractId:"contract-alice"},{personId:"bob",name:"Bob",
    side:"B",contractId:"contract-bob"}]};
  const card=()=>({showId:"weekly",year:1,week:5,canEdit:true,ready:false,
   worldRevision:revision,day:5,venueId:"arena",showName:"Ascension",
   promotionName:"CWA",venueName:"Arena",marketName:"Home",
   bookingClass:"REGULAR",ticketStrategy:"STANDARD",championships:[],
   programmes:[story],programmeLinks:[{slotId:"angle",programmeId:"feud"}],
   selectedPeople:[{personId:"alice",name:"Alice",division:"WOMEN",
    contractId:"contract-alice"},{personId:"bob",name:"Bob",
    division:"WOMEN",contractId:"contract-bob"}],
   slots:[{slotId:"bout",kind:"MATCH",position:0,payload:match},
    {slotId:"angle",kind:"SEGMENT",position:1,payload:saved}]});
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const req=route.request().postDataJSON() as Record<string,unknown>;
   const method=String(req.method);calls.push(method);
   if(method==="save"){
    const segments=req.segments as {slotId:string;programmeId:string;
     payload:Record<string,unknown>}[];
    expect(segments).toHaveLength(1);
    expect(segments[0]!.programmeId).toBe("feud");
    saved=segments[0]!.payload;
    expect(saved.kind).toBe("ATTACK");
    expect(saved.actorIds).toEqual(["alice"]);
    expect(saved.targetIds).toEqual(["bob"]);
    expect(saved.scriptedActions).toMatchObject([
     {action:"SPEAK",by:"alice",line:"I want an answer."},
     {action:"REPLY",by:"bob",to:"alice"},
     {action:"ATTACK",by:"alice",to:"bob"}
    ]);
    revision++;
    return route.fulfill({json:{status:"APPLIED",result:{performers:2}}});
   }
   return route.fulfill({json:method==="planner"?planner:method==="load"?card():
    method==="kpWorkspace"?{entitlements:[]}:{}});
  });
  await page.goto("/#/planner");
  await page.getByRole("button",{name:"Edit card"}).click();
  await page.locator(".ppw-card-bar .ppw-expand").last().click();
  let dialog=page.getByRole("dialog",{name:"Edit angle"});
  await expect(dialog.locator(".ppw-angle-sequence")).toBeVisible();
  await dialog.getByRole("button",{name:"Add scripted moment"}).click();
  await dialog.getByLabel("Moment 1 dialogue or detail").fill("I want an answer.");
  await dialog.getByRole("button",{name:"Add scripted moment"}).click();
  await dialog.getByLabel("Moment 2 action").selectOption("REPLY");
  await dialog.getByLabel("Moment 2 performer").selectOption("bob");
  await dialog.getByLabel("Moment 2 recipient").selectOption("alice");
  await dialog.getByRole("button",{name:"Add scripted moment"}).click();
  await dialog.getByLabel("Moment 3 action").selectOption("ATTACK");
  await dialog.getByLabel("Moment 3 recipient").selectOption("bob");
  await expect(dialog.locator(".ppw-angle-sequence-step")).toHaveCount(3);
  // The actual editor at 320px and 390px. Capture the authored beat order.
  await dialog.locator(".ppw-angle-sequence").screenshot({
   path:"test-results/ppw-integrated-creative-editor-"+width+".png",
   animations:"disabled"});
  await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
  await expect(dialog.locator(".ppw-angle-sequence-review"))
   .toContainText("Alice spoke");
  await expect(dialog.locator(".ppw-angle-sequence-review"))
   .toContainText("Bob answered Alice");
  await expect(dialog.locator(".ppw-angle-sequence-review"))
   .toContainText("Alice attacked Bob");
  await dialog.locator(".ppw-angle-sequence-review").screenshot({
   path:"test-results/ppw-integrated-script-review-"+width+".png",
   animations:"disabled"});
  await dialog.getByRole("button",{name:"Complete angle"}).click();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(calls.filter(x=>x==="save")).toHaveLength(1);
  await page.locator(".ppw-card-bar .ppw-expand").last().click();
  dialog=page.getByRole("dialog",{name:"Edit angle"});
  if(await dialog.getByRole("button",{name:"← Revise script"}).count())
   await dialog.getByRole("button",{name:"← Revise script"}).click();
  await expect(dialog.locator(".ppw-angle-sequence-step")).toHaveCount(3);
  await expect(dialog.getByLabel("Moment 2 action")).toHaveValue("REPLY");
  expect(calls).not.toContain("talent");
  expect(calls).not.toContain("groq");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
