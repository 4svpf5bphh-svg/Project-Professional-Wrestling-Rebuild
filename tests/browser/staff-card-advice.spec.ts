import {test,expect} from "@playwright/test";

const joe={personId:"joe",contractId:"deal-joe"};
const mistico={personId:"mistico",contractId:"deal-mistico"};
const match={matchType:"SINGLES",family:"INDIVIDUAL",
 participants:[joe,mistico],sides:[{sideId:"A",participants:[joe]},
 {sideId:"B",participants:[mistico]}],scriptedWinnerSide:"A",
 plannedFinish:"RETRIEVAL",stipulation:"TLC",
 intent:"COMPETITIVE",plannedLengthMinutes:35};
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:1_000_000,
 debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"csrf",overview,availablePromotions:[]};
const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:5,
 canEdit:true,worldRevision:4,homeMarketId:"home",venues:[],venuePressure:[],
 weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
 scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
 eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
 marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
 ready:false,slots:1,bookingClass:"REGULAR",showSeriesId:null,showName:"Ascension"}]}]};

test("390px iPhone gets contextual Road Agent, referee and medical warnings without a staff page read",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const method=String(r.request().postDataJSON().method);methods.push(method);
  return r.fulfill({json:method==="planner"?planner:method==="load"?{
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:4,
   day:5,venueId:"arena",showName:"Ascension",promotionName:"CWA",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
   advisers:[{role:"ROAD_AGENT",staffId:"a"},{role:"MEDICAL",staffId:"b"},
    {role:"REFEREE",staffId:"c"}],
   selectedPeople:[
    {personId:"joe",name:"Samoa Joe",division:"MEN",stamina:34,
     safety:42,fatigue:78,wear:82,inRingQuality:73,matchCraft:48,presentation:82},
    {personId:"mistico",name:"Mistico",division:"MEN",stamina:83,
     safety:85,fatigue:12,wear:17,inRingQuality:91,matchCraft:84,presentation:88}
   ],
   slots:[{slotId:"main",kind:"MATCH",position:0,payload:match}]
  }:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.locator(".ppw-card-crew-strip")).toContainText("booking concerns");
 await page.locator(".ppw-card-bar .ppw-expand").first().click();
 const dialog=page.getByRole("dialog",{name:"Edit match"});
 await expect(dialog.locator(".ppw-card-advisor-notes")).toBeVisible();
 await dialog.locator(".ppw-card-advisor-notes summary").click();
 await expect(dialog.getByText("This is a demanding match")).toBeVisible();
 await expect(dialog.getByText("Watch cumulative wear")).toBeVisible();
 await expect(dialog.getByText("Risky stipulation and safety concerns")).toBeVisible();
 await expect(dialog).toContainText("Samoa Joe");
 expect(methods).toEqual(["planner","load"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
