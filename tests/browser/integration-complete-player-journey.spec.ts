import {test,expect} from "@playwright/test";

/** Combined, owner-authenticated PPW browser journey through the real host
 * and original game components, not mock DOM. Only server RPCs are fixtures.
 * The confirmed PPV and due TV show coexist in the same week, while one
 * sequential rival angle goes through a genuine save and reopen.
 * This deliberately never advances the World or deploys anything. */
for(const width of [320,390]){
 test("integrated Home → annual TV + PPV → actual card → scripted Programme at "+width+"px",
 async({page})=>{
  await page.setViewportSize({width,height:844});
  const joe={personId:"joe",contractId:"joe-deal"};
  const riddle={personId:"riddle",contractId:"riddle-deal"};
  const world={id:"world",revision:42,name:"Genesis",year:1,week:33,
   phase:"OPEN",day:3,nextLockEpoch:Date.now()/1000+5000,
   serverEpoch:Date.now()/1000};
  const promotion={id:"cwa",name:"Chaotic Wrestling Alliance",tier:"LOCAL",
   cash:1200000,debt:0,lastWeeklyNet:45000,financialDistress:"HEALTHY",
   homeMarketName:"Home",broadcastPackageStyle:"LUCHA_FIESTA",
   promoterPrestige:{rank:"RISING PROMOTER",earnedCount:4,total:47,prestigeScore:62},
   nextShow:{year:1,week:33,showName:"Ascension",ready:false,status:"DRAFT"},
   attention:{plannedShows:1,unpreparedShow:true,pendingBackstage:false,
    backstageUnreadCount:0,expiringTalent:false,pendingContractOffers:false}};
  const overview={world,membership:"ACTIVE" as const,promotion};
  const session={worldId:"world",playerId:"booker",csrfToken:"test-csrf",
   overview,availablePromotions:[]};
  const tv={seriesId:"ascension-series",name:"Ascension",role:"FLAGSHIP",
   eventType:"REGULAR",cadenceWeeks:2,anchorWeek:0,importance:72,active:true};
  const premium={seriesId:"premium",name:"Extreme Warfare",role:"PREMIUM",
   eventType:"MAJOR",cadenceWeeks:52,anchorWeek:32,importance:88,active:true};
  const tvDraft={draftId:"week33-tv",year:1,week:33,bookingClass:"REGULAR",
   showSeriesId:"ascension-series",showName:"Ascension",status:"DRAFT",
   day:4,venueName:"Home Arena",marketName:"Home",ready:false};
  const ppvEdition={draftId:"week33-ppv",year:1,week:33,showSeriesId:"premium",
   showName:"The Lottery",status:"SUBMITTED",ready:true,certified:false};
  const calendar={promotionId:"cwa",promotionName:"Chaotic Wrestling Alliance",
   year:1,week:33,worldRevision:42,canEdit:true,series:[tv,premium],
   broadcastSlot:{offerCode:"network",networkName:"VibeFlix",
    day:4,hour:20,startWeekIndex:0,endWeekIndex:51},
   bookings:[tvDraft],premiumEditions:[ppvEdition],
   annual:{tier:"LOCAL",policyStartYear:1,
    policy:{minimum:2,maximum:4,recommended:3,minGap:8},
    years:[{year:1,confirmed:true,
     events:[{seriesId:"premium",week:33,name:"Lottery Night"}],
     suggested:[{seriesId:"premium",week:33,name:"Lottery Night"}]},
     {year:2,confirmed:false,events:[],suggested:[]}]},
   weeks:[{year:1,week:33,offset:0,shows:[tv,premium]}],worldWeeks:[]};
  const match={matchType:"SINGLES",family:"INDIVIDUAL",participants:[joe,riddle],
   sides:[{sideId:"A",participants:[joe]},{sideId:"B",participants:[riddle]}],
   scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:16};
  let segment:Record<string,unknown>={
   kind:"ATTACK",actorIds:["joe"],targetIds:["riddle"],outcome:"HAPPENS",
   participants:[joe,riddle],durationMinutes:5,
   creativeBeat:{kind:"ATTACK",presentation:"BLINDSIDE",objective:"GENERATE_HEAT"},
   scene:{location:"BACKSTAGE",visual:"NONE",purpose:"BUILD_RIVALRY",
    intensity:"BEATDOWN"}
  };
  let revision=42,sessionReads=0;
  const calls:string[]=[];
  const story={programmeId:"feud",label:"Samoa Joe vs Matt Riddle",
   heat:52,repetition:2,activityCount:1,segmentCount:0,
   cast:[{personId:"joe",name:"Samoa Joe",side:"A",contractId:"joe-deal"},
    {personId:"riddle",name:"Matt Riddle",side:"B",contractId:"riddle-deal"}]};
  const card=()=>({showId:"week33-tv",year:1,week:33,worldRevision:revision,
   canEdit:true,ready:false,day:4,venueId:"arena",showName:"Ascension",
   promotionName:"Chaotic Wrestling Alliance",venueName:"Home Arena",
   marketName:"Home",bookingClass:"REGULAR",ticketStrategy:"STANDARD",
   championships:[],programmes:[story],
   programmeLinks:[{slotId:"angle",programmeId:"feud"}],
   selectedPeople:[{personId:"joe",name:"Samoa Joe",division:"MEN",
    contractId:"joe-deal"},{personId:"riddle",name:"Matt Riddle",
    division:"MEN",contractId:"riddle-deal"}],
   slots:[{slotId:"bout",kind:"MATCH",position:0,payload:match},
    {slotId:"angle",kind:"SEGMENT",position:1,payload:segment}]});
  await page.route("**/api/session",r=>{
   sessionReads++;return r.fulfill({json:session});
  });
  await page.route("**/api/card",r=>{
   const body=r.request().postDataJSON() as Record<string,unknown>;
   const method=String(body.method);calls.push(method);
   if(method==="overview")return r.fulfill({json:overview});
   if(method==="calendar")return r.fulfill({json:calendar});
   if(method==="load"){
    expect(body.showId).toBe("week33-tv");
    return r.fulfill({json:card()});
   }
   if(method==="kpWorkspace")return r.fulfill({json:{entitlements:[]}});
   if(method==="save"){
    const saved=body.segments as {slotId:string;programmeId:string;
     payload:Record<string,unknown>}[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({slotId:"angle",programmeId:"feud"});
    segment=saved[0]!.payload;
    expect(segment.actorIds).toEqual(["joe"]);
    expect(segment.targetIds).toEqual(["riddle"]);
    expect(segment.scriptedActions).toMatchObject([
     {action:"SPEAK",by:"joe",line:"The truth comes out tonight."},
     {action:"REPLY",by:"riddle",to:"joe"},
     {action:"ATTACK",by:"joe",to:"riddle"}]);
    revision++;
    return r.fulfill({json:{status:"APPLIED",result:{performers:2}}});
   }
   throw Error("Unexpected authenticated integration RPC: "+method);
  });

  // Phase 57: true Home, prestige, booking, broadcast KP and bottom drawer.
  await page.goto("/#/home");
  await expect(page.locator(".ppw-home-phase-tag")).toHaveText("WORLD OPEN");
  await expect(page.getByRole("button",{name:/BOOKING OPEN/})).toBeVisible();
  await expect(page.locator(".ppw-home-show-spotlight .ppw-tv-frame"))
   .toHaveAttribute("data-broadcast-package","luchafiesta");
  await page.getByRole("button",{name:"Open Plan menu"}).click();
  const drawer=page.getByRole("navigation",{name:"Promotion navigation"});
  await drawer.getByRole("button",{name:/Calendar/}).click();
  await expect(page).toHaveURL(/#\/calendar$/);

  // Phase 60: one combined real week, a contract-locked slot and protected PPV.
  const week=page.getByRole("button",{name:"Year 1 week 33 — The Lottery + Ascension"});
  await expect(week).toHaveAttribute("data-has-both","true");
  await week.click();
  const focus=page.getByRole("region",{name:"Week 33 shows and booking"});
  await expect(focus.locator(".ppw-calendar-week-focus-event")).toHaveCount(2);
  await expect(focus).toContainText("VibeFlix · Thu 20:00 · Contracted slot");
  await expect(focus).toContainText("The Lottery");
  await expect(focus).toContainText("Card submitted");
  await expect(focus.getByRole("button",{name:"Book PPV"})).toHaveCount(0);
  await focus.getByRole("button",{name:"Edit card"}).click();
  await expect(page).toHaveURL(/#\/card$/);

  // Phase 59: existing real card, one linked feud, multiple authored beats.
  await page.locator(".ppw-card-bar .ppw-expand").last().click();
  let dialog=page.getByRole("dialog",{name:"Edit angle"});
  await expect(dialog.locator(".ppw-angle-sequence")).toBeVisible();
  await dialog.getByRole("button",{name:"Add scripted moment"}).click();
  await dialog.getByLabel("Moment 1 dialogue or detail")
   .fill("The truth comes out tonight.");
  await dialog.getByRole("button",{name:"Add scripted moment"}).click();
  await dialog.getByLabel("Moment 2 action").selectOption("REPLY");
  await dialog.getByLabel("Moment 2 who").selectOption("riddle");
  await dialog.getByLabel("Moment 2 responding to").selectOption("joe");
  await dialog.getByRole("button",{name:"Add scripted moment"}).click();
  await dialog.getByLabel("Moment 3 action").selectOption("ATTACK");
  await dialog.getByLabel("Moment 3 target").selectOption("riddle");
  await expect(dialog.locator(".ppw-angle-sequence-step")).toHaveCount(3);
  await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
  await expect(dialog.locator(".ppw-angle-sequence-review")).toContainText(
   "Matt Riddle answered Samoa Joe");
  await dialog.getByRole("button",{name:"Complete angle"}).click();
  expect(calls.filter(x=>x==="save")).toHaveLength(0);
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  await page.locator(".ppw-card-bar .ppw-expand").last().click();
  dialog=page.getByRole("dialog",{name:"Edit angle"});
  if(await dialog.getByRole("button",{name:"← Revise script"}).count())
   await dialog.getByRole("button",{name:"← Revise script"}).click();
  await expect(dialog.locator(".ppw-angle-sequence-step")).toHaveCount(3);
  await expect(dialog.getByLabel("Moment 2 action")).toHaveValue("REPLY");
  expect(calls.filter(x=>x==="overview")).toHaveLength(0);
  expect(calls.filter(x=>x==="calendar")).toHaveLength(1);
  expect(calls.filter(x=>x==="save")).toHaveLength(1);
  expect(sessionReads).toBe(1);
  expect(calls).not.toContain("groq");
  expect(calls).not.toContain("planShow");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
