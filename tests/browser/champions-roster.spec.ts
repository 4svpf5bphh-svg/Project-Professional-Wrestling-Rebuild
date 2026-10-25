import {test,expect} from "@playwright/test";
const overview={world:{id:"genesis",name:"Genesis",year:1,week:5,revision:4,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"Home Wrestling",tier:"LOCAL",
 cash:3000000,debt:0,attention:{plannedShows:0,unpreparedShow:false,
 pendingBackstage:false,expiringTalent:false,pendingContractOffers:false}}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"test",
 overview,availablePromotions:[]};
const title=(promotionId:string,name:string)=>({
 promotionId,championshipId:name,promotionName:promotionId==="home"?"Home Wrestling":"Rival",
 name,division:"SINGLES",status:"ACTIVE",prestige:80,currentReignId:null,
 holderId:null,holderType:null,holderName:null,defenses:0});
for(const width of [320,390]){
 test(`My Champions ${width}px: own belts only, World view still available without second read`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const methods:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method as string;
   methods.push(method);
   return r.fulfill({json:method==="wrestlerDirectory"?{
    year:1,week:5,currentWeekIndex:4,worldRevision:4,canEdit:true,
    people:[],hasMore:false
   }:method==="championships"?{
    worldName:"Genesis",year:1,week:5,viewerPromotionId:"home",
    titles:[title("home","Home Heavyweight"),title("rival","Rival World")]
   }:{}});
  });
  await page.goto("/#/roster");
  await page.getByRole("button",{name:"My Champions"}).click();
  await expect(page.getByRole("heading",{name:"My Champions"})).toBeVisible();
  await expect(page.locator(".ppw-belt-card:visible")).toHaveCount(1);
  await expect(page.locator(".ppw-belt-card:visible")).toContainText("Home Heavyweight");
  await page.getByRole("button",{name:"World Championships"}).click();
  await expect(page.locator(".ppw-belt-card:visible")).toHaveCount(2);
  expect(methods.filter(x=>x==="championships").length).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
