import {test,expect} from "@playwright/test";

const a={personId:"alice",contractId:"alice-deal"};
const b={personId:"bob",contractId:"bob-deal"};
const baseMatch={matchType:"SINGLES",family:"INDIVIDUAL",
 participants:[a,b],sides:[{sideId:"A",participants:[a]},
  {sideId:"B",participants:[b]}],
 scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
 intent:"COMPETITIVE",plannedLengthMinutes:18};
const overview={
 world:{revision:4,name:"Playtest",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+4000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"indie",name:"Independent",
  tier:"LOCAL",cash:1000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}
};
const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
 overview,availablePromotions:[]};
const planner={worldName:"Playtest",promotionName:"Independent",
 year:1,week:5,canEdit:true,worldRevision:4,homeMarketId:"home",
 venues:[],weeks:[{year:1,week:5,offset:0,required:true,major:false,
 canEdit:true,scheduled:[],shows:[{
  draftId:"weekly",year:1,week:5,status:"DRAFT",bookingClass:"REGULAR",
  eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
  marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
  ready:false,slots:1,showSeriesId:null,showName:"Weekly show"}]}]};

for(const conflicting of [false,true]){
 test("iPhone preserves unsaved scripted winner when "+(conflicting?
  "this show was modified in another session":"a rival promotion changed the World"),async({page})=>{
  await page.setViewportSize({width:390,height:844});
  let revision=4,saved={...baseMatch};
  let attempt=0;
  const submissions:Array<{requestId:string;expectedRevision:number;winner:string}>=[];
  const view=()=>({
   showId:"weekly",year:1,week:5,worldRevision:revision,
   canEdit:true,ready:false,day:5,venueId:"arena",showName:"Weekly show",
   promotionName:"Independent",venueName:"Arena",marketName:"Home",
   bookingClass:"REGULAR",ticketStrategy:"STANDARD",
   championships:[],programmes:[],programmeLinks:[],
   selectedPeople:[{personId:"alice",name:"Alice",division:"MEN"},
    {personId:"bob",name:"Bob",division:"MEN"}],
   slots:[{slotId:"main",kind:"MATCH",position:0,payload:saved}]
  });
  const calls:string[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",async route=>{
   const input=route.request().postDataJSON();
   calls.push(input.method);
   if(input.method==="planner")return route.fulfill({json:planner});
   if(input.method==="load")return route.fulfill({json:view()});
   if(input.method==="save"){
    attempt++;
    const booking=input.matches?.[0]?.payload;
    submissions.push({requestId:input.requestId,
     expectedRevision:input.expectedRevision,winner:booking?.scriptedWinnerSide});
    if(attempt===1){
     revision=5;
     if(conflicting)saved={...saved,plannedFinish:"SUBMISSION"};
     return route.fulfill({json:{status:"STALE",revision}});
    }
    saved={...booking};revision=6;
    return route.fulfill({json:{status:"APPLIED",revision,
     result:{showId:"weekly",matchCount:1}}});
   }
   throw new Error("Unexpected request "+input.method);
  });
  await page.goto("/#/planner");
  await page.getByRole("button",{name:"Edit card"}).click();
  await page.locator(".ppw-card-bar .ppw-expand").first().click();
  const dialog=page.getByRole("dialog",{name:"Edit match"});
  await dialog.getByLabel("Winner").selectOption("1");
  await expect(dialog.getByLabel("Winner")).toHaveValue("1");
  await dialog.getByRole("button",{name:"Close card editor"}).click();
  await expect(page.getByRole("button",{name:"Discard unsaved edits"})).toBeVisible();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  const msg=conflicting?/saved card changed elsewhere/:/Another manager changed the World/;
  await expect(page.getByText(msg)).toBeVisible();
  await expect(page.getByRole("button",{name:"Discard unsaved edits"})).toBeVisible();
  await page.locator(".ppw-card-bar .ppw-expand").first().click();
  await expect(page.getByRole("dialog",{name:"Edit match"}).getByLabel("Winner"))
   .toHaveValue("1");
  await page.getByRole("dialog",{name:"Edit match"}).getByRole("button",
   {name:"Close card editor"}).click();
  await page.getByRole("button",{name:/Save card|Save changes/}).click();
  await expect(page.getByText("Show card saved")).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions.map(x=>x.expectedRevision)).toEqual([4,5]);
  expect(submissions.map(x=>x.winner)).toEqual(["B","B"]);
  expect(submissions[0]?.requestId).not.toBe(submissions[1]?.requestId);
  expect(calls.filter(x=>x==="talent")).toHaveLength(0);
  await page.locator(".ppw-card-bar .ppw-expand").first().click();
  await expect(page.getByRole("dialog",{name:"Edit match"}).getByLabel("Winner"))
   .toHaveValue("1");
 });
}
