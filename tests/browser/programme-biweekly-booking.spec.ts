import {test,expect} from "@playwright/test";

/** A story booking may only use a genuine due programme broadcast or PPV.
 * Alternate-week television must never create a phantom weekly card. */
for(const width of [320,390])for(const alreadyPlanned of [true,false]){
 test("biweekly Programme chapter "+(alreadyPlanned?"reopens":"plans")+
  " the next licensed show at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const session={worldId:"world",playerId:"booker",csrfToken:"csrf",
   overview:{world:{revision:8,name:"Genesis",year:1,week:7,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
    membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
     cash:1000000,debt:0}},availablePromotions:[]};
  const programme={programmeId:"joe-riddle",status:"ACTIVE",heat:55,repetition:3,
   activityCount:1,matchCount:1,segmentCount:0,sideAWins:1,sideBWins:0,draws:0,
   championshipId:null,startedWeekIndex:2,endedWeekIndex:null,
   sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
   sideB:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
   recentActivity:[],plannedActivity:[],eligibleCreativePeople:[],creativeAgreements:[],
   creativeIntent:{blueprintId:"SLOW_BURN_VILLAIN",
    motivation:"Feels overlooked",audienceGoal:"Unease",destination:"PPV"}};
  const cast=[{personId:"joe",name:"Samoa Joe",side:"A",contractId:"joe-deal"},
   {personId:"riddle",name:"Matt Riddle",side:"B",contractId:"riddle-deal"}];
  const story={programmeId:"joe-riddle",label:"Samoa Joe vs Matt Riddle",
   heat:55,repetition:3,activityCount:1,segmentCount:0,cast};
  const venue={venueId:"arena",marketId:"home",marketName:"Home",name:"Arena",
   capacity:1000,weeklyHireCost:3000,prestige:60,productionSuitability:70,
   awareness:55,liveStrength:55,loyalty:55,audiencePotential:55,
   wrestlingInterest:55,spendingIndex:55,strongestRival:null,home:true};
  const tv={seriesId:"ascension-series",name:"Ascension",role:"FLAGSHIP",
   eventType:"REGULAR",cadenceWeeks:2,anchorWeek:7,importance:70,active:true};
  const draft={draftId:"ascension-w8",year:1,week:8,status:"DRAFT",
   eventType:"REGULAR",bookingClass:"REGULAR",showSeriesId:"ascension-series",
   showName:"Ascension",day:5,marketId:"home",venueId:"arena",
   marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",ready:false,slots:0};
  let created=alreadyPlanned,revision=8;
  const calls:string[]=[];
  const planner=()=>({worldName:"Genesis",promotionName:"CWA",year:1,week:7,
   canEdit:true,worldRevision:revision,homeMarketId:"home",
   venues:[venue],venuePressure:[],
   weeks:[{year:1,week:7,offset:0,required:false,major:false,
     canEdit:true,scheduled:[],shows:[]},
    {year:1,week:8,offset:1,required:true,major:false,
     canEdit:true,scheduled:[tv],shows:created?[draft]:[]},
    {year:1,week:9,offset:2,required:false,major:false,
     canEdit:true,scheduled:[],shows:[]}]});
  const joe={personId:"joe",contractId:"joe-deal"};
  const riddle={personId:"riddle",contractId:"riddle-deal"};
  const match={matchType:"SINGLES",family:"INDIVIDUAL",participants:[joe,riddle],
   sides:[{sideId:"A",participants:[joe]},{sideId:"B",participants:[riddle]}],
   scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:18};
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const body=route.request().postDataJSON() as Record<string,unknown>;
   const method=String(body.method);calls.push(method);
   if(method==="programmes")return route.fulfill({json:{
    year:1,week:7,worldRevision:revision,canEdit:true,
    people:[],teams:[],championships:[],programmes:[programme]}});
   if(method==="planner")return route.fulfill({json:planner()});
   if(method==="planShow"){
    expect(body).toMatchObject({year:1,week:8,showSeriesId:"ascension-series",
     eventType:"REGULAR",day:5,venueId:"arena"});
    expect(created).toBe(false);
    created=true;revision++;
    return route.fulfill({json:{status:"APPLIED",revision,
     result:{draftId:"ascension-w8",status:"CREATED"}}});
   }
   if(method==="load"){
    expect(body.showId).toBe("ascension-w8");
    return route.fulfill({json:{
     showId:"ascension-w8",year:1,week:8,canEdit:true,ready:false,
     worldRevision:revision,day:5,venueId:"arena",showName:"Ascension",
     promotionName:"CWA",venueName:"Arena",marketName:"Home",
     bookingClass:"REGULAR",ticketStrategy:"STANDARD",
     championships:[],programmes:[story],programmeLinks:[],
     selectedPeople:[{personId:"joe",name:"Samoa Joe",division:"MEN",
      contractId:"joe-deal",alignment:"FACE"},
      {personId:"riddle",name:"Matt Riddle",division:"MEN",
       contractId:"riddle-deal",alignment:"HEEL"}],
     slots:[{slotId:"bout",kind:"MATCH",position:0,payload:match}]
    }});
   }
   if(method==="kpWorkspace")return route.fulfill({json:{entitlements:[]}});
   if(method==="talent")return route.fulfill({json:{talent:[{
    personId:"joe",name:"Samoa Joe",contractId:"joe-deal",
    division:"MEN",available:true,reason:"AVAILABLE",remainingDates:8,
    popularity:78,recognition:76,momentum:65,
    inRingQuality:88,matchCraft:87,presentation:83}],cursor:null}});
   throw Error("Unexpected authenticated method "+method);
  });
  await page.goto("/#/programmes");
  await page.getByRole("button",{name:"Plan",exact:true}).click();
  const beats=page.locator(".ppw-programme-next-beats");
  await beats.getByRole("button",{name:/Show signs of frustration/}).click();
  if(!alreadyPlanned){
   await expect(page).toHaveURL(/#\/planner$/);
   await expect(page.getByRole("button",{name:"Save show"})).toBeVisible();
   await expect(page.getByText("Booking: Ascension")).toBeVisible();
   // The owner must confirm a real World planning request; selecting a
   // blueprint alone has not created an off-week card or charged anyone.
   expect(calls.filter(x=>x==="planShow")).toHaveLength(0);
   await page.getByRole("button",{name:"Save show"}).click();
  }
  await expect(page).toHaveURL(/#\/card$/);
  await expect(page.getByRole("dialog",{name:"Edit angle"})).toBeVisible();
  expect(calls.filter(x=>x==="planShow")).toHaveLength(alreadyPlanned?0:1);
  expect(calls.filter(x=>x==="load")).toHaveLength(1);
  // No extra overview/world read, no AI call, no fabricated off-week show.
  expect(calls).not.toContain("overview");
  expect(calls).not.toContain("groq");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
