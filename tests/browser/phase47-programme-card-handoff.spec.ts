import {test,expect} from "@playwright/test";

for(const width of [320,390])test(`Phase 47 ${width}px: wrestler-led rivalry enters the real current-week card and survives Back/Forward`,async({page})=>{
 await page.setViewportSize({width,height:width===320?730:844});
 const session={worldId:"world",playerId:"booker",csrfToken:"secret",
  overview:{world:{revision:14,name:"Genesis",year:1,week:6,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
    cash:500000,debt:0}},availablePromotions:[]};
 const story={programmeId:"joe-riddle",status:"ACTIVE",heat:72,repetition:4,
  activityCount:2,matchCount:1,segmentCount:1,sideAWins:1,sideBWins:0,draws:0,
  championshipId:null,startedWeekIndex:1,endedWeekIndex:null,
  sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
  sideB:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
  wrestlerOrigin:{requestId:"pitch:1",initiatorId:"joe",opponentId:"riddle",
   acceptedWeekIndex:1,recordedWeekIndex:2,previousCertifiedMeetings:2},
  medicalHolds:[],recentActivity:[],plannedActivity:[],finale:null,
  latestFollowUp:null,eligibleCreativePeople:[],creativeAgreements:[]};
 const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:6,
  canEdit:true,worldRevision:14,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:6,offset:0,required:true,major:false,
   canEdit:true,scheduled:[],shows:[{draftId:"ascension",year:1,week:6,
    status:"DRAFT",eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
    marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
    ready:false,slots:0,bookingClass:"REGULAR",showSeriesId:null,
    showName:"CWA Ascension"}]}]};
 const cardProgrammes=[
  {programmeId:"other",label:"Different Story",heat:35,repetition:1,
   activityCount:1,segmentCount:0,cast:[]},
  {programmeId:"joe-riddle",label:"Samoa Joe vs Matt Riddle",
   heat:72,repetition:4,activityCount:2,segmentCount:1,
   cast:[{personId:"joe",name:"Samoa Joe",side:"A",contractId:"joe-deal"},
    {personId:"riddle",name:"Matt Riddle",side:"B",contractId:"riddle-deal"}]}
 ];
 const card={showId:"ascension",year:1,week:6,canEdit:true,ready:false,
  worldRevision:14,day:5,venueId:"arena",showName:"CWA Ascension",
  promotionName:"CWA",venueName:"Arena",marketName:"Home",
  bookingClass:"REGULAR",ticketStrategy:"STANDARD",
  championships:[],programmes:cardProgrammes,programmeLinks:[],
  selectedPeople:[{personId:"joe",name:"Samoa Joe",division:"MEN"},
   {personId:"riddle",name:"Matt Riddle",division:"MEN"}],slots:[]};
 const calls:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as {method:string};
  calls.push(req.method);
  const method=req.method;
  if(method==="programmes")return r.fulfill({json:{year:1,week:6,
   worldRevision:14,canEdit:true,people:[],teams:[],championships:[],
   programmes:[story]}});
  if(method==="planner")return r.fulfill({json:planner});
  if(method==="load")return r.fulfill({json:card});
  return r.fulfill({json:{}});
 });
 await page.goto("/#/programmes");
 await expect(page.locator(".ppw-programme-wrestler-idea")).toContainText("Samoa Joe");
 await page.getByRole("button",{name:"Book next chapter"}).click();
 await expect.poll(()=>page.evaluate(()=>location.hash)).toBe("#/card");
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 const selected=page.locator(".ppw-card-rivalry-pick[aria-pressed='true']");
 await expect(selected).toHaveText("Samoa Joe vs Matt Riddle");
 expect(calls).toContain("planner");
 expect(calls).toContain("load");
 expect(calls).not.toContain("save");
 expect(calls).not.toContain("saveCard");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
 await page.goBack();
 await expect.poll(()=>page.evaluate(()=>location.hash)).toBe("#/planner");
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await page.goForward();
 await expect.poll(()=>page.evaluate(()=>location.hash)).toBe("#/card");
 await expect(page.locator(".ppw-card-rivalry-pick[aria-pressed='true']"))
  .toHaveText("Samoa Joe vs Matt Riddle");
 await page.reload();
 await expect(page.locator(".ppw-card-rivalry-pick[aria-pressed='true']"))
  .toHaveText("Samoa Joe vs Matt Riddle");
 expect(calls).not.toContain("save");
});
