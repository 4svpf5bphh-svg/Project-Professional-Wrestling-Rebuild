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
   decision:"TALK",trustDelta:0,assessmentReason:null,plannedBooking:null}
 ] as const;
 const roster=people.map(p=>({personId:p.personId,name:p.name,
  isCurrent:true,status:"ACTIVE",careerStage:"PRIME",fatigue:8,morale:66,
  momentum:55,latestIncoming:{request_id:p.personId,kind:p.kind,
   status:p.status,created_week_index:5,read_week_index:6,archived:false}}));
 const methods:string[]=[];
 await page.route("**/api/session",r=>r.fulfill({json:{worldId:"world",
  playerId:"owner",csrfToken:"token",overview,availablePromotions:[]}}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as {method:string;personId?:string};
  methods.push(req.method);
  if(req.method==="backstage"){
   const selected=people.find(p=>p.personId===req.personId);
   const conversations=selected?[{
    conversationId:selected.personId,kind:selected.kind,status:selected.status,
    decision:selected.decision,createdWeekIndex:5,respondedWeekIndex:6,
    dueWeekIndex:selected.kind==="TITLE_AMBITION"?null:8,
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
 expect(methods).not.toContain("saveCard");
});
