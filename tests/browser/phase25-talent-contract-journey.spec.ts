import {test,expect} from "@playwright/test";

const session={worldId:"world",playerId:"owner",csrfToken:"csrf",
 overview:{world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"Chaotic Wrestling Alliance",
 tier:"LOCAL",cash:5_000_000,debt:0,lastWeeklyNet:0,financialDistress:"HEALTHY"}},
 availablePromotions:[]};
const market={year:1,week:5,currentWeekIndex:4,worldRevision:4,canEdit:true,
 view:"MARKET",offset:0,hasMore:false,
 offerBudget:{hasTalentManager:true,
  talentManager:{staffId:"staff-001",name:"Morgan Keane",insight:88},
  cash:5_000_000,
  weeklyIncome:90_000,weeklyOverhead:25_000,weeklyGuarantees:30_000,
  weeklyStaffPayroll:5_000,weeklyWageLimit:55_000,cashReserve:300_000,
  signedRosterExposure:1_000_000},
 people:[{personId:"star",name:"Taylor Vale",division:"MEN",
  availability:"FREE_AGENT",interest:"INTERESTED",pendingOffer:false,
  estimatedWeeklyValue:10_000,recognition:60,popularity:70,momentum:50,
  inRingQuality:78,matchCraft:76,presentation:82,morale:75}]};

test("320px Talent Market keeps talent visible, remembers scouting filters, and offers clear one-night and year-long costs",async({page})=>{
 await page.setViewportSize({width:320,height:740});
 const filters:Record<string,unknown>[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const input=r.request().postDataJSON() as {method:string;filter?:Record<string,unknown>};
  if(input.method==="wrestlerDirectory"){
   filters.push(input.filter??{});
   return r.fulfill({json:market});
  }
  return r.fulfill({json:{}});
 });
 await page.goto("/#/market");
 const refinements=page.locator(".ppw-directory-refinements");
 await expect(page.getByRole("heading",{name:"Talent Market"})).toBeVisible();
 await expect(page.locator(".ppw-directory-card")).toHaveCount(1);
 await expect(refinements).not.toHaveAttribute("open");
 await expect(page.getByRole("button",{name:"Men",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Women",exact:true})).toBeVisible();
 await expect(page.getByLabel("Sort by")).toBeHidden();
 await expect(page.getByLabel("Recruitment interest")).toBeHidden();
 await page.getByRole("button",{name:"Free agents"}).click();
 await expect(page.getByRole("button",{name:"Free agents"})).toHaveAttribute("aria-pressed","true");
 expect(filters.at(-1)?.availability).toBe("FREE_AGENT");
 await refinements.locator(":scope > summary").click();
 await expect(page.getByLabel("Sort by")).toBeVisible();
 await page.getByLabel("Recruitment interest").selectOption("INTERESTED_PLUS");
 await expect(refinements).toHaveAttribute("open","");
 await expect(refinements.locator("summary").first()).toContainText("active");
 expect(filters.at(-1)?.interest).toBe("INTERESTED_PLUS");
 await refinements.getByRole("button",{name:"Clear filters"}).click();
 await expect(refinements).not.toHaveAttribute("open");
 expect(filters.at(-1)?.availability).toBe("ALL");
 expect(filters.at(-1)?.interest).toBe("ALL");
 const talent=page.locator(".ppw-directory-card").first();
 await talent.locator("summary").click();
 await talent.getByRole("button",{name:"Make contract offer"}).click();
 const offer=page.locator(".ppw-directory-offer");
 await expect(offer.getByText(/Year 1 Week 6/)).toBeVisible();
 await offer.getByRole("button",{name:/One night only/}).click();
 await expect(offer.getByText(/One-night booking available in Year 1 Week 6/)).toBeVisible();
 await expect(offer.locator(".ppw-directory-contract-estimate")).toContainText("POTENTIAL FULL-TERM COST");
 await expect(offer.getByRole("button",{name:"Use my recommendation"})).toBeVisible();
 await offer.getByRole("button",{name:/Long term/}).click();
 await expect(offer.getByText(/52 weeks · 40 dates/)).toBeVisible();
 await offer.getByRole("button",{name:"Customise this offer"}).click();
 await offer.getByLabel("Appearance fee ($)").fill("12500");
 await expect(offer.locator(".ppw-directory-contract-estimate")).toContainText("$500,000");
 // A huge full-term deal used to be described as fitting the plan.
 await offer.getByLabel("Appearance fee ($)").fill("200000");
 const manager=offer.locator(".ppw-directory-adviser");
 await expect(manager).toBeVisible();
 await expect(manager).toHaveAttribute("data-risk","watch");
 await expect(manager).toContainText("Unsustainable on current cash");
 await expect(offer.locator(".ppw-directory-affordability")).toHaveAttribute("data-risk","true");
 await offer.getByLabel("Appearance fee ($)").fill("12500");
 const stress=offer.locator(".ppw-directory-cash-stress");
 await expect(stress).not.toHaveAttribute("open","");
 await stress.locator("summary").click();
 await expect(stress.locator(".ppw-directory-cash-only"))
  .toContainText("signed roster + this offer");
 await expect(stress).toContainText("not owed now");
 // A named Talent Manager now includes a weekly guarantee in the year-long
 // recommendation: $114,400 wages + $500,000 on 40 dates = $614,400.
 await expect(offer.locator(".ppw-directory-contract-estimate")).toContainText("$614,400");
 await expect(offer.locator(".ppw-directory-cash-only")).toContainText("$3,385,600 remaining");
 expect(filters.length).toBe(4); // one initial read, two refinements, one clear
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("Contract Desk compares ten genuine annual signings with cash, without another Neon request",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let cash=5_000_000,contractReads=0;
 const roster=Array.from({length:10},(_,i)=>({
  personId:"talent-"+i,contractId:"contract-"+i,name:"Talent "+i,
  family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",remainingDates:40,
  startWeekIndex:4,expiresWeekIndex:55,dateEntitlement:40,
  weeksRemaining:52,weeklyGuarantee:5000,appearanceFee:6000,signingBonus:0,
  roleExpectation:"FEATURED",creativeControl:"NONE",
  needsAttention:false,expiringSoon:false,reason:null,
  additionalDatesEligible:false,renewalEligible:false,
  pendingNegotiation:false,pendingRenewal:false,renewalArranged:false
 }));
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const input=r.request().postDataJSON() as {method:string};
  if(input.method==="contracts"){
   contractReads++;
   return r.fulfill({json:{year:1,week:5,currentWeekIndex:4,worldRevision:4,
    canEdit:true,hasTalentManager:true,spendingPlan:null,
    talentBudget:{cash,currentGuarantees:50_000},
    roster,requests:[],renewals:[],offers:[],resolvedOffers:[],dateDecisions:[],
    summary:{signed:10,expiringSoon:0,noDates:0,pendingNegotiations:0,
     pendingRenewals:0,pendingOffers:0,weeklyGuarantees:50_000}}});
  }
  return r.fulfill({json:{}});
 });
 await page.goto("/#/contracts");
 const exposure=page.locator(".ppw-contract-exposure");
 await expect(page.getByRole("navigation",{name:"Contract Desk sections"}))
  .toContainText("Needs action");
 await expect(page.getByRole("navigation",{name:"Contract Desk sections"}))
  .toContainText("Roster");
 await expect(page.getByRole("navigation",{name:"Contract Desk sections"}))
  .toContainText("Offers");
 await expect(page.locator(".ppw-contract-card")).toHaveCount(0);
 await page.getByRole("button",{name:/Roster · 10/}).click();
 await expect(page.locator(".ppw-contract-card")).toHaveCount(10);
 await exposure.locator("summary").click();
 await expect(exposure.locator(".ppw-contract-exposure-total")).toHaveText("$5,000,000");
 await expect(exposure).toContainText("Guaranteed wages to expiry");
 await expect(exposure).toContainText("$2,600,000");
 await expect(exposure).toContainText("$2,400,000");
 await expect(exposure).toContainText("400 unused appearance dates");
 await expect(exposure.locator(".ppw-contract-cash-comparison")).toContainText("$0 left");
 await expect(exposure.getByText(/planning comparison, not a debt or cash reservation/)).toBeVisible();
 expect(contractReads).toBe(1);
 cash=4_000_000;
 await page.reload();
 await exposure.locator("summary").click();
 await expect(exposure.locator(".ppw-contract-cash-comparison")).toContainText("$1,000,000 short");
 await expect(exposure.locator(".ppw-contract-cash-comparison"))
  .toHaveAttribute("data-coverage","gap");
 expect(contractReads).toBe(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});
