import {test,expect} from "@playwright/test";

for(const width of [320,390]){
 test("future-show renewal is player-confirmed with identical scripted results at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const people=[
   {personId:"austin",name:"Austin Gunn",division:"MEN",contractId:"new-austin"},
   {personId:"colten",name:"Colten Gunn",division:"MEN",contractId:"new-colten"},
   {personId:"joe",name:"Samoa Joe",division:"MEN",contractId:"deal-joe"},
   {personId:"mistico",name:"Mistico",division:"MEN",contractId:"deal-mistico"}];
  const old=people.map(p=>({personId:p.personId,contractId:p.personId==="austin"?
   "old-austin":p.personId==="colten"?"old-colten":p.contractId}));
  const fresh=people.map(p=>({personId:p.personId,contractId:p.contractId}));
  const asMatch=(cast:typeof fresh)=>({
   matchType:"TAG",family:"TEAMS",participants:cast,
   sides:[{sideId:"A",participants:cast.slice(0,2)},
    {sideId:"B",participants:cast.slice(2,4)}],
   scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:18
  });
  let saved=asMatch(old),revision=4;
  const requests:Record<string,unknown>[]=[];
  let releaseSave!:()=>void;
  const saveGate=new Promise<void>(resolve=>{releaseSave=resolve;});
  const overview={world:{revision:4,name:"Genesis",year:1,week:1,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"cwa",name:"Chaotic Wrestling Alliance",tier:"LOCAL",
    cash:5000000,debt:0,lastWeeklyNet:0}};
  const planner={worldName:"Genesis",promotionName:"Chaotic Wrestling Alliance",
   year:1,week:1,worldRevision:4,canEdit:true,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:3,offset:2,required:false,major:false,
    canEdit:true,scheduled:[],shows:[{
     draftId:"future",year:1,week:3,status:"DRAFT",bookingClass:"REGULAR",
     eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
     marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
     ready:false,slots:1,showSeriesId:null,showName:"Ascension"}]}]};
  const card=()=>({
   showId:"future",year:1,week:3,worldRevision:revision,
   canEdit:true,ready:false,day:5,venueId:"arena",
   showName:"Ascension",promotionName:"Chaotic Wrestling Alliance",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[],
   programmeLinks:[],bookableTeams:[],bookableTrios:[],tournamentBouts:[],
   creativeConcerns:[],selectedPeople:people,
   slots:[{slotId:"main",kind:"MATCH",position:0,payload:saved}]
  });
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"genesis",playerId:"owner",csrfToken:"csrf",overview,availablePromotions:[]
  }}));
  await page.route("**/api/card",async r=>{
   const req=r.request().postDataJSON() as Record<string,unknown>;
   if(req.method==="planner")return r.fulfill({json:planner});
   if(req.method==="load")return r.fulfill({json:card()});
   if(req.method==="save"){
    requests.push(req);
    await saveGate;
    saved=(req.matches as Array<{payload:typeof saved}>)[0]!.payload;
    revision++;
    return r.fulfill({json:{status:"APPLIED",revision,result:{showId:"future",matchCount:1}}});
   }
   throw Error("Unexpected World RPC "+String(req.method));
  });
  await page.goto("/#/planner");
  await page.getByRole("button",{name:"Edit card"}).click();
  const update=page.getByRole("button",{name:"Use current signed agreements"});
  await expect(update).toBeVisible();
  await expect(page.locator(".ppw-card-contract-refresh"))
   .toContainText("2 wrestlers have a different eligible agreement");
  const oldScript=saved.scriptedWinnerSide;
  await update.click();
  await expect(update).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Discard unsaved edits"})).toBeVisible();
  // A manager can abandon a renewal correction without changing the saved
  // card, and the same valid offer remains available on reopening.
  page.once("dialog",dialog=>{void dialog.accept();});
  await page.getByRole("button",{name:"Discard unsaved edits"}).click();
  await expect(update).toBeVisible();
  expect(requests).toHaveLength(0);
  await update.click();
  await expect(update).toHaveCount(0);
  expect(saved.participants[0]?.contractId).toBe("old-austin");
  expect(requests).toHaveLength(0);
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  const inFlight=page.getByRole("button",{name:"Saving…"});
  await expect(inFlight).toBeDisabled();
  // A tap while an authoritative save is pending must not enqueue a second
  // command or spend two appearances. Only one request ID leaves the device.
  await inFlight.evaluate((el:HTMLButtonElement)=>el.click());
  expect(requests).toHaveLength(1);
  releaseSave();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]?.expectedRevision).toBe(4);
  expect(saved.participants.map(p=>p.contractId)).toEqual(
   ["new-austin","new-colten","deal-joe","deal-mistico"]);
  expect(saved.scriptedWinnerSide).toBe(oldScript);
  expect(saved.plannedFinish).toBe("CLEAN_PIN");
  await expect(page.locator(".ppw-card-contract-refresh")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
