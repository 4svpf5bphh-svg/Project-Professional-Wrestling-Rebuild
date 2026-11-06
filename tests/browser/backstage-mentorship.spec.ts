import {test,expect} from "@playwright/test";
for(const width of [320,390])test(`${width}px: veteran asks to mentor a prospect and the booker plans without auto-booking`,async({page})=>{
 await page.setViewportSize({width,height:780});
 const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
  nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
  cash:250000,debt:0}};
 const session={worldId:"world",playerId:"booker",csrfToken:"csrf",overview,
  availablePromotions:[]};
 let revision=4,accepted=false,decisions=0;
 const methods:string[]=[];
 const veteran={personId:"veteran",name:"Veteran Mentor",isCurrent:true,
  careerStage:"VETERAN",status:"ACTIVE",fatigue:8,morale:74,momentum:57,
  lastMessage:null,
  latestIncoming:{request_id:"mentor:2",kind:"MENTORSHIP_PITCH",
   status:"PENDING",created_week_index:2,read_week_index:null,archived:false}};
 const prospect={personId:"young",name:"Young Prospect",isCurrent:true,
  careerStage:"PROSPECT",status:"ACTIVE",fatigue:8,morale:70,momentum:58,
  lastMessage:null,latestIncoming:null};
 const item=()=>({conversationId:"mentor:2",kind:"MENTORSHIP_PITCH",
  status:accepted?"ANSWERED":"PENDING",
  decision:accepted?"EXPLORE_MENTORSHIP":null,
  relatedPersonId:"young",createdWeekIndex:2,
  respondedWeekIndex:accepted?4:null,
  dueWeekIndex:null,followThroughWeekIndex:null,followThroughKind:null,
  verifiedTagShows:3,averageExecution:81,
  verifiedSinglesShows:null,professionalTrust:null,
  observedMatchShows:null,observedFeaturedShows:null,promisedRole:null,
  assessmentReason:null,trustDelta:0,workingVerifiedShows:null,
  workingTrustDelta:null,averageCrowd:null,observedAbsentWeeks:null,
  observedLosses:null,relevantTitle:null,careerStageAtRequest:"VETERAN"});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const req=r.request().postDataJSON() as Record<string,unknown>;
  methods.push(String(req.method));
  if(req.method==="backstage")return r.fulfill({json:{
   roster:[veteran,prospect],
   personId:req.personId==="veteran"?"veteran":null,
   personName:req.personId==="veteran"?"Veteran Mentor":null,
   worldYear:1,worldWeek:5,worldRevision:revision,canEdit:true,
   persona:null,history:[],recentRequests:[],archetypes:[],
   documentedAlternates:[],nextPitchWeek:0,
   conversations:req.personId==="veteran"?[item()]:[],
   memories:[] }});
  if(req.method==="markBackstageRead")return r.fulfill({json:{readCount:1}});
  if(req.method==="backstageDecision"){
   expect(req.conversationId).toBe("mentor:2");
   expect(req.decision).toBe("EXPLORE_MENTORSHIP");
   expect(req.expectedRevision).toBe(4);
   decisions++;accepted=true;revision=5;
   return r.fulfill({json:{status:"APPLIED",result:{
    conversationId:"mentor:2",status:"ANSWERED",
    decision:"EXPLORE_MENTORSHIP",moraleDelta:0}}});
  }
  return r.fulfill({json:{}});
 });
 await page.goto("/#/backstage");
 await page.getByRole("button",{name:/Veteran Mentor/}).click();
 const thread=page.getByLabel("Conversation with Veteran Mentor");
 await expect(thread).toBeVisible();
 await expect(thread.locator(".ppw-persona-bubble.ppw-persona-in").first())
  .toContainText("Young Prospect");
 const drive=thread.locator(".ppw-backstage-current-drive");
 await expect(drive).toHaveAttribute("data-motivation","MENTORSHIP_PITCH");
 await expect(drive).toContainText("Help Young Prospect develop");
 const proposal=thread.locator(".ppw-backstage-reply-choice");
 await expect(proposal).toHaveCount(2);
 await expect(proposal.first()).toContainText("Explore a mentoring partnership");
 await proposal.first().click();
 await expect(thread.locator(".ppw-backstage-current-drive"))
  .toHaveAttribute("data-motivation","MENTORSHIP_FOLLOW_THROUGH");
 await expect(thread.locator(".ppw-backstage-current-drive"))
  .toContainText("Guide Young Prospect in the ring");
 await expect(thread.locator(".ppw-backstage-reply-choice")).toHaveCount(0);
 const open=thread.getByRole("button",{name:"Plan their next match →"});
 await expect(open).toBeVisible();
 expect(decisions).toBe(1);
 expect(methods).not.toContain("saveCard");
 expect(methods).not.toContain("wrestlerProfile");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
 await open.click();
 await expect.poll(()=>page.evaluate(()=>location.hash)).toContain("planner");
 expect(decisions).toBe(1);
 expect(methods).not.toContain("saveCard");
});