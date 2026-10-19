import {test,expect} from "@playwright/test";
const title={id:"title-reign:show:main:new-reign",championshipId:"world",
 titleName:"World Championship",winnerName:"Alice",holderType:"PERSON",
 personId:"alice",year:1,week:4};
const world={world:{revision:4,name:"Genesis",year:1,week:5,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"Home",tier:"LOCAL",
 cash:3000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY",
 attention:{plannedShows:0,unpreparedShow:false,pendingBackstage:false,
 expiringTalent:false,pendingContractOffers:false,titleNews:[title]}}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"opaque",overview:world,
 availablePromotions:[]};
test("iPhone publishes only verified championship history and links to the title desk",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string};
  methods.push(req.method);
  return route.fulfill({json:req.method==="overview"?world:
   req.method==="championships"?{
    worldName:"Genesis",year:1,week:5,viewerPromotionId:"local",titles:[]} :{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"New champions"})).toBeVisible();
 await expect(page.getByText("Alice won World Championship")).toBeVisible();
 await expect(page.getByRole("button",{name:/Plan this week's show/})).toBeVisible();
 expect(methods).toEqual(["overview"],"Home must not separately fetch Championships");
 await page.getByRole("button",{name:"Open Championships"}).click();
 await expect(page).toHaveURL(/#\/championships$/);
 await expect(page.getByText("Championships").first()).toBeVisible();
 await expect.poll(()=>methods.filter(x=>x==="championships").length).toBe(1);
});
test("iPhone clears confirmed title and business news but never the unprepared show",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const business={id:"business-update:77",kind:"ANNUAL_REVIEW",year:1,week:4,
  prestigeDelta:2,before:null,after:null};
 let cleared=false;const methods:string[]=[];
 const fresh=()=>({...world,promotion:{...world.promotion,
  attention:{...world.promotion.attention,unpreparedShow:true,
   titleNews:cleared?[]:[title],businessUpdates:cleared?[]:[business]}}});
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string;attentionIds?:string[]};
  methods.push(req.method);
  if(req.method==="dismissAttentionBatch"){
   expect(req.attentionIds).toEqual(["business-update:77","title-reign:show:main:new-reign"]);
   cleared=true;return route.fulfill({json:{dismissed:2,firstDismissals:2}});
  }
  return route.fulfill({json:req.method==="overview"?fresh():{}});
 });
 await page.goto("/#/home");
 await expect(page.getByText("Alice won World Championship")).toBeVisible();
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
 await page.getByRole("button",{name:"Clear all resolved updates"}).click();
 await expect(page.getByText("Alice won World Championship")).toHaveCount(0);
 await expect(page.getByText("Company updates")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Finish your booking card/})).toBeVisible();
 expect(methods).toEqual(["overview","dismissAttentionBatch"]);
});
