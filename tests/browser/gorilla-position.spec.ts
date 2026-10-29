import {test,expect} from "@playwright/test";

test("320px Gorilla clipboard protects an exact match, saves conditional choices and returns to Staff without another nav bar",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",
   tier:"LOCAL",cash:200000,debt:0}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",
  overview,availablePromotions:[]};
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 let revision=4,protectedMatch=false,crowdChoice="DELEGATE",
  timingChoice="DELEGATE",saved=0;
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as Record<string,unknown>;
  if(req.method==="staff")return route.fulfill({json:{
   year:1,week:5,worldRevision:revision,canEdit:true,
   gorillaPolicy:"FOLLOW_THE_CROWD",allowUnfinishedFallback:false,
   allowLogisticsFallback:false,autoRenewSameTerms:false,permittedDays:[],
   permittedVenueIds:[],lockedLogisticsDelegated:false,talentManager:null,
   availableManagers:[],weeklyPayroll:0,promotionCash:200000,
   employees:[],market:[],employmentHistory:[],venues:[],notices:[]
  }});
  if(req.method==="gorillaWorkspace")return route.fulfill({json:{
   year:1,week:5,worldRevision:revision,canEdit:true,policy:"FOLLOW_THE_CROWD",
   shows:[{showId:"show-1",name:"Saturday Night",year:1,week:5,status:"DRAFT",canEdit:true,
    matches:[{matchId:"bout-1",position:0,description:"Wrestler A vs Wrestler B",
     unavailable:[],protectScript:protectedMatch,crowdChoice,timingChoice}]}]
  }});
  if(req.method==="saveGorillaShow"){
   expect(req.playerId).toBeUndefined();
   expect(req.worldId).toBe("genesis");expect(req.promotionId).toBe("local");
   expect(req.targetShowId).toBe("show-1");expect(req.expectedRevision).toBe(revision);
   const match=(req.matches as Record<string,unknown>[])[0]!;
   expect(match.matchId).toBe("bout-1");
   protectedMatch=match.protectScript===true;
   crowdChoice=String(match.crowdChoice);timingChoice=String(match.timingChoice);
   saved++;revision++;
   return route.fulfill({json:{status:"APPLIED",result:{saved:1}}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/staff");
 await page.getByRole("button",{name:/Prepare individual match contingencies/}).click();
 await expect(page.getByRole("heading",{name:"At the curtain"})).toBeVisible();
 await expect(page.getByText("Wrestler A vs Wrestler B")).toBeVisible();
 const choice=page.getByRole("combobox",{name:"Exceptional crowd response"});
 await choice.selectOption("RESET_COMMENTARY");
 await page.getByRole("combobox",{name:"Verified major timing overrun"})
  .selectOption("TIGHTEN_TRANSITIONS");
 await page.getByRole("button",{name:"Save match contingencies"}).click();
 await expect(page.getByText(/Gorilla contingencies saved before World Lock/)).toBeVisible();
 expect(saved).toBe(1);
 await expect(choice).toHaveValue("RESET_COMMENTARY");
 await page.getByRole("checkbox",{name:/Protect this match/}).check();
 await expect(choice).toBeDisabled();
 await page.getByRole("checkbox",{name:/Protect this match/}).uncheck();
 await page.getByRole("button",{name:"← Staff Office"}).click();
 await expect(page.getByRole("heading",{name:"Staff Office"})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test("Gorilla retains edits across show tabs and replays a lost save receipt without double-writing",async({page})=>{
 await page.setViewportSize({width:320,height:720});
 const overview={world:{revision:5,name:"Genesis",year:1,week:8,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"local",name:"Local Wrestling",
  tier:"LOCAL",cash:300000,debt:0}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"opaque",
  overview,availablePromotions:[]};
 const stored=new Map<string,string>(),receipts=new Map<string,string>(),ids:string[]=[];
 let revision=5,writeCount=0,firstLost=true,reads=0;
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as Record<string,unknown>;
  if(req.method==="staff")return route.fulfill({json:{
   year:1,week:8,worldRevision:revision,canEdit:true,
   gorillaPolicy:"FOLLOW_THE_CROWD",allowUnfinishedFallback:false,
   allowLogisticsFallback:false,autoRenewSameTerms:false,permittedDays:[],
   permittedVenueIds:[],lockedLogisticsDelegated:false,talentManager:null,
   availableManagers:[],weeklyPayroll:0,promotionCash:300000,
   employees:[],market:[],employmentHistory:[],venues:[],notices:[]
  }});
  if(req.method==="gorillaWorkspace"){
   reads++;
   return route.fulfill({json:{year:1,week:8,worldRevision:revision,canEdit:true,
    policy:"FOLLOW_THE_CROWD",shows:["Alpha","Bravo"].map((name,i)=>({
     showId:"show-"+i,name,year:1,week:8,status:"DRAFT",canEdit:true,
     matches:[{matchId:"bout-"+i,position:0,description:name+" main event",
      unavailable:[],protectScript:false,crowdChoice:stored.get("show-"+i)??"DELEGATE",
      timingChoice:"DELEGATE"}]
    }))}});
  }
  if(req.method==="saveGorillaShow"){
   const id=String(req.requestId),target=String(req.targetShowId);
   ids.push(id);
   const original=receipts.get(id);
   if(original){
    expect(original).toBe(target);
    return route.fulfill({json:{status:"REPLAYED",result:{saved:1}}});
   }
   expect(req.expectedRevision).toBe(revision);
   receipts.set(id,target);writeCount++;revision++;
   const m=(req.matches as {crowdChoice:string}[])[0]!;
   stored.set(target,m.crowdChoice);
   if(firstLost){firstLost=false;return route.abort("failed");}
   return route.fulfill({json:{status:"APPLIED",result:{saved:1}}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto("/#/staff");
 await page.getByRole("button",{name:/Prepare individual match contingencies/}).click();
 await expect(page.getByRole("heading",{name:"At the curtain"})).toBeVisible();
 await page.getByRole("combobox",{name:"Exceptional crowd response"})
  .selectOption("LET_CROWD_BREATHE");
 await page.getByRole("button",{name:/Bravo/}).click();
 await page.getByRole("combobox",{name:"Exceptional crowd response"})
  .selectOption("RESET_COMMENTARY");
 page.once("dialog",d=>void d.dismiss());
 await page.getByRole("button",{name:"← Staff Office"}).click();
 await expect(page.getByRole("heading",{name:"At the curtain"})).toBeVisible();
 await expect(page.getByRole("button",{name:/Alpha/})).toContainText("UNSAVED");
 await page.getByRole("button",{name:/Alpha/}).click();
 await expect(page.getByRole("combobox",{name:"Exceptional crowd response"}))
  .toHaveValue("LET_CROWD_BREATHE");
 await page.getByRole("button",{name:"Save match contingencies"}).click();
 await expect(page.getByText(/were not saved|failed to fetch|network|unavailable/i).first())
  .toBeVisible();
 await page.getByRole("button",{name:"Save match contingencies"}).click();
 await expect(page.getByText(/contingencies saved before World Lock/)).toBeVisible();
 expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
 expect(writeCount).toBe(1);
 await expect(page.getByRole("button",{name:/Bravo/})).toContainText("UNSAVED");
 await page.getByRole("button",{name:/Bravo/}).click();
 await expect(page.getByRole("combobox",{name:"Exceptional crowd response"}))
  .toHaveValue("RESET_COMMENTARY");
 await page.getByRole("button",{name:"Save match contingencies"}).click();
 await expect(page.getByText(/contingencies saved before World Lock/)).toBeVisible();
 expect(writeCount).toBe(2);
 expect(reads).toBe(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
