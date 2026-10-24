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
   expect(req.showId).toBe("show-1");expect(req.expectedRevision).toBe(revision);
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
