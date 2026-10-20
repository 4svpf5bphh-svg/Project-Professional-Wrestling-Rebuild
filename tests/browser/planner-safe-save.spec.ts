import {test,expect} from "@playwright/test";

const overview={
 world:{revision:4,name:"Playtest",year:1,week:1,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"independent",name:"Independent",
  tier:"LOCAL",cash:2000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}
};
const session={worldId:"playtest",playerId:"owner",csrfToken:"csrf",overview,
 availablePromotions:[]};
const arena={
 venueId:"home-hall",marketId:"home",marketName:"Home market",name:"Town Hall",
 capacity:900,weeklyHireCost:6000,prestige:45,productionSuitability:60,
 awareness:55,liveStrength:52,loyalty:60,audiencePotential:65,
 wrestlingInterest:68,spendingIndex:74,strongestRival:null,home:true
};
function planner(revision:number,showCreated:boolean){
 return {worldName:"Playtest",promotionName:"Independent",year:1,week:1,
  worldRevision:revision,canEdit:true,homeMarketId:"home",
  venues:[arena],venuePressure:[],
  weeks:[{year:1,week:1,offset:0,required:true,major:false,canEdit:true,
   scheduled:[],shows:showCreated?[{
    draftId:"created-on-server",year:1,week:1,status:"DRAFT",eventType:"REGULAR",
    bookingClass:"REGULAR",showSeriesId:null,showName:"Weekly show",
    day:5,marketId:"home",venueId:"home-hall",marketName:"Home market",
    venueName:"Town Hall",ticketStrategy:"STANDARD",ready:false,slots:0
   }]:[]}]
 };
}
test("iPhone retries a committed show with the SAME receipt after its response is lost",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const keys:string[]=[];let created=false;
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const body=route.request().postDataJSON();
  if(body.method==="planner"){
   await route.fulfill({json:planner(4,created)});
   return;
  }
  if(body.method!=="planShow")throw new Error("Unexpected request "+body.method);
  keys.push(body.requestId);
  expect(body).toMatchObject({expectedRevision:4,worldId:"playtest",
   promotionId:"independent",venueId:"home-hall",year:1,week:1,day:5});
  if(keys.length===1){
   created=true; // the database committed, but the mobile response disappeared.
   await route.fulfill({status:503,body:JSON.stringify({error:"Network interrupted"}),
    contentType:"application/json"});
  }else await route.fulfill({json:{status:"REPLAYED",revision:5,
   result:{draftId:"created-on-server",status:"CREATED"}}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Plan weekly show"}).click();
 await page.getByRole("button",{name:"Save show"}).click();
 await expect(page.getByText(/Booking request failed/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Save show"})).toBeVisible();
 await expect(page.getByLabel("Show venue")).toHaveValue("home-hall");
 await page.getByRole("button",{name:"Save show"}).click();
 await expect(page.getByRole("button",{name:"Edit card"})).toBeVisible();
 expect(keys).toHaveLength(2);
 expect(keys[0]).toBe(keys[1]);
 await expect(page.getByText(/Weekly show · Town Hall/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("stale two-manager show planning never reports success or loses venue/day selection",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const attempts:Array<{id:string;revision:number}>=[];
 let revision=4,created=false;
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const body=route.request().postDataJSON();
  if(body.method==="planner"){
   await route.fulfill({json:planner(revision,created)});
   return;
  }
  if(body.method!=="planShow")throw new Error("Unexpected request "+body.method);
  attempts.push({id:body.requestId,revision:body.expectedRevision});
  if(attempts.length===1){
   revision=5;
   await route.fulfill({json:{status:"STALE",revision:5}});
  }else{
   created=true;
   await route.fulfill({json:{status:"APPLIED",revision:6,
    result:{draftId:"created-on-server",status:"CREATED"}}});
  }
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Plan weekly show"}).click();
 await page.getByRole("button",{name:"Save show"}).click();
 await expect(page.getByText(/Plans have changed/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Save show"})).toBeVisible();
 await expect(page.getByLabel("Show venue")).toHaveValue("home-hall");
 await expect(page.getByLabel("Show day")).toHaveValue("5");
 await page.getByRole("button",{name:"Save show"}).click();
 await expect(page.getByRole("button",{name:"Edit card"})).toBeVisible();
 expect(attempts).toHaveLength(2);
 expect(attempts.map(x=>x.revision)).toEqual([4,5]);
 expect(attempts[0]?.id).not.toBe(attempts[1]?.id);
});
