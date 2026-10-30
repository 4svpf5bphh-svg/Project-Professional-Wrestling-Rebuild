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
 let balance=5000,brand:null|string=null,activeBadge:null|string="GOLD",entitlements:string[]=["BADGE_GOLD"],alias:null|string=null;
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
   entitlements,activeBrand:brand,activeBadge,
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
   }else if(request.kind==="CLEAR_BADGE"){activeBadge=null;}
   else if(request.kind==="APPLY_BADGE"){activeBadge="GOLD";}
   else if(request.kind==="RENAME_STAFF"){alias=String(request.name);balance-=350;}
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
 await page.getByRole("button",{name:"Use standard milestone frame"}).click();
 await expect(page.getByText("Standard milestone style restored.")).toBeVisible();
 await expect(page.locator(".ppw-kp-active-preview")).toHaveCount(0);
 await page.locator(".ppw-kp-item").filter({hasText:"Gold achievement display"})
  .getByRole("button",{name:"Apply"}).click();
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
   "kpAction","kpWorkspace","kpAction","kpWorkspace",
   "kpAction","kpWorkspace","kpAction","kpWorkspace"]);
});

test("Territory TV skin can be purchased once and switched off/on without a second charge",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 let balance=2000,activeResultsSkin:string|null=null;
 const entitlements:string[]=[];
 const actions:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"secret",overview,availablePromotions:[]}}));
 await page.route("**/api/card",r=>{
  const request=r.request().postDataJSON() as {method:string;kind?:string;sku?:string};
  if(request.method==="kpWorkspace")return r.fulfill({json:{
   balance,lifetimeEarned:2000,lifetimeSpent:2000-balance,worldYear:1,week:5,
   promotionName:"Home",weeklyAward:100,claim:null,entitlements,
   activeBrand:null,activeBadge:null,activeResultsSkin,staff:[],achievements:[],
   createdTalent:[],createOptions:{alignments:["FACE","HEEL","TWEENER"],
    styles:[],gimmicks:[]},staffAliasPrice:350,createTalentPrice:3000,
   catalogue:[{sku:"RESULTS_TERRITORY_TV",label:"Territory TV · vintage show results",
    price:750,kind:"RESULTS_SKIN"}]
  }});
  if(request.method==="kpAction"){
   actions.push(String(request.kind));
   if(request.kind==="BUY"){
    expect(request.sku).toBe("RESULTS_TERRITORY_TV");
    balance-=750;entitlements.push(request.sku!);activeResultsSkin="TERRITORY_TV";
   }
   if(request.kind==="CLEAR_RESULTS_SKIN")activeResultsSkin=null;
   if(request.kind==="APPLY_RESULTS_SKIN"){
    expect(entitlements).toContain("RESULTS_TERRITORY_TV");
    activeResultsSkin="TERRITORY_TV";
   }
   return r.fulfill({json:{price:request.kind==="BUY"?750:0,balance}});
  }
  return r.fulfill({json:{}});
 });
 await page.goto("/#/kayfabe");
 const skins=page.locator(".ppw-kp-results-skins");
 await expect(skins.getByRole("heading",{name:"My results skins"})).toBeVisible();
 await expect(skins.getByText("TERRITORY TV",{exact:true})).toBeVisible();
 await skins.getByRole("button",{name:"Unlock"}).click();
 await expect(skins.getByText("Owned · applied to your results")).toBeVisible();
 await expect(page.getByText("1,250 KP",{exact:true})).toBeVisible();
 await skins.getByRole("button",{name:"Use original PPW results"}).click();
 await expect(skins.getByText("Owned · ready to apply")).toBeVisible();
 await skins.getByRole("button",{name:"Apply"}).click();
 await expect(skins.getByText("Owned · applied to your results")).toBeVisible();
 await expect(page.getByText("1,250 KP",{exact:true})).toBeVisible();
 expect(actions).toEqual(["BUY","CLEAR_RESULTS_SKIN","APPLY_RESULTS_SKIN"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("iPhone KP shop switches two independently purchased results skins, without extra charges",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 let balance=4000,activeResultsSkin:string|null=null;
 const entitlements:string[]=[],charges:number[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"secret",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const input=route.request().postDataJSON() as {method:string;kind?:string;sku?:string};
  if(input.method==="kpWorkspace")return route.fulfill({json:{
   balance,lifetimeEarned:4000,lifetimeSpent:4000-balance,worldYear:1,week:5,
   promotionName:"Home",weeklyAward:100,claim:null,entitlements,
   activeBrand:null,activeBadge:null,activeResultsSkin,staff:[],achievements:[],
   createdTalent:[],createOptions:{alignments:["FACE","HEEL","TWEENER"],
    styles:[],gimmicks:[]},staffAliasPrice:350,createTalentPrice:3000,
   catalogue:[{sku:"RESULTS_TERRITORY_TV",label:"Territory TV · vintage show results",
    price:750,kind:"RESULTS_SKIN"},
    {sku:"RESULTS_FIGHT_NIGHT",label:"Fight Night · professional match reports",
     price:750,kind:"RESULTS_SKIN"}]
  }});
  if(input.method==="kpAction"){
   if(input.kind==="BUY"){
    expect(entitlements).not.toContain(input.sku);
    entitlements.push(input.sku!);charges.push(750);balance-=750;
    activeResultsSkin=input.sku==="RESULTS_FIGHT_NIGHT"?"FIGHT_NIGHT":"TERRITORY_TV";
   }
   if(input.kind==="APPLY_RESULTS_SKIN"){
    expect(entitlements).toContain(input.sku);
    activeResultsSkin=input.sku==="RESULTS_FIGHT_NIGHT"?"FIGHT_NIGHT":"TERRITORY_TV";
   }
   if(input.kind==="CLEAR_RESULTS_SKIN")activeResultsSkin=null;
   return route.fulfill({json:{balance}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/kayfabe");
 const skins=page.locator(".ppw-kp-results-skins");
 await expect(skins.locator(".ppw-kp-fight-preview")).toBeVisible();
 await expect(skins.locator(".ppw-kp-territory-preview")).toBeVisible();
 const territory=skins.locator(".ppw-kp-results-skin-row").filter({hasText:"Territory TV"});
 const fight=skins.locator(".ppw-kp-results-skin-row").filter({hasText:"Fight Night"});
 await territory.getByRole("button",{name:"Unlock"}).click();
 await expect(territory.getByRole("button",{name:"Applied"})).toBeVisible();
 await fight.getByRole("button",{name:"Unlock"}).click();
 await expect(fight.getByRole("button",{name:"Applied"})).toBeVisible();
 await territory.getByRole("button",{name:"Apply"}).click();
 await expect(territory.getByRole("button",{name:"Applied"})).toBeVisible();
 await fight.getByRole("button",{name:"Apply"}).click();
 await expect(fight.getByRole("button",{name:"Applied"})).toBeVisible();
 await skins.getByRole("button",{name:"Use original PPW results"}).click();
 await expect(fight.getByRole("button",{name:"Apply"})).toBeVisible();
 await expect(territory.getByRole("button",{name:"Apply"})).toBeVisible();
 expect(charges).toEqual([750,750]);
 expect(balance).toBe(2500);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("Three result skins: Zine joins the other two without repeat purchases or iPhone overflow",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 let balance=4000,activeResultsSkin:string|null=null;
 const entitlements:string[]=[],charges:number[]=[];
 const styles:Record<string,string>={
  RESULTS_TERRITORY_TV:"TERRITORY_TV",RESULTS_FIGHT_NIGHT:"FIGHT_NIGHT",
  RESULTS_UNDERGROUND_ZINE:"UNDERGROUND_ZINE"};
 await page.route("**/api/session",route=>route.fulfill({json:{
  worldId:"world",playerId:"owner",csrfToken:"secret",overview,availablePromotions:[]}}));
 await page.route("**/api/card",route=>{
  const request=route.request().postDataJSON() as {method:string;kind?:string;sku?:string};
  if(request.method==="kpWorkspace")return route.fulfill({json:{
   balance,lifetimeEarned:4000,lifetimeSpent:4000-balance,worldYear:1,week:5,
   promotionName:"Home",weeklyAward:100,claim:null,entitlements,
   activeBrand:null,activeBadge:null,activeResultsSkin,staff:[],achievements:[],
   createdTalent:[],createOptions:{alignments:["FACE","HEEL","TWEENER"],
    styles:[],gimmicks:[]},staffAliasPrice:350,createTalentPrice:3000,
   catalogue:[{sku:"RESULTS_TERRITORY_TV",label:"Territory TV · vintage show results",
    price:750,kind:"RESULTS_SKIN"},
    {sku:"RESULTS_FIGHT_NIGHT",label:"Fight Night · professional match reports",
     price:750,kind:"RESULTS_SKIN"},
    {sku:"RESULTS_UNDERGROUND_ZINE",label:"Underground Zine · indie wrestling fanzine",
     price:750,kind:"RESULTS_SKIN"}]
  }});
  if(request.method==="kpAction"){
   if(request.kind==="BUY"){
    expect(entitlements).not.toContain(request.sku);
    entitlements.push(request.sku!);charges.push(750);balance-=750;
    activeResultsSkin=styles[request.sku!];
   }
   if(request.kind==="APPLY_RESULTS_SKIN"){
    expect(entitlements).toContain(request.sku);
    activeResultsSkin=styles[request.sku!];
   }
   if(request.kind==="CLEAR_RESULTS_SKIN")activeResultsSkin=null;
   return route.fulfill({json:{balance}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/kayfabe");
 const skins=page.locator(".ppw-kp-results-skins");
 for(const kind of ["territory","fight","zine"]){
  await expect(skins.locator(".ppw-kp-"+kind+"-preview")).toBeVisible();
 }
 const rows=skins.locator(".ppw-kp-results-skin-row");
 for(const name of ["Territory TV","Fight Night","Underground Zine"]){
  const row=rows.filter({hasText:name});
  await row.getByRole("button",{name:"Unlock"}).click();
  await expect(row.getByRole("button",{name:"Applied"})).toBeVisible();
 }
 for(const name of ["Territory TV","Fight Night","Underground Zine"]){
  const row=rows.filter({hasText:name});
  await row.getByRole("button",{name:"Apply"}).click();
  await expect(row.getByRole("button",{name:"Applied"})).toBeVisible();
 }
 await skins.getByRole("button",{name:"Use original PPW results"}).click();
 await expect(rows.filter({hasText:"Underground Zine"}).getByRole("button",{name:"Apply"})).toBeVisible();
 expect(charges).toEqual([750,750,750]);
 expect(balance).toBe(1750);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
