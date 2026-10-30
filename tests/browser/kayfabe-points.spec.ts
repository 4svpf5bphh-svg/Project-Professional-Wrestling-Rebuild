import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"Genesis",year:1,week:5,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"Home",tier:"LOCAL",cash:5000000,
 debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}};
const business={name:"Home",tier:"LOCAL",year:1,week:5,phase:"OPEN",
 homeMarketName:"Territory 0",mediaReach:80,cash:5000000,debt:0,
 standing:{prestige:40,fanReputation:50,businessReputation:50,talentReputation:50,lastEvaluatedYear:0},
 weeklyMediaIncome:300000,weeklySponsorIncome:25000,weeklyFixedOverhead:60000,
 weeklyGuarantees:15000,weeklyStaffPayroll:1000,recurringMargin:249000,
 lastWeeklyNet:0,runwayWeeks:null,financialDistress:"HEALTHY",
 shows:[],rollingFourWeeks:{income:0,spending:0,net:0,byCategory:[]},
 recentTransactions:[],territories:[]};
test("iPhone Kayfabe Points shows cosmetic catalogue, secure account actions and fair Create-a-Wrestler",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 let balance=5000,brand:null|string=null,entitlements:string[]=["BADGE_GOLD"],alias:null|string=null;
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"secret",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const request=route.request().postDataJSON() as Record<string,unknown>&{method:string};
  calls.push(request.method);
  if(request.method==="business")return route.fulfill({json:{...business,kpBrandStyle:brand}});
  if(request.method==="kpWorkspace")return route.fulfill({json:{
   balance,lifetimeEarned:balance+100,lifetimeSpent:5100-balance,worldYear:1,
   week:5,promotionName:"Home",weeklyAward:100,
   claim:{year:1,week:4,played:true,eligible:false,alreadyClaimed:true,dailyCapReached:true},
   entitlements,activeBrand:brand,activeBadge:"GOLD",
   staff:[{staffId:"staff-road-agent-001",alias}],
   achievements:[{key:"FIRST_BELL",label:"First Bell",earned:true,progress:1,target:1},
    {key:"TEN_SHOWS",label:"The Regular",earned:false,progress:3,target:10},
    {key:"YEAR_OF_SHOWS",label:"Iron Booker",earned:false,progress:3,target:52}],
   createdTalent:[],createOptions:{
    styles:[{id:"ALL_ROUNDER",label:"All Rounder"},{id:"HIGH_FLYER",label:"High Flyer"}],
    gimmicks:[{id:"AUTHENTIC",label:"Authentic"},{id:"UNDERDOG",label:"Underdog"}],
    alignments:["FACE","HEEL","TWEENER"]
   },catalogue:[
    {sku:"BRAND_CHROME",label:"Chrome promotion crest",price:200,kind:"BRAND"},
    {sku:"BRAND_NEON",label:"Neon promotion crest",price:350,kind:"BRAND"},
    {sku:"BADGE_GOLD",label:"Gold achievement display",price:350,kind:"BADGE"}
   ],staffAliasPrice:350,createTalentPrice:3000}});
  if(request.method==="kpAction"){
   expect(typeof request.requestId).toBe("string");
   if(request.kind==="BUY"){
    entitlements.push(String(request.sku));
    balance-=200;brand="CHROME";
   }else if(request.kind==="RENAME_STAFF"){alias=String(request.name);balance-=350;}
   else if(request.kind==="CREATE_WRESTLER"){balance-=3000;
    return route.fulfill({json:{market:"FREE_AGENT",name:request.name,balance}});}
   return route.fulfill({json:{balance}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/business");
 await expect(page.getByRole("heading",{name:"Business"})).toBeVisible();
 expect(calls).toEqual(["business"]);
 await page.getByRole("button",{name:"Open your KP wallet"}).click();
 await expect(page.getByRole("heading",{name:"Kayfabe Points"})).toBeVisible();
 await expect(page.getByText("5,000 KP",{exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Create a Wrestler"})).toBeVisible();
 await expect(page.getByText("free-agent market",{exact:false}).first()).toBeVisible();
 await expect(page.getByText("First Bell")).toBeVisible();
 await expect(page.getByText("Active gold milestone frame")).toBeVisible();
 await expect(page.locator(".ppw-kp-active-preview.ppw-kp-achievement-gold")).toBeVisible();
 await page.locator(".ppw-kp-item").filter({hasText:"Chrome promotion crest"})
  .getByRole("button",{name:"Unlock"}).click();
 await expect(page.locator(".ppw-kp-symbol[data-style='CHROME']")).toBeVisible();
 await expect(page.getByText("4,800 KP",{exact:true})).toBeVisible();
 await page.getByRole("textbox",{name:"New staff display name"}).fill("Alex Ringside");
 await page.getByRole("button",{name:/Rename/}).click();
 await expect(page.getByText("Staff display name updated.")).toBeVisible();
 await page.getByRole("button",{name:/Design a Wrestler/}).click();
 await page.getByRole("textbox",{name:"Wrestler name"}).fill("Jules Comet");
 await page.getByRole("combobox",{name:"Wrestling style"}).selectOption("HIGH_FLYER");
 await page.getByRole("combobox",{name:"Character archetype"}).selectOption("UNDERDOG");
 await page.getByRole("textbox",{name:"Signature move"}).fill("Rising Splash");
 await page.getByRole("textbox",{name:"Finishing move"}).fill("Comet Driver");
 await page.getByRole("button",{name:"Review Wrestler"}).click();
 await expect(page.getByRole("heading",{name:"Jules Comet"})).toBeVisible();
 await expect(page.getByText("Comet Driver")).toBeVisible();
 await page.once("dialog",dialog=>void dialog.accept());
 await page.getByRole("button",{name:/Finalise · 3,000 KP/}).click();
 await expect(page.getByText(/Jules Comet has entered the shared World/)).toBeVisible();
 const bounds=await page.locator(".ppw-kp-funds").boundingBox();
 expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);
 expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);
 expect(calls).toEqual(["business","kpWorkspace","kpAction","kpWorkspace",
  "kpAction","kpWorkspace","kpAction","kpWorkspace"]);
});
