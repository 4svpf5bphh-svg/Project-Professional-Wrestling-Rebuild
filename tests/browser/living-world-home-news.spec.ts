import {test,expect} from "@playwright/test";
const news=[
 {eventId:"2",kind:"WRESTLER_RETIRED",year:3,week:10,
  personId:"wrestler-1",personName:"Alex Rook",promotionName:null,toTier:null},
 {eventId:"1",kind:"PROMOTION_TIER_CHANGED",year:3,week:9,
  personId:null,personName:null,promotionName:"Coastal Wrestling",toTier:"RISING"}
];
const overview={world:{revision:4,name:"Genesis",year:3,week:11,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"promotion",name:"Promotion",tier:"LOCAL",
 cash:1000000,debt:0,lastWeeklyNet:5000,financialDistress:"HEALTHY",
 attention:{plannedShows:1,unpreparedShow:false,pendingBackstage:false,
 expiringTalent:false,pendingContractOffers:false,worldStories:news}}};
test("iPhone Home publishes recent verified world developments without leaking private rival terms or polling",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"opaque",overview,
  availablePromotions:[]
 }}));
 await page.route("**/api/card",route=>{
  const {method}=route.request().postDataJSON() as {method:string};
  calls.push(method);
  if(method==="overview")return route.fulfill({json:overview});
  return route.fulfill({json:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Industry headlines"})).toBeVisible();
 await expect(page.getByRole("button",{name:/Alex Rook hangs up the boots/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Coastal Wrestling moves to RISING/})).toBeVisible();
 await expect(page.getByText("private rival problem")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Read more industry stories/})).toBeVisible();
 expect(calls).toEqual(["overview"]);
});
