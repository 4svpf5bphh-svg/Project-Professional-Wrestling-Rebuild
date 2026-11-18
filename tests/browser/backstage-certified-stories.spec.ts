import {test,expect} from "@playwright/test";

/** Storyline correspondence is an earned channel, not another scripted
 * wrestler conversation or a fabricated staff request. */
for(const width of [320,390]){
 test("Certified character scenes earn a dedicated, private Backstage Storylines lane at "+width+"px",
 async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const overview={world:{id:"world",revision:8,name:"PPW",year:1,week:5,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
    cash:250000,debt:0,lastWeeklyNet:8000,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:false,backstageUnreadCount:2}}};
  const mailId=(v:string)=>"backstage-world:"+v.repeat(32);
  const mail=[
   {id:mailId("a"),kind:"LOCKER_ROOM",sender:"Character One",
    subject:"About that chapter we put on air",
    body:"My interview on The Lottery gave my character an on-screen chapter. The audience got behind that moment.",
    action:"PROGRAMMES",createdWeekIndex:4,read:false,
    storyChapter:true,targetPersonId:"cast-one"},
   {id:mailId("b"),kind:"STAFF",sender:"Creative Director",
    subject:"Creative review of an on-air storyline",
    body:"The faction story had a certified interview on The Lottery. The response was quiet.",
    action:"PROGRAMMES",createdWeekIndex:4,read:false,storyChapter:true},
   {id:mailId("c"),kind:"STAFF",sender:"Medical Director",
    subject:"Roster fatigue",body:"Real medical warning",
    action:"STAFF",createdWeekIndex:4,read:true},
   {id:mailId("d"),kind:"LOCKER_ROOM",sender:"Another Wrestler",
    subject:"A teammate conversation",body:"An existing separate thread",
    action:"PROGRAMMES",createdWeekIndex:4,read:true,targetPersonId:"other"}
  ];
  const read:string[]=[],calls:string[]=[];
  await page.route("**/api/session",r=>r.fulfill({json:{
   worldId:"world",playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const x=r.request().postDataJSON() as {method:string;mailId?:string};
   calls.push(x.method);
   if(x.method==="backstage")return r.fulfill({json:{
    personId:null,worldYear:1,worldWeek:5,worldRevision:8,canEdit:true,
    roster:[{personId:"other",name:"Another Wrestler",isCurrent:true,
     latestIncoming:null,lastMessage:{status:"ACCEPTED",requested_gimmick_id:"HERO"}}],
    persona:null,history:[],recentRequests:[],conversations:[],memories:[],
    archetypes:[],documentedAlternates:[],nextPitchWeek:0,worldMessages:mail}});
   if(x.method==="markBackstageWorldRead"){
    read.push(x.mailId!);
    const item=mail.find(m=>m.id===x.mailId);
    if(item)item.read=true;
    return r.fulfill({json:{readCount:1}});
   }
   if(x.method==="overview")return r.fulfill({json:overview});
   return r.fulfill({json:{}});
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:"Storylines"}).click();
  await expect(page.locator('.ppw-backstage-world-contact[data-story-chapter="true"]'))
   .toHaveCount(2);
  await expect(page.locator(".ppw-backstage-contact")).toHaveCount(2,
   "The dedicated story lane excludes ordinary wrestler conversations and staff warnings");
  await page.getByRole("button",{name:/About that chapter we put on air/}).click();
  const wrestler=page.getByLabel("Message from Character One");
  await expect(wrestler).toContainText("The Lottery");
  await expect(wrestler).toContainText("actual completed Programme chapter");
  await expect(wrestler).toContainText("Plan a creative response");
  await expect(wrestler).toContainText("View wrestler dossier");
  await expect.poll(()=>read.length).toBe(1);
  await page.getByRole("button",{name:"Back to messages"}).click();
  await expect(page.locator(".ppw-backstage-world-contact")).toHaveCount(2);
  await page.getByRole("button",{name:/Creative review of an on-air storyline/}).click();
  const creative=page.getByLabel("Message from Creative Director");
  await expect(creative).toContainText("faction story");
  await expect(creative).toContainText("verified audience response");
  await expect(creative).toContainText("Plan a creative response");
  await expect(creative).not.toContainText("I'll refresh the rivalries");
  await expect.poll(()=>read.length).toBe(2);
  expect(calls.filter(x=>x==="backstage")).toHaveLength(1);
  expect(calls.some(x=>/groq|generate|advance/i.test(x))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
