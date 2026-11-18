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
  await expect(page.locator(".ppw-backstage-contact")).toHaveCount(2);
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

/** The UI must carry an explicitly chosen next beat all the way from the
 * certified Backstage message to the EXACT Programme, not the first feud. */
for(const width of [320,390]){
 test("Backstage reply saves story choice and opens its exact editable Programme at "+width+"px",
 async({page})=>{
  await page.setViewportSize({width,height:width===320?720:844});
  const mailId=(x:string)=>"backstage-world:"+x.repeat(32);
  const source={sourceShowId:"verified-show",sourceSlotId:"scene-12",
   sourceWeekIndex:4,crowdResponse:74,programmeFormat:"SOLO" as const};
  const messages=[
   {id:mailId("a"),kind:"LOCKER_ROOM",sender:"Character B",
    subject:"About that chapter",body:"My actual interview connected.",
    action:"PROGRAMMES",createdWeekIndex:4,read:false,
    storyChapter:true,storyProgrammeId:"story-b",storySource:source,
    canChooseStoryFollowUp:true,targetPersonId:"person-b",
    storyFollowUp:undefined as string|undefined},
   {id:mailId("b"),kind:"STAFF",sender:"Creative Director",
    subject:"A verified creative response",body:"This completed chapter connected.",
    action:"PROGRAMMES",createdWeekIndex:4,read:true,
    storyChapter:true,storyProgrammeId:"story-b",storySource:source,
    canChooseStoryFollowUp:true,storyFollowUp:undefined as string|undefined}
  ];
  const overview={world:{id:"world",revision:8,name:"PPW",year:1,week:5,
   phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
   membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",cash:100000,
    debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY",
    attention:{unpreparedShow:false,pendingBackstage:false,backstageUnreadCount:1}}};
  let revision=8,chosen:string|null=null;const calls:string[]=[];
  const story=(id:string,name:string)=>({
   programmeId:id,programmeFormat:"SOLO",status:"ACTIVE",heat:55,repetition:0,
   activityCount:1,matchCount:0,segmentCount:1,sideAWins:0,sideBWins:0,draws:0,
   championshipId:null,startedWeekIndex:0,endedWeekIndex:null,
   creativeIntent:id==="story-b"&&chosen?{
    blueprintId:"CUSTOM",motivation:"",audienceGoal:"",destination:"",
    followUp:{choice:chosen,sourceShowId:source.sourceShowId,
     sourceSlotId:source.sourceSlotId,sourceWeekIndex:source.sourceWeekIndex}}:null,
   blueprintProgress:null,
   sideA:[{refId:id==="story-b"?"person-b":"person-a",kind:"PERSON",name}],
   sideB:[],recentActivity:[{showId:"verified-show",slotId:"scene-12",kind:"SEGMENT",
    weekIndex:4,crowdResponse:74,winnerSide:null,segmentKind:"INTERVIEW",
    sceneLocation:"INTERVIEW_AREA"}],
   plannedActivity:[],medicalHolds:[],eligibleCreativePeople:[],creativeAgreements:[],
   wrestlerChanges:[],latestFollowUp:null,finale:null
  });
  await page.route("**/api/session",r=>r.fulfill({json:{worldId:"world",
   playerId:"owner",csrfToken:"opaque",overview,availablePromotions:[]}}));
  await page.route("**/api/card",r=>{
   const input=r.request().postDataJSON() as {method:string;mailId?:string;
    choice?:string;requestId?:string;expectedRevision?:number};
   calls.push(input.method);
   if(input.method==="backstage")return r.fulfill({json:{
    personId:null,worldYear:1,worldWeek:5,worldRevision:revision,canEdit:true,
    roster:[],persona:null,history:[],recentRequests:[],conversations:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    worldMessages:messages}});
   if(input.method==="markBackstageWorldRead"){
    const m=messages.find(x=>x.id===input.mailId);if(m)m.read=true;
    return r.fulfill({json:{readCount:1}});
   }
   if(input.method==="chooseBackstageStoryFollowUp"){
    expect(input.mailId).toBe(mailId("a"));
    expect(input.expectedRevision).toBe(8);
    expect(input.choice).toBe("CHANGE_PRESENTATION");
    expect(input.requestId).toBeTruthy();
    chosen=input.choice!;revision++;
    for(const m of messages){m.canChooseStoryFollowUp=false;m.storyFollowUp=chosen;}
    return r.fulfill({json:{status:"APPLIED",revision,result:{
     mailId:input.mailId,programmeId:"story-b",choice:chosen,
     sourceShowId:source.sourceShowId,sourceSlotId:source.sourceSlotId,
     sourceWeekIndex:source.sourceWeekIndex}}});
   }
   if(input.method==="programmes")return r.fulfill({json:{
    year:1,week:5,worldRevision:revision,canEdit:true,
    people:[{refId:"person-a",kind:"PERSON",name:"Character A"},
     {refId:"person-b",kind:"PERSON",name:"Character B"}],
    teams:[],championships:[],
    programmes:[story("story-a","Character A"),story("story-b","Character B")]
   }});
   if(input.method==="overview")return r.fulfill({json:overview});
   throw Error("Unrequested card RPC: "+input.method);
  });
  await page.goto("/#/backstage");
  await page.getByRole("button",{name:"Storylines"}).click();
  await page.getByRole("button",{name:/About that chapter/}).click();
  const thread=page.getByLabel("Message from Character B");
  await expect(thread.getByRole("button",{name:"Try a different approach"})).toBeVisible();
  await thread.getByRole("button",{name:"Try a different approach"}).click();
  await expect(thread).toContainText("My next chapter: Try a different approach");
  await expect(thread.getByRole("button",{name:"Try a different approach"})).toHaveCount(0);
  await page.getByRole("button",{name:"Back to messages"}).click();
  await page.getByRole("button",{name:/A verified creative response/}).click();
  await expect(page.getByLabel("Message from Creative Director"))
   .toContainText("My next chapter: Try a different approach");
  await expect(page.getByRole("button",{name:"Try a different approach"})).toHaveCount(0);
  await page.getByRole("button",{name:"Open this exact storyline"}).click();
  await expect(page).toHaveURL(/#\/programmes$/);
  const active=page.locator('.ppw-programme-switch[aria-pressed="true"]');
  await expect(active).toHaveCount(1);
  await expect(active).toContainText("Character B");
  await expect(page.locator(".ppw-programme-story-follow-up"))
   .toContainText("Try a different approach");
  await expect(page.locator(".ppw-programme-story-cue"))
   .toContainText("YOUR BACKSTAGE DECISION");
  await page.getByRole("button",{name:"Plan"}).click();
  await expect(page.getByRole("button",{name:"Reframe the story"})).toBeVisible();
  expect(calls.filter(x=>x==="chooseBackstageStoryFollowUp")).toHaveLength(1);
  expect(calls.filter(x=>x==="backstage")).toHaveLength(1);
  expect(calls.filter(x=>x==="programmes")).toHaveLength(1);
  expect(calls.some(x=>/groq|advance|saveCard|saveCreativeIntent|planShow/i.test(x)))
   .toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
