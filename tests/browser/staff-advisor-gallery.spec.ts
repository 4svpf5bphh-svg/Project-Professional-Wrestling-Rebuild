import {test,expect} from "@playwright/test";
import {mkdir} from "node:fs/promises";

const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
 overview:{world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"Chaotic Wrestling Alliance",
 tier:"LOCAL",cash:5_588_026,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}},
 availablePromotions:[]};
const planner={worldName:"Genesis",promotionName:"Chaotic Wrestling Alliance",
 year:1,week:5,canEdit:true,worldRevision:4,homeMarketId:"home",
 venues:[],venuePressure:[],weeks:[{year:1,week:5,offset:0,required:true,
 major:false,canEdit:true,scheduled:[],shows:[{draftId:"weekly",
 year:1,week:5,status:"DRAFT",eventType:"REGULAR",day:5,
 marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
 ticketStrategy:"STANDARD",ready:false,slots:1,bookingClass:"REGULAR",
 showSeriesId:null,showName:"Ascension"}]}]};
const folder="test-results/presentation-screenshots";
test("Creative's contextual angle advice appears in PPW's real mobile editor",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const method=String(r.request().postDataJSON().method);
  return r.fulfill({json:method==="planner"?planner:method==="load"?{
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:4,
   day:5,venueId:"arena",showName:"Ascension",promotionName:"Chaotic Wrestling Alliance",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",ticketStrategy:"STANDARD",
   championships:[],bookableTeams:[],programmes:[{programmeId:"feud",label:"Samoa Joe vs Místico",
    cast:[{personId:"joe",name:"Samoa Joe"},{personId:"mistico",name:"Místico"}],
    heat:67,repetition:1,activityCount:3,segmentCount:2}],
   programmeLinks:[{slotId:"interview",programmeId:"feud"}],
   advisers:[{role:"CREATIVE",staffId:"staff-creative-001",name:"Jamie Keane"}],
   selectedPeople:[{personId:"out",name:"Blake Howard",division:"MEN",
    presentation:38,stamina:70,safety:80,fatigue:18,wear:12}],
   slots:[{slotId:"interview",kind:"SEGMENT",position:0,payload:{
    kind:"PROMO",outcome:"HAPPENS",actorIds:["out"],targetIds:[],
    participants:[{personId:"out",contractId:"co"}],
    durationMinutes:18
   }}]
  }:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await page.locator(".ppw-card-bar .ppw-expand").first().click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await expect(dialog.locator(".ppw-card-advisor-notes")).toBeVisible();
 await dialog.locator(".ppw-card-advisor-notes summary").click();
 await expect(dialog.getByText("Storyline cast does not appear")).toBeVisible();
 await mkdir(folder,{recursive:true});
 await page.screenshot({path:folder+"/phase23-creative-storyline-advice-390.png"});
});
test("Talent Manager advice is part of the live contract-offer UI and uses real budget math",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const method=String(r.request().postDataJSON().method);
  return r.fulfill({json:method==="wrestlerDirectory"?{
   year:1,week:5,currentWeekIndex:4,worldRevision:4,canEdit:true,
   view:"MARKET",offset:0,hasMore:false,
   offerBudget:{hasTalentManager:true,cash:5_588_026,
    weeklyIncome:124_733,weeklyOverhead:70_000,weeklyGuarantees:35_729,
    weeklyStaffPayroll:12_000,weeklyWageLimit:49_000,cashReserve:1_118_000},
   people:[{personId:"blake",name:"Blake Howard",division:"MEN",
    availability:"FREE_AGENT",interest:"OPEN_TO_TALKS",pendingOffer:false,
    estimatedWeeklyValue:4_700,recognition:40,popularity:56,momentum:31,
    inRingQuality:63,matchCraft:71,presentation:68,morale:72,
    signatureMove:"Springboard Arm Drag",finisherMove:"Tornado DDT"}]
  }:{}});
 });
 await page.goto("/#/market");
 await page.locator(".ppw-directory-card > summary").first().click();
 await page.getByRole("button",{name:"Make contract offer"}).click();
 await expect(page.locator(".ppw-directory-affordability")).toContainText("What this does to your company");
 const input=page.getByLabel("Weekly guarantee ($)");
 await input.fill("18000");
 await input.press("Tab");
 const notes=page.locator(".ppw-directory-adviser");
 await expect(notes).toBeVisible();
 await notes.locator("summary").click();
 await expect(notes).toContainText("wage plan");
 await mkdir(folder,{recursive:true});
 await page.locator(".ppw-directory-affordability").scrollIntoViewIfNeeded();
 await page.screenshot({path:folder+"/phase23-talent-manager-contract-advice-390.png"});
});
