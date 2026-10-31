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
    const css=getComputedStyle(el);
    const rgb=(value:string)=>{
     const channels=value.match(/[0-9.]+/g)?.slice(0,3).map(Number)??[0,0,0];
     return channels.map(v=>{
      const c=v/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
     });
    };
    const luminance=(v:number[])=>v[0]!*0.2126+v[1]!*0.7152+v[2]!*0.0722;
    const a=luminance(rgb(css.color)),b=luminance(rgb(css.backgroundColor));
    return {ink:css.color,background:css.backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
   });
   expect(ribbon.ratio,p.label+" red banner needs at least 4.5:1 contrast, actual "+
    JSON.stringify(ribbon)).toBeGreaterThanOrEqual(4.5);
   for(const label of [".ppw-tv-caption",".ppw-tv-broadcast-label"]){
    const ratio=await sample.locator(label).evaluate(element=>{
     const css=getComputedStyle(element);
     const rgb=(value:string)=>(value.match(/[0-9.]+/g)?.slice(0,3).map(Number)??[0,0,0])
      .map(c=>{const n=c/255;return n<=0.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)});
     const lum=(v:number[])=>v[0]!*0.2126+v[1]!*0.7152+v[2]!*0.0722;
     const a=lum(rgb(css.color)),b=lum(rgb(css.backgroundColor));
     return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    expect(ratio,p.label+" "+label+" must have a legible opaque label").toBeGreaterThanOrEqual(4.5);
   }
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
