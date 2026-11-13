import {test,expect} from "@playwright/test";

/** The public World news and actual staff channels arrive through the existing
 * authenticated Backstage RPC. Opening them writes only a private read receipt.
 */
for(const width of [320,390]){
 test("Home Backstage unread badge opens private real-world messages at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const overview={world:{id:"world",revision:4,name:"Genesis",year:1,week:5,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",
    cash:250000,debt:0,lastWeeklyNet:8000,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:false,backstageUnreadCount:2,
     plannedShows:1,expiringTalent:false,pendingContractOffers:false}}};
  const session={worldId:"world",playerId:"owner",csrfToken:"opaque",
   overview,availablePromotions:[]};
  const id=(ch:string)=>"backstage-world:"+ch.repeat(32);
  const sources=[
   {id:id("a"),kind:"NETWORK",sender:"VibeFlix",
    subject:"VibeFlix demands better television from CWA",
    body:"Three weeks of certified audience shortfalls triggered a network warning.",
    action:"COMMERCIALS",createdWeekIndex:4,read:false,canRespond:true,
    networkResponse:undefined as {decision:string;status:string;dueWeekIndex:number}|undefined},
   {id:id("b"),kind:"STAFF",sender:"Dr Lena Winters",
    subject:"Our roster needs a breather",body:"Three contracted wrestlers are fatigued.",
    action:"STAFF",createdWeekIndex:4,read:false},
   {id:id("c"),kind:"SCOUT",sender:"Anika Maddox",
    subject:"A potential free agent is worth a look",
    body:"One talent is available to discuss terms, but no contract has been agreed.",
    targetPersonId:"available-1",action:"MARKET",createdWeekIndex:2,read:true},
   {id:id("d"),kind:"FREE_AGENT",sender:"Available Prospect",
    subject:"Could we talk about a booking?",
    body:"I caught one of your completed shows. I'm between contracts.",
    targetPersonId:"available-1",action:"MARKET",createdWeekIndex:1,read:true}
  ];
  const calls:string[]=[];
  const read:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const x=r.request().postDataJSON() as {method:string;mailId?:string};
   calls.push(x.method);
   if(x.method==="overview")return r.fulfill({json:overview});
   if(x.method==="backstage")return r.fulfill({json:{
    personId:null,worldYear:1,worldWeek:5,worldRevision:4,canEdit:true,
    roster:[],persona:null,history:[],recentRequests:[],conversations:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    worldMessages:sources
   }});
   if(x.method==="respondBackstageNetwork"){
    expect(x.mailId).toBe(id("a"));
    expect((x as {decision?:string}).decision).toBe("COMMIT_RECOVERY");
    sources[0]!.canRespond=false;
    sources[0]!.networkResponse={decision:"COMMIT_RECOVERY",status:"PENDING",dueWeekIndex:7};
    return r.fulfill({json:{status:"APPLIED",revision:5,
     result:{mailId:id("a"),decision:"COMMIT_RECOVERY",status:"PENDING",dueWeekIndex:7}}});
   }
   if(x.method==="markBackstageWorldRead"){
    expect(x.mailId).toMatch(/^backstage-world:[a-f0-9]{32}$/);
    read.push(x.mailId!);
    const item=sources.find(m=>m.id===x.mailId)!;item.read=true;
    return r.fulfill({json:{readCount:1}});
   }
   return r.fulfill({json:{}});
  });
  await page.goto("/#/home");
  const shortcut=page.getByRole("button",{name:"Open Backstage, 2 unread messages"});
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  await expect(page).toHaveURL(/#\/backstage\/unread$/);
  await expect(page.locator(".ppw-backstage-world-contact")).toHaveCount(2);
  await page.getByRole("button",{name:"Networks"}).click();
  await expect(page.locator(".ppw-backstage-world-contact")).toHaveCount(1);
  await page.getByRole("button",{name:/VibeFlix demands better television/}).click();
  const network=page.getByLabel("Message from VibeFlix");
  await expect(network).toBeVisible();
  await expect(network).toContainText("certified audience shortfalls");
  await expect(network).toContainText("Review broadcaster");
  await page.getByRole("button",{name:"Promise to improve ratings"}).click();
  await expect.poll(()=>calls.filter(v=>v==="respondBackstageNetwork").length).toBe(1);
  await expect(page.locator(".ppw-alert.ppw-error")).toHaveCount(0);
  await expect(network).toContainText("next three weeks");
  await expect(network).toContainText("Judge our next broadcasts");
  await expect(page.getByRole("button",{name:"Promise to improve ratings"})).toHaveCount(0);
  await expect.poll(()=>read.length).toBe(1);
  await page.getByRole("button",{name:"Back to messages"}).click();
  await page.getByRole("button",{name:"Staff",exact:true}).click();
  await expect(page.locator(".ppw-backstage-world-contact")).toHaveCount(1);
  await page.getByRole("button",{name:/Dr Lena Winters/}).click();
  await expect(page.getByLabel("Message from Dr Lena Winters"))
   .toContainText("contracted wrestlers are fatigued");
  await expect.poll(()=>read.length).toBe(2);
  await expect(page.locator(".ppw-backstage-world-thread")).toBeVisible();
  await page.getByRole("button",{name:"Back to messages"}).click();
  await page.getByRole("button",{name:"Free agents",exact:true}).click();
  await expect(page.locator(".ppw-backstage-world-contact")).toHaveCount(1);
  await page.getByRole("button",{name:/Available Prospect/}).click();
  await expect(page.getByLabel("Message from Available Prospect"))
   .toContainText("between contracts");
  await expect(page.getByRole("button",{name:"View wrestler dossier"})).toBeVisible();
  await expect(page.locator("#account")).toBeHidden();
  await expect(page.locator(".ppw-bottom-navigation")).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
  expect(calls.filter(v=>v==="backstage")).toHaveLength(1);
  expect(calls.filter(v=>v==="respondBackstageNetwork")).toHaveLength(1);
  expect(calls.filter(v=>v==="markBackstageWorldRead")).toHaveLength(2);
  expect(calls.some(v=>/groq|generate|worldAdvance/i.test(v))).toBe(false);
 });
}


for(const width of [320,390]){
 test("A verified hardcore TV complaint receives a manager promise at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const overview={world:{id:"world",revision:8,name:"Genesis",year:1,week:6,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",
    cash:250000,debt:0,lastWeeklyNet:8000,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:false,backstageUnreadCount:1,
     expiringTalent:false,pendingContractOffers:false}}};
  const mailId="backstage-world:"+"f".repeat(32);
  const messages=[{id:mailId,kind:"NETWORK",sender:"BBS Sports",
   subject:"About the hardcore match on CWA Friday",
   body:"Your completed programme CWA Friday included a hardcore-rules match.",
   action:"COMMERCIALS",createdWeekIndex:4,read:false,
   canRespond:true,contentConcern:true,
   networkResponse:undefined as {decision:string;status:string;dueWeekIndex:number}|undefined}];
  const seen:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{worldId:"world",
   playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const x=r.request().postDataJSON() as {method:string;mailId?:string;decision?:string};
   seen.push(x.method);
   if(x.method==="backstage")return r.fulfill({json:{
    personId:null,worldYear:1,worldWeek:6,worldRevision:8,canEdit:true,
    roster:[],persona:null,history:[],recentRequests:[],conversations:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    worldMessages:messages}});
   if(x.method==="markBackstageWorldRead"){messages[0]!.read=true;
    return r.fulfill({json:{readCount:1}});}
   if(x.method==="respondBackstageNetwork"){
    expect(x.mailId).toBe(mailId);
    expect(x.decision).toBe("COMMIT_STANDARDS");
    messages[0]!.canRespond=false;
    messages[0]!.networkResponse={decision:"COMMIT_STANDARDS",
     status:"PENDING",dueWeekIndex:8};
    return r.fulfill({json:{status:"APPLIED",revision:9,
     result:{mailId,decision:"COMMIT_STANDARDS",status:"PENDING",dueWeekIndex:8}}});
   }
   if(x.method==="overview")return r.fulfill({json:overview});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:/About the hardcore match on CWA Friday/}).click();
  const thread=page.getByLabel("Message from BBS Sports");
  await expect(thread).toContainText("hardcore-rules match");
  await expect(thread).toContainText("completed television match");
  await expect(page.getByRole("button",{name:"Promise to improve ratings"})).toHaveCount(0);
  await page.getByRole("button",{name:"Keep hardcore off our next TV show"}).click();
  await expect(thread).toContainText("hardcore stipulations off our next TV broadcasts");
  await expect(thread).toContainText("next three weeks");
  await expect(page.getByRole("button",{name:"Keep hardcore off our next TV show"})).toHaveCount(0);
  expect(seen.filter(x=>x==="respondBackstageNetwork")).toHaveLength(1);
  expect(seen.filter(x=>x==="backstage")).toHaveLength(1);
  expect(seen.some(x=>/generate|groq|advance/i.test(x))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}


for(const width of [320,390]){
 test("Medical and Creative staff can answer a real workload warning at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const overview={world:{id:"world",revision:4,name:"Genesis",year:1,week:5,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",cash:200000,
    debt:0,lastWeeklyNet:8000,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:false,backstageUnreadCount:2,
     plannedShows:1,expiringTalent:false,pendingContractOffers:false}}};
  const mailId="backstage-world:"+"e".repeat(32),creativeId="backstage-world:"+"f".repeat(32);
  const messages=[
   {id:mailId,kind:"STAFF",sender:"Dr Lena Winters",
    subject:"The roster needs a breather",
    body:"Two contracted wrestlers have fatigue at 70 or above.",
    action:"STAFF",createdWeekIndex:4,read:false,canStaffRespond:true,
    staffResponse:undefined as {decision:string;status:string;dueWeekIndex:number}|undefined},
   {id:creativeId,kind:"STAFF",sender:"Creative Director",
    subject:"Our rivalries are running in circles",
    body:"Three active programmes have repeated without moving forward.",
    action:"PROGRAMMES",createdWeekIndex:4,read:false,canStaffRespond:true,
    staffResponse:undefined as {decision:string;status:string;dueWeekIndex:number}|undefined}
  ];
  let revision=4;const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{worldId:"world",
   playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const x=r.request().postDataJSON() as {method:string;mailId?:string;decision?:string;
    expectedRevision?:number};
   calls.push(x.method);
   if(x.method==="backstage")return r.fulfill({json:{
    personId:null,worldYear:1,worldWeek:5,worldRevision:revision,canEdit:true,
    roster:[],persona:null,history:[],recentRequests:[],conversations:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    worldMessages:messages}});
   if(x.method==="markBackstageWorldRead"){
    const m=messages.find(m=>m.id===x.mailId);if(m)m.read=true;
    return r.fulfill({json:{readCount:1}});
   }
   if(x.method==="respondBackstageStaff"){
    const m=messages.find(m=>m.id===x.mailId)!;
    expect(m).toBeDefined();
    expect(x.decision).toBe("COMMIT");
    expect(x.expectedRevision).toBe(revision);
    revision++;
    m.canStaffRespond=false;
    m.staffResponse={decision:"COMMIT",status:"PENDING",dueWeekIndex:8};
    return r.fulfill({json:{status:"APPLIED",revision,
     result:{mailId:x.mailId,decision:"COMMIT",status:"PENDING",dueWeekIndex:8}}});
   }
   if(x.method==="overview")return r.fulfill({json:overview});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:"Staff",exact:true}).click();
  await page.getByRole("button",{name:/The roster needs a breather/}).click();
  const medical=page.getByLabel("Message from Dr Lena Winters");
  await expect(medical).toContainText("fatigue at 70");
  await page.getByRole("button",{name:"I'll rest the tired roster"}).click();
  await expect(medical).toContainText("I'll manage the workload");
  await expect(medical).toContainText("next three weeks");
  await expect(page.getByRole("button",{name:"I'll rest the tired roster"})).toHaveCount(0);
  await page.getByRole("button",{name:"Back to messages"}).click();
  await page.getByRole("button",{name:/Our rivalries are running in circles/}).click();
  const creative=page.getByLabel("Message from Creative Director");
  await expect(creative).toContainText("Three active programmes");
  await page.getByRole("button",{name:"I'll refresh the rivalries"}).click();
  await expect(creative).toContainText("I'll freshen up these rivalries");
  expect(calls.filter(x=>x==="respondBackstageStaff")).toHaveLength(2);
  expect(calls.filter(x=>x==="backstage")).toHaveLength(1);
  expect(calls.some(x=>/groq|generate|worldAdvance/i.test(x))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}


for(const width of [320,390]){
 test("Verified free agent replies open the original focused contract offer on "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const overview={world:{id:"world",revision:4,name:"Genesis",year:1,week:5,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",
    cash:5_000_000,debt:0,lastWeeklyNet:8000,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:false,backstageUnreadCount:1,
     plannedShows:1,expiringTalent:false,pendingContractOffers:false}}};
  const personId="verified-prospect",name="Available Prospect";
  const mailId="backstage-world:"+"a".repeat(32);
  const messages=[{id:mailId,kind:"FREE_AGENT",sender:name,
   subject:"Could we talk about a booking?",body:"I caught your certified show and wondered if there might be a spot.",
   action:"MARKET",targetPersonId:personId,createdWeekIndex:1,read:false,
   canFreeAgentRespond:true,
   freeAgentResponse:undefined as {decision:string;status:string}|undefined}];
  const market={year:1,week:5,currentWeekIndex:4,worldRevision:5,canEdit:true,
   view:"MARKET",offset:0,hasMore:false,offerBudget:{hasTalentManager:false,
    talentManager:null,cash:5_000_000,weeklyIncome:90_000,
    weeklyOverhead:25_000,weeklyGuarantees:30_000,
    weeklyStaffPayroll:5_000,weeklyWageLimit:55_000,cashReserve:300_000,
    signedRosterExposure:1_000_000},
   people:[{personId,name,division:"MEN",availability:"FREE_AGENT",
    interest:"INTERESTED",pendingOffer:false,estimatedWeeklyValue:10_000,
    recognition:60,popularity:55,momentum:50,inRingQuality:78,
    matchCraft:76,presentation:82,morale:75}]};
  const calls:string[]=[];const filters:Record<string,unknown>[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const x=r.request().postDataJSON() as {method:string;mailId?:string;
    decision?:string;filter?:Record<string,unknown>};
   calls.push(x.method);
   if(x.method==="backstage")return r.fulfill({json:{
    personId:null,worldYear:1,worldWeek:5,worldRevision:4,canEdit:true,
    roster:[],persona:null,history:[],recentRequests:[],conversations:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    worldMessages:messages}});
   if(x.method==="markBackstageWorldRead"){messages[0]!.read=true;
    return r.fulfill({json:{readCount:1}});}
   if(x.method==="respondBackstageFreeAgent"){
    expect(x.mailId).toBe(mailId);expect(x.decision).toBe("INVITE");
    messages[0]!.canFreeAgentRespond=false;
    messages[0]!.freeAgentResponse={decision:"INVITE",status:"INVITED"};
    return r.fulfill({json:{status:"APPLIED",revision:5,
     result:{mailId,personId,decision:"INVITE",status:"INVITED"}}});
   }
   if(x.method==="wrestlerDirectory"){filters.push(x.filter??{});
    return r.fulfill({json:market});}
   if(x.method==="overview")return r.fulfill({json:overview});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:/Could we talk about a booking/}).click();
  const thread=page.getByLabel("Message from Available Prospect");
  await expect(thread).toContainText("No contract or appearance has been agreed");
  await page.getByRole("button",{name:"Let's discuss a contract"}).click();
  await expect(thread).toContainText("No offer has been made");
  await expect(page.getByRole("button",{name:"Let's discuss a contract"})).toHaveCount(0);
  await page.getByRole("button",{name:"Prepare real contract offer"}).click();
  await expect(page).toHaveURL(/#\/market$/);
  await expect(page.getByRole("heading",{name:"Talent Market"})).toBeVisible();
  await expect(page.locator(".ppw-directory-offer")).toBeVisible();
  await expect(page.locator(".ppw-directory-card").first()).toContainText(name);
  expect(filters).toHaveLength(1);
  expect(filters[0]?.search).toBe(name);
  expect(calls.filter(x=>x==="respondBackstageFreeAgent")).toHaveLength(1);
  expect(calls.filter(x=>x==="backstage")).toHaveLength(1);
  expect(calls.filter(x=>x==="submitContractOffer")).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}


for(const width of [320,390]){
 test("Talent Manager opt-in from a genuine expiring contract message at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const overview={world:{id:"world",revision:4,name:"Genesis",year:1,week:5,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",cash:500000,
    debt:0,lastWeeklyNet:10000,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:false,backstageUnreadCount:1,
     plannedShows:1,expiringTalent:true,pendingContractOffers:false}}};
  const mailId="backstage-world:"+"d".repeat(32);
  const messages=[{id:mailId,kind:"STAFF",sender:"Morgan Keane",
   subject:"Contract renewals need a look",
   body:"Two signed contracts expire soon. I can prepare unchanged renewal offers with your authorisation; wrestlers still decide.",
   action:"CONTRACTS",createdWeekIndex:4,read:false,
   canStaffRespond:true,
   staffResponse:undefined as {decision:string;status:string;dueWeekIndex:number}|undefined}];
  const calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const x=r.request().postDataJSON() as {method:string;mailId?:string;decision?:string;
    expectedRevision?:number};
   calls.push(x.method);
   if(x.method==="backstage")return r.fulfill({json:{
    personId:null,worldYear:1,worldWeek:5,worldRevision:4,canEdit:true,
    roster:[],persona:null,history:[],recentRequests:[],conversations:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    worldMessages:messages}});
   if(x.method==="markBackstageWorldRead"){messages[0]!.read=true;
    return r.fulfill({json:{readCount:1}});}
   if(x.method==="respondBackstageStaff"){
    expect(x.mailId).toBe(mailId);expect(x.decision).toBe("COMMIT");
    expect(x.expectedRevision).toBe(4);
    messages[0]!.canStaffRespond=false;
    messages[0]!.staffResponse={decision:"COMMIT",status:"PENDING",dueWeekIndex:7};
    return r.fulfill({json:{status:"APPLIED",revision:5,
     result:{mailId,decision:"COMMIT",status:"PENDING",dueWeekIndex:7}}});
   }
   if(x.method==="overview")return r.fulfill({json:overview});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:/Contract renewals need a look/}).click();
  const thread=page.getByLabel("Message from Morgan Keane");
  await expect(thread).toContainText("wrestlers still decide");
  await page.getByRole("button",{name:"Authorise same-terms renewal proposals"}).click();
  await expect(thread).toContainText("I authorise unchanged-terms renewal proposals");
  await expect(thread).toContainText("World Lock");
  await expect(thread).toContainText("wrestlers still decide");
  await expect(page.getByRole("button",{name:"Authorise same-terms renewal proposals"}))
   .toHaveCount(0);
  expect(calls.filter(x=>x==="respondBackstageStaff")).toHaveLength(1);
  expect(calls.filter(x=>x==="backstage")).toHaveLength(1);
  expect(calls.some(x=>/submitContractOffer|advanceWorld|signContract/i.test(x))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}


for(const width of [320,390]){
 test("Real staff disagreement and strained tag partners use distinct authoritative Backstage decisions at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const overview={world:{id:"world",revision:4,name:"Genesis",year:1,week:5,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",
    cash:500000,debt:0,lastWeeklyNet:10000,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:true,backstageUnreadCount:2,
     plannedShows:1,expiringTalent:false,pendingContractOffers:false}}};
  const mailId="backstage-world:"+"e".repeat(32);
  const messages=[{id:mailId,kind:"STAFF",sender:"Dr Lena Winters",
   subject:"Medical and Creative see Toby differently",
   body:"Toby has fatigue at 84 while their active programme has repeated 5 times. Medical wants a lighter workload. Creative needs the programme to move forward.",
   action:"STAFF",targetPersonId:"toby",createdWeekIndex:4,read:false,
   canDisagree:true,
   disagreementResponse:undefined as {decision:string;status:string;dueWeekIndex:number}|undefined}];
  const roster=[
   {personId:"wrestler",name:"Lance Archer",isCurrent:true,morale:60,
    momentum:50,lastMessage:null,latestIncoming:{
     request_id:"strain-1",kind:"PARTNERSHIP",status:"PENDING",
     created_week_index:4,read_week_index:null,archived:false}},
   {personId:"other",name:"Samoa Joe",isCurrent:true,morale:70,
    momentum:66,lastMessage:null,latestIncoming:{
     request_id:"other-1",kind:"CONTRACT",status:"PENDING",
     created_week_index:4,read_week_index:null,archived:false}}
  ];
  const calls:string[]=[];
  let revision=4,mediated=false;
  const relationship=()=>({
   conversationId:"strain-1",kind:"PARTNERSHIP",createdWeekIndex:4,
   respondedWeekIndex:mediated?4:null,relatedPersonId:"other",
   relatedPersonName:"Samoa Joe",status:mediated?"ANSWERED":"PENDING",
   decision:mediated?"MEDIATE":null,dueWeekIndex:null,
   promisedRole:null,observedMatchShows:null,observedFeaturedShows:null,
   assessmentReason:null,trustDelta:0,workingVerifiedShows:3,
   workingTrustDelta:-0.6,averageCrowd:null,verifiedSinglesShows:null,
   professionalTrust:38,verifiedTagShows:3,averageExecution:34,
   followThroughWeekIndex:null,followThroughKind:null});
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const x=r.request().postDataJSON() as {method:string;personId?:string;
    mailId?:string;decision?:string;expectedRevision?:number};
   calls.push(x.method);
   if(x.method==="backstage")return r.fulfill({json:{
    personId:x.personId??null,personName:x.personId==="wrestler"?"Lance Archer":"",
    worldYear:1,worldWeek:5,worldRevision:revision,canEdit:true,
    roster,persona:null,history:[],recentRequests:[],conversations:
     x.personId==="wrestler"?[relationship()]:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    worldMessages:x.personId?[]:messages}});
   if(x.method==="markBackstageWorldRead"){messages[0]!.read=true;
    return r.fulfill({json:{readCount:1}});}
   if(x.method==="markBackstageRead")return r.fulfill({json:{readCount:1}});
   if(x.method==="respondBackstageDisagreement"){
    expect(x.mailId).toBe(mailId);expect(x.decision).toBe("PRIORITISE_HEALTH");
    expect(x.expectedRevision).toBe(4);
    messages[0]!.canDisagree=false;
    messages[0]!.disagreementResponse={decision:"PRIORITISE_HEALTH",
     status:"PENDING",dueWeekIndex:7};
    revision=5;
    return r.fulfill({json:{status:"APPLIED",revision,
     result:{mailId,decision:"PRIORITISE_HEALTH",
      status:"PENDING",dueWeekIndex:7}}});
   }
   if(x.method==="backstageDecision"){
    expect(x.decision).toBe("MEDIATE");
    expect(x.expectedRevision).toBe(5);
    mediated=true;revision=6;
    return r.fulfill({json:{status:"APPLIED",revision,
     result:{status:"ANSWERED",decision:"MEDIATE"}}});
   }
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:"Staff disagreements"}).click();
  await expect(page.locator(".ppw-backstage-world-contact")).toHaveCount(1);
  await page.getByRole("button",{name:/Medical and Creative see Toby differently/}).click();
  const conflict=page.getByLabel("Message from Dr Lena Winters");
  await expect(conflict).toContainText("programme has repeated 5 times");
  await page.getByRole("button",{name:"Prioritise medical recovery"}).click();
  await expect(conflict).toContainText("real fatigue or programme changes");
  await expect(page.getByRole("button",{name:"Prioritise medical recovery"})).toHaveCount(0);
  await page.getByRole("button",{name:"Back to messages"}).click();
  await page.getByRole("button",{name:"Locker room"}).click();
  const locker=page.locator(".ppw-backstage-contacts .ppw-backstage-contact");
  await expect(locker).toHaveCount(1);
  await expect(locker).toContainText("Lance Archer");
  await locker.click();
  const thread=page.getByLabel("Conversation with Lance Archer");
  await expect(thread).toBeVisible();
  await expect(thread).toContainText("Samoa Joe");
  const mediation=page.locator(".ppw-backstage-reply-choice").filter({hasText:"Mediate backstage"});
  await expect(mediation).toBeVisible();
  await mediation.click();
  await expect(thread).toContainText("Mediate backstage");
  expect(calls.filter(x=>x==="respondBackstageDisagreement")).toHaveLength(1);
  expect(calls.filter(x=>x==="backstageDecision")).toHaveLength(1);
  expect(calls.filter(x=>x==="backstage"&&x)).toHaveLength(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
