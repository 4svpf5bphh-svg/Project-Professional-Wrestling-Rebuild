import {test,expect} from "@playwright/test";
test("iPhone faction selector reuses scouting cards and submits only the selected founders",async({page})=>{
 const methods:string[]=[];let submitted:unknown=null;
 const overview={world:{name:"Genesis",year:1,week:5,revision:4,phase:"OPEN",
  serverEpoch:Date.now()/1000,nextLockEpoch:Date.now()/1000+1800},
  membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:5000000,debt:0}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"test-csrf",overview,
  availablePromotions:[]};
 const roster=Array.from({length:46},(_,i)=>({
  personId:"p-"+i,name:"Performer "+String(i).padStart(3,"0"),
  ringName:"Performer "+String(i).padStart(3,"0"),division:i%3===0?"WOMEN":"MEN",
  stableId:null,popularity:55+i%35,recognition:50+i%40,
  momentum:40+i%50,inRingQuality:63+i%24,matchCraft:65,
  presentation:74,alignment:"FACE",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL"
 }));
 const dossier={personId:"p-0",name:"Performer 000",division:"WOMEN",
  status:"ACTIVE",careerStage:"PRIME",popularity:55,recognition:50,momentum:40,
  morale:70,inRingQuality:63,matchCraft:65,presentation:74,stamina:75,safety:85,
  fatigue:0,wear:0,alignment:"FACE",onYourRoster:true,canEdit:false,
  sharedHuman:false,currentWeekIndex:4,worldRevision:4,
  persona:{personaName:"Performer 000",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[],teams:[],stables:[],connections:[],history:[]};
 await page.route("**/api/session",async route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const input=route.request().postDataJSON();
  methods.push(input.method);
  if(input.method==="wrestlerProfile")return route.fulfill({json:dossier});
  if(input.method==="createStable"){
   submitted=input;
   return route.fulfill({json:{status:"APPLIED",result:{stableId:"formed"}}});
  }
  return route.fulfill({json:input.method==="stables"?
   {year:1,week:5,worldRevision:4,canEdit:true,stables:[],
    roster,storyFollowThrough:[]}:{}});
 });
 await page.goto("/#/stables");
 await expect(page.getByRole("heading",{name:"Stables"})).toBeVisible();
 const cards=page.locator(".ppw-stable-founder-card");
 await expect(cards).toHaveCount(40);
 await expect(page.getByRole("button",{name:"Form faction"})).toBeDisabled();
 await page.getByRole("button",{name:"View Performer 000's dossier ↗"}).click();
 const modal=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(modal).toBeVisible();
 await modal.getByRole("button",{name:"‹ Back"}).click();
 await expect(modal).toHaveCount(0);
 await expect(cards).toHaveCount(40);
 expect(methods.filter(x=>x==="stables")).toHaveLength(1);
 for(let i=0;i<3;i++)await cards.nth(i).click();
 await expect(page.getByRole("button",{name:"Form faction"})).toBeEnabled();
 await expect(page.locator(".ppw-stable-founder-card[aria-pressed=true]")).toHaveCount(3);
 const field=page.getByRole("searchbox",{name:"Search faction founders"});
 await field.fill("Performer 045");
 await expect(cards).toHaveCount(1);
 await expect(page.getByText(/3 of 12 chosen/)).toBeVisible();
 expect(methods).toEqual(["stables","wrestlerProfile"]);
 await page.getByLabel("Faction name").fill("The Revolution");
 await page.getByRole("button",{name:"Form faction"}).click();
 await expect(page.getByText("New faction created")).toBeVisible();
 expect(submitted).toMatchObject({method:"createStable",name:"The Revolution",
  personIds:["p-0","p-1","p-2"]});
 expect((submitted as {playerId?:string}).playerId).toBeUndefined();
 expect(methods.filter(x=>x==="stables")).toHaveLength(2);
 expect(methods.filter(x=>x==="wrestlerProfile")).toHaveLength(1);
});

test("iPhone tag selection and Backstage thread keep their place when scouting a wrestler",async({page})=>{
 const calls:string[]=[];
 const overview={world:{name:"Genesis",year:1,week:5,revision:4,phase:"OPEN",
  serverEpoch:Date.now()/1000,nextLockEpoch:Date.now()/1000+1800},
  membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:5000000,debt:0}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"test-csrf",overview,
  availablePromotions:[]};
 const person={personId:"ada",name:"Ada Stone",ringName:"Ada Stone",
  division:"WOMEN",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
  alignment:"FACE",popularity:74,recognition:72,momentum:80,
  matchCraft:75,inRingQuality:83,presentation:78};
 const other={...person,personId:"ruby",name:"Ruby Stone",ringName:"Ruby Stone"};
 const full={...person,status:"ACTIVE",careerStage:"PRIME",morale:75,
  stamina:81,safety:90,fatigue:0,wear:0,canEdit:false,onYourRoster:true,
  sharedHuman:false,currentWeekIndex:4,worldRevision:4,
  persona:{personaName:"Ada Stone",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[],teams:[],stables:[],connections:[],history:[]};
 const latest={request_id:"message",kind:"CONTRACT",status:"PENDING",
  created_week_index:4,read_week_index:0,archived:false};
 const contact={...person,isCurrent:true,morale:75,lastMessage:null,latestIncoming:latest};
 const inbox={personId:null,persona:null,history:[],recentRequests:[],
  archetypes:[],documentedAlternates:[],conversations:[],worldYear:1,
  worldWeek:5,worldRevision:4,canEdit:false,nextPitchWeek:0,roster:[contact]};
 await page.route("**/api/session",async route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const data=route.request().postDataJSON();
  calls.push(data.method);
  await route.fulfill({json:data.method==="tagTeams"?
   {year:1,week:5,worldRevision:4,canEdit:true,roster:[person,other],
    teams:[]}:
   data.method==="wrestlerProfile"?full:
   data.method==="backstage"?(data.personId?
    {...inbox,personId:"ada",personName:"Ada Stone",persona:full.persona}:inbox):{}});
 });
 await page.goto("/#/teams");
 await expect(page.getByRole("heading",{name:"Tag Teams"})).toBeVisible();
 const picked=page.locator(".ppw-pair-wrestler").first();
 await picked.click();
 await expect(picked).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"View Ada Stone's dossier ↗"}).click();
 const dialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"‹ Back"}).click();
 await expect(dialog).toHaveCount(0);
 await expect(picked).toHaveAttribute("aria-pressed","true");
 expect(calls.filter(x=>x==="tagTeams")).toHaveLength(1);
 await page.goto("/#/backstage");
 await expect(page.getByRole("heading",{name:"Messages"})).toBeVisible();
 await page.locator(".ppw-backstage-contact").first().click();
 const thread=page.getByLabel("Conversation with Ada Stone");
 await expect(thread).toBeVisible();
 const before=calls.filter(x=>x==="backstage").length;
 await thread.getByRole("button",{name:"View Ada Stone wrestler dossier"}).click();
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"‹ Back"}).click();
 await expect(thread).toBeVisible();
 expect(calls.filter(x=>x==="backstage")).toHaveLength(before);
 expect(calls.filter(x=>x==="wrestlerProfile")).toHaveLength(2);
});
