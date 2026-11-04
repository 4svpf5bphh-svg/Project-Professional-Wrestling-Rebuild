import {test,expect} from "@playwright/test";

const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
 overview:{world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"Chaotic Wrestling Alliance",
 tier:"LOCAL",cash:5_000_000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}},
 availablePromotions:[]};
const roster={view:"ROSTER",year:1,week:5,currentWeekIndex:4,
 worldRevision:4,canEdit:true,hasMore:false,
 people:[{personId:"alice",name:"Alice Vale",ringName:"Alice Vale",
  division:"WOMEN",availability:"YOUR_ROSTER",family:"LIMITED_NON_EXCLUSIVE",
  startsInWeeks:0,remainingDates:3,weeksRemaining:26,weeklyGuarantee:5000,
  appearanceFee:12000,popularity:75,recognition:70,momentum:65,
  inRingQuality:84,matchCraft:81,presentation:82,morale:75,
  roleExpectation:"MAIN_EVENT"}]};
const dossier={personId:"alice",name:"Alice Vale",division:"WOMEN",status:"ACTIVE",
 careerStage:"PRIME",popularity:75,recognition:70,momentum:65,morale:75,
 inRingQuality:84,matchCraft:81,presentation:82,stamina:82,safety:90,
 fatigue:5,wear:4,alignment:"FACE",canEdit:true,onYourRoster:true,
 sharedHuman:false,currentWeekIndex:4,worldRevision:4,
 persona:{personaName:"Alice Vale",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
  secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
 contracts:[{promotionId:"cwa",promotion:"Chaotic Wrestling Alliance",isYours:true,
  family:"LIMITED_NON_EXCLUSIVE",role:"MAIN_EVENT",remainingDates:3,
  startWeekIndex:0,expiresWeekIndex:29,weeklyGuarantee:5000,
  appearanceFee:12000,creativeControl:"NONE"}],
 teams:[],stables:[],connections:[],history:[]};
const week={year:1,week:5,offset:0,required:true,major:false,canEdit:true,
 scheduled:[],shows:[{draftId:"week5-card",year:1,week:5,status:"DRAFT",
  eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
  marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
  ready:false,slots:0,bookingClass:"REGULAR",showSeriesId:null,
  showName:"Ascension"}]};
const planner={worldName:"Genesis",promotionName:"Chaotic Wrestling Alliance",
 year:1,week:5,worldRevision:4,canEdit:true,homeMarketId:"home",
 venues:[],weeks:[week]};
const card={showId:"week5-card",year:1,week:5,worldRevision:4,
 canEdit:true,ready:false,day:5,venueId:"arena",showName:"Ascension",
 promotionName:"Chaotic Wrestling Alliance",venueName:"Arena",marketName:"Home",
 bookingClass:"REGULAR",ticketStrategy:"STANDARD",championships:[],
 programmes:[],programmeLinks:[],bookableTeams:[],bookableTrios:[],
 advisers:[],selectedPeople:[],slots:[]};
async function mock(page:import("@playwright/test").Page,settings?:{
 availability?:"AVAILABLE"|"INJURED";hasDraft?:boolean;
}){
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  calls.push(method);
  const data=method==="wrestlerDirectory"?roster:
   method==="wrestlerProfile"?dossier:
   method==="planner"?{...planner,weeks:[{
    ...week,shows:settings?.hasDraft===false?[]:week.shows}]}:
   method==="load"?card:
   method==="backstage"?{
    personId:"alice",personName:"Alice Vale",worldYear:1,worldWeek:5,
    worldRevision:4,canEdit:true,roster:[{personId:"alice",
     name:"Alice Vale",isCurrent:true,morale:75,momentum:65,
     lastMessage:null,latestIncoming:null}],persona:null,archetypes:[],
    history:[],memories:[],recentRequests:[],nextPitchWeek:0,
    documentedAlternates:[],conversations:[]
   }:
   method==="talent"?{talent:[{personId:"alice",contractId:"deal-alice",
    name:"Alice Vale",division:"WOMEN",available:settings?.availability!=="INJURED",
    reason:settings?.availability??"AVAILABLE",medicalWeeksRemaining:
     settings?.availability==="INJURED"?3:null,
    remainingDates:3,appearanceFee:12000,
    popularity:75,recognition:70,momentum:65,inRingQuality:84,
    matchCraft:81,presentation:82,stamina:82,safety:90,fatigue:5,wear:4}],
    cursor:null}: {};
  return route.fulfill({json:data});
 });
 return calls;
}
async function openFromDossier(page:import("@playwright/test").Page){
 await page.goto("/#/roster");
 const wrestler=page.locator(".ppw-directory-card").first();
 await wrestler.locator("summary").click();
 await wrestler.getByRole("button",{name:"Wrestler profile →"}).click();
 const dossierDialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dossierDialog.getByRole("button",{name:"Book on this week's show"})).toBeVisible();
 await dossierDialog.getByRole("button",{name:"Book on this week's show"}).click();
 await expect(dossierDialog).toHaveCount(0);
}
test("320px dossier sends the right wrestler into a real unfinished show, casts a match only after server rights check",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const calls=await mock(page);
 await openFromDossier(page);
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 const focused=page.locator(".ppw-card-wrestler-focus");
 await expect(focused).toContainText("Alice Vale");
 expect(calls).toEqual(["wrestlerDirectory","wrestlerProfile","planner","load"]);
 await focused.getByRole("button",{name:"Start a match"}).click();
 await expect(focused).toHaveCount(0);
 const editor=page.getByRole("dialog",{name:"Edit match"});
 await expect(editor).toBeVisible();
 await expect(editor).toContainText("Alice Vale");
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
 expect(calls).not.toContain("save");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
test("dossier-based promo is explicitly unsaved and does not bypass the angle editor",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls=await mock(page);
 await openFromDossier(page);
 const focused=page.locator(".ppw-card-wrestler-focus");
 await focused.getByRole("button",{name:"Start a promo"}).click();
 const editor=page.getByRole("dialog",{name:"Edit angle"});
 await expect(editor).toBeVisible();
 await expect(editor).toContainText("Alice Vale");
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
 expect(calls).not.toContain("save");
});
test("dossier shortcut refuses an injured show-week wrestler without writing or creating a slot",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const calls=await mock(page,{availability:"INJURED"});
 await openFromDossier(page);
 await page.locator(".ppw-card-wrestler-focus").getByRole("button",{name:"Start a match"}).click();
 await expect(page.locator(".ppw-alert.ppw-error"))
  .toContainText("cannot be booked for this show's week");
 await expect(page.locator(".ppw-card-wrestler-focus")).toBeVisible();
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(0);
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
 expect(calls).not.toContain("save");
});
test("no unfinished card sends dossier back to planner rather than inventing a draft",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls=await mock(page,{hasDraft:false});
 await openFromDossier(page);
 await expect(page).toHaveURL(/#\/planner\/card$/);
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await expect(page.getByText(/There isn't an unfinished show card this week/)).toBeVisible();
 expect(calls).toEqual(["wrestlerDirectory","wrestlerProfile","planner"]);
});

for(const width of [320,390]){
 test(width+"px dossier → Backstage always exposes a safe return action",async({page})=>{
  await page.setViewportSize({width,height:740});
  const calls=await mock(page);
  await page.goto("/#/roster");
  const wrestler=page.locator(".ppw-directory-card").first();
  await wrestler.locator("summary").click();
  await wrestler.getByRole("button",{name:"Wrestler profile →"}).click();
  const dossier=page.getByRole("dialog",{name:"Wrestler dossier"});
  await dossier.getByRole("button",{name:"Talk in Backstage"}).click();
  await expect(page).toHaveURL(/#\/backstage$/);
  const leave=page.getByRole("button",{name:"‹ Leave Backstage"});
  await expect(leave).toBeVisible();
  const position=await leave.boundingBox();
  expect(position).not.toBeNull();
  expect(position!.y).toBeGreaterThanOrEqual(0);
  expect(position!.y+position!.height).toBeLessThan(150);
  expect(position!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
  expect(calls).toContain("backstage");
  await leave.click();
  await expect(page).toHaveURL(/#\/roster$/);
 });
}
