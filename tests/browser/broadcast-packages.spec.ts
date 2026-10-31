import {test,expect} from "@playwright/test";
import {BROADCAST_PACKAGES} from "../../src/domain/broadcast-packages.js";
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"CWA",tier:"LOCAL",cash:100000,
 debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]};
for(const width of [320,390]){
 test("nine real CSS broadcasts and white text on red ribbons at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let balance=5000,activeBroadcastPackage:string|null=null;
  const entitlements:string[]=[];const charges:number[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const input=r.request().postDataJSON() as {method:string;kind?:string;sku?:string};
   if(input.method==="kpWorkspace")return r.fulfill({json:{
    balance,lifetimeEarned:5000,lifetimeSpent:5000-balance,
    worldYear:1,week:5,promotionName:"Chaotic Wrestling Alliance",weeklyAward:100,
    claim:null,entitlements,activeBrand:null,activeBadge:null,activeResultsSkin:null,
    activeEventPoster:null,activeStaffOfficeTheme:null,activeBroadcastPackage,
    staff:[],achievements:[],createdTalent:[],
    createOptions:{alignments:[],styles:[],gimmicks:[]},
    staffAliasPrice:350,createTalentPrice:3000,
    catalogue:BROADCAST_PACKAGES.map(p=>({...p,kind:"BROADCAST_PACKAGE",price:1500}))
   }});
   if(input.method==="kpAction"){
    if(input.kind==="BUY"){
     expect(entitlements).not.toContain(input.sku);
     entitlements.push(input.sku!);balance-=1500;charges.push(1500);
     activeBroadcastPackage=BROADCAST_PACKAGES.find(p=>p.sku===input.sku)?.style??null;
    }else if(input.kind==="APPLY_BROADCAST_PACKAGE"){
     expect(entitlements).toContain(input.sku);
     activeBroadcastPackage=BROADCAST_PACKAGES.find(p=>p.sku===input.sku)?.style??null;
    }else if(input.kind==="CLEAR_BROADCAST_PACKAGE")activeBroadcastPackage=null;
    return r.fulfill({json:{balance}});
   }
   return r.fulfill({json:{}});
  });
  await page.goto("/#/kayfabe");
  const shop=page.locator(".ppw-kp-broadcast-shop");
  const picker=shop.getByRole("combobox",{name:"Choose broadcast package"});
  await expect(picker.locator("option")).toHaveCount(9);
  for(const [i,p] of BROADCAST_PACKAGES.entries()){
   await picker.selectOption(String(i));
   const sample=shop.locator(".ppw-tv-frame");
   await expect(sample).toHaveCount(1);
   await expect(sample).toHaveAttribute("data-broadcast-package",p.key);
   await expect(sample.locator(".ppw-tv-title")).toHaveText("Ascension");
   const ribbon=await sample.locator(".ppw-tv-red-label").evaluate(el=>{
    const c=getComputedStyle(el);return {ink:c.color,red:c.backgroundColor};
   });
   expect(ribbon.ink,"Every red ribbon must have legible white/ivory text").toBe("rgb(255, 249, 237)");
   expect(ribbon.red).not.toBe("rgba(0, 0, 0, 0)");
  }
  await shop.getByRole("button",{name:"Match graphic"}).click();
  await expect(shop.locator(".ppw-tv-fighter")).toHaveCount(2);
  await expect(shop.locator(".ppw-tv-fighter").first()).toHaveText("Samoa Joe");
  await shop.getByRole("button",{name:"Segment graphic"}).click();
  await expect(shop.locator(".ppw-tv-lower-name")).toHaveText("Místico");
  await picker.selectOption("0");
  await shop.getByRole("button",{name:"Unlock"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await picker.selectOption("3");
  await shop.getByRole("button",{name:"Unlock"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await picker.selectOption("0");
  await shop.getByRole("button",{name:"Apply"}).click();
  await expect(shop.getByRole("button",{name:"Applied"})).toBeVisible();
  await shop.getByRole("button",{name:"Use standard broadcast graphics"}).click();
  await expect(shop.getByRole("button",{name:"Apply"})).toBeVisible();
  expect(charges).toEqual([1500,1500]);
  expect(balance).toBe(2000);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
test("broadcast package respects reduced motion",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>r.fulfill({json:{
  balance:0,lifetimeEarned:0,lifetimeSpent:0,worldYear:1,week:5,
  promotionName:"CWA",weeklyAward:100,claim:null,
  entitlements:[],activeBrand:null,activeBadge:null,activeResultsSkin:null,
  activeEventPoster:null,activeStaffOfficeTheme:null,activeBroadcastPackage:null,
  staff:[],achievements:[],createdTalent:[],
  createOptions:{alignments:[],styles:[],gimmicks:[]},
  staffAliasPrice:350,createTalentPrice:3000,
  catalogue:BROADCAST_PACKAGES.map(p=>({...p,kind:"BROADCAST_PACKAGE",price:1500}))
 }}));
 await page.goto("/#/kayfabe");
 const animation=await page.locator(".ppw-kp-broadcast-showcase .ppw-tv-motion")
  .evaluate(el=>getComputedStyle(el).animationName);
 expect(animation).toBe("none");
});
