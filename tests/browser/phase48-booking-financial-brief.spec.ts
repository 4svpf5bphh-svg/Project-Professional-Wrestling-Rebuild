import {test,expect} from "@playwright/test";
const overview={world:{revision:5,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
 cash:130000,debt:0}};
const session={worldId:"world",playerId:"owner",csrfToken:"secret",
 overview,availablePromotions:[]};
const bookings=[
 {personId:"joe",contractId:"joe-deal"},
 {personId:"mistico",contractId:"mistico-deal"}
];
const bout={matchType:"SINGLES",family:"INDIVIDUAL",participants:bookings,
 sides:[{sideId:"A",participants:[bookings[0]]},
  {sideId:"B",participants:[bookings[1]]}],
 scriptedWinnerSide:"B",plannedFinish:"CLEAN_PIN",intent:"TECHNICAL",
 plannedLengthMinutes:20};
const finance={currentWeekIndex:4,cash:130000,media:14000,sponsor:8000,
 overhead:7000,wages:11000,staff:3000,showTalentLimit:12000,cashReserve:120000};
for(const width of [320,390])test(`Phase 48 ${width}px booking uses actual wages, show cap and known fees without extra Finance read`,async({page})=>{
 await page.setViewportSize({width,height:width===320?740:844});
 const methods:string[]=[];
 const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:5,
  canEdit:true,worldRevision:5,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
    eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
    marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
    ready:false,slots:1,bookingClass:"REGULAR",showSeriesId:null,
    showName:"CWA Ascension"}]}]};
 const view={showId:"weekly",year:1,week:5,canEdit:true,ready:false,
  worldRevision:5,day:5,venueId:"arena",showName:"CWA Ascension",
  promotionName:"CWA",venueName:"Arena",marketName:"Home",
  bookingClass:"REGULAR",ticketStrategy:"STANDARD",
  bookingFinancials:finance,championships:[],programmes:[],programmeLinks:[],
  selectedPeople:[
   {personId:"joe",name:"Samoa Joe",division:"MEN",appearanceFee:9000,
    contractId:"joe-deal",stamina:35,safety:40,fatigue:80,wear:85},
   {personId:"mistico",name:"Mistico",division:"MEN",appearanceFee:8000,
    contractId:"mistico-deal",stamina:85,safety:83,fatigue:18,wear:15}
  ],advisers:[{role:"ROAD_AGENT",name:"Alex Agent",staffId:"agent"}],
  slots:[{slotId:"main",kind:"MATCH",position:0,payload:bout}]};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as {method:string};
  methods.push(req.method);
  return r.fulfill({json:req.method==="planner"?planner:req.method==="load"?view:
   req.method==="talent"?{talent:[],cursor:null}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 const costs=page.locator(".ppw-card-appearance-cost");
 await expect(costs.locator("summary")).toContainText("Show talent fees · $17,000");
 await costs.locator("summary").click();
 await expect(costs).toContainText("Show talent limit");
 await expect(costs).toContainText("$12,000");
 await expect(costs).toContainText("Wages + staff / week");
 await expect(costs).toContainText("$14,000");
 await expect(costs).toContainText("4-week baseline");
 await expect(costs).toContainText("8-week baseline");
 await expect(costs).toContainText("Known fees exceed the show talent limit");
 await expect(costs).toContainText("selected cash reserve");
 await expect(costs).toContainText("Excludes tickets, venues, production, travel");
 expect(methods).toEqual(["planner","load"]); // No separate Finance RPC
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
