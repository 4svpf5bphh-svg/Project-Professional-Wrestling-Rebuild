import {test,expect} from "@playwright/test";

for(const width of [320,390]){
 test("certified and booked Story Blueprint beats guide real actions at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const session={worldId:"world",playerId:"booker",csrfToken:"csrf",
   overview:{world:{revision:8,name:"Genesis",year:1,week:6,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
    membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
     cash:1000000,debt:0}},availablePromotions:[]};
  const programme={
   programmeId:"joe-riddle",status:"ACTIVE",heat:65,repetition:2,
   activityCount:1,matchCount:0,segmentCount:1,
   sideAWins:0,sideBWins:0,draws:0,
   championshipId:null,startedWeekIndex:3,endedWeekIndex:null,
   sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
   sideB:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
   recentActivity:[],plannedActivity:[{showId:"ascension",slotId:"interrupt",
    kind:"SEGMENT",segmentKind:"INTERRUPTION",scenePurpose:"STEAL_SPOTLIGHT",
    titleMatch:false,stipulationMatch:false,year:1,week:6,
    showName:"Ascension",status:"DRAFT"}],
   eligibleCreativePeople:[],creativeAgreements:[],
   creativeIntent:{blueprintId:"SLOW_BURN_VILLAIN",
    motivation:"Feels overlooked",audienceGoal:"Unease",destination:"PPV"},
   blueprintProgress:{blueprintId:"SLOW_BURN_VILLAIN",
    played:1,booked:1,available:1,suggestedBeatId:"turn",
    beats:[
     {beatId:"resent",status:"PLAYED",playedWeekIndex:4,crowdResponse:73,bookedAt:null},
     {beatId:"line",status:"BOOKED",playedWeekIndex:null,crowdResponse:null,
      bookedAt:{year:1,week:6,showName:"Ascension",submitted:false}},
     {beatId:"turn",status:"AVAILABLE",playedWeekIndex:null,crowdResponse:null,
      bookedAt:null}]}
  };
  const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:6,
   canEdit:true,worldRevision:8,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:6,offset:0,required:true,major:false,
    canEdit:true,scheduled:[],shows:[{draftId:"ascension",
     year:1,week:6,status:"DRAFT",eventType:"REGULAR",day:5,
     marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
     ticketStrategy:"STANDARD",ready:false,slots:1,
     bookingClass:"REGULAR",showSeriesId:null,showName:"Ascension"}]}]};
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const p=r.request().postDataJSON() as {method:string};
   calls.push(p.method);
   if(p.method==="programmes")return r.fulfill({json:{
    year:1,week:6,worldRevision:8,canEdit:true,programmes:[programme],
    people:[],teams:[],championships:[]}});
   if(p.method==="planner")return r.fulfill({json:planner});
   throw Error("Blueprint read must not create a card or call "+p.method);
  });
  await page.goto("/#/programmes");
  await page.getByRole("button",{name:"Plan",exact:true}).click();
  const beats=page.locator(".ppw-programme-next-beats");
  await expect(beats).toContainText("1 performed · 1 booked · 1 still to explore");
  const performed=beats.locator('[data-beat-id="resent"]');
  const booked=beats.locator('[data-beat-id="line"]');
  const available=beats.locator('[data-beat-id="turn"]');
  await expect(performed).toHaveAttribute("data-beat-status","played");
  await expect(performed).toContainText("Performed Y1 W5 · Crowd 73/100");
  await expect(booked).toHaveAttribute("data-beat-status","booked");
  await expect(booked).toContainText("Draft · Ascension · Y1 W6");
  await expect(available).toHaveAttribute("data-beat-status","available");
  await expect(available).toContainText("SUGGESTED NEXT");
  expect(calls).toEqual(["programmes"]);
  await booked.click();
  await expect(page).toHaveURL(/#\/planner$/);
  expect(calls).toEqual(["programmes","planner"],
   "A booked blueprint beat must open the existing plan, not duplicate the angle");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
