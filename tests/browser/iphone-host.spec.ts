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
  const menuBox=await menu.boundingBox(),size=page.viewportSize();
  expect(menuBox&&size&&menuBox.y+menuBox.height>size.height-115).toBeTruthy();
 await expect(nav).toBeHidden();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 const before=methods.length;
 await menu.click();
 await expect(nav).toBeVisible();
 await expect(menu).toHaveAttribute("aria-expanded","true");
 await expect(page.locator("body")).toHaveClass(/ppw-drawer-active/);
 await expect(nav.getByRole("button",{name:"Close promotion menu"})).toBeFocused();
 await page.keyboard.press("Escape");
 await expect(nav).toBeHidden();
 await expect(menu).toBeFocused();
 await expect(page.locator("body")).not.toHaveClass(/ppw-drawer-active/);
 await menu.click();
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
test("Home alerts open expiring agreements or pending offers directly without another lookup",async({page})=>{
 const methods:string[]=[];
 const home={...overview,promotion:{...overview.promotion,attention:{
  plannedShows:1,unpreparedShow:false,pendingBackstage:false,
  expiringTalent:true,pendingContractOffers:true
 }}};
 const contracts={year:1,week:5,worldRevision:4,canEdit:true,
  currentWeekIndex:4,roster:[],requests:[],renewals:[],offers:[],
  summary:{signed:0,expiringSoon:0,noDates:0,
   backstageContractDiscussions:0,pendingNegotiations:0,pendingRenewals:0,
   pendingOffers:0,weeklyGuarantees:0}};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  methods.push(method);
  await route.fulfill({json:method==="overview"?home:
   method==="contracts"?contracts:{}});
 });
 await page.goto("/#/home");
 await page.getByRole("button",{name:/Contracts approaching expiry/}).click();
 await expect(page).toHaveURL(/#\/contracts\/expiring$/);
 await expect(page.getByLabel("Contract filter")).toHaveValue("EXPIRING");
 await expect(page.getByText(/Contracts closest to expiry/)).toBeVisible();
 await page.goto("/#/home");
 await page.getByRole("button",{name:/Offers awaiting decisions/}).click();
 await expect(page).toHaveURL(/#\/contracts\/pending$/);
 await expect(page.getByText(/outstanding offers, renewals and date requests/)).toBeVisible();
 await expect(page.getByLabel("Contract filter")).toHaveValue("ATTENTION");
 expect(methods).toEqual(["overview","contracts","overview","contracts"]);
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeHidden();
});

test("named contract alerts give the right negotiation and expiry routes without hiding booking",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 const home={...overview,promotion:{...overview.promotion,attention:{
  plannedShows:0,unpreparedShow:false,pendingBackstage:false,
  expiringTalent:true,pendingContractOffers:false,
  contractAlerts:[
   {contractId:"unused",personId:"ada",name:"Ada",kind:"DATES_EXHAUSTED",
    weeksRemaining:25,waiting:true},
   {contractId:"soon",personId:"bert",name:"Bert",kind:"EXPIRING",
    weeksRemaining:1,waiting:false}]
 }}};
 const contracts={year:1,week:5,worldRevision:4,canEdit:true,currentWeekIndex:4,
  roster:[],requests:[],renewals:[],offers:[],
  summary:{signed:0,expiringSoon:0,noDates:0,backstageContractDiscussions:0,
   pendingNegotiations:0,pendingRenewals:0,pendingOffers:0,weeklyGuarantees:0}};
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  calls.push(method);
  return route.fulfill({json:method==="overview"?home:method==="contracts"?contracts:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("button",{name:/Ada has a negotiation pending/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Bert's contract expires in 1 week/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Plan this week's show/})).toBeVisible();
 await page.getByRole("button",{name:/Ada has a negotiation pending/}).click();
  await expect(page).toHaveURL(/#\/contracts\/pending$/);
 await expect(page.getByLabel("Contract filter")).toHaveValue("ATTENTION");
 await page.goto("/#/home");
 await page.getByRole("button",{name:/Bert's contract expires in 1 week/}).click();
  await expect(page).toHaveURL(/#\/contracts\/expiring$/);
 await expect(page.getByLabel("Contract filter")).toHaveValue("EXPIRING");
 expect(calls).toEqual(["overview","contracts","overview","contracts"]);
});
test("named Home concerns open only the intended wrestler conversation",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 const home={...overview,promotion:{...overview.promotion,attention:{
  plannedShows:1,unpreparedShow:false,pendingBackstage:true,
  backstageRequests:[{personId:"p-adams",name:"Ava Adams",kind:"CREATIVE"}],
  expiringTalent:false,pendingContractOffers:false
 }}};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(request.method);methods.push(method);
  if(method==="backstage"){
   expect(request.personId).toBe("p-adams");
   await route.fulfill({json:{
    personId:"p-adams",personName:"Ava Adams",worldYear:1,worldWeek:5,
    worldRevision:4,canEdit:true,persona:null,documentedAlternates:[],history:[],
    recentRequests:[],nextPitchWeek:0,archetypes:[],roster:[{
     personId:"p-adams",name:"Ava Adams",isCurrent:true,morale:65,momentum:52,
     lastMessage:null,latestIncoming:{archived:false,read_week_index:null,
      status:"PENDING",kind:"CREATIVE",created_week_index:4}}],
    conversations:[]
   }});
  }else if(method==="markBackstageRead"){
   expect(request.personId).toBe("p-adams");
   await route.fulfill({json:{readCount:1}});
  }else await route.fulfill({json:method==="overview"?home:{}});
 });
 await page.goto("/#/home");
 const prompt=page.getByRole("button",{name:/Ava Adams is waiting/});
 await expect(prompt).toBeVisible();
 await expect(prompt).toContainText("has a new creative idea");
 expect(methods).toEqual(["overview"]);
 await prompt.click();
 await expect(page).toHaveURL(/#\/backstage\/unread$/);
 await expect(page.getByRole("region",{name:"Conversation with Ava Adams"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Back to messages"})).toBeVisible();
 await expect.poll(()=>methods.length).toBe(3);
 expect(methods).toEqual(["overview","backstage","markBackstageRead"]);
 expect(page.url()).not.toContain("p-adams");
 await page.getByRole("button",{name:"Back to messages"}).click();
 await expect(page.getByRole("heading",{name:"Messages"})).toBeVisible();
 expect(methods).toHaveLength(3);
});
test("completed locker-room updates dismiss privately without hiding current tasks",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];
 let dismissed=false;
 const home=()=>({...overview,promotion:{...overview.promotion,attention:{
  plannedShows:1,unpreparedShow:true,pendingBackstage:true,
  backstageRequests:[{personId:"p-adams",name:"Ava Adams",kind:"CREATIVE"}],
  expiringTalent:false,pendingContractOffers:false,
  offerResults:[{id:"offer-result:deal-7",personId:"p-smith",name:"Sam Smith",status:"ACCEPTED"}],
  backstageResults:dismissed?[]:[{
   id:"backstage-result:153",personId:"p-adams",name:"Ava Adams",status:"BROKEN"}]
 }}});
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(request.method);calls.push(method);
  if(method==="dismissAttention"){
   expect(request.attentionId).toBe("backstage-result:153");
   dismissed=true;
   await route.fulfill({json:{dismissed:true,firstDismissal:true}});
  }else await route.fulfill({json:method==="overview"?home():{}});
 });
 await page.goto("/#/home");
 await expect(page.getByText("Promises settled")).toBeVisible();
 await expect(page.getByText(/Ava Adams was left waiting/)).toBeVisible();
 await expect(page.getByRole("button",{name:/Ava Adams is waiting/})).toBeVisible();
 await expect(page.getByText(/Sam Smith accepted the offer/)).toBeVisible();
 await page.getByRole("button",{name:"Dismiss Ava Adams's locker room update"}).click();
 await expect(page.getByText("Promises settled")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Ava Adams is waiting/})).toBeVisible();
 await expect(page.getByText(/Sam Smith accepted the offer/)).toBeVisible();
 expect(calls).toEqual(["overview","dismissAttention"]);
 await page.reload();
 await expect(page.getByText("Promises settled")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Ava Adams is waiting/})).toBeVisible();
 expect(calls.filter(x=>x==="overview")).toHaveLength(2);
});
test("resolved locker-room promise opens the exact private historical thread",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 const home={...overview,promotion:{...overview.promotion,attention:{
  plannedShows:1,unpreparedShow:false,pendingBackstage:false,
  expiringTalent:false,pendingContractOffers:false,
  backstageResults:[{
   id:"backstage-result:77",personId:"p-victor",name:"Victor Vale",status:"FULFILLED"}]
 }}};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const req=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(req.method);methods.push(method);
  if(method==="backstage"){
   expect(req.personId).toBe("p-victor");
   await route.fulfill({json:{
    personId:"p-victor",personName:"Victor Vale",
    worldYear:1,worldWeek:5,worldRevision:4,canEdit:true,
    persona:null,history:[],documentedAlternates:[],
    recentRequests:[],nextPitchWeek:0,archetypes:[],
    roster:[{personId:"p-victor",name:"Victor Vale",isCurrent:true,
     lastMessage:null,latestIncoming:{archived:false,read_week_index:4,
      status:"FULFILLED",kind:"CREATIVE",created_week_index:2}}],
    conversations:[]
   }});
  }else await route.fulfill({json:method==="overview"?home:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByText(/Victor Vale saw your promise kept/)).toBeVisible();
 await page.getByRole("button",{name:"Open Backstage"}).click();
 await expect(page).toHaveURL(/#\/backstage$/);
 await expect(page.getByRole("region",{name:"Conversation with Victor Vale"})).toBeVisible();
 expect(methods).toEqual(["overview","backstage"]);
 expect(page.url()).not.toContain("p-victor");
});
test("iPhone clears all settled notices in one request and preserves urgent work",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const calls:string[]=[];let cleared=false;
 const home=()=>({...overview,promotion:{...overview.promotion,attention:{
  plannedShows:0,unpreparedShow:false,pendingBackstage:true,
  backstageRequests:[{personId:"p-adams",name:"Ava Adams",kind:"CREATIVE"}],
  expiringTalent:false,pendingContractOffers:false,
  offerResults:cleared?[]:[
   {id:"offer-result:one",personId:"p-lee",name:"Lee Harper",status:"ACCEPTED"},
   {id:"offer-result:two",personId:"p-jade",name:"Jade Quinn",status:"REJECTED"}],
  backstageResults:cleared?[]:[{
   id:"backstage-result:91",personId:"p-adams",name:"Ava Adams",status:"BROKEN"}]
 }}});
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON() as Record<string,unknown>;
  calls.push(String(request.method));
  if(request.method==="dismissAttentionBatch"){
   expect(request.attentionIds).toEqual([
    "offer-result:one","offer-result:two","backstage-result:91"]);
   expect(request.playerId).toBeUndefined();
   cleared=true;
   await route.fulfill({json:{dismissed:3,firstDismissals:3}});
  }else await route.fulfill({json:request.method==="overview"?home():{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("button",{name:"Clear all resolved updates"})).toBeVisible();
 await expect(page.getByText(/Ava Adams was left waiting/)).toBeVisible();
 await page.getByRole("button",{name:"Clear all resolved updates"}).click();
 await expect(page.getByText(/Lee Harper accepted the offer/)).toHaveCount(0);
 await expect(page.getByText("Promises settled")).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Clear all resolved updates"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Plan this week's show/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Ava Adams is waiting/})).toBeVisible();
 expect(calls).toEqual(["overview","dismissAttentionBatch"]);
 await page.reload();
 await expect(page.getByRole("button",{name:/Ava Adams is waiting/})).toBeVisible();
 await expect(page.getByText("Promises settled")).toHaveCount(0);
 expect(calls).toEqual(["overview","dismissAttentionBatch","overview"]);
});
test("Tag partner cards and roster disciplines stay fast without person-by-person reads",async({page})=>{
 const methods:string[]=[];
 const people=Array.from({length:50},(_,i)=>({
  personId:"person-"+i,name:"Talent "+String(i).padStart(2,"0"),
  division:i%5===0?"WOMEN":"MEN"
 }));
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);methods.push(method);
  await route.fulfill({json:method==="overview"?overview:
   method==="tagTeams"?{year:1,week:5,canEdit:true,worldRevision:4,
    roster:people,teams:[]}:
   method==="wrestlerDirectory"?{year:1,week:5,view:"ROSTER",
    worldRevision:4,canEdit:true,people:[],hasMore:false,currentWeekIndex:4}:{}});
 });
 await page.goto("/#/teams");
 await expect(page.getByRole("heading",{name:"Tag Teams"})).toBeVisible();
 await expect(page.locator(".ppw-pair-picks .ppw-wrestler-card")).toHaveCount(35);
 await page.getByRole("button",{name:"Women",exact:true}).click();
 await expect(page.locator(".ppw-pair-picks .ppw-wrestler-card")).toHaveCount(10);
 await page.locator(".ppw-pair-picks .ppw-wrestler-card").first().click();
 await expect(page.locator(".ppw-pair-picks .ppw-wrestler-card[aria-pressed=true]")).toHaveCount(1);
 await page.getByRole("button",{name:"Men",exact:true}).click();
 await expect(page.locator(".ppw-pair-picks .ppw-wrestler-card").first()).toBeDisabled();
 await page.goto("/#/roster");
 await expect(page.getByRole("navigation",{name:"Roster divisions"})).toBeVisible();
 await expect(page.getByRole("button",{name:/Trios/})).toBeDisabled();
 await page.getByRole("navigation",{name:"Roster divisions"})
  .getByRole("button",{name:"Tag Teams"}).click();
 await expect(page.getByRole("heading",{name:"Tag Teams"})).toBeVisible();
 expect(methods).not.toContain("wrestlerProfile");
 expect(methods.filter(x=>x==="tagTeams").length).toBe(2);
});
test("parent-company affiliates remain visible on the iPhone roster without editable parent contracts",async({page})=>{
 const people=[{
  personId:"nxt-entrant",name:"NXT Rookie",ringName:"NXT Rookie",division:"WOMEN",
  popularity:64,recognition:60,momentum:72,inRingQuality:71,matchCraft:67,
  presentation:74,morale:80,availability:"YOUR_ROSTER",family:"EXCLUSIVE",
  remainingDates:null,startsInWeeks:0,weeksRemaining:26,
  affiliatedViaParent:true,contractOwnerName:"WWE",
  weeklyGuarantee:12000,appearanceFee:0,pendingOffer:false
 },{
  personId:"own-entrant",name:"Direct Wrestler",ringName:"Direct Wrestler",division:"MEN",
  popularity:65,recognition:63,momentum:68,inRingQuality:73,matchCraft:66,
  presentation:70,morale:70,availability:"YOUR_ROSTER",family:"LIMITED_NON_EXCLUSIVE",
  remainingDates:4,startsInWeeks:0,weeksRemaining:6,
  affiliatedViaParent:false,contractOwnerName:null,
  weeklyGuarantee:0,appearanceFee:5000,pendingOffer:false
 }];
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",route=>{
  const body=route.request().postDataJSON();
  methods.push(String(body.method));
  return route.fulfill({json:body.method==="wrestlerDirectory"?{
   view:"ROSTER",year:1,week:5,worldRevision:4,canEdit:true,
   hasMore:false,currentWeekIndex:4,people}:{}});
 });
 await page.goto("/#/roster");
 await expect(page.getByText("NXT Rookie")).toBeVisible();
 const cards=page.locator(".ppw-directory-card");
 await expect(cards).toHaveCount(2);
 const child=cards.first();
 await expect(child.getByText("PARENT-COMPANY ROSTER")).toBeVisible();
 await child.locator("summary").click();
 await expect(child.getByText(/Roster appearance through WWE/)).toBeVisible();
 await expect(child.getByText(/The parent owns the contract and wages/)).toBeVisible();
 await expect(child.getByRole("button",{name:"Manage contract →"})).toHaveCount(0);
 const direct=cards.nth(1);
 await direct.locator("summary").click();
 await expect(direct.getByRole("button",{name:"Manage contract →"})).toBeVisible();
 expect(methods,"These details must come from the same bounded roster read")
  .toEqual(["wrestlerDirectory"]);
});
test("Roster dossiers preserve filters and expanded cards without reloading the directory",async({page})=>{
 const methods:string[]=[];
 const directory={view:"ROSTER",year:1,week:5,worldRevision:4,canEdit:true,
  hasMore:false,currentWeekIndex:4,
  people:[{personId:"alice",name:"Alice",ringName:"Alice",division:"WOMEN",
   availability:"YOUR_ROSTER",family:"EXCLUSIVE",remainingDates:null,
   startsInWeeks:0,weeksRemaining:15,weeklyGuarantee:1000,appearanceFee:0,
   popularity:70,recognition:72,momentum:80,inRingQuality:89,matchCraft:83,
   presentation:88,morale:75,pendingOffer:false,roleExpectation:"MAIN_EVENT"}]};
 const dossier={personId:"alice",name:"Alice",division:"WOMEN",status:"ACTIVE",
  careerStage:"REGULAR",popularity:70,recognition:72,momentum:80,morale:75,
  inRingQuality:89,matchCraft:83,presentation:88,stamina:70,safety:85,
  fatigue:0,wear:0,alignment:"FACE",canEdit:false,onYourRoster:true,
  sharedHuman:false,currentWeekIndex:4,worldRevision:4,
  persona:{personaName:"Alice",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[],teams:[],stables:[],connections:[],history:[]};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  methods.push(method);
  await route.fulfill({json:method==="wrestlerDirectory"?directory:
   method==="wrestlerProfile"?dossier:{}});
 });
 await page.goto("/#/roster");
 await expect(page.getByRole("heading",{name:"My Roster"})).toBeVisible();
 const search=page.getByLabel("Search wrestlers");
 await search.fill("Alice");
 await page.getByRole("button",{name:"Search",exact:true}).click();
 const alice=page.locator(".ppw-directory-card").first();
 await alice.locator("summary").click();
 await expect(alice).toHaveAttribute("open","");
 const reads=methods.filter(x=>x==="wrestlerDirectory").length;
 await alice.getByRole("button",{name:"Wrestler profile →"}).click();
 const dialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"‹ Back"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(search).toHaveValue("Alice");
 await expect(alice).toHaveAttribute("open","");
 expect(methods.filter(x=>x==="wrestlerDirectory").length).toBe(reads);
 expect(methods.filter(x=>x==="wrestlerProfile").length).toBe(1);
});

test("Home contract wire dismisses one resolved offer without suppressing show obligations or refetching",async({page})=>{
 const methods:string[]=[];
 const attention={plannedShows:0,unpreparedShow:false,pendingBackstage:false,
  expiringTalent:false,pendingContractOffers:false,
  offerResults:[
   {id:"offer-result:accept",personId:"alice",name:"Alice",status:"ACCEPTED"},
   {id:"offer-result:reject",personId:"bob",name:"Bob",status:"REJECTED"}
  ]};
 const home={...overview,promotion:{...overview.promotion,attention}};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const data=route.request().postDataJSON();methods.push(data.method);
  if(data.method==="dismissAttention"){
   expect(data.attentionId).toBe("offer-result:accept");
   expect(data.playerId).toBeUndefined();
   await route.fulfill({json:{dismissed:true,firstDismissal:true}});return;
  }
  await route.fulfill({json:data.method==="overview"?home:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByText("Alice accepted the offer")).toBeVisible();
 await expect(page.getByText("Bob declined the offer")).toBeVisible();
 await expect(page.getByRole("button",{name:"Plan this week's show"})).toBeVisible();
 await page.getByRole("button",{name:"Dismiss Alice's contract update"}).click();
 await expect(page.getByText("Alice accepted the offer")).toHaveCount(0);
 await expect(page.getByText("Bob declined the offer")).toBeVisible();
 await expect(page.getByRole("button",{name:"Plan this week's show"})).toBeVisible();
 expect(methods).toEqual(["overview","dismissAttention"]);
});

test("iPhone booking restores authored run-in, cheating and protected winner without extra reads",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 const alice={personId:"alice",contractId:"deal-alice"};
 const bob={personId:"bob",contractId:"deal-bob"};
 const booking={
  matchType:"SINGLES",family:"INDIVIDUAL",participants:[alice,bob],
  sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[bob]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
  plannedLengthMinutes:18
 };
 let saved=booking as Record<string,unknown>,revision=4;
 const planner={
  worldName:"Genesis",promotionName:"AEW",year:1,week:5,canEdit:true,
  worldRevision:4,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,scheduled:[],
   shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
    eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
    marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
    ready:false,slots:1,bookingClass:"REGULAR",showSeriesId:null,showName:"Dynamite"}]}]
 };
 const view=()=>({
  showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:revision,
  day:5,venueId:"arena",showName:"Dynamite",promotionName:"AEW",
  venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
  ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
  selectedPeople:[{personId:"alice",name:"Alice",division:"MEN"},
   {personId:"bob",name:"Bob",division:"MEN"},
   ...("interference" in saved?[{personId:"outside",name:"Outside",division:"MEN"}]:[])],
  slots:[{slotId:"bout",kind:"MATCH",position:0,payload:saved}]
 });
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(input.method);methods.push(method);
  if(method==="save"){
   const matches=input.matches as {slotId:string;payload:Record<string,unknown>}[];
   saved=matches[0]!.payload;revision++;
  }
  await route.fulfill({json:method==="planner"?planner:method==="load"?view():
   method==="talent"?{talent:[{
    personId:"outside",contractId:"deal-outside",name:"Outside",division:"MEN",
    available:true,reason:"AVAILABLE",remainingDates:5,popularity:68,
    recognition:63,momentum:72,inRingQuality:84,matchCraft:77,presentation:80
   }],cursor:null}:method==="save"?{status:"APPLIED",result:{performers:3}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 await page.reload();
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 await page.goBack();
 await expect(page).toHaveURL(/#\/planner$/);
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await page.goForward();
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 await expect(page.getByText("18 / 120 min")).toBeVisible();
 await expect(page.getByRole("progressbar",{name:"Total match and angle minutes against the television running-time guide"}))
  .toHaveAttribute("aria-valuenow","18");
 await page.locator(".ppw-card-bar .ppw-expand").click();
 const focused=page.getByRole("dialog",{name:"Edit match"});
 await expect(focused).toBeVisible();
 await expect(page.locator(".ppw-card-list .ppw-card-body")).toHaveCount(0);
 const finish=focused.getByLabel("Finish");
 await finish.selectOption("FOREIGN_OBJECT");
 await page.getByLabel("Who uses the foreign object?").selectOption("alice");
 await page.locator(".ppw-run-in summary").click();
 await page.getByRole("button",{name:"Choose run-in wrestler"}).click();
 await expect(page.getByRole("dialog",{name:"Choose wrestler"})).toBeVisible();
 await page.locator(".ppw-sheet .ppw-wrestler-card").first().click();
 const run=page.locator(".ppw-run-in");
 await expect(run).toHaveAttribute("open","");
 await run.getByLabel("Which side?").selectOption("B");
 await expect(run.getByLabel("What happens?")).toHaveValue("THWARTED");
 await run.getByLabel("Which side?").selectOption("A");
 await run.getByLabel("What happens?").selectOption("SUCCESS");
 await expect(page.getByLabel("Who uses the foreign object?")).toHaveValue("alice");
 await focused.getByRole("button",{name:"Close card editor"}).click();
 await expect(focused).toHaveCount(0);
 await page.getByRole("button",{name:/Save card|Save changes/}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect((saved.interference as {contractId:string}).contractId).toBe("deal-outside");
 expect((saved.interference as {plannedOutcome:string}).plannedOutcome).toBe("SUCCESS");
 expect(saved.cheatingWrestlerId).toBe("alice");
 expect(saved.scriptedWinnerSide).toBe("A");
 expect(methods.filter(x=>x==="talent")).toHaveLength(1);
 expect(methods.filter(x=>x==="save")).toHaveLength(1);
 expect(methods).not.toContain("wrestlerProfile");
});

test("Home reminders open the unfinished card and unread locker room directly",async({page})=>{
 const methods:string[]=[];
 const home={...overview,promotion:{...overview.promotion,attention:{
  plannedShows:1,unpreparedShow:true,pendingBackstage:true,
  expiringTalent:false,pendingContractOffers:false}}};
 const planner={
  worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   scheduled:[],shows:[{draftId:"week5-card",year:1,week:5,status:"DRAFT",
    eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
    marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
    ready:false,slots:0,bookingClass:"REGULAR",showSeriesId:null,showName:"Dynamite"}]}]
 };
 const card={showId:"week5-card",year:1,week:5,worldRevision:4,
  canEdit:true,ready:false,day:5,venueId:"arena",showName:"Dynamite",
  promotionName:"AEW",venueName:"Arena",marketName:"Home",
  bookingClass:"REGULAR",ticketStrategy:"STANDARD",championships:[],
  programmes:[],programmeLinks:[],selectedPeople:[],slots:[]};
 const backstage={personId:null,persona:null,personName:"",roster:[
  {personId:"talent-1",name:"Charlie",isCurrent:true,morale:70,momentum:70,
   lastMessage:null,latestIncoming:{archived:false,read_week_index:null,
    status:"PENDING",kind:"ROLE_USAGE",created_week_index:4}},
  {personId:"talent-2",name:"Riley",isCurrent:true,morale:70,momentum:70,
   lastMessage:null,latestIncoming:{archived:false,read_week_index:4,
    status:"NOTED",kind:"GOOD_NEWS",created_week_index:4}}
 ],conversations:[]};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  methods.push(method);
  await route.fulfill({json:method==="overview"?home:method==="planner"?planner:
   method==="load"?card:method==="backstage"?backstage:{}});
 });
 await page.goto("/#/home");
 await page.getByRole("button",{name:/Finish your booking card/}).click();
 await expect(page).toHaveURL(/#\/planner\/card$/);
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 expect(methods).toEqual(["overview","planner","load"]);
 await page.locator("details.ppw-management-menu summary").click();
 await page.getByRole("button",{name:"Show Planner"}).click();
 await expect(page).toHaveURL(/#\/planner$/);
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await expect.poll(()=>methods).toEqual(["overview","planner","load","planner"]);
 await page.goto("/#/home");
 await page.getByRole("button",{name:/Your locker room has messages/}).click();
 await expect(page).toHaveURL(/#\/backstage\/unread$/);
 await expect(page.getByRole("heading",{name:"Messages"})).toBeVisible();
 await expect(page.locator(".ppw-backstage-contact")).toHaveCount(1);
 await expect(page.getByRole("button",{name:/Charlie/})).toBeVisible();
 expect(methods).toEqual(["overview","planner","load","planner","overview","backstage"]);
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeHidden();
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
   availablePromotions:stage===1?[{id:"aew",name:"AEW",tier:"GLOBAL",
    homeMarketName:"Chicago",rosterSize:43}]:[]};
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
   await route.fulfill({json:{status:"APPLIED",result:path==="/api/claim"?
    {claimed:true}:{joined:true}}});
  });
 }
 await page.route("**/api/card",async route=>route.fulfill({json:overview}));
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Join Genesis"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Promotion navigation"})).toBeHidden();
 await page.getByRole("button",{name:"Join World"}).click();
 await expect(page.getByRole("heading",{name:"Pick a promotion"})).toBeVisible();
 await expect(page.getByText("Home territory · Chicago")).toBeVisible();
 await expect(page.getByText("43 signed wrestlers")).toBeVisible();
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
 await expect(page.getByRole("heading",{name:"Messages"})).toBeVisible();
 await expect(page.locator(".ppw-messenger.ppw-messenger-inbox")).toHaveCount(1);
 await expect(page.getByRole("navigation",{name:"Backstage messages and contacts"})).toBeVisible();
 await expect(page.locator(".ppw-messenger-inbox-topline")).toContainText("2 chats");
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

test("Backstage messages read and archive in place without fetching the entire inbox again",async({page})=>{
 const methods:string[]=[];
 const contact={personId:"ada",name:"Ada Stone",isCurrent:true,morale:67,momentum:58,
  lastMessage:null,latestIncoming:{request_id:"c-1",kind:"CONTRACT",status:"PENDING",
   created_week_index:4,read_week_index:null,archived:false}};
 const common={personId:"ada",personName:"Ada Stone",
  roster:[contact],worldYear:1,worldWeek:5,worldRevision:4,canEdit:false,
  persona:{personaName:"Ada Stone",gimmickId:"AUTHENTIC",
   primaryStyle:"TECHNICAL",secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  recentRequests:[],documentedAlternates:[],history:[],archetypes:[],
  nextPitchWeek:0,
  conversations:[{conversationId:"c-1",kind:"CONTRACT",
   createdWeekIndex:4,respondedWeekIndex:null,relatedPersonId:null,
   status:"PENDING",decision:null,dueWeekIndex:null,promisedRole:null,
   observedMatchShows:null,observedFeaturedShows:null,
   assessmentReason:null,trustDelta:0,workingVerifiedShows:null,
   workingTrustDelta:null,averageCrowd:null,verifiedSinglesShows:null,
   professionalTrust:null,verifiedTagShows:null,averageExecution:null,
   followThroughWeekIndex:null,followThroughKind:null}]};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const req=route.request().postDataJSON();
  const method=String(req.method);methods.push(method);
  await route.fulfill({json:method==="backstage"?common:
   method==="markBackstageRead"?{readCount:1}:
   method==="backstageArchive"?{personId:"ada",
    archivedThroughWeekIndex:req.archived?4:-1}:{}});
 });
 await page.goto("/#/backstage");
 const list=page.locator(".ppw-backstage-contact");
 await expect(list).toHaveCount(1);
 await expect(list.first()).toContainText("My deal is nearly up");
 const initial=methods.filter(m=>m==="backstage").length;
 await list.first().click();
 await expect(page.getByLabel("Conversation with Ada Stone")).toBeVisible();
 expect(methods.filter(m=>m==="backstage").length).toBe(initial+1);
 await expect.poll(()=>methods.filter(m=>m==="markBackstageRead").length).toBe(1);
 await expect(page.locator(".ppw-persona-chat .ppw-backstage-date")).toContainText(["Y1 · W5"]);
 await page.getByRole("button",{name:"Back to messages"}).click();
 await expect(page.locator(".ppw-messenger-inbox-count")).toHaveText("1 chats");
 await expect(page.locator(".ppw-backstage-unread-dot")).toHaveCount(0);
 expect(methods.filter(m=>m==="backstage").length).toBe(initial+1);
 await page.locator(".ppw-backstage-contact").first().click();
 await page.locator("summary").filter({hasText:"Conversation options"}).click();
 await page.getByRole("button",{name:"Archive conversation"}).click();
 await expect(page.getByRole("button",{name:"Archived",exact:true})).toHaveClass(/ppw-persona-selected/);
 await expect(page.locator(".ppw-backstage-contact")).toHaveCount(1);
 expect(methods.filter(m=>m==="backstage").length).toBe(initial+1);
 expect(methods.filter(m=>m==="backstageArchive")).toHaveLength(1);
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

test("Post-show creative direction follows the latest completed rivalry match without booking a card",async({page})=>{
 const methods:string[]=[];
 let selected:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND"|null=null;
 let revision=4;
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const data=route.request().postDataJSON();
  methods.push(data.method);
  if(data.method==="chooseProgrammeDirection"){
   expect(data.programmeId).toBe("feud-test");
   expect(data.sourceShowId).toBe("show-last");
   expect(data.sourceSlotId).toBe("main");
   expect(data.expectedRevision).toBe(revision);
   selected=data.choice;revision++;
   await route.fulfill({json:{status:"APPLIED"}});return;
  }
  const direction=selected?{choice:selected,showId:"show-last",slotId:"main",weekIndex:3}:null;
  await route.fulfill({json:data.method==="programmes"?{
   year:1,week:5,canEdit:true,worldRevision:revision,
   people:[],teams:[],championships:[],
   programmes:[{programmeId:"feud-test",status:"ACTIVE",heat:74,
    repetition:15,activityCount:1,matchCount:1,segmentCount:0,
    sideAWins:1,sideBWins:0,draws:0,championshipId:null,
    startedWeekIndex:1,endedWeekIndex:null,
    sideA:[{kind:"PERSON",refId:"alex",name:"Alex"}],
    sideB:[{kind:"PERSON",refId:"jules",name:"Jules"}],
    latestFollowUp:direction,
    recentActivity:[{showId:"show-last",slotId:"main",kind:"MATCH",
     weekIndex:3,crowdResponse:86}]
   }]
  }:{}});
 });
 await page.goto("/#/programmes");
 await expect(page.getByRole("heading",{name:"Where does this rivalry go next?"})).toBeVisible();
 await page.getByRole("button",{name:"Rematch",exact:true}).click();
 await expect(page.getByText(/Last direction: Pursue a rematch/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Rematch",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"Let it stand"}).click();
 await expect(page.getByText(/Last direction: Let the result stand/)).toBeVisible();
 expect(methods.filter(m=>m==="chooseProgrammeDirection")).toHaveLength(2);
 expect(methods.filter(m=>m==="programmes")).toHaveLength(3);
 expect(methods).not.toContain("save");
 expect(methods).not.toContain("results");
 await expect(page.getByText(/No bout or angle is booked for you/)).toBeVisible();
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
 await expect(restored.locator(".ppw-wrestler-badges")).toContainText("WWE");
 await expect(restored.locator(".ppw-wrestler-alignment")).toContainText("FACE · CHEERED");
 await expect(restored.locator(".ppw-wrestler-stat[data-ability=outstanding]")).toHaveCount(6);
 expect(requests.filter(x=>x==="industryFeatured")).toHaveLength(1);
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

test("Annual show editor previews real weeks, catches clashing PPVs and never polls",async({page})=>{
 const flagship={seriesId:"weekly",name:"Dynamite",role:"FLAGSHIP",
  eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:70,active:true};
 const ppv={seriesId:"premium",name:"All In",role:"PREMIUM",
  eventType:"MAJOR",cadenceWeeks:52,anchorWeek:5,importance:95,active:true};
 const view={promotionName:"AEW",year:1,week:5,worldRevision:4,canEdit:true,
  series:[flagship,ppv],weeks:[],worldWeeks:[]};
 const calls:{method:string;payload:Record<string,unknown>}[]=[];
 await page.setViewportSize({width:360,height:780});
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const payload=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(payload.method);calls.push({method,payload});
  await route.fulfill({json:method==="calendar"?view:{status:"APPLIED"}});
 });
 await page.goto("/#/calendar");
 await page.getByRole("button",{name:"+ Add event"}).click();
 await page.getByRole("textbox",{name:"Event name"}).fill("Summer Clash");
 const frequency=page.getByRole("combobox",{name:"Repeat frequency"});
 await frequency.selectOption("13");
 await expect(page.locator(".ppw-calendar-forecast-dates")).toContainText("YEAR 1 · WEEK 5");
 await frequency.selectOption("52");
 await page.getByRole("spinbutton",{name:"First week in repeat cycle"}).fill("6");
 await expect(page.locator(".ppw-calendar-forecast-warning")).toContainText(/Only one additional PPV/i);
 await expect(page.getByRole("button",{name:"Save event"})).toBeDisabled();
 expect(calls.map(x=>x.method)).toEqual(["calendar"]);
 await page.getByRole("spinbutton",{name:"First week in repeat cycle"}).fill("7");
 await expect(page.locator(".ppw-calendar-forecast-dates")).toContainText("YEAR 1 · WEEK 7");
 await expect(page.locator(".ppw-calendar-forecast-dates")).toContainText("YEAR 2 · WEEK 7");
 await expect(page.getByRole("button",{name:"Save event"})).toBeEnabled();
 await page.getByRole("button",{name:"Save event"}).click();
 await expect(page.getByRole("heading",{name:"Create recurring event"})).toHaveCount(0);
 const saved=calls.find(x=>x.method==="saveCalendar")?.payload;
 expect(saved?.series).toMatchObject({name:"Summer Clash",cadenceWeeks:52,anchorWeek:6,
  role:"SPECIAL",eventType:"MAJOR"});
 await expect.poll(()=>calls.filter(x=>x.method==="calendar").length).toBe(2);
 expect(calls.map(x=>x.method)).toEqual(["calendar","saveCalendar","calendar"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test("Venue briefing uses original dollar pricing and live local-rival facts with no extra reads",async({page})=>{
 const methods:string[]=[];
 const calendar={seriesId:"weekly",name:"Saturday Showcase",role:"FLAGSHIP",
  eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:70,active:true};
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,homeMarketId:"home",
  venues:[{venueId:"arena",marketId:"home",marketName:"Home Territory",
   name:"Main Arena",capacity:4000,weeklyHireCost:12000,
   awareness:68,liveStrength:59,loyalty:65,
   audiencePotential:75,wrestlingInterest:80,spendingIndex:95,
   prestige:77,productionSuitability:82,home:true,
   strongestRival:{name:"WWE",tier:"GLOBAL",liveStrength:84,basedHere:false}}],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   shows:[],scheduled:[calendar]}]};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  methods.push(method);await route.fulfill({json:method==="planner"?planner:{}});
 });
 await page.goto("/#/planner");
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await expect(page.getByText(/HOME MARKET\s*\/\s*Home Territory/)).toBeVisible();
 await page.getByRole("button",{name:/Plan Saturday Showcase/}).click();
 await expect(page.getByText(/LOCAL COMPETITION/)).toBeVisible();
 await expect(page.getByText(/WWE/)).toBeVisible();
 await expect(page.getByText(/Prestige/)).toBeVisible();
 const venue=page.getByRole("combobox",{name:"Show venue"});
 const option=await venue.locator("option:checked").innerText();
 expect(option).toContain("$");expect(option).not.toContain("£");
 await expect(page.getByText(/Hire cost:/)).toContainText(/12,000/);
 expect(methods).toEqual(["planner"]);
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

test("Calendar shows only owned booked venues and opens the correct six-week PPV planning form",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const flagship={seriesId:"weekly",name:"Dynamite",role:"FLAGSHIP",
  eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:70,active:true};
 const ppv={seriesId:"premium",name:"All In",role:"PREMIUM",
  eventType:"MAJOR",cadenceWeeks:52,anchorWeek:5,importance:95,active:true};
 const calendar={promotionId:"aew",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,series:[flagship,ppv],
  bookings:[{draftId:"own",year:1,week:5,bookingClass:"REGULAR",showSeriesId:"weekly",
   showName:"Dynamite",status:"DRAFT",day:5,venueName:"AEW Arena",
   marketName:"New York",ready:false}],
  weeks:[{year:1,week:5,offset:0,shows:[flagship]},
   {year:1,week:6,offset:1,shows:[flagship,ppv]}],
  worldWeeks:[{year:1,week:5,offset:0,events:[{
   promotionId:"wwe",promotionName:"WWE",seriesId:"wwe-weekly",
   name:"Raw",role:"FLAGSHIP",eventType:"REGULAR",importance:85
  }]},{year:1,week:6,offset:1,events:[{
   promotionId:"wwe",promotionName:"WWE",seriesId:"wwe-ppv",
   name:"WrestleMania",role:"PREMIUM",eventType:"MAJOR",importance:99
  }]}]};
 const venue={venueId:"arena",marketId:"home",marketName:"Home Market",
  name:"AEW Arena",capacity:3000,weeklyHireCost:6000,
  awareness:70,liveStrength:68,loyalty:72,
  audiencePotential:75,wrestlingInterest:80,spendingIndex:95,
  prestige:80,productionSuitability:84,home:true,strongestRival:null};
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,homeMarketId:"home",venues:[venue],
  venuePressure:[],weeks:[{year:1,week:5,offset:0,
   required:true,major:false,canEdit:true,shows:[],scheduled:[flagship]},
   {year:1,week:6,offset:1,required:true,major:true,canEdit:true,
    shows:[],scheduled:[flagship,ppv]}]};
 const calls:{method:string;payload:Record<string,unknown>}[]=[];
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const payload=route.request().postDataJSON() as Record<string,unknown>;
  const method=String(payload.method);calls.push({method,payload});
  await route.fulfill({json:method==="calendar"?calendar:
   method==="planner"?planner:
   method==="planShow"?{status:"APPLIED",result:{draftId:"new-premium"}}:{}});
 });
 await page.goto("/#/calendar");
 await expect(page.getByText("Card in progress")).toBeVisible();
 await expect(page.getByText("Day 5 · AEW Arena · New York")).toBeVisible();
 await expect(page.getByRole("button",{name:"Open this card"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Plan this show"})).toHaveCount(2);
 await page.getByRole("button",{name:"Across the World"}).click();
 await expect(page.getByText("WrestleMania")).toBeVisible();
 await expect(page.getByText("Raw")).toBeVisible();
 await expect(page.getByText("AEW Arena")).toHaveCount(0);
 await page.getByRole("button",{name:"PPVs & specials"}).click();
 await expect(page.getByText("Raw")).toHaveCount(0);
 await expect(page.getByText("WrestleMania")).toBeVisible();
 await page.getByRole("button",{name:"My shows"}).click();
 await page.getByRole("button",{name:"All events"}).click();
 const premium=page.locator(".ppw-calendar-event-major");
 await premium.getByRole("button",{name:"Plan this show"}).click();
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
 await expect(page.getByText("Booking: All In")).toBeVisible();
 await expect(page.getByRole("button",{name:"Save show"})).toBeVisible();
 await page.getByRole("button",{name:"Save show"}).click();
 await expect.poll(()=>calls.filter(x=>x.method==="planShow").length).toBe(1);
 const saved=calls.find(x=>x.method==="planShow")!.payload;
 expect(saved).toMatchObject({year:1,week:6,showSeriesId:"premium",eventType:"MAJOR"});
 await expect.poll(()=>calls.map(x=>x.method)).toEqual(["calendar","planner","planShow","planner"]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test("iPhone venue choices show rival interest and save without repeated Planner reads",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 const venue=(venueId:string,name:string)=>({
  venueId,marketId:"home",marketName:"Home territory",name,capacity:1500,
  weeklyHireCost:25000,prestige:60,productionSuitability:75,
  awareness:55,liveStrength:55,loyalty:50,audiencePotential:70,
  wrestlingInterest:73,spendingIndex:82,strongestRival:null,home:true
 });
 const planner={
  worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,homeMarketId:"home",
  venues:[venue("arena","Main Arena"),venue("hall","Town Hall")],
  venuePressure:[{year:1,week:5,day:5,venueId:"arena",otherPromotions:2}],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   shows:[],scheduled:[]}]
 };
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON();
  methods.push(String(input.method));
  if(input.method==="planShow"){
   expect(input.day).toBe(5);
   expect(input.venueId).toBe("hall");
   await route.fulfill({json:{status:"APPLIED",result:{draftId:"first"}}});
  }else await route.fulfill({json:input.method==="planner"?planner:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Plan weekly show"}).click();
 await expect(page.getByText("Other promotions are eyeing this venue")).toBeVisible();
 await expect(page.getByText(/2 other promotions have planned a show/)).toBeVisible();
 await page.getByRole("button",{name:"Choose Town Hall instead"}).click();
 await expect(page.getByText(/No other promotion currently has a show planned/)).toBeVisible();
 await page.getByRole("button",{name:"Save show"}).click();
 // The authoritative response is asynchronous: wait for the subsequent
 // single workspace refresh, rather than sampling the request log mid-flight.
 await expect.poll(()=>methods.length).toBe(3);
 await expect(page.getByRole("button",{name:"Plan weekly show"})).toBeVisible();
 expect(methods).toEqual(["planner","planShow","planner"]);
});

test("iPhone reorders a match together with its attached post-match angle",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const a={personId:"alice",contractId:"da"};
 const b={personId:"bob",contractId:"db"};
 const c={personId:"charlie",contractId:"dc"};
 const d={personId:"dana",contractId:"dd"};
 const bout=(people:[typeof a,typeof b])=>({
  matchType:"SINGLES",family:"INDIVIDUAL",participants:people,
  sides:[{sideId:"A",participants:[people[0]]},{sideId:"B",participants:[people[1]]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
  plannedLengthMinutes:12
 });
 const slots=[
  {slotId:"opener",kind:"MATCH",position:0,payload:bout([c,d])},
  {slotId:"main",kind:"MATCH",position:1,payload:bout([a,b])},
  {slotId:"interview",kind:"SEGMENT",position:2,payload:{
   kind:"INTERVIEW",actorIds:["charlie"],targetIds:[],outcome:"HAPPENS",
   participants:[c]}},
  {slotId:"assault",kind:"SEGMENT",position:3,payload:{
   kind:"POST_MATCH_ASSAULT",
   actorIds:["alice"],targetIds:["bob"],outcome:"HAPPENS",
   creativeBeat:{kind:"POST_MATCH_ASSAULT",ending:"ATTACKER_STANDS_TALL"},
   participants:[a,b]}}
 ];
 let order=["opener","assault","interview","main"],revision=4;
 const methods:string[]=[];
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
    eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
    marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
    ready:false,slots:4,bookingClass:"REGULAR",showSeriesId:null,showName:"Dynamite"}]}]};
 const view=()=>({
  showId:"weekly",year:1,week:5,canEdit:true,ready:false,
  worldRevision:revision,day:5,venueId:"arena",showName:"Dynamite",
  promotionName:"AEW",venueName:"Arena",marketName:"Home",
  bookingClass:"REGULAR",ticketStrategy:"STANDARD",
  championships:[],programmes:[],programmeLinks:[],
  selectedPeople:[{personId:"alice",name:"Alice",division:"MEN",alignment:"FACE"},
   {personId:"bob",name:"Bob",division:"MEN",alignment:"HEEL"},
   {personId:"charlie",name:"Charlie",division:"MEN"},
   {personId:"dana",name:"Dana",division:"WOMEN"}],
  slots:order.map((id,i)=>({...slots.find(slot=>slot.slotId===id)!,position:i}))
 });
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON() as Record<string,unknown>;
  methods.push(String(input.method));
  if(input.method==="save"){
   order=input.runningOrder as string[];revision++;
   expect(order).toEqual(["main","assault","opener","interview"]);
   expect((input.segments as {slotId:string;payload:Record<string,unknown>}[])
    .find(s=>s.slotId==="assault")?.payload.sourceMatchSlotId).toBe("main");
  }
  await route.fulfill({json:input.method==="planner"?planner:
   input.method==="load"?view():
   input.method==="save"?{status:"APPLIED",result:{performers:4}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.locator(".ppw-card-bar")).toHaveCount(4);
 await page.locator(".ppw-card-bar .ppw-expand").nth(1).click();
 await page.getByRole("dialog",{name:"Edit angle"}).getByLabel("After which match?")
  .selectOption("main");
 await page.getByRole("dialog",{name:"Edit angle"}).getByRole("button",
  {name:"Close card editor"}).click();
 await expect(page.locator(".ppw-card-bar").nth(3)).toContainText("Follows its match");
 await page.getByRole("button",{name:"Move match in slot 3 earlier"}).click();
 await page.getByRole("button",{name:"Move match in slot 2 earlier"}).click();
 await expect(page.locator(".ppw-card-bar").first()).toContainText("Alice");
 await expect(page.locator(".ppw-card-bar").nth(1)).toContainText("Follows its match");
 await expect(page.getByRole("button",{name:"Move angle in slot 2 earlier"})).toBeDisabled();
 await page.getByRole("button",{name:/Save card|Save changes/}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 await expect(page.locator(".ppw-card-bar").first()).toContainText("Alice");
 expect(methods).toEqual(["planner","load","save","load"]);
 await page.locator(".ppw-card-bar .ppw-expand").first().click();
 const matchup=page.getByRole("dialog",{name:"Edit match"});
 await expect(matchup.getByText("Crowd roles · FACE vs HEEL")).toBeVisible();
 await expect(matchup.getByText(/clear favourite and antagonist/)).toBeVisible();
 await page.getByRole("dialog",{name:"Edit match"}).getByRole("button",
  {name:"Remove match"}).click();
 await expect(page.locator(".ppw-card-bar")).toHaveCount(3);
 await page.locator(".ppw-card-bar .ppw-expand").first().click();
 const orphan=page.getByRole("dialog",{name:"Edit angle"});
 await expect(orphan.getByLabel("After which match?")).toHaveValue("");
 await expect(orphan.getByText("Choose a wrestler who appeared in the selected match."))
  .toBeVisible();
 await orphan.getByLabel("After which match?").selectOption("opener");
 await expect(orphan.getByText("This angle needs a target.")).toBeVisible();
 await orphan.getByRole("button",{name:"Close card editor"}).click();
 await expect(page.locator(".ppw-card-bar").nth(1)).toContainText("Follows its match");
 expect(methods).toEqual(["planner","load","save","load"]);
});

test("iPhone scripts and reopens a specialist attack with one card save",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 const alice={personId:"alice",contractId:"deal-alice"};
 const bob={personId:"bob",contractId:"deal-bob"};
 const match={
  matchType:"SINGLES",family:"INDIVIDUAL",participants:[alice,bob],
  sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[bob]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
  plannedLengthMinutes:18
 };
 let angle:Record<string,unknown>={
  slotId:"ambush",position:1,kind:"ATTACK",actorIds:["alice"],
  targetIds:["bob"],outcome:"HAPPENS",participants:[alice,bob]
 };
 const planner={
  worldName:"Genesis",promotionName:"AEW",year:1,week:5,canEdit:true,
  worldRevision:4,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
    eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
    marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
    ready:false,slots:2,bookingClass:"REGULAR",showSeriesId:null,showName:"Dynamite"}]}]
 };
 let revision=4;
 const view=()=>({
  showId:"weekly",year:1,week:5,canEdit:true,ready:false,
  worldRevision:revision,day:5,venueId:"arena",showName:"Dynamite",
  promotionName:"AEW",venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
  ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
  selectedPeople:[{personId:"alice",name:"Alice",division:"MEN"},
   {personId:"bob",name:"Bob",division:"MEN"}],
  slots:[{slotId:"bout",kind:"MATCH",position:0,payload:match},
   {slotId:"ambush",kind:"SEGMENT",position:1,payload:angle}]
 });
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON();
  methods.push(String(input.method));
  if(input.method==="save"){
   const segments=input.segments as {slotId:string;payload:Record<string,unknown>}[];
   expect(segments).toHaveLength(1);
   angle=segments[0]!.payload;
   revision++;
  }
  await route.fulfill({json:input.method==="planner"?planner:
   input.method==="load"?view():
   input.method==="save"?{status:"APPLIED",result:{performers:2}}:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await page.locator(".ppw-card-bar .ppw-expand").nth(1).click();
 const dialog=page.getByRole("dialog",{name:"Edit angle"});
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"Script the exact angle"}).click();
 await dialog.getByLabel("Attack style").selectOption("PULL_APART_BRAWL");
 await dialog.getByLabel("The intention").selectOption("ESCALATE_RIVALRY");
 await expect(dialog.getByLabel("Attack style")).toHaveValue("PULL_APART_BRAWL");
 await expect(dialog.getByLabel("The intention")).toHaveValue("ESCALATE_RIVALRY");
 await dialog.getByRole("button",{name:"Close card editor"}).click();
 await expect(page.locator(".ppw-card-lineup").last()).toContainText("Pull-apart brawl");
 await page.getByRole("button",{name:/Save card|Save changes/}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(angle.creativeBeat).toEqual({kind:"ATTACK",
  presentation:"PULL_APART_BRAWL",objective:"ESCALATE_RIVALRY"});
 expect(angle.outcome).toBe("HAPPENS");
 await page.locator(".ppw-card-bar .ppw-expand").nth(1).click();
 await expect(page.getByRole("dialog",{name:"Edit angle"}).getByLabel("Attack style"))
  .toHaveValue("PULL_APART_BRAWL");
 expect(methods.filter(x=>x==="save")).toHaveLength(1);
 expect(methods.filter(x=>x==="talent")).toHaveLength(0);
 expect(methods.filter(x=>x==="wrestlerProfile")).toHaveLength(0);
});

test("Home contract news opens the exact wrestler dossier without losing the desk",async({page})=>{
 const methods:string[]=[];
 const home={...overview,promotion:{...overview.promotion,attention:{
  plannedShows:0,unpreparedShow:false,pendingBackstage:false,
  expiringTalent:false,pendingContractOffers:false,
  offerResults:[{id:"offer-result:new-contract",personId:"alice",
   name:"Alice",status:"ACCEPTED"}]}}};
 const dossier={personId:"alice",name:"Alice",division:"WOMEN",status:"ACTIVE",
  careerStage:"REGULAR",popularity:70,recognition:72,momentum:80,morale:75,
  inRingQuality:89,matchCraft:83,presentation:88,stamina:70,safety:85,
  fatigue:0,wear:0,alignment:"FACE",canEdit:false,onYourRoster:true,
  sharedHuman:false,currentWeekIndex:4,worldRevision:4,
  persona:{personaName:"Alice",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[],teams:[],stables:[],connections:[],history:[]};
 await page.route("**/api/session",async route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON();
  methods.push(String(input.method));
  if(input.method==="wrestlerProfile")expect(input.personId).toBe("alice");
  await route.fulfill({json:input.method==="overview"?home:
   input.method==="wrestlerProfile"?dossier:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByText("Alice accepted the offer")).toBeVisible();
 await page.getByRole("button",{name:"View Alice's wrestler dossier"}).click();
 const dialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"‹ Back"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByText("Alice accepted the offer")).toBeVisible();
 await expect(page.getByRole("button",{name:"Plan this week's show"})).toBeVisible();
 expect(methods).toEqual(["overview","wrestlerProfile"]);
});

test("iPhone restores the exact premium card instead of reopening the weekly show",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const a={personId:"alice",contractId:"deal-alice"};
 const b={personId:"bob",contractId:"deal-bob"};
 const booking={matchType:"SINGLES",family:"INDIVIDUAL",
  participants:[a,b],sides:[{sideId:"A",participants:[a]},{sideId:"B",participants:[b]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18};
 const shows=[
  {draftId:"weekly",showName:"Wednesday Show",eventType:"REGULAR",bookingClass:"REGULAR"},
  {draftId:"premium",showName:"The Big Event",eventType:"MAJOR",bookingClass:"PREMIUM"}
 ].map(show=>({...show,year:1,week:5,status:"DRAFT",day:5,
  marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
  ticketStrategy:"STANDARD",ready:false,slots:1,showSeriesId:null}));
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  canEdit:true,worldRevision:4,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:true,
   canEdit:true,scheduled:[],shows}]};
 const selected:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const request=route.request().postDataJSON();
  const method=String(request.method);
  if(method==="load")selected.push(String(request.showId));
  const show=shows.find(x=>x.draftId===request.showId)??shows[0]!;
  const body=method==="planner"?planner:method==="load"?{
   showId:show.draftId,year:1,week:5,canEdit:true,ready:false,worldRevision:4,
   day:5,venueId:"arena",showName:show.showName,promotionName:"AEW",
   venueName:"Arena",marketName:"Home",bookingClass:show.bookingClass,
   ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
   selectedPeople:[{personId:"alice",name:"Alice",division:"MEN"},
    {personId:"bob",name:"Bob",division:"MEN"}],
   slots:[{slotId:"bout",kind:"MATCH",position:0,payload:booking}]
  }:{};
  await route.fulfill({json:body});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).nth(1).click();
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByRole("heading",{name:"The Card"})).toBeVisible();
 await expect(page.getByText("The Big Event")).toBeVisible();
 await page.reload();
 await expect(page.getByText("The Big Event")).toBeVisible();
 expect(selected).toEqual(["premium","premium"]);
 expect(page.url()).not.toContain("premium");
 await page.getByRole("button",{name:"← Planner"}).click();
 await expect(page).toHaveURL(/#\/planner$/);
 await expect(page.getByRole("heading",{name:"Show Planner"})).toBeVisible();
});

test("two-manager claim race keeps the losing iPhone out of private desks",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let claimed=false,attempts=0,sessionReads=0;
 await page.route("**/api/session",async route=>{
  sessionReads++;
  await route.fulfill({json:{...current,
   overview:{...overview,membership:"ACTIVE",
    promotion:claimed?overview.promotion:null},
   availablePromotions:claimed?[]:[{id:"aew",name:"Takeover Company",
    tier:"INDEPENDENT",homeMarketName:"Leeds",rosterSize:16}]
  }});
 });
 await page.route("**/api/claim",async route=>{
  const body=route.request().postDataJSON();
  expect(body.promotionId).toBe("aew");
  expect(body.playerId).toBeUndefined();
  attempts++;
  if(attempts===2)claimed=true;
  await route.fulfill({json:{status:"APPLIED",result:attempts===1?
   {claimed:false,reason:"PROMOTION_TAKEN"}:{claimed:true}}});
 });
 await page.route("**/api/card",route=>route.fulfill({json:overview}));
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Pick a promotion"})).toBeVisible();
 await expect(page.getByText("Home territory · Leeds")).toBeVisible();
 await page.getByRole("button",{name:"Run this promotion"}).click();
 await expect(page.getByText(/Another manager may have taken this company/)).toBeVisible();
 await expect(page.getByRole("heading",{name:"Pick a promotion"})).toBeVisible();
 expect(sessionReads,"Rejected claims must not enter or reload a private desk").toBe(1);
 await page.getByRole("button",{name:"Refresh available promotions"}).click();
 await expect(page.getByRole("heading",{name:"Pick a promotion"})).toBeVisible();
 await page.getByRole("button",{name:"Run this promotion"}).click();
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 expect(attempts).toBe(2);
});

test("iPhone completes the World Lock to next-week broadcast handoff on explicit refresh",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let reads=0,archives=0;
 const locked={...overview,world:{...overview.world,phase:"LOCKED",
  year:1,week:5,revision:9}};
 const next={...overview,world:{...overview.world,phase:"OPEN",
  year:1,week:6,revision:10}};
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  if(method==="overview"){reads++;return route.fulfill({json:reads===1?locked:next});}
  if(method==="resultsArchive"){
   archives++;return route.fulfill({json:{items:[{showId:"last-week",
    year:1,week:5,crowdResponse:81,matchCount:3,angleCount:2,
    showName:"Wednesday Wrestling"}],nextCursor:null}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByRole("heading",{name:"Your World"})).toBeVisible();
 await expect(page.getByText(/CARDS LOCKED/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Check World status"})).toBeVisible();
 expect(reads).toBe(1);
 await page.getByRole("button",{name:"Check World status"}).click();
 await expect(page.getByRole("heading",{name:"The World has moved on"})).toBeVisible();
 await expect(page.getByText(/Year 1 · Week 5 is complete/)).toBeVisible();
 await expect(page.getByRole("button",{name:/Read completed shows/})).toBeVisible();
 expect(reads).toBe(2);
 await page.getByRole("button",{name:/Read completed shows/}).click();
 await expect(page).toHaveURL(/#\/results$/);
 await expect(page.getByRole("heading",{name:"THE TAPE LIBRARY"})).toBeVisible();
 await expect(page.getByText("Wednesday Wrestling")).toBeVisible();
 expect(archives).toBe(1);
});

test("reaching a World deadline on iPhone offers a refresh without silently resolving it",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let reads=0;
 const due={...overview,world:{...overview.world,phase:"OPEN",
  nextLockEpoch:Date.now()/1000-20,serverEpoch:Date.now()/1000}};
 const locked={...overview,world:{...due.world,phase:"LOCKED"}};
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);
  if(method==="overview"){reads++;return route.fulfill({json:reads===1?due:locked});}
  return route.fulfill({json:{}});
 });
 await page.goto("/#/home");
 await expect(page.getByText(/Booking deadline reached/)).toBeVisible();
 await expect(page.getByText(/DEADLINE REACHED/)).toBeVisible();
 await expect(page.getByText(/BOOKING OPEN/)).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Check World status"})).toBeVisible();
 expect(reads).toBe(1);
 await page.getByRole("button",{name:"Check World status"}).click();
 await expect(page.getByText(/CARDS LOCKED/)).toBeVisible();
 expect(reads).toBe(2);
});

test("iPhone unsaved show authorship survives browser back and can be deliberately discarded",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const a={personId:"alice",contractId:"deal-a"};
 const b={personId:"bob",contractId:"deal-b"};
 const booking={matchType:"SINGLES",family:"INDIVIDUAL",participants:[a,b],
  sides:[{sideId:"A",participants:[a]},{sideId:"B",participants:[b]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
  plannedLengthMinutes:18};
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  canEdit:true,worldRevision:4,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,canEdit:true,required:true,major:false,
   scheduled:[],shows:[{draftId:"weekly",showName:"Showtime",
    year:1,week:5,eventType:"REGULAR",bookingClass:"REGULAR",status:"DRAFT",
    day:5,venueId:"arena",marketId:"home",venueName:"Arena",marketName:"Home",
    ticketStrategy:"STANDARD",ready:false,slots:1,showSeriesId:null}]}]};
 const card={showId:"weekly",year:1,week:5,canEdit:true,ready:false,
  worldRevision:4,day:5,venueId:"arena",showName:"Showtime",
  venueName:"Arena",marketName:"Home",promotionName:"AEW",
  bookingClass:"REGULAR",ticketStrategy:"STANDARD",
  championships:[],programmes:[],programmeLinks:[],
  selectedPeople:[{personId:"alice",name:"Alice",division:"MEN"},
   {personId:"bob",name:"Bob",division:"MEN"}],
  slots:[{slotId:"main",kind:"MATCH",position:0,payload:booking}]};
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",async route=>{
  const method=String(route.request().postDataJSON().method);calls.push(method);
  await route.fulfill({json:method==="planner"?planner:method==="load"?card:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page).toHaveURL(/#\/card$/);
 await page.locator(".ppw-card-bar .ppw-expand").click();
 const editor=page.getByRole("dialog",{name:"Edit match"});
 await editor.getByLabel("Minutes").fill("26");
 await editor.getByLabel("Minutes").press("Tab");
 await editor.getByRole("button",{name:"Close card editor"}).click();
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 await expect(page.getByRole("button",{name:"Discard unsaved edits"})).toBeVisible();
 page.once("dialog",d=>d.dismiss());
 await page.goBack();
 await expect(page).toHaveURL(/#\/card$/);
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 expect(calls).not.toContain("save");
 page.once("dialog",d=>d.accept());
 await page.getByRole("button",{name:"Discard unsaved edits"}).click();
 await expect(page.getByText("Unsaved changes")).toHaveCount(0);
 await expect(page.getByText("18 / 120 min")).toBeVisible();
 await page.getByRole("button",{name:"← Planner"}).click();
 await expect(page).toHaveURL(/#\/planner$/);
 expect(calls).not.toContain("save");
});

// Failed-card guidance must reach the booker at the bottom action rail without
// losing the authored running order, even when the server rejects one contract.
test("failed card save explains the roster problem beside Save and retries the same authored card",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const players=[{personId:"alice",contractId:"deal-alice"},
  {personId:"bob",contractId:"deal-bob"}];
 const match={matchType:"SINGLES",family:"INDIVIDUAL",participants:players,
  sides:[{sideId:"A",participants:[players[0]]},{sideId:"B",participants:[players[1]]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18};
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,scheduled:[],
   shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",eventType:"REGULAR",
    day:5,marketId:"home",venueId:"arena",marketName:"Home",venueName:"Arena",
    ticketStrategy:"STANDARD",ready:false,slots:1,bookingClass:"REGULAR",
    showSeriesId:null,showName:"Dynamite"}]}]};
 let attempts=0;
 const submissions:Array<{runningOrder:string[];requestId:string}>=[];
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",route=>{
  const body=route.request().postDataJSON();
  if(body.method==="planner")return route.fulfill({json:planner});
  if(body.method==="load")return route.fulfill({json:{
   showId:"weekly",year:1,week:5,canEdit:true,ready:false,worldRevision:4,
   day:5,venueId:"arena",showName:"Dynamite",promotionName:"AEW",
   venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
   ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
   selectedPeople:[{personId:"alice",name:"Alice",division:"MEN",alignment:"FACE"},
    {personId:"bob",name:"Bob",division:"MEN",alignment:"HEEL"}],
   slots:[{slotId:"bout",kind:"MATCH",position:0,payload:match}]
  }});
  if(body.method==="save"){
   attempts++;
   submissions.push({runningOrder:body.runningOrder,requestId:body.requestId});
   return attempts===1?route.fulfill({status:400,json:{
    error:"Booking request rejected",code:"TALENT"}}):
    route.fulfill({json:{status:"APPLIED",result:{performers:2}}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 await expect(page.locator(".ppw-card-bar")).toHaveCount(1);
 await page.getByRole("button",{name:/Save card|Save changes/}).click();
 const nearSave=page.locator(".ppw-save .ppw-save-error");
 await expect(nearSave).toContainText("selected wrestlers");
 await expect(nearSave).toBeVisible();
 await expect(page.locator(".ppw-card-bar")).toHaveCount(1);
 await page.getByRole("button",{name:/Save card|Save changes/}).click();
 await expect(page.getByText("Show card saved")).toBeVisible();
 expect(submissions.map(x=>x.runningOrder)).toEqual([["bout"],["bout"]]);
 expect(submissions[1]!.requestId).toBe(submissions[0]!.requestId);
});

test("iPhone roster explains crowd character alignments without an extra read",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const methods:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);methods.push(method);
  return route.fulfill({json:method==="wrestlerDirectory"?{
   view:"ROSTER",year:1,week:5,worldRevision:4,canEdit:true,currentWeekIndex:4,
   people:[],total:0,hasMore:false
  }:method==="overview"?overview:{}});
 });
 await page.goto("/#/roster");
 await expect(page.getByRole("heading",{name:"My Roster"})).toBeVisible();
 const guide=page.locator(".ppw-alignment-guide");
 await expect(guide).toHaveCount(1);
 await expect(guide).not.toHaveAttribute("open");
 await guide.locator("summary").click();
 await expect(guide.locator('[data-alignment="FACE"]')).toContainText("Crowd favourite");
 await expect(guide.locator('[data-alignment="HEEL"]')).toContainText("Crowd antagonist");
 await expect(guide.locator('[data-alignment="TWEENER"]')).toContainText("Unpredictable");
 expect(methods).toEqual(["wrestlerDirectory"]);
});

test("dragging booking tickets on iPhone changes only local order until Save",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const a={personId:"alice",contractId:"da"},b={personId:"bob",contractId:"db"};
 const booking={matchType:"SINGLES",family:"INDIVIDUAL",
  participants:[a,b],sides:[{sideId:"A",participants:[a]},{sideId:"B",participants:[b]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
  plannedLengthMinutes:12};
 const planner={worldName:"Genesis",promotionName:"AEW",year:1,week:5,
  worldRevision:4,canEdit:true,homeMarketId:"home",venues:[],
  weeks:[{year:1,week:5,offset:0,required:true,major:false,canEdit:true,
   scheduled:[],shows:[{draftId:"weekly",year:1,week:5,status:"DRAFT",
    eventType:"REGULAR",day:5,marketId:"home",venueId:"arena",
    marketName:"Home",venueName:"Arena",ticketStrategy:"STANDARD",
    ready:false,slots:2,bookingClass:"REGULAR",showSeriesId:null,showName:"Dynamite"}]}]};
 const card={showId:"weekly",year:1,week:5,canEdit:true,ready:false,
  worldRevision:4,day:5,venueId:"arena",showName:"Dynamite",
  promotionName:"AEW",venueName:"Arena",marketName:"Home",bookingClass:"REGULAR",
  ticketStrategy:"STANDARD",championships:[],programmes:[],programmeLinks:[],
  selectedPeople:[{personId:"alice",name:"Alice",division:"MEN",alignment:"FACE"},
   {personId:"bob",name:"Bob",division:"MEN",alignment:"HEEL"}],
  slots:[{slotId:"first",kind:"MATCH",position:0,payload:booking},
   {slotId:"second",kind:"MATCH",position:1,payload:booking}]};
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:current}));
 await page.route("**/api/card",route=>{
  const method=String(route.request().postDataJSON().method);
  calls.push(method);
  return route.fulfill({json:method==="planner"?planner:method==="load"?card:{}});
 });
 await page.goto("/#/planner");
 await page.getByRole("button",{name:"Edit card"}).click();
 const tickets=page.locator(".ppw-card[data-booking-slot-id]");
 await expect(tickets).toHaveCount(2);
 const grip=tickets.first().locator(".ppw-card-grip");
 const first=await grip.boundingBox(),second=await tickets.nth(1).boundingBox();
 expect(first&&second).toBeTruthy();
 await page.mouse.move(first!.x+first!.width/2,first!.y+first!.height/2);
 await page.mouse.down();
 await page.mouse.move(second!.x+second!.width/2,second!.y+second!.height/2,{steps:7});
 await page.mouse.up();
 await expect(tickets.first()).toHaveAttribute("data-booking-slot-id","second");
 await expect(page.getByText("Unsaved changes")).toBeVisible();
 expect(calls).toEqual(["planner","load"]);
});
