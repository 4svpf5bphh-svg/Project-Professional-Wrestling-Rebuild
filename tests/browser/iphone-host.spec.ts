import {test,expect} from "@playwright/test";
const overview={
 world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",
  cash:5000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}
};
const current={worldId:"genesis",playerId:"test-owner",
 csrfToken:"opaque-browser-csrf",overview,availablePromotions:[]};
test("iPhone signs in and opens every department through a single drawer",async({page})=>{
 let signedIn=false;const methods:string[]=[];
 await page.route("**/api/session",async route=>{
  await route.fulfill(signedIn?{json:current}:{status:401,json:{error:"Sign in required"}});
 });
 await page.route("**/api/auth",async route=>{
  signedIn=route.request().method()==="POST";
  await route.fulfill({json:{ok:true}});
 });
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON();
  expect(route.request().headers()["x-ppw-csrf"]).toBe(current.csrfToken);
  expect(request.worldId).toBe(current.worldId);
  expect(request.promotionId).toBe(overview.promotion.id);
  expect(request.playerId).toBeUndefined();
  methods.push(request.method);
  await route.fulfill({json:request.method==="overview"?overview:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Enter the locker room"})).toBeVisible();
 const nav=page.getByRole("navigation",{name:"Promotion navigation"});
 await expect(nav).toBeHidden();
 await page.getByLabel("Player ID").fill("test-owner");
 await page.getByLabel("Private access code").fill("test-code-123456789");
 await page.getByRole("button",{name:"Sign in"}).click();
 const menu=page.getByRole("button",{name:"Open promotion menu"});
 await expect(menu).toBeVisible();
 await expect(nav).toBeHidden();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 const before=methods.length;
 await menu.click();
 await expect(nav).toBeVisible();
 await expect(menu).toHaveAttribute("aria-expanded","true");
 await nav.getByRole("button",{name:"Business",exact:true}).click();
 await expect(page.getByRole("region",{name:"Business menu"})).toBeVisible();
 expect(methods.length,"The promotion drawer never reads Neon").toBe(before);
 await nav.getByRole("button",{name:"Talent",exact:true}).click();
 await nav.getByRole("button",{name:/Talent Market/}).click();
 await expect(page).toHaveURL(/#\/market$/);
 await expect(nav).toBeHidden();
 await expect(menu).toHaveAttribute("aria-expanded","false");
 await menu.click();
 await expect(page.getByRole("region",{name:"Talent menu"})).toBeVisible();
 await nav.getByRole("button",{name:/Contracts/}).click();
 await expect(page).toHaveURL(/#\/contracts$/);
 await menu.click();
 await nav.getByRole("button",{name:"Plan",exact:true}).click();
 await nav.getByRole("button",{name:/Show Planner/}).click();
 await expect(page).toHaveURL(/#\/planner$/);
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await page.goto("/#/home");
 await expect(nav).toBeHidden();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 expect(methods).toContain("overview");expect(methods).toContain("planner");
});
test("PWA manifest, service worker and explicit offline shell",async({page,request})=>{
 const manifest=await request.get("/manifest.webmanifest");
 expect(manifest.ok()).toBeTruthy();
 expect((await manifest.json()).display).toBe("standalone");
 const worker=await request.get("/sw.js");
 expect(worker.ok()).toBeTruthy();
 expect(await worker.text()).toContain('url.pathname.startsWith("/api/")');
 const offline=await request.get("/offline.html");
 expect(offline.ok()).toBeTruthy();
 expect(await offline.text()).toContain("Bookings, results and contracts are not available offline");
 await page.goto("/");
 await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href","/manifest.webmanifest");
});

test("small iPhones have one accessible menu, no permanent bottom tabs or horizontal overflow",async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=route.request().postDataJSON().method;
  await route.fulfill({json:method==="overview"?overview:{}});
 });
 await page.goto("/#/home");
 const nav=page.getByRole("navigation",{name:"Promotion navigation"});
 const menu=page.getByRole("button",{name:"Open promotion menu"});
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await expect(page.locator(".ppw-shell-logo")).toHaveText("PPW");
 await expect(page.locator(".ppw-shell-brand strong")).toHaveText("AEW");
 await expect(menu).toBeVisible();await expect(nav).toBeHidden();
 await expect(page.locator(".ppw-navigation .ppw-tab")).toHaveCount(0);
 let overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(await overflow()).toBeLessThanOrEqual(1);
 expect(await menu.evaluate(el=>Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
 await menu.click();
 await expect(nav).toBeVisible();
 await expect(nav.locator(".ppw-tab")).toHaveCount(5);
 await nav.getByRole("button",{name:"Business",exact:true}).click();
 await expect(page.getByRole("region",{name:"Business menu"})).toBeVisible();
 await expect(nav.getByRole("button",{name:/Staff/})).toBeVisible();
 expect(await overflow()).toBeLessThanOrEqual(1);
 await nav.getByRole("button",{name:"Talent",exact:true}).click();
 await nav.getByRole("button",{name:/Contracts/}).click();
 await expect(page).toHaveURL(/#\/contracts$/);
 await expect(nav).toBeHidden();
 await page.setViewportSize({width:390,height:844});
 await menu.click();
 await nav.getByRole("button",{name:"World",exact:true}).click();
 await nav.getByRole("button",{name:/World overview/}).click();
 await expect(page).toHaveURL(/#\/home$/);
 await expect(nav).toBeHidden();
 expect(await overflow()).toBeLessThanOrEqual(1);
});
test("verified player can join, claim and reach World without bypassing session authority",async({page})=>{
 let stage=0;
 const mutated:string[]=[];
 await page.route("**/api/session",async route=>{
  const snapshot={...current,overview:{...overview,
   world:{...overview.world,revision:stage},
   membership:stage===0?"NONE":"ACTIVE",
   promotion:stage===2?overview.promotion:null},
   availablePromotions:stage===1?[{id:"aew",name:"AEW",tier:"GLOBAL"}]:[]};
  await route.fulfill({json:snapshot});
 });
 for(const path of ["/api/join","/api/claim"]){
  await page.route("**"+path,async route=>{
   const body=route.request().postDataJSON();
   expect(route.request().headers()["x-ppw-csrf"]).toBe(current.csrfToken);
   expect(body.expectedRevision).toBe(stage);
   expect(body.playerId).toBeUndefined();
   expect(body.requestId).toBeTruthy();
   if(path==="/api/claim")expect(body.promotionId).toBe("aew");
   mutated.push(path);
   stage++;
   await route.fulfill({json:{status:"APPLIED"}});
  });
 }
 await page.route("**/api/card",async route=>route.fulfill({json:overview}));
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Join Genesis"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeHidden();
 await page.getByRole("button",{name:"Join World"}).click();
 await expect(page.getByRole("heading",{name:"Pick a promotion"})).toBeVisible();
 await page.getByRole("button",{name:"Run this promotion"}).click();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Open promotion menu"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeHidden();
 expect(mutated).toEqual(["/api/join","/api/claim"]);
});

test("slow abandoned results cannot overwrite the next mobile workspace",async({page})=>{
 let releaseShow!:()=>void;
 const gate=new Promise<void>(resolve=>{releaseShow=resolve;});
 let showStarted!:()=>void;
 const requested=new Promise<void>(resolve=>{showStarted=resolve;});
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const p=route.request().postDataJSON();
  if(p.method==="resultsArchive")return route.fulfill({json:{
   items:[{showId:"show-one",year:1,week:4,
    matchCount:2,angleCount:1,crowdResponse:72,showName:"Saturday Spectacle"}],
   nextCursor:null
  }});
  if(p.method==="results"){
   showStarted();
   await gate;
   return route.fulfill({json:{bad:"incomplete receipt"}});
  }
  return route.fulfill({json:p.method==="overview"?overview:{}});
 });
 await page.goto("/#/results");
 await expect(page.getByRole("button",{name:/Saturday Spectacle/})).toBeVisible();
 await page.getByRole("button",{name:/Saturday Spectacle/}).click();
 await requested;
 const nav=page.getByRole("navigation",{name:"Promotion navigation"});
 await page.getByRole("button",{name:"Open promotion menu"}).click();
 await nav.getByRole("button",{name:"World",exact:true}).click();
 await nav.getByRole("button",{name:/World overview/}).click();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 releaseShow();
 await page.waitForTimeout(250);
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await expect(page.locator("#game > .ppw-workspace")).toHaveCount(1);
 await expect(page.locator("#game .ppw-archive-hero")).toHaveCount(0);
 expect(await page.evaluate(()=>
  document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test("Backstage phone inbox stays visible without seeded personas; local filters do not query Neon",async({page})=>{
 const methods:string[]=[];
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON();
  methods.push(request.method);
  if(request.method==="overview")return route.fulfill({json:overview});
  if(request.method==="backstage")return route.fulfill({json:{
   personId:null,persona:null,personName:"",roster:[{
    personId:"p-adams",name:"Ava Adams",isCurrent:true,morale:65,
    momentum:52,lastMessage:null,latestIncoming:{
     archived:false,read_week_index:null,status:"PENDING",
     kind:"ROLE_USAGE",created_week_index:0}
   },{
    personId:"p-stone",name:"Ben Stone",isCurrent:true,morale:75,
    momentum:66,lastMessage:null,latestIncoming:{
     archived:false,read_week_index:0,status:"NOTED",
     kind:"GOOD_NEWS",created_week_index:0}
   }],conversations:[]
  }});
  await route.fulfill({json:{}});
 });
 await page.goto("/#/backstage");
 await expect(page.getByRole("heading",{name:"Conversations"})).toBeVisible();
 await expect(page.locator(".ppw-messenger.ppw-messenger-inbox")).toHaveCount(1);
 await expect(page.getByRole("navigation",{name:"Backstage messages and contacts"})).toBeVisible();
 await expect(page.locator(".ppw-messenger-inbox-topline")).toContainText("2 threads");
 await expect(page.locator(".ppw-messenger-inbox-topline")).toContainText("1 unread");
 await expect(page.locator(".ppw-messenger-awaiting")).toHaveCount(1);
 await expect(page.locator(".ppw-backstage-contact")).toHaveCount(2);
 await expect(page.locator(".ppw-backstage-avatar")).toHaveCount(2);
 const before=methods.length;
 await page.getByRole("button",{name:"Unread"}).click();
 await expect(page.locator(".ppw-backstage-contact")).toHaveCount(1);
 await expect(page.getByRole("button",{name:/Ava Adams/})).toBeVisible();
 expect(methods.length,"Inbox filter is client-only").toBe(before);
 const search=page.getByRole("searchbox",{name:"Search Backstage conversations"});
 await search.fill("Nobody matches");
 await expect(page.getByText("No matching conversations.")).toBeVisible();
 expect(methods.length,"Inbox search is client-only").toBe(before);
});

test("Programme casting opens the universal wrestler dossier without erasing its creative selections",async({page})=>{
 const calls:string[]=[];
 const story={
  year:1,week:5,worldRevision:4,canEdit:true,
  people:[{kind:"PERSON",refId:"alice",name:"Alice"},{kind:"PERSON",refId:"bob",name:"Bob"}],
  teams:[],championships:[],
  programmes:[{
   programmeId:"feud-1",status:"ACTIVE",heat:61,repetition:3,
   activityCount:2,matchCount:1,segmentCount:1,sideAWins:1,sideBWins:0,draws:0,
   championshipId:null,startedWeekIndex:2,endedWeekIndex:null,recentActivity:[],
   sideA:[{kind:"PERSON",refId:"alice",name:"Alice"}],
   sideB:[{kind:"PERSON",refId:"bob",name:"Bob"}]
  }]
 };
 const dossier={
  personId:"alice",name:"Alice",division:"WOMEN",status:"ACTIVE",
  careerStage:"REGULAR",popularity:62,recognition:63,momentum:64,morale:70,
  inRingQuality:76,matchCraft:70,presentation:79,stamina:68,safety:85,
  fatigue:0,wear:0,alignment:"FACE",canEdit:false,onYourRoster:true,
  sharedHuman:false,currentWeekIndex:4,worldRevision:4,
  persona:{personaName:"Alice",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[],teams:[],stables:[],connections:[],history:[]
 };
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  calls.push(method);
  await route.fulfill({json:method==="programmes"?story:
   method==="wrestlerProfile"?dossier:
   method==="wrestlerCareer"?{personId:"alice",
    summary:{matches:0,wins:0,losses:0,singles:0,tag:0,ratedMatches:0,
     averageStars:null,bestStars:null,injuries:0},
    recent:[],singlesTitles:[]}:{}});
 });
 await page.goto("/#/programmes");
 await expect(page.getByRole("heading",{name:"Programmes"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Open Alice's wrestler dossier"})).toBeVisible();
 expect(calls.filter(x=>x==="wrestlerProfile")).toHaveLength(0);
 const selectors=page.getByRole("combobox",{name:"Choose rivalry participant"});
 await selectors.nth(0).selectOption("PERSON:alice");
 await selectors.nth(1).selectOption("PERSON:bob");
 await page.getByRole("button",{name:"View Alice's dossier ↗"}).click();
 const dialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByText("SCOUTING / WRESTLER DOSSIER")).toBeVisible();
 await expect(dialog.getByText("Alice",{exact:true}).first()).toBeVisible();
 expect(calls.filter(x=>x==="programmes")).toHaveLength(1);
 expect(calls.filter(x=>x==="wrestlerProfile")).toHaveLength(1);
 expect(calls.filter(x=>x==="wrestlerCareer")).toHaveLength(0);
 await dialog.getByRole("button",{name:"‹ Back"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(selectors.nth(0)).toHaveValue("PERSON:alice");
 await expect(selectors.nth(1)).toHaveValue("PERSON:bob");
 expect(calls.filter(x=>x==="programmes")).toHaveLength(1);
});

test("Industry featured wrestlers load only on expansion, cache through local filters and open the universal dossier",async({page})=>{
 const requests:string[]=[];
 const hub={
  worldName:"Genesis",year:1,week:5,phase:"OPEN",nextLockEpoch:Date.now()/1000+3000,
  ownPromotionId:"aew",ownPromotionName:"AEW",
  promotions:[
   {promotionId:"aew",name:"AEW",tier:"GLOBAL",rank:1,mediaReach:80,
    managementMode:"HUMAN",latestCompletedWeekIndex:null,
    recentAverageCrowd:null,recentShowCount:0,isYours:true},
   {promotionId:"wwe",name:"WWE",tier:"GLOBAL",rank:2,mediaReach:70,
    managementMode:"AI",latestCompletedWeekIndex:null,
    recentAverageCrowd:null,recentShowCount:0,isYours:false}
  ],broadcasts:[]
 };
 const featured={promotionId:"wwe",promotionName:"WWE",moreThanEight:false,
  people:[{personId:"cody",name:"Cody Rhodes",division:"MEN",gimmickId:"HERO",
   alignment:"FACE",popularity:95,recognition:97,momentum:88,
   inRingQuality:86,matchCraft:87,presentation:92}]};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  requests.push(method);
  await route.fulfill({json:method==="industry"?hub:
   method==="industryFeatured"?featured:{}});
 });
 await page.goto("/#/industry");
 await expect(page.getByRole("heading",{name:"Industry"})).toBeVisible();
 expect(requests).toEqual(["industry"]);
 const rival=page.locator("details.ppw-industry-company").filter({hasText:"WWE"});
 await rival.locator("summary").click();
 await expect(rival.getByRole("heading",{name:"Featured wrestlers"})).toBeVisible();
 await expect(rival.getByText("Cody Rhodes",{exact:true})).toBeVisible();
 expect(requests.filter(x=>x==="industryFeatured")).toHaveLength(1);
 await page.getByLabel("Search promotions").fill("AEW");
 await expect(rival).toHaveCount(0);
 await page.getByLabel("Search promotions").fill("");
 const restored=page.locator("details.ppw-industry-company").filter({hasText:"WWE"});
 await restored.locator("summary").click();
 await expect(restored.getByText("Cody Rhodes",{exact:true})).toBeVisible();
 expect(requests.filter(x=>x==="industryFeatured")).toHaveLength(1);
 await restored.locator(".ppw-wrestler-card").click();
 await expect(page.getByRole("dialog",{name:"Wrestler dossier"})).toBeVisible();
 expect(requests.filter(x=>x==="wrestlerProfile")).toHaveLength(1);
});

test("Business event pulse reuses loaded receipts and opens detailed accounts without another request",async({page})=>{
 await page.setViewportSize({width:320,height:700});
 const methods:string[]=[];
 const business={
  name:"AEW",tier:"GLOBAL",year:1,week:5,phase:"OPEN",
  cash:5000000,debt:0,lastWeeklyNet:700,runwayWeeks:null,financialDistress:"HEALTHY",
  weeklyMediaIncome:10000,weeklySponsorIncome:2000,weeklyFixedOverhead:5000,
  weeklyGuarantees:1000,recurringMargin:6000,
  shows:[{
   showId:"event-new",year:1,week:4,name:"Collision",
   bookingClass:"REGULAR",attendance:2500,expectedDemand:2700,
   gateRevenue:5000,venueCost:1000,productionCost:1400,travelCost:200,
   appearanceFees:400,totalCost:3000,netResult:2000,incrementalCash:1800
  },{
   showId:"event-old",year:1,week:3,name:"Rampage",
   bookingClass:"REGULAR",attendance:800,expectedDemand:950,
   gateRevenue:1000,venueCost:1000,productionCost:800,travelCost:100,
   appearanceFees:100,totalCost:2000,netResult:-1000,incrementalCash:-1200
  }],
  territories:[]
 };
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=route.request().postDataJSON().method;
  methods.push(method);
  await route.fulfill({json:method==="business"?business:overview});
 });
 await page.goto("/#/business");
 await expect(page.getByRole("heading",{name:"Business"})).toBeVisible();
 await page.getByRole("button",{name:"Events"}).click();
 await expect(page.getByText("EVENT RESULT")).toBeVisible();
 await expect(page.locator(".ppw-business-event-stat").filter({hasText:"EVENT RESULT"}).locator("strong")).toContainText("1,000");
 const group=page.getByRole("group",{name:"Event profit and loss"});
 await expect(group).toBeVisible();
 await expect(group.getByRole("button")).toHaveCount(2);
 await group.getByRole("button",{name:/Collision/}).click();
 const expanded=page.locator('details.ppw-business-show[data-show-id="event-new"]');
 await expect(expanded).toHaveAttribute("open","");
 await expect(expanded.getByText("Gate revenue")).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeHidden();
 expect(methods).toEqual(["business"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test("Calendar highlights flagship and premium broadcasts without additional reads",async({page})=>{
 await page.setViewportSize({width:360,height:780});
 const flagship={seriesId:"weekly",name:"Dynamite",role:"FLAGSHIP",
  eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:70,active:true};
 const ppv={seriesId:"premium",name:"All In",role:"PREMIUM",
  eventType:"MAJOR",cadenceWeeks:52,anchorWeek:5,importance:95,active:true};
 const calendar={promotionName:"AEW",year:1,week:5,worldRevision:4,canEdit:true,
  series:[flagship,ppv],weeks:[
   {year:1,week:5,offset:0,shows:[flagship]},
   {year:1,week:6,offset:1,shows:[ppv]}
  ],
  worldWeeks:[{year:1,week:6,offset:1,events:[{
   promotionId:"wwe",promotionName:"WWE",seriesId:"mania",name:"WrestleMania",
   role:"PREMIUM",eventType:"MAJOR",importance:99
  }]}]
 };
 const methods:string[]=[];
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=route.request().postDataJSON().method;
  methods.push(method);
  await route.fulfill({json:method==="calendar"?calendar:overview});
 });
 await page.goto("/#/calendar");
 await expect(page.getByRole("heading",{name:"Show Calendar"})).toBeVisible();
 await expect(page.locator(".ppw-calendar-event-weekly").getByText("Dynamite")).toBeVisible();
 await expect(page.locator(".ppw-calendar-event-major").getByText("All In")).toBeVisible();
 await page.getByRole("button",{name:"PPVs & specials"}).click();
 await expect(page.locator(".ppw-calendar-occurrence")).toHaveCount(1);
 await expect(page.locator(".ppw-calendar-occurrence").getByText("All In")).toBeVisible();
 await page.getByRole("button",{name:"Across the World"}).click();
 await expect(page.locator(".ppw-calendar-event-major").getByText("WrestleMania")).toBeVisible();
 await expect(page.locator(".ppw-calendar-event-strap")).toContainText(["WWE"]);
 expect(methods).toEqual(["calendar"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
