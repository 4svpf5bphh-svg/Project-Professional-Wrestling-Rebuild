import {test,expect} from "@playwright/test";

const alice={personId:"alice",contractId:"contract-alice"};
const bob={personId:"bob",contractId:"contract-bob"};
const original={matchType:"SINGLES",family:"INDIVIDUAL",
 participants:[alice,bob],sides:[{sideId:"A",participants:[alice]},
  {sideId:"B",participants:[bob]}],scriptedWinnerSide:"A",
 plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18};
for(const width of [320,390]){
 test("booker's actual object and referee bump round-trip in full-card booking at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let saved:Record<string,unknown>={...original},revision=5,saves=0;
  const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:5,
   worldRevision:5,canEdit:true,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
    scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
     eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
     marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",ready:false,
     slots:1,bookingClass:"REGULAR",showSeriesId:null,showName:"Ascension"}]}]};
  const session={worldId:"genesis",playerId:"booker",csrfToken:"opaque-browser-csrf",
   overview:{world:{revision:5,name:"Genesis",year:1,week:5,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
    membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
     cash:1000000,debt:0}},availablePromotions:[]};
  const card=()=>({showId:"weekly",year:1,week:5,canEdit:true,ready:false,
   worldRevision:revision,day:5,venueId:"arena",showName:"Ascension",
   promotionName:"CWA",venueName:"Arena",marketName:"Home",
   bookingClass:"REGULAR",ticketStrategy:"STANDARD",championships:[],
   programmes:[],programmeLinks:[],
   selectedPeople:[{...alice,name:"Alice",division:"WOMEN"},
    {...bob,name:"Bob",division:"WOMEN"}],
   slots:[{slotId:"bout",kind:"MATCH",position:0,payload:saved}]});
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const req=r.request().postDataJSON() as Record<string,unknown>;
   const method=String(req.method);
   if(method==="save"){
    const matches=req.matches as {slotId:string;payload:Record<string,unknown>}[];
    expect(matches).toHaveLength(1);
    expect(matches[0]?.slotId).toBe("bout");
    expect(matches[0]?.payload).toMatchObject({
     scriptedWinnerSide:"A",plannedFinish:"FOREIGN_OBJECT",
     finishProp:"SCREWDRIVER",refereeSpot:"REF_BUMP"});
    saved=matches[0]!.payload;revision++;saves++;
    return r.fulfill({json:{status:"APPLIED",result:{performers:2}}});
   }
   return r.fulfill({json:method==="planner"?planner:method==="load"?card():
    method==="kpWorkspace"?{entitlements:[]}:{}});
  });
  await page.goto("/#/planner");
  await page.getByRole("button",{name:"Edit card"}).click();
  await page.locator(".ppw-card-bar .ppw-expand").first().click();
  let dialog=page.getByRole("dialog",{name:"Edit match"});
  await expect(dialog.getByText("STEP 3 OF 4 · SCRIPT")).toBeVisible();
  await dialog.locator(".ppw-guide-finish-tile").filter({hasText:/Foreign Object/i}).click();
  await dialog.getByLabel("Weapon used").selectOption("SCREWDRIVER");
  await dialog.getByLabel("Referee spot").selectOption("REF_BUMP");
  await expect(dialog.getByLabel("Weapon used")).toHaveValue("SCREWDRIVER");
  await expect(dialog.getByLabel("Referee spot")).toHaveValue("REF_BUMP");
  await expect(dialog.getByLabel("Weapon used")).toBeVisible();
  await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
  await dialog.getByRole("button",{name:"Complete match"}).click();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(saves).toBe(1);
  await page.reload();
  await page.getByRole("button",{name:"Edit card"}).click();
  await page.locator(".ppw-card-bar .ppw-expand").first().click();
  dialog=page.getByRole("dialog",{name:"Edit match"});
  await expect(dialog.getByLabel("Weapon used")).toHaveValue("SCREWDRIVER");
  await expect(dialog.getByLabel("Referee spot")).toHaveValue("REF_BUMP");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
