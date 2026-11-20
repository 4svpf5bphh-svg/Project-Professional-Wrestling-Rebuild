import {test,expect} from "@playwright/test";

const session={
 worldId:"world",playerId:"manager",csrfToken:"csrf",
 overview:{world:{revision:8,name:"Genesis",year:1,week:20,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"cwa",name:"Chaotic Wrestling Alliance",
  tier:"LOCAL",cash:2500000,debt:0}},availablePromotions:[]
};
for(const width of [320,390]){
 test("new terms retain the selected wrestler and replace expiry ribbon with pending status at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let pending=false,revision=8,reads=0;
  const submitted:Record<string,unknown>[]=[];
  const contract={
   personId:"riddle",contractId:"riddle-current",name:"Matt Riddle",
   family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",
   remainingDates:12,startWeekIndex:0,expiresWeekIndex:21,
   weeksRemaining:2,dateEntitlement:20,weeklyGuarantee:1200,
   appearanceFee:2000,signingBonus:0,
   roleExpectation:"FEATURED",creativeControl:"NONE",
   needsAttention:!pending,expiringSoon:!pending,
   renewalEligible:!pending,additionalDatesEligible:false,
   reason:null,pendingNegotiation:false,pendingRenewal:false,
   pendingRenewalOffer:pending,renewalArranged:false,
   careerStage:"PRIME",popularity:72,recognition:70,
   estimatedWeeklyValue:4000
  };
  const data=()=>({
   year:1,week:20,currentWeekIndex:19,worldRevision:revision,
   canEdit:true,hasTalentManager:false,spendingPlan:null,
   talentManager:null,
   talentBudget:{cash:2500000,currentGuarantees:1200},
   roster:[{...contract,needsAttention:!pending,expiringSoon:!pending,
    renewalEligible:!pending,pendingRenewalOffer:pending}],
   requests:[],renewals:[],offers:pending?[{
    offer_id:"offer-riddle",person_id:"riddle",person_name:"Matt Riddle",
    source_contract_id:"riddle-current",status:"PENDING",
    submitted_week_index:19,terms:submitted[0]?.terms
   }]:[],resolvedOffers:[],dateDecisions:[],
   summary:{signed:1,expiringSoon:pending?0:1,noDates:0,
    pendingNegotiations:0,pendingRenewals:0,pendingOffers:pending?1:0,
    weeklyGuarantees:1200}
  });
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const body=r.request().postDataJSON() as Record<string,unknown>;
   if(body.method==="contracts"){reads++;return r.fulfill({json:data()});}
   if(body.method==="submitContractOffer"){
    submitted.push(body);pending=true;revision++;
    return r.fulfill({json:{status:"APPLIED",result:{offerId:"offer-riddle"}}});
   }
   throw Error("Unexpected method "+String(body.method));
  });
  await page.goto("/#/contracts");
  const card=page.locator(".ppw-contract-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator("summary")).toContainText("EXPIRING");
  await card.locator("summary").click();
  await card.getByRole("button",{name:"Negotiate a new package"}).click();
  await expect(card).toHaveAttribute("open","");
  await expect(card.locator(".ppw-contract-renegotiate")).toBeVisible();
  await expect(card.getByLabel("Weekly guarantee ($) for Matt Riddle"))
   .toHaveValue("1200");
  await card.getByLabel("New contract type for Matt Riddle").selectOption("EXCLUSIVE");
  await expect(card.locator(".ppw-contract-exclusive-floor"))
   .toContainText("Minimum exclusive weekly guarantee: $2,000/week");
  await expect(card.getByLabel("Weekly guarantee ($) for Matt Riddle"))
   .toHaveValue("2000");
  await expect(card.getByLabel("Appearance fee ($) for Matt Riddle")).toBeDisabled();
  await card.getByRole("button",{name:"Send negotiated renewal"}).click();
  await expect(page.getByText(/Renewal offer sent/)).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Contract Desk sections"}))
   .toHaveAttribute("aria-label","Contract Desk sections");
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("open","");
  await expect(card.locator("summary")).toContainText("OFFER SENT");
  await expect(card.locator("summary")).not.toContainText("EXPIRING");
  await expect(card).toContainText("Matt Riddle");
  expect(submitted).toHaveLength(1);
  expect(submitted[0]?.sourceContractId).toBe("riddle-current");
  expect(submitted[0]?.terms).toMatchObject({family:"EXCLUSIVE",weeklyGuarantee:2000,
   appearanceFee:0,dateEntitlement:52});
  expect(submitted[0]?.expectedRevision).toBe(8);
  expect(reads).toBe(2); // One refresh; no extra Neon read to restore context
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
