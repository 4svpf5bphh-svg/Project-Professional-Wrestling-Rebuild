import {test,expect,type Page} from "@playwright/test";

const session={worldId:"world",playerId:"manager",csrfToken:"csrf",
 overview:{world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"company",name:"Chaotic Wrestling Alliance",
   tier:"LOCAL",cash:5_000_000,debt:0,lastWeeklyNet:0,
   financialDistress:"HEALTHY"}},availablePromotions:[]};
const week={year:1,week:5,offset:0,required:true,canEdit:true,major:false,
 scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
  eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
  marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",ready:false,
  slots:0,bookingClass:"REGULAR",showSeriesId:null,showName:"Ascension"}]};
const planner={worldName:"Genesis",promotionName:"Chaotic Wrestling Alliance",
 year:1,week:5,worldRevision:4,canEdit:true,homeMarketId:"home",venues:[],weeks:[week]};
const talent=[
 {personId:"joe",contractId:"c-joe",name:"Samoa Joe",division:"MEN",
  alignment:"HEEL",available:true,reason:"AVAILABLE",remainingDates:18,
  popularity:86,recognition:89,momentum:62,inRingQuality:75,matchCraft:46,
  presentation:44,stamina:34,safety:42,fatigue:78,wear:82,appearanceFee:11000},
 {personId:"mistico",contractId:"c-mistico",name:"Místico",division:"MEN",
  alignment:"FACE",available:true,reason:"AVAILABLE",remainingDates:20,
  popularity:91,recognition:91,momentum:70,inRingQuality:90,matchCraft:90,
  presentation:85,stamina:91,safety:84,fatigue:6,wear:12,appearanceFee:16000}
];
const card={showId:"weekly",year:1,week:5,worldRevision:4,
 canEdit:true,ready:false,day:5,venueId:"arena",showName:"Ascension",
 promotionName:"Chaotic Wrestling Alliance",venueName:"Arena",marketName:"Home",
 bookingClass:"REGULAR",ticketStrategy:"STANDARD",
 championships:[],programmes:[],programmeLinks:[],bookableTeams:[],
 bookableTrios:[],selectedPeople:[],slots:[],
 advisers:[{role:"ROAD_AGENT",name:"Derek James",staffId:"agent"},
  {role:"MEDICAL",name:"Dr Singh",staffId:"doctor"},
  {role:"REFEREE",name:"Mark Reid",staffId:"ref"},
  {role:"CREATIVE",name:"Emma Cross",staffId:"creative"}]};
async function stub(page:Page){
 const calls:string[]=[];
 const saved:unknown[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string;matches?:unknown[];segments?:unknown[]};
  calls.push(req.method);
  if(req.method==="save"){
   saved.push({matches:req.matches,segments:req.segments});
   return route.fulfill({json:{status:"APPLIED",result:{showId:"weekly"}}});
  }
  const data=req.method==="planner"?planner:req.method==="load"?card:
   req.method==="talent"?{talent,cursor:null}:{};
  return route.fulfill({json:data});
 });
 return {calls,saved};
}
async function goToCard(page:Page){
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
}
test("320px: a match moves through format, both sides, outcome and named crew briefing before reaching the card",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add match"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.getByText("STEP 1 OF 4 · SETUP")).toBeVisible();
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(0);
 await dialog.getByRole("button",{name:"Ladder Match"}).click();
 await expect(dialog.locator(".ppw-guide-rules-brief")).toContainText("physical risk");
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await expect(dialog.getByText("STEP 2 OF 4 · CAST")).toBeVisible();
 await dialog.getByRole("button",{name:"Choose wrestler"}).first().click();
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await expect(picker.locator(".ppw-picker-side-tabs .ppw-picker-side-tab")).toHaveCount(2);
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(2);
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.getByRole("button",{name:"Fatigued 65+"}).click();
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(1);
 await picker.locator(".ppw-wrestler-card").first().click();
 await expect(picker.locator('.ppw-picker-side-tab[aria-pressed="true"]')).toContainText("Side B");
 await expect(picker.locator(".ppw-wrestler-card")).toHaveCount(1);
 await picker.getByRole("button",{name:"Heel",exact:true}).click();
 await picker.getByRole("button",{name:"Fatigued 65+"}).click();
 await picker.locator(".ppw-wrestler-card").first().click();
 await expect(picker).toHaveCount(0);
 await expect(dialog.locator(".ppw-guide-crew-pulse")).toContainText("Watch cumulative wear");
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await expect(dialog.getByText("STEP 3 OF 4 · SCRIPT")).toBeVisible();
 await dialog.getByLabel("Minutes").fill("30");
 await dialog.getByLabel("Minutes").press("Tab");
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 await expect(dialog.getByText("STEP 4 OF 4 · REVIEW")).toBeVisible();
 const review=dialog.locator(".ppw-guide-staff-review");
 await expect(review).toContainText("Derek James");
 await expect(review).toContainText("Dr Singh");
 await expect(review).toContainText("Mark Reid");
 await expect(review).toContainText("This is a demanding match");
 await expect(review).toContainText("Watch cumulative wear");
 await expect(review).toContainText("Risky stipulation and safety concerns");
 await expect(review).toContainText("Potential appearance fees");
 await expect(review).toContainText("does not establish whether they have good or bad chemistry");
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
 expect(saved).toHaveLength(0);
 await dialog.getByRole("button",{name:"Complete match"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-card-matchup")).toBeVisible();
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
 await page.getByRole("button",{name:"Save changes"}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(saved).toHaveLength(1);
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
});
test("390px: cancelling a new match or scene leaves no phantom running-order slot",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add match"}).click();
 let dialog=page.getByRole("dialog",{name:"Edit match"});
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(0);
 await expect(page.getByText("Unsaved changes")).toHaveCount(0);
 await page.getByRole("button",{name:"+ Add angle"}).click();
 dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.getByLabel("Creative direction").selectOption("TURN");
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(0);
 expect(saved).toHaveLength(0);
});
test("390px: an angle also has a meaningful Creative team review before completion",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {calls,saved}=await stub(page);
 await goToCard(page);
 await page.getByRole("button",{name:"+ Add angle"}).click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await dialog.getByLabel("Creative direction").selectOption("TURN");
 await dialog.getByRole("button",{name:"Continue · Select wrestlers"}).click();
 await dialog.getByRole("button",{name:"+ Add performer"}).click();
 const picker=page.getByRole("dialog",{name:"Choose wrestler"});
 await picker.locator(".ppw-wrestler-card").nth(1).click();
 await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
 await dialog.getByLabel("Angle duration (minutes)").selectOption("20");
 await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
 const review=dialog.locator(".ppw-guide-staff-review");
 await expect(review).toContainText("Emma Cross");
 await expect(review).toContainText("Long scene, limited presentation strength");
 await dialog.getByRole("button",{name:"Complete angle"}).click();
 await expect(page.locator(".ppw-card[data-booking-slot-id]")).toHaveCount(1);
 expect(saved).toHaveLength(0);
 expect(calls.filter(x=>x==="talent")).toHaveLength(1);
});
