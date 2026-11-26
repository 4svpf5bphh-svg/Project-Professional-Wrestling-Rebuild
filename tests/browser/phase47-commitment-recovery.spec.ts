import {test,expect} from "@playwright/test";

/** Real Backstage presentation, under iPhone widths, on read-only fixtures.
 * No mock call can book a card or fake completion in the browser.
 */
for(const width of [320,390])test(`Phase 47 ${width}px private request outcomes stay accurate and actionable`,async({page})=>{
 await page.setViewportSize({width,height:width===320?730:844});
 const overview={world:{revision:12,name:"Genesis",year:1,week:8,
  phase:"OPEN",nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
   cash:800000,debt:0}};
 const people=[
  {personId:"alice",name:"Alice",kind:"MORALE",status:"PROMISED",
   decision:"PROMISE_APPEARANCE",trustDelta:0,assessmentReason:null,
   plannedBooking:{showName:"CWA Ascension",year:1,week:9,status:"DRAFT",kind:"MATCH"}},
  {personId:"bruno",name:"Bruno",kind:"CREATIVE",status:"FULFILLED",
   decision:"PROMISE_SEGMENT",trustDelta:0,assessmentReason:"VERIFIED_BOOKING",
   plannedBooking:null},
  {personId:"charlie",name:"Charlie",kind:"MORALE",status:"EXCUSED",
   decision:"PROMISE_APPEARANCE",trustDelta:0,assessmentReason:"MEDICAL_UNAVAILABLE",
   plannedBooking:null},
  {personId:"delta",name:"Delta",kind:"MORALE",status:"BROKEN",
   decision:"PROMISE_APPEARANCE",trustDelta:-3,
   assessmentReason:"UNFULFILLED_COMMITMENT",plannedBooking:null},
  {personId:"eve",name:"Eve",kind:"TITLE_AMBITION",status:"ANSWERED",
   decision:"TALK",trustDelta:0,assessmentReason:null,plannedBooking:null},
  {personId:"frank",name:"Frank",kind:"CONTRACT",status:"PENDING",
   decision:null,trustDelta:0,assessmentReason:null,plannedBooking:null}
 ] as const;
 const roster=people.map(p=>({personId:p.personId,name:p.name,
  isCurrent:true,status:"ACTIVE",careerStage:"PRIME",fatigue:8,morale:66,
  momentum:55,latestIncoming:{request_id:p.personId,kind:p.kind,
   status:p.status,created_week_index:5,read_week_index:6,archived:false}}));
 const historical={contractExpires:9,remainingDates:1,strongMatches:2,programmeId:"story",
  championshipId:null,lastChapterWeek:6};
 const shared={personId:"frank",personName:"Frank",conversationId:"frank",kind:"CONTRACT",
  context:{...historical,programmeId:"new-story"},requestStatus:"ANSWERED",renewalArranged:true,
  renewalPending:false,nextShowCovered:true};
 const other={...shared,personId:"alice",personName:"Alice",conversationId:"alice",kind:"MOMENTUM_OPPORTUNITY",
  requestStatus:"PENDING",renewalArranged:false,context:{...historical,programmeId:null}};
 const methods:string[]=[];
 const programme=(id:string,name:string)=>({programmeId:id,programmeFormat:"SOLO",status:"ACTIVE",
  heat:55,repetition:0,activityCount:0,matchCount:0,segmentCount:0,sideAWins:0,sideBWins:0,draws:0,
  championshipId:null,startedWeekIndex:0,endedWeekIndex:null,creativeIntent:null,blueprintProgress:null,
  sideA:[{refId:"frank",kind:"PERSON",name}],sideB:[],recentActivity:[],plannedActivity:[],
  medicalHolds:[],eligibleCreativePeople:[],creativeAgreements:[],wrestlerChanges:[],latestFollowUp:null,finale:null});
 await page.route("**/api/session",r=>r.fulfill({json:{worldId:"world",
  playerId:"owner",csrfToken:"token",overview,availablePromotions:[]}}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as {method:string;personId?:string};
  methods.push(req.method);
  if(req.method==="staff")return r.fulfill({json:{year:1,week:8,worldRevision:12,canEdit:true,
   permittedDays:[],permittedVenueIds:[],notices:[],market:[],employmentHistory:[],venues:[],employees:[],
   promotionCash:800000,weeklyPayroll:0,meetings:[
    {role:"ROAD_AGENT",staffName:null,urgency:"CLEAR"},
    {role:"TALENT_MANAGER",staffName:"Morgan",urgency:"WATCH",conversationId:"frank"},
    {role:"CREATIVE",staffName:"Cameron",urgency:"WATCH",conversationId:"alice"}
   ],managementCases:[shared,other],managementBriefs:[
    {staffName:"Morgan",urgency:"WATCH",conversationId:"frank",
     message:"Frank has signed follow-on terms.",nextStep:"The signed dates cover Quay Return."},
    {staffName:"Cameron",urgency:"WATCH",conversationId:"alice",
     message:"Alice has recent match form.",nextStep:"Plan a singles chapter for Alice."}
   ]}});
  if(req.method==="programmes")return r.fulfill({json:{year:1,week:8,worldRevision:12,canEdit:true,
   people:[],teams:[],championships:[],programmes:[programme("story","Old chapter"),programme("new-story","Current chapter")]}});
  if(req.method==="contracts")return r.fulfill({json:{year:1,week:8,currentWeekIndex:7,worldRevision:12,
   canEdit:true,talentBudget:{cash:800000,currentGuarantees:1500},
   roster:people.slice(-2).map(p=>({personId:p.personId,name:p.name,contractId:p.personId+"-deal",
    family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",remainingDates:1,startWeekIndex:0,expiresWeekIndex:9,
    weeksRemaining:3,dateEntitlement:10,weeklyGuarantee:750,appearanceFee:0,signingBonus:0,
    roleExpectation:"FEATURED",creativeControl:"NONE",needsAttention:false,expiringSoon:false,renewalEligible:false})),
   requests:[],renewals:[],offers:[],resolvedOffers:[],dateDecisions:[],
   summary:{signed:2,expiringSoon:0,noDates:0,pendingNegotiations:0,pendingRenewals:0,pendingOffers:0,weeklyGuarantees:1500}}});
  if(req.method==="backstage"){
   const selected=people.find(p=>p.personId===req.personId);
   const conversations=selected?[{
    conversationId:String(selected.personId),kind:selected.kind,status:selected.status,
    decision:selected.decision,createdWeekIndex:5,respondedWeekIndex:6,
    dueWeekIndex:selected.kind==="TITLE_AMBITION"||selected.kind==="CONTRACT"?null:8,
    settledWeekIndex:selected.status==="FULFILLED"?7:null,
    managementContext:selected.kind==="CONTRACT"?historical:null,
    activeProgrammeId:selected.kind==="CONTRACT"?"new-story":null,
    relatedPersonId:null,trustDelta:selected.trustDelta,
    assessmentReason:selected.assessmentReason,
    plannedBooking:selected.plannedBooking,followThroughWeekIndex:null,
    followThroughKind:null,observedMatchShows:null,observedFeaturedShows:null,
    promisedRole:null,workingVerifiedShows:null,workingTrustDelta:null,
    verifiedSinglesShows:null,professionalTrust:null,verifiedTagShows:null,
    averageExecution:null,averageCrowd:null,observedAbsentWeeks:null,
    observedLosses:null,relevantTitle:selected.personId==="eve"?
     "CWA World Championship":null,careerStageAtRequest:"PRIME"
   }]:[];
   if(selected?.personId==="frank")conversations.push({...conversations[0]!,
    conversationId:"frank-later",kind:"MORALE",decision:"TALK",createdWeekIndex:7,
    managementContext:null,activeProgrammeId:null});
   return r.fulfill({json:{roster,personId:selected?.personId??null,
    personName:selected?.name??null,worldYear:1,worldWeek:8,
    worldRevision:12,canEdit:true,persona:null,history:[],recentRequests:[],
    memories:[],archetypes:[],documentedAlternates:[],nextPitchWeek:0,
    conversations}});
  }
  if(req.method==="markBackstageRead")return r.fulfill({json:{readCount:0}});
  return r.fulfill({json:{}});
 });
 await page.goto("/#/backstage");
 const open=async(name:string)=>{
  await page.getByRole("button",{name:new RegExp(name)}).click();
  await expect(page.getByLabel("Conversation with "+name)).toBeVisible();
 };
 await open("Alice");
 await expect(page.locator(".ppw-backstage-chapter")).toHaveAttribute(
  "data-commitment-stage","PLANNED");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("CWA Ascension");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("draft");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("only counts after");
 await page.getByRole("button",{name:"Back to messages"}).click();
 await open("Bruno");
 await expect(page.locator(".ppw-backstage-chapter")).toHaveAttribute(
  "data-commitment-stage","FULFILLED");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("certified show");
 await expect(page.getByText("Follow-up · Y1 W8")).toBeVisible();
 await expect(page.getByText("I'll look for it on the card by Y1 W9.")).toBeVisible();
 await page.getByRole("button",{name:"Back to messages"}).click();
 await open("Charlie");
 await expect(page.locator(".ppw-backstage-chapter")).toHaveAttribute(
  "data-commitment-stage","EXCUSED");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("certified injury");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("No trust penalty");
 await page.getByRole("button",{name:"Back to messages"}).click();
 await open("Delta");
 await expect(page.locator(".ppw-backstage-chapter")).toHaveAttribute(
  "data-commitment-stage","BROKEN");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("trust -3");
 await page.getByRole("button",{name:"Back to messages"}).click();
 await open("Eve");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("Championship goal heard");
 await expect(page.locator(".ppw-backstage-chapter")).toContainText("No title opportunity");
 expect(methods).not.toContain("saveCard");
 expect(methods).not.toContain("backstageDecision");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
 await page.getByRole("button",{name:"Plan their next opportunity →"}).click();
 await expect.poll(()=>page.evaluate(()=>location.hash)).toContain("planner");
 await page.goto("/#/backstage");
 await open("Frank");
 await expect(page.getByText(/One paid appearance remains/).first()).toBeVisible();
 await expect(page.getByRole("button",{name:"Review contract"}).first()).toBeVisible();
 await page.getByRole("button",{name:"Staff advice"}).click();
 await expect.poll(()=>page.evaluate(()=>location.hash)).toContain("staff");
 const frank=page.locator("article.ppw-staff-meeting-brief").filter({hasText:"Frank"});
 const alice=page.locator("article.ppw-staff-meeting-brief").filter({hasText:"Alice"});
 await expect(frank).toContainText("Still open");
 await expect(alice).toContainText("Needs attention");
 await expect(alice).toContainText("Plan a singles chapter for Alice.");
 await expect(frank).not.toContainText("Cameron");
 await expect(page.getByText("The signed dates cover Quay Return.",{exact:true})).toHaveCount(1);
 await expect(page.getByText("Vacant · no specialist employed")).toBeVisible();
 await frank.getByRole("button",{name:"Open conversation"}).click();
 await expect(page.getByLabel("Conversation with Frank")).toBeVisible();
 await expect(page.locator(".ppw-persona-in").first()).toBeFocused();
 await page.getByRole("button",{name:"Review contract"}).first().click();
 await expect(page.locator(".ppw-contract-card[open]")).toContainText("Frank");
 await page.goto("/#/staff");
 await frank.getByRole("button",{name:"Open conversation"}).click();
 await page.getByRole("button",{name:"Review programme"}).first().click();
 await expect(page.locator('.ppw-programme-switch[aria-pressed="true"]')).toContainText("Current chapter");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 expect(methods).not.toContain("saveCard");
});
