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
  expect(submitted[0]?.expectedRevision).toBe(8);
  expect(reads).toBe(2); // One refresh; no extra Neon read to restore context
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });

 test("a paid current non-exclusive deal can become exclusive next term at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let revision=8,pending=false,reads=0;
  const submissions:{sourceContractId?:string;terms?:Record<string,unknown>}[]=[];
  const source={
   personId:"riddle",contractId:"riddle-current",name:"Matt Riddle",
   family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",
   remainingDates:12,startWeekIndex:0,expiresWeekIndex:21,
   weeksRemaining:2,dateEntitlement:20,weeklyGuarantee:1200,
   appearanceFee:2000,signingBonus:1500,
   roleExpectation:"FEATURED",creativeControl:"NONE",
   needsAttention:true,expiringSoon:true,renewalEligible:true,
   additionalDatesEligible:false,reason:null,
   pendingNegotiation:false,pendingRenewal:false,
   pendingRenewalOffer:false,renewalArranged:false,
   estimatedWeeklyValue:4000
  };
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const m=r.request().postDataJSON() as Record<string,unknown>;
   if(m.method==="contracts"){
    reads++;
    return r.fulfill({json:{
     year:1,week:20,currentWeekIndex:19,worldRevision:revision,canEdit:true,
     hasTalentManager:false,talentManager:null,spendingPlan:null,
     talentBudget:{cash:600000,currentGuarantees:1200},
     roster:[{...source,pendingRenewalOffer:pending,
      renewalEligible:!pending,needsAttention:!pending}],
     offers:pending?[{offer_id:"riddle-future",person_id:"riddle",
      person_name:"Matt Riddle",source_contract_id:"riddle-current",
      status:"PENDING",terms:submissions[0]?.terms}]:[],
     requests:[],renewals:[],resolvedOffers:[],dateDecisions:[],
     summary:{signed:1,expiringSoon:pending?0:1,noDates:0,
      pendingNegotiations:0,pendingRenewals:0,pendingOffers:pending?1:0,
      weeklyGuarantees:1200}
    }});
   }
   if(m.method==="submitContractOffer"){
    submissions.push({sourceContractId:String(m.sourceContractId),
     terms:m.terms as Record<string,unknown>});
    pending=true;revision++;
    return r.fulfill({json:{status:"APPLIED",result:{offerId:"riddle-future"}}});
   }
   throw Error("Unexpected request "+String(m.method));
  });
  await page.goto("/#/contracts");
  const card=page.locator(".ppw-contract-card").first();
  await card.locator("summary").click();
  await card.getByRole("button",{name:"Negotiate a new package"}).click();
  const type=card.getByLabel("New contract type for Matt Riddle");
  await expect(type).toHaveValue("LIMITED_NON_EXCLUSIVE");
  await type.selectOption("EXCLUSIVE");
  await expect(type).toHaveValue("EXCLUSIVE");
  await expect(card.locator(".ppw-contract-exclusive-minimum"))
   .toContainText("Exclusive wage minimum · $2,000/week");
  await expect(card.locator(".ppw-contract-exclusive-minimum"))
   .toHaveAttribute("data-shortfall","true");
  await card.getByRole("button",{name:"Use minimum $2,000"}).click();
  await expect(card.getByLabel("Weekly guarantee ($) for Matt Riddle"))
   .toHaveValue("2000");
  await expect(card.getByLabel("Purchased dates for Matt Riddle")).toBeDisabled();
  await expect(card.getByLabel("Appearance fee ($) for Matt Riddle")).toBeDisabled();
  await expect(card.getByLabel("Signing bonus ($) for Matt Riddle")).toHaveValue("0");
  await card.getByRole("button",{name:"Send negotiated renewal"}).click();
  await expect(page.getByText("Renewal offer sent.",{exact:false})).toBeVisible();
  expect(submissions[0]?.sourceContractId).toBe("riddle-current");
  expect(submissions[0]?.terms).toMatchObject({
   family:"EXCLUSIVE",startWeekIndex:22,
   appearanceFee:0,weeklyGuarantee:2000,signingBonus:0
  });
  expect(submissions[0]?.terms?.dateEntitlement).toBe(submissions[0]?.terms?.termWeeks);
  expect(reads).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });

 test("exclusive can become non-exclusive only after expiry at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  const submissions:Record<string,unknown>[]=[];
  const current={personId:"riddle",contractId:"exclusive-current",name:"Matt Riddle",
   family:"EXCLUSIVE",status:"SIGNED",remainingDates:null,startWeekIndex:0,
   expiresWeekIndex:25,weeksRemaining:7,dateEntitlement:26,
   weeklyGuarantee:6000,appearanceFee:0,signingBonus:0,
   roleExpectation:"MAIN_EVENT",creativeControl:"CONSULTATION",
   needsAttention:true,expiringSoon:true,renewalEligible:true,
   additionalDatesEligible:false,reason:null,
   pendingNegotiation:false,pendingRenewal:false,pendingRenewalOffer:false,
   renewalArranged:false,estimatedWeeklyValue:10000};
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const m=r.request().postDataJSON() as Record<string,unknown>;
   if(m.method==="contracts")return r.fulfill({json:{
    year:1,week:20,currentWeekIndex:19,worldRevision:8,canEdit:true,
    hasTalentManager:false,spendingPlan:null,
    talentBudget:{cash:1000000,currentGuarantees:6000},
    roster:[current],requests:[],renewals:[],offers:[],
    resolvedOffers:[],dateDecisions:[],
    summary:{signed:1,expiringSoon:1,noDates:0,pendingNegotiations:0,
     pendingRenewals:0,pendingOffers:0,weeklyGuarantees:6000}
   }});
   if(m.method==="submitContractOffer"){
    submissions.push(m.terms as Record<string,unknown>);
    return r.fulfill({json:{status:"APPLIED"}});
   }
   throw Error("Unexpected request "+String(m.method));
  });
  await page.goto("/#/contracts");
  const card=page.locator(".ppw-contract-card").first();
  await card.locator("summary").click();
  await card.getByRole("button",{name:"Negotiate a new package"}).click();
  await card.getByLabel("New contract type for Matt Riddle")
   .selectOption("LIMITED_NON_EXCLUSIVE");
  await expect(card.getByLabel("Purchased dates for Matt Riddle")).toBeEnabled();
  await expect(card.getByLabel("Appearance fee ($) for Matt Riddle")).toBeEnabled();
  await card.getByLabel("Appearance fee ($) for Matt Riddle").fill("2500");
  await card.getByRole("button",{name:"Send negotiated renewal"}).click();
  await expect(page.getByText(/Renewal offer sent/)).toBeVisible();
  expect(submissions[0]).toMatchObject({family:"LIMITED_NON_EXCLUSIVE",
   startWeekIndex:26,appearanceFee:2500,weeklyGuarantee:6000});
  expect(Number(submissions[0]?.dateEntitlement)).toBeLessThanOrEqual(
   Number(submissions[0]?.termWeeks));
 });
}
