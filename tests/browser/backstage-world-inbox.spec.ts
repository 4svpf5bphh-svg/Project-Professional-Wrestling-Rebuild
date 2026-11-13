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
    return r.fulfill({json:{status:"APPLIED",revision:5}});
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
  expect(calls.filter(v=>v==="backstage")).toHaveLength(2);
  expect(calls.filter(v=>v==="respondBackstageNetwork")).toHaveLength(1);
  expect(calls.filter(v=>v==="markBackstageWorldRead")).toHaveLength(2);
  expect(calls.some(v=>/groq|generate|worldAdvance/i.test(v))).toBe(false);
 });
}
