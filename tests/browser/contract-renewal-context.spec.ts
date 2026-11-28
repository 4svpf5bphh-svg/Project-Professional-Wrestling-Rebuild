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
  await card.locator(":scope > summary").click();
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
  await card.locator(":scope > summary").click();
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
  await card.locator(":scope > summary").click();
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

for(const width of [320,390]){
 test("Takeshita-style competing commitment caps a Talent Manager proposal at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let submissions=0;
  const takeshita={
   personId:"takeshita",contractId:"takeshita-cwa",name:"Konosuke Takeshita",
   family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",remainingDates:5,
   startWeekIndex:18,expiresWeekIndex:30,weeksRemaining:2,
   dateEntitlement:10,weeklyGuarantee:2200,appearanceFee:7600,signingBonus:0,
   roleExpectation:"FEATURED",creativeControl:"NONE",
   needsAttention:true,expiringSoon:true,renewalEligible:true,
   additionalDatesEligible:false,reason:null,pendingNegotiation:false,
   pendingRenewal:false,pendingRenewalOffer:false,renewalArranged:false,
   careerStage:"PRIME",popularity:84,recognition:78,morale:64,
   estimatedWeeklyValue:8800,nextTermServiceDensity:.475,
   nextTermHasOverlap:true
  };
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const data=r.request().postDataJSON() as Record<string,unknown>;
   if(data.method==="contracts")return r.fulfill({json:{
    year:1,week:29,currentWeekIndex:28,worldRevision:8,canEdit:true,
    hasTalentManager:true,spendingPlan:null,
    talentManager:{staffId:"shaw",name:"Rowan Shaw",insight:85},
    talentBudget:{cash:7500000,currentGuarantees:2200},
    roster:[takeshita],requests:[],renewals:[],offers:[],
    resolvedOffers:[],dateDecisions:[],
    summary:{signed:1,expiringSoon:1,noDates:0,pendingNegotiations:0,
     pendingRenewals:0,pendingOffers:0,weeklyGuarantees:2200}
   }});
   if(data.method==="submitContractOffer"){submissions++;return r.fulfill({
    json:{status:"APPLIED"}
   });}
   throw Error("Unexpected "+String(data.method));
  });
  await page.goto("/#/contracts");
  const card=page.locator(".ppw-contract-card").first();
  await card.locator(":scope > summary").click();
  await card.getByRole("button",{name:"Negotiate a new package"}).click();
  await expect(card.locator(".ppw-contract-manager-recommendation"))
   .toContainText("52 weeks, 24 dates");
  await card.getByRole("button",{name:"Use recommended terms"}).click();
  const dates=card.getByLabel("Purchased dates for Konosuke Takeshita");
  await expect(dates).toHaveValue("24");
  await dates.fill("40");
  await expect(card.locator(".ppw-contract-renegotiate .ppw-contract-renew-hint")
   .filter({hasText:"Not enough available dates"}))
   .toContainText("at most 24");
  await card.getByRole("button",{name:"Send negotiated renewal"}).click();
  expect(submissions).toBe(0);
  await expect(page.getByText(/can commit to at most 24 dates/).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390])test(`${width}px Talent Manager delegation uses labelled strategy options and posts the authorised terms`,
 async({page},info)=>{
 await page.setViewportSize({width,height:844});
 const submissions:Record<string,unknown>[]=[];
 let queued=false;
 const roster=[{personId:"bayne",contractId:"bayne-term",name:"Megan Bayne",family:"EXCLUSIVE",
  status:"SIGNED",remainingDates:null,startWeekIndex:0,expiresWeekIndex:25,weeksRemaining:7,
  dateEntitlement:26,weeklyGuarantee:3500,appearanceFee:0,signingBonus:0,roleExpectation:"FEATURED",
  creativeControl:"NONE",needsAttention:true,expiringSoon:true,renewalEligible:true,
  reason:null,renewalArranged:false,estimatedWeeklyValue:5700,careerStage:"PRIME"}];
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const data=r.request().postDataJSON() as Record<string,unknown>;
  if(data.method==="contracts")return r.fulfill({json:{year:1,week:20,currentWeekIndex:19,worldRevision:8,
   canEdit:true,hasTalentManager:true,talentManager:{name:"Rowan Shaw",staffId:"manager",insight:80},
   talentBudget:{cash:2500000,currentGuarantees:3500},roster:roster.map(entry=>({...entry,
    renewalEligible:!queued,delegatedRenewalQueued:queued})),requests:[],renewals:[],offers:[],
   delegations:queued?[{request_id:"delegated",contract_id:"bayne-term",person_name:"Megan Bayne",
    status:"QUEUED",strategy:"PRIORITY_RETENTION"}]:[],
   resolvedOffers:[],dateDecisions:[],summary:{signed:1,expiringSoon:1,noDates:0,
    pendingNegotiations:0,pendingRenewals:0,pendingOffers:0,weeklyGuarantees:3500}}});
  if(data.method==="renewContract"){
   submissions.push(data);queued=true;
   return r.fulfill({json:{status:"APPLIED",result:{status:"QUEUED"}}});
  }
  throw Error("Unexpected "+String(data.method));
 });
 await page.goto("/#/contracts");
 const card=page.locator(".ppw-contract-card");
 await card.locator(":scope > summary").click();
 await expect(card.getByRole("button",{name:"Ask Talent Manager to renew on existing terms"})).toBeVisible();
 await expect(card.getByText(/prepares the offer at World Lock/)).toBeVisible();
 await card.getByText("Choose a negotiation strategy").click();
 const strategies=card.getByRole("group",{name:"Strategy"});
 await expect(strategies.getByRole("radio",{name:"Balanced negotiation"})).toBeChecked();
 await expect(strategies.getByRole("radio")).toHaveCount(3);
 await strategies.getByRole("radio",{name:"Balanced negotiation"}).press("ArrowLeft");
 await expect(strategies.getByRole("radio",{name:"Priority retention"})).toBeChecked();
 await expect(card.getByText("The manager can improve terms up to your limits.")).toBeVisible();
 await card.getByLabel("Maximum weekly guarantee").fill("4500");
 await card.locator(".ppw-contract-delegation").screenshot({path:info.outputPath(`talent-manager-${width}.png`)});
 await card.getByRole("button",{name:"Queue Talent Manager negotiation"}).click();
 await expect(card.locator(":scope > summary")).toContainText("QUEUED FOR WORLD LOCK");
 expect(submissions).toHaveLength(1);
 expect(submissions[0]?.delegation).toMatchObject({strategy:"PRIORITY_RETENTION",maxWeeklyGuarantee:4500,maxAppearanceFee:0});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
