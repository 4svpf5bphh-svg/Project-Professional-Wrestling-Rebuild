import {test,expect} from "@playwright/test";

/** Self-contained rendered visual QA; no world writes, no production credentials. */
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:5000000,
 debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}};
const session={worldId:"genesis",playerId:"owner",csrfToken:"secret",
 overview,availablePromotions:[]};
const person=(personId:string,name:string,division:"MEN"|"WOMEN"="MEN")=>({
 personId,name,division,popularity:79,recognition:75,momentum:80,
 inRingQuality:78,matchCraft:82,presentation:76
});
for(const width of [320,390]){
 test("iPhone "+width+"px: cached wrestler cards keep a portrait well after image failure and never overlap text",async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  const calls:string[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/commons.wikimedia.org/**",route=>route.fulfill({status:404,body:""}));
  await page.route("**/api/card",route=>{
   const method=String(route.request().postDataJSON().method);calls.push(method);
   return route.fulfill({json:method==="tagTeams"?{
    year:1,week:5,worldRevision:4,canEdit:true,roster:[
     person("joe","Samoa Joe"),person("unpictured","Unpictured Wrestler","WOMEN")],teams:[]
   }:{}});
  });
  await page.goto("/#/teams");
  const cards=page.locator(".ppw-pair-picks .ppw-wrestler-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-portrait","unavailable");
  await expect(cards.nth(1)).toHaveAttribute("data-portrait","unavailable");
  await expect(page.locator(".ppw-wrestler-media")).toHaveCount(2);
  for(const card of await cards.all()){
   const boxes=await card.evaluate(el=>{
    const rect=(query:string)=>{
     const r=el.querySelector(query)?.getBoundingClientRect();
     return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}:null;
    };
    return {media:rect(".ppw-wrestler-media"),name:rect(".ppw-wrestler-name"),
      copy:rect(".ppw-wrestler-copy"),card:el.getBoundingClientRect().width};
   });
   expect(boxes.media?.width).toBeGreaterThan(40);
   expect(boxes.name?.left??0).toBeGreaterThan((boxes.media?.right??0)-1);
   expect(boxes.copy?.width).toBeGreaterThan(70);
   expect(boxes.card).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await testInfo.attach("wrestler-fallback-"+width,{
   body:await page.screenshot({fullPage:true}),contentType:"image/png"});
  expect(calls).toEqual(["tagTeams"]);
 });
 test("iPhone "+width+"px: actual show posters load without obstructing calendar and actions",async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});
  const weekly={seriesId:"dynamite",name:"AEW Dynamite",role:"FLAGSHIP",eventType:"REGULAR",
   cadenceWeeks:1,anchorWeek:0,importance:70,active:true};
  const ppv={seriesId:"all-in",name:"All In",role:"PREMIUM",eventType:"MAJOR",
   cadenceWeeks:52,anchorWeek:4,importance:97,active:true};
  const requests:string[]=[];
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const method=String(route.request().postDataJSON().method);requests.push(method);
   return route.fulfill({json:method==="calendar"?{promotionId:"aew",promotionName:"AEW",
    year:1,week:5,worldRevision:4,canEdit:false,series:[weekly,ppv],bookings:[],
    weeks:[{year:1,week:5,offset:0,shows:[weekly,ppv]}],worldWeeks:[]}:{}});
  });
  await page.goto("/#/calendar");
  await expect(page.locator(".ppw-calendar-event-art")).toHaveCount(2);
  await expect(page.locator(".ppw-calendar-event-art").nth(0))
   .toHaveAttribute("src",/\/events\/dynamite\.svg$/);
  await expect(page.locator(".ppw-calendar-event-art").nth(1))
   .toHaveAttribute("src",/\/events\/all-in\.svg$/);
  await expect.poll(async()=>page.locator(".ppw-calendar-event-art").evaluateAll(
   images=>images.every(img=>(img as HTMLImageElement).naturalWidth>=1200))).toBe(true);
  const sizes=await page.locator(".ppw-calendar-event-art").evaluateAll(nodes=>nodes.map(n=>({
   width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
  expect(sizes[0]?.height).toBeGreaterThanOrEqual(80);
  expect(sizes[1]?.height).toBeGreaterThan(sizes[0]!.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await testInfo.attach("event-calendar-"+width,{
   body:await page.screenshot({fullPage:true}),contentType:"image/png"});
  expect(requests).toEqual(["calendar"]);
 });
}
test("Backstage owns the entire phone, preserves inbox state, and leaves for the previous desk",async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});
 const roster={view:"ROSTER",year:1,week:5,worldRevision:4,canEdit:true,
  hasMore:false,currentWeekIndex:4,people:[]};
 const contact={personId:"ada",name:"Ada Stone",isCurrent:true,morale:67,momentum:58,
  lastMessage:null,latestIncoming:{request_id:"c-1",kind:"CONTRACT",status:"PENDING",
   created_week_index:4,read_week_index:4,archived:false}};
 const backstage={personId:"ada",personName:"Ada Stone",roster:[contact],
  worldYear:1,worldWeek:5,worldRevision:4,canEdit:false,
  persona:{personaName:"Ada Stone",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  recentRequests:[],documentedAlternates:[],history:[],archetypes:[],
  nextPitchWeek:0,conversations:[]};
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON();calls.push(String(req.method));
  return route.fulfill({json:req.method==="wrestlerDirectory"?roster:
   req.method==="backstage"?req.personId?backstage:{...backstage,personId:null,personName:"",persona:null}:{}});
 });
 await page.goto("/#/roster");
 await expect(page.getByRole("heading",{name:"My Roster"})).toBeVisible();
 await page.getByRole("button",{name:"Open promotion menu"}).click();
 await page.getByRole("navigation",{name:"Promotion navigation"})
  .getByRole("button",{name:"Talent",exact:true}).click();
 await page.getByRole("navigation",{name:"Promotion navigation"})
  .getByRole("button",{name:/Backstage/}).click();
 await expect(page).toHaveURL(/#\/backstage$/);
 const menu=page.getByRole("button",{name:"Open promotion menu"});
 await expect(menu).toBeHidden();
 await expect(page.getByRole("button",{name:"Leave Backstage"})).toBeVisible();
 await page.getByRole("button",{name:"Unread",exact:true}).click();
 await page.getByRole("button",{name:"People",exact:true}).click();
 await expect(menu).toBeHidden();
 await page.getByRole("button",{name:"Chats",exact:true}).click();
 await page.locator(".ppw-backstage-contact").first().click();
 await expect(page.getByLabel("Conversation with Ada Stone")).toBeVisible();
 await expect(menu).toBeHidden();
 await page.getByRole("button",{name:"Back to messages"}).click();
 await expect(page.locator(".ppw-messenger-inbox")).toBeVisible();
 await testInfo.attach("backstage-inbox",{
  body:await page.screenshot({fullPage:true}),contentType:"image/png"});
 await page.getByRole("button",{name:"Leave Backstage"}).click();
 await expect(page).toHaveURL(/#\/roster$/);
 await expect(menu).toBeVisible();
 expect(calls.filter(x=>x==="backstage")).toHaveLength(2);
});
