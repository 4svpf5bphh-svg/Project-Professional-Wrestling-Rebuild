import {test,expect} from "@playwright/test";

test("320px Backstage: actual SMS choices retry the same World command after a lost mobile reply",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",
   tier:"LOCAL",cash:200000,debt:0}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",
  overview,availablePromotions:[]};
 let revision=4,answered=false,read=0,writes=0;
 const commands:string[]=[];
 const wrestler={personId:"ada",name:"Ada Stone",isCurrent:true,
  morale:67,momentum:58,lastMessage:null,
  latestIncoming:{request_id:"c-1",kind:"CONTRACT",status:"PENDING",
   created_week_index:4,read_week_index:null,archived:false}};
 const item=()=>({conversationId:"c-1",kind:"CONTRACT",createdWeekIndex:4,
  respondedWeekIndex:answered?4:null,relatedPersonId:null,
  status:answered?"ANSWERED":"PENDING",decision:answered?"TALK":null,
  dueWeekIndex:null,promisedRole:null,observedMatchShows:null,
  observedFeaturedShows:null,assessmentReason:null,trustDelta:0,
  workingVerifiedShows:null,workingTrustDelta:null,averageCrowd:null,
  verifiedSinglesShows:null,professionalTrust:null,verifiedTagShows:null,
  averageExecution:null,followThroughWeekIndex:null,followThroughKind:null});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",async r=>{
  const req=r.request().postDataJSON() as Record<string,unknown>;
  if(req.method==="backstage"){
   return r.fulfill({json:{
    personId:req.personId==="ada"?"ada":null,
    personName:req.personId==="ada"?"Ada Stone":"",
    worldYear:1,worldWeek:5,worldRevision:revision,canEdit:true,
    roster:[wrestler],persona:null,archetypes:[],history:[],
    memories:[],recentRequests:[],nextPitchWeek:0,documentedAlternates:[],
    conversations:req.personId==="ada"?[item()]:[]
   }});
  }
  if(req.method==="markBackstageRead"){read++;return r.fulfill({json:{readCount:1}});}
  if(req.method==="backstageDecision"){
   expect(req.conversationId).toBe("c-1");
   expect(req.decision).toBe("TALK");
   commands.push(String(req.requestId));
   if(!answered){
    expect(req.expectedRevision).toBe(4);
    writes++;answered=true;revision=5;
    return r.fulfill({status:503,contentType:"application/json",
     body:JSON.stringify({error:"Mobile connection dropped"})});
   }
   return r.fulfill({json:{status:"REPLAYED",result:{status:"ANSWERED"}}});
  }
  return r.fulfill({json:{}});
 });
 await page.goto("/#/backstage");
 await page.getByRole("button",{name:/Ada Stone/}).click();
 await expect(page.getByLabel("Conversation with Ada Stone")).toBeVisible();
 const sentence="Let's talk about your deal and what you'd want next. Nothing is signed yet.";
 const send=page.getByRole("button",{name:sentence});
 await expect(send).toContainText("Hear them out");
 await send.click();
 await expect(page.getByText(/Your reply was not confirmed\. Retrying sends the same message/)).toBeVisible();
 await page.getByRole("button",{name:sentence}).click();
 await expect(page.locator(".ppw-persona-bubble.ppw-persona-out")).toContainText([sentence]);
 await expect(page.locator(".ppw-backstage-reply-choice")).toHaveCount(0);
 await expect(page.locator(".ppw-persona-bubble.ppw-persona-in").last())
  .toContainText("before this deal runs out");
 expect(commands).toHaveLength(2);
 expect(commands[0]).toBe(commands[1]);
 expect(writes).toBe(1);
 expect(read).toBe(1);
 await expect(page.locator("#account")).toBeHidden();
 await expect(page.locator(".ppw-bottom-navigation")).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

/** A real long thread must scroll through the document on iPhone, not stick
 * inside a fixed height flex container after the first few messages. */
for(const width of [320,390]){
 test("Backstage long thread has no blank account header and reaches latest messages at "+width+"px",async({page},testInfo)=>{
  await page.setViewportSize({width,height:width===320?568:844});
  const overview={world:{revision:44,name:"World",year:1,week:20,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"mine",name:"CWA",tier:"LOCAL",cash:200000,debt:0}};
  const conversations=Array.from({length:24},(_,i)=>({
   conversationId:"conversation-"+i,kind:"CREATIVE",createdWeekIndex:i,
   respondedWeekIndex:i,relatedPersonId:null,status:"ANSWERED",
   decision:"TALK",dueWeekIndex:null,promisedRole:null,
   observedMatchShows:null,observedFeaturedShows:null,assessmentReason:null,
   trustDelta:0,workingVerifiedShows:null,workingTrustDelta:null,averageCrowd:null,
   verifiedSinglesShows:null,professionalTrust:null,verifiedTagShows:null,
   averageExecution:null,followThroughWeekIndex:null,followThroughKind:null
  }));
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview,
   availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const req=r.request().postDataJSON() as {method:string;personId?:string};
   if(req.method==="backstage")return r.fulfill({json:{
    personId:req.personId==="ada"?"ada":null,
    personName:req.personId==="ada"?"Ada Stone":"",
    worldYear:1,worldWeek:20,worldRevision:44,canEdit:true,
    roster:[{personId:"ada",name:"Ada Stone",isCurrent:true,morale:55,
     momentum:65,lastMessage:null,latestIncoming:{request_id:"conversation-23",
      kind:"CREATIVE",status:"ANSWERED",created_week_index:23,
      read_week_index:23,archived:false}}],
    persona:null,archetypes:[],history:[],memories:[],recentRequests:[],
    nextPitchWeek:0,documentedAlternates:[],
    conversations:req.personId==="ada"?conversations:[]
   }});
   return r.fulfill({json:{readCount:0}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:/Ada Stone/}).click();
  const thread=page.getByLabel("Conversation with Ada Stone");
  await expect(thread).toBeVisible();
  // Each historical request has an incoming message and a generated reply;
  // this is a test fixture, not 24 single-message threads.
  await expect(thread.locator(".ppw-persona-bubble.ppw-persona-in")).toHaveCount(48);
  await expect(page.locator("#account")).toBeHidden();
  const geometry=await page.evaluate(()=>{
   const exit=document.querySelector(".ppw-backstage-thread-exit")!
    .getBoundingClientRect();
   const chat=document.querySelector(".ppw-persona-chat")!;
   const root=document.querySelector(".ppw-messenger-thread")!;
   return {exitY:exit.y,chatScroll:getComputedStyle(chat).overflowY,
    rootScroll:getComputedStyle(root).overflowY,
    documentHeight:document.scrollingElement!.scrollHeight,viewport:innerHeight,
    horizontal:document.documentElement.scrollWidth-innerWidth};
  });
  expect(geometry.exitY,"Exit belongs immediately below the iPhone safe area").toBeLessThan(100);
  expect(geometry.chatScroll).toBe("visible");
  expect(geometry.rootScroll).toBe("visible");
  expect(geometry.documentHeight).toBeGreaterThan(geometry.viewport+350);
  expect(geometry.horizontal).toBeLessThanOrEqual(1);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath("backstage-"+width+"-top.png")});
  const rect=await thread.boundingBox();expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+Math.min(80,rect!.width/2),rect!.y+Math.min(140,rect!.height/2));
  await page.mouse.wheel(0,1200);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(200);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await expect(thread.locator(".ppw-persona-bubble.ppw-persona-in").last()).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath("backstage-"+width+"-bottom.png")});
  await expect(page.locator(".ppw-bottom-navigation")).toBeHidden();
 });
}
