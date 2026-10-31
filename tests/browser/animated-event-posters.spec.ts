import {test,expect} from "@playwright/test";
import {EVENT_POSTER_SKINS} from "../../src/domain/event-poster-skins.js";

const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"Chaotic Wrestling Alliance",
 tier:"LOCAL",cash:5000000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};

for(const width of [320,390]){
 test("all 18 real CSS/SVG poster previews fit iPhone "+width+" and purchase/switch without extra charges",
 async({page})=>{
  await page.setViewportSize({width,height:844});
  let balance=5000,activeEventPoster:string|null=null;
  const entitlements:string[]=[],charges:number[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"secret",overview,availablePromotions:[]}}));
  await page.route("**/api/card",route=>{
   const request=route.request().postDataJSON() as {method:string;kind?:string;sku?:string};
   if(request.method==="kpWorkspace")return route.fulfill({json:{
    balance,lifetimeEarned:5000,lifetimeSpent:5000-balance,worldYear:1,week:5,
    promotionName:"Chaotic Wrestling Alliance",weeklyAward:100,claim:null,
    entitlements,activeBrand:null,activeBadge:null,activeResultsSkin:null,
    activeEventPoster,staff:[],achievements:[],createdTalent:[],
    createOptions:{alignments:["FACE","HEEL","TWEENER"],styles:[],gimmicks:[]},
    staffAliasPrice:350,createTalentPrice:3000,
    catalogue:EVENT_POSTER_SKINS.map(s=>({...s,kind:"EVENT_POSTER",price:1250}))
   }});
   if(request.method==="kpAction"){
    if(request.kind==="BUY"){
     expect(entitlements).not.toContain(request.sku);
     entitlements.push(request.sku!);charges.push(1250);balance-=1250;
     activeEventPoster=EVENT_POSTER_SKINS.find(s=>s.sku===request.sku)?.style??null;
    }
    if(request.kind==="APPLY_EVENT_POSTER"){
     expect(entitlements).toContain(request.sku);
     activeEventPoster=EVENT_POSTER_SKINS.find(s=>s.sku===request.sku)?.style??null;
    }
    if(request.kind==="CLEAR_EVENT_POSTER")activeEventPoster=null;
    return route.fulfill({json:{balance}});
   }
   return route.fulfill({json:{}});
  });
  await page.goto("/#/kayfabe");
  const shop=page.locator(".ppw-kp-event-posters");
  await expect(shop.getByRole("heading",{name:"Animated event posters"})).toBeVisible();
  const picker=shop.getByRole("combobox",{name:"Choose animated poster design"});
  await expect(picker.locator("option")).toHaveCount(18);
  for(const [i,skin] of EVENT_POSTER_SKINS.entries()){
   await picker.selectOption(String(i));
   const poster=shop.locator(".ppw-kp-poster-showcase");
   await expect(poster).toHaveAttribute("data-poster",skin.style.toLowerCase().replaceAll("_","-"));
   await expect(poster.locator(".ppw-ep-title")).toHaveText(skin.label);
   await expect(poster.locator(".ppw-ep-main")).toHaveText("TO BE ANNOUNCED");
   await expect(shop.locator(".ppw-kp-poster-showcase")).toHaveCount(1);
  }
  await picker.selectOption("0");
  await shop.getByRole("button",{name:"Unlock"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await picker.selectOption("4");
  await shop.getByRole("button",{name:"Unlock"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await picker.selectOption("0");
  await shop.getByRole("button",{name:"Apply"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await shop.getByRole("button",{name:"Use standard event artwork"}).click();
  await expect(shop.getByRole("button",{name:"Apply"})).toBeVisible();
  expect(charges).toEqual([1250,1250]);
  expect(balance).toBe(2500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
test("poster respects reduced-motion iOS preference",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.setViewportSize({width:390,height:844});
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"secret",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const request=route.request().postDataJSON() as {method:string};
  return route.fulfill({json:request.method==="kpWorkspace"?{
   balance:0,lifetimeEarned:0,lifetimeSpent:0,worldYear:1,week:5,
   promotionName:"Chaotic Wrestling Alliance",weeklyAward:100,claim:null,
   entitlements:[],activeBrand:null,activeBadge:null,activeResultsSkin:null,
   activeEventPoster:null,staff:[],achievements:[],createdTalent:[],
   createOptions:{alignments:[],styles:[],gimmicks:[]},staffAliasPrice:350,
   createTalentPrice:3000,
   catalogue:EVENT_POSTER_SKINS.map(s=>({...s,kind:"EVENT_POSTER",price:1250}))
  }:{}});
 });
 await page.goto("/#/kayfabe");
 const poster=page.locator(".ppw-kp-poster-showcase");
 await expect(poster).toBeVisible();
 const animation=await poster.locator("svg path").first().evaluate(el=>getComputedStyle(el).animationName);
 expect(animation).toBe("none");
});
