import {test,expect} from "@playwright/test";

/** Authenticated original card and all cast rights are real in-memory fixture
 * facts; Story Blueprints never invoke an AI service or fabricate a result. */
for(const width of [320,390]){
 test("Story Blueprint books a native editable angle with actual Programme at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const joe={personId:"joe",contractId:"joe-deal"};
  let revision=8;
  let saved:Record<string,unknown>|null=null;
  const calls:string[]=[];
  const session={worldId:"world",playerId:"booker",csrfToken:"csrf",
   overview:{world:{revision:8,name:"Genesis",year:1,week:6,phase:"OPEN",
    nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
    membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
     cash:1000000,debt:0}},availablePromotions:[]};
  const planner={worldName:"Genesis",promotionName:"CWA",year:1,week:6,
   canEdit:true,worldRevision:8,homeMarketId:"home",venues:[],
   weeks:[{year:1,week:6,offset:0,required:true,major:false,
    canEdit:true,scheduled:[],shows:[{draftId:"ascension",
     year:1,week:6,status:"DRAFT",eventType:"REGULAR",day:5,
     marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
     ticketStrategy:"STANDARD",ready:false,slots:0,bookingClass:"REGULAR",
     showSeriesId:null,showName:"Ascension"}]}]};
  const story={programmeId:"joe-riddle",label:"Samoa Joe vs Matt Riddle",
   heat:55,repetition:4,activityCount:2,segmentCount:1,
   cast:[{personId:"joe",name:"Samoa Joe",side:"A",contractId:"joe-deal"},
    {personId:"riddle",name:"Matt Riddle",side:"B",contractId:"riddle-deal"}]};
  const load=()=>({
   showId:"ascension",year:1,week:6,canEdit:true,ready:false,
   worldRevision:revision,day:5,venueId:"arena",showName:"Ascension",
   promotionName:"CWA",venueName:"Arena",marketName:"Home",
   bookingClass:"REGULAR",ticketStrategy:"STANDARD",
   championships:[],programmes:[story],programmeLinks:[],
   selectedPeople:[{personId:"joe",name:"Samoa Joe",division:"MEN",
    contractId:"joe-deal",alignment:"FACE"}],
   slots:saved?[{slotId:"blueprint-scene",kind:"SEGMENT",position:0,
    payload:saved}]:[]
  });
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const body=r.request().postDataJSON() as Record<string,unknown>;
   const method=String(body.method);calls.push(method);
   if(method==="save"){
    const segments=body.segments as {slotId:string;payload:Record<string,unknown>}[];
    expect(segments).toHaveLength(1);
    saved=segments[0]!.payload;
    expect(saved.kind).toBe("INTERVIEW");
    expect(saved.actorIds).toEqual(["joe"]);
    expect(saved.scene).toMatchObject({purpose:"REVEAL_MOTIVATION"});
    expect(saved.creativeBeat).toMatchObject({kind:"INTERVIEW"});
    revision++;
    return r.fulfill({json:{status:"APPLIED",result:{performers:1}}});
   }
   if(method==="planner")return r.fulfill({json:planner});
   if(method==="load")return r.fulfill({json:load()});
   if(method==="talent")return r.fulfill({json:{talent:[{
    personId:"joe",name:"Samoa Joe",contractId:"joe-deal",
    division:"MEN",available:true,reason:"AVAILABLE",
    remainingDates:8,popularity:78,recognition:76,momentum:65,
    inRingQuality:88,matchCraft:87,presentation:83
   }],cursor:null}});
   throw Error("Unexpected method "+method);
  });
  await page.goto("/#/planner");
  await page.getByRole("button",{name:"Edit card"}).click();
  await page.getByRole("button",{name:"+ Add angle"}).click();
  let dialog=page.getByRole("dialog",{name:"Edit angle"});
  await expect(dialog.locator(".ppw-story-blueprint-panel")).toBeVisible();
  await dialog.getByRole("button",{name:"The Fall"}).click();
  await dialog.getByRole("button",{name:/Slow-Burn Villain/}).click();
  await expect(dialog.locator(".ppw-story-blueprint-intention"))
   .toContainText("overlooked");
  await dialog.locator(".ppw-story-blueprint-links")
   .getByRole("button",{name:"Samoa Joe vs Matt Riddle"}).click();
  await dialog.getByRole("button",{name:/Show signs of frustration/}).click();
  await expect(dialog.getByRole("button",{name:"Next · Script outcome"})).toBeVisible();
  await dialog.getByRole("button",{name:"+ Add performer"}).click();
  await page.getByRole("dialog",{name:"Choose wrestler"})
   .locator(".ppw-wrestler-card").first().click();
  dialog=page.getByRole("dialog",{name:"Edit angle"});
  await dialog.getByRole("button",{name:"Next · Script outcome"}).click();
  await expect(dialog.locator(
   '.ppw-guide-script-choice[data-field="Storytelling purpose"] .ppw-guide-script-tile[data-value="REVEAL_MOTIVATION"]'
  )).toHaveAttribute("aria-pressed","true");
  await dialog.getByRole("button",{name:"Next · Staff briefing"}).click();
  await dialog.getByRole("button",{name:"Complete angle"}).click();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(calls.filter(x=>x==="save")).toHaveLength(1);
  expect(calls.filter(x=>x==="talent")).toHaveLength(1);
  expect(calls).not.toContain("groq");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
