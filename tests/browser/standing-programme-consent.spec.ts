import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"Genesis",year:1,week:5,
 phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"local",name:"Home",tier:"LOCAL",cash:800000,debt:0,
 lastWeeklyNet:null,financialDistress:"HEALTHY"}};
const session={worldId:"world",playerId:"owner",csrfToken:"opaque",overview,
 availablePromotions:[]};
test("iPhone negotiates one limited rivalry agreement, remembers the answer and keeps its selections",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let approved=false,revision=4;const methods:string[]=[];
 await page.route("**/api/session",async route=>route.fulfill({json:session}));
 await page.route("**/api/card",async route=>{
  const req=route.request().postDataJSON() as Record<string,unknown>;
  methods.push(String(req.method));
  if(req.method==="standingProgrammeConsent"){
   expect(req.programmeId).toBe("rivalry");
   expect(req.personId).toBe("alice");
   expect(req.matchType).toBe("TAG");
   expect(req.permittedOutcome).toBe("WIN_OR_PROTECTED_LOSS");
   expect(req.termWeeks).toBe(4);
   expect(req.expectedRevision).toBe(4);
   expect(req.playerId).toBeUndefined();
   approved=true;revision++;
   await route.fulfill({json:{status:"APPLIED",result:{
    approved:true,existing:false,expiresWeekIndex:8,score:76}}});
   return;
  }
  const story={year:1,week:5,worldRevision:revision,canEdit:true,
   people:[{kind:"PERSON",refId:"alice",name:"Alice"},
    {kind:"PERSON",refId:"bob",name:"Bob"}],
   teams:[],championships:[],
   programmes:[{programmeId:"rivalry",status:"ACTIVE",heat:67,repetition:0,
    activityCount:2,matchCount:1,segmentCount:1,
    sideAWins:1,sideBWins:0,draws:0,championshipId:null,
    startedWeekIndex:1,endedWeekIndex:null,latestFollowUp:null,
    sideA:[{kind:"PERSON",refId:"alice",name:"Alice"}],
    sideB:[{kind:"PERSON",refId:"bob",name:"Bob"}],recentActivity:[],
    eligibleCreativePeople:[{personId:"alice",name:"Alice"}],
    creativeAgreements:approved?[{personId:"alice",approved:true,score:76,
     decidedWeekIndex:4,expiresWeekIndex:8,
     matchType:"TAG",permittedOutcome:"WIN_OR_PROTECTED_LOSS"}]:[]
   }]
  };
  await route.fulfill({json:req.method==="programmes"?story:{}});
 });
 await page.goto("/#/programmes");
 await expect(page.getByRole("heading",{name:"Match agreements"})).toBeVisible();
 await page.getByRole("combobox",{name:"Match format for Alice"}).selectOption("TAG");
 await page.getByRole("combobox",{name:"Permitted finish for Alice"}).selectOption("WIN_OR_PROTECTED_LOSS");
 await page.getByRole("spinbutton",{name:"Agreement weeks for Alice"}).fill("4");
 await page.getByRole("spinbutton",{name:"Agreement weeks for Alice"}).blur();
 await page.getByRole("button",{name:"Ask Alice about the rivalry"}).click();
 await expect(page.getByText(/The wrestler has considered/)).toBeVisible();
 await expect(page.getByText(/Agreed · Through Y1 W8/)).toBeVisible();
 await expect(page.getByRole("button",{name:"Ask Alice about the rivalry"})).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"Active rivalries · 1"})).toBeVisible();
 expect(methods).toEqual(["programmes","standingProgrammeConsent","programmes"]);
 await page.reload();
 await expect(page.getByText(/Agreed · Through/)).toBeVisible();
 expect(methods).toEqual(["programmes","standingProgrammeConsent","programmes","programmes"]);
});
