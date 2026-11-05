import {test,expect} from "@playwright/test";
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN",
 nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
 membership:"ACTIVE",promotion:{id:"home",name:"Home Wrestling",tier:"LOCAL",cash:300000,debt:0}};
const session={worldId:"world",playerId:"owner",csrfToken:"csrf",overview,availablePromotions:[]};
for(const width of [320,390])test(`Phase 31 at ${width}px preserves wrestler motive from dossier to Backstage`,async({page})=>{
 await page.setViewportSize({width,height:760});
 const methods:string[]=[];
 const motivation={kind:"CREATIVE",title:"Find their voice",
  reason:"They have requested microphone or angle time. You have not replied yet.",
  source:"BACKSTAGE",next:"BACKSTAGE"};
 const directory={view:"ROSTER",year:1,week:5,worldRevision:4,
  currentWeekIndex:4,canEdit:true,hasMore:false,people:[{
   personId:"ace",name:"Ace Vale",division:"MEN",alignment:"FACE",
   availability:"YOUR_ROSTER",remainingDates:22,startsInWeeks:0,
   popularity:75,recognition:71,momentum:63,morale:68}]};
 const dossier={personId:"ace",name:"Ace Vale",division:"MEN",status:"ACTIVE",
  careerStage:"PRIME",popularity:75,recognition:71,momentum:63,morale:68,
  inRingQuality:80,matchCraft:81,presentation:79,stamina:71,safety:84,
  fatigue:10,wear:10,alignment:"FACE",championships:[],motivation,
  canEdit:true,onYourRoster:true,sharedHuman:false,currentWeekIndex:4,worldRevision:4,
  persona:{personaName:"Ace Vale",gimmickId:"AUTHENTIC",primaryStyle:"BRAWLER",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[{promotionId:"home",promotion:"Home Wrestling",isYours:true,
   family:"EXCLUSIVE",role:"REGULAR",remainingDates:22,startWeekIndex:0,
   expiresWeekIndex:28,weeklyGuarantee:1000,appearanceFee:0,creativeControl:"NONE"}],
  teams:[],stables:[],connections:[],history:[]};
 const contact={personId:"ace",name:"Ace Vale",isCurrent:true,status:"ACTIVE",
  careerStage:"PRIME",fatigue:10,morale:68,momentum:63,lastMessage:null,
  latestIncoming:{request_id:"creative5",kind:"CREATIVE",status:"PENDING",
   created_week_index:4,read_week_index:null,archived:false}};
 const incoming={conversationId:"creative5",kind:"CREATIVE",status:"PENDING",
  decision:null,createdWeekIndex:4,respondedWeekIndex:null,dueWeekIndex:null,
  relatedPersonId:null,observedMatchShows:null,observedFeaturedShows:null,
  promisedRole:null,assessmentReason:null,trustDelta:0,workingVerifiedShows:null,
  workingTrustDelta:null,averageCrowd:null,verifiedSinglesShows:null,
  professionalTrust:null,verifiedTagShows:null,averageExecution:null,
  followThroughWeekIndex:null,followThroughKind:null,observedAbsentWeeks:null,
  observedLosses:null,relevantTitle:null,careerStageAtRequest:"PRIME"};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  const q=r.request().postDataJSON() as {method:string;personId?:string};
  methods.push(q.method);
  if(q.method==="wrestlerDirectory")return r.fulfill({json:directory});
  if(q.method==="wrestlerProfile")return r.fulfill({json:dossier});
  if(q.method==="markBackstageRead")return r.fulfill({json:{readCount:1}});
  if(q.method==="backstage")return r.fulfill({json:{
   roster:[contact],personId:q.personId==="ace"?"ace":null,
   personName:q.personId==="ace"?"Ace Vale":null,
   worldYear:1,worldWeek:5,worldRevision:4,canEdit:true,persona:null,
   history:[],recentRequests:[],archetypes:[],documentedAlternates:[],
   nextPitchWeek:0,conversations:q.personId==="ace"?[incoming]:[],
   memories:q.personId==="ace"?[
    {kind:"TITLE_CHALLENGE",sourceId:"title",weekIndex:2,importance:4}]:[]
  }});
  return r.fulfill({json:{}});
 });
 await page.goto("/#/roster");
 await page.locator(".ppw-directory-list .ppw-wrestler-card").first().click();
 const dialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dialog.locator(".ppw-profile-current-drive"))
  .toHaveAttribute("data-motivation","CREATIVE");
 await expect(dialog.locator(".ppw-profile-current-drive")).toContainText("Find their voice");
 // The wrestler dossier is a modal. Follow the player's actual in-app
 // management action; a raw hash navigation would leave the dialog on top.
 await dialog.getByRole("button",{name:"Talk in Backstage"}).click();
 // Dossier action opens this particular wrestler's thread directly;
 // it does not require an extra inbox selection or person read.
 const thread=page.getByLabel("Conversation with Ace Vale");
 await expect(thread.locator(".ppw-backstage-current-drive"))
  .toHaveAttribute("data-motivation","CREATIVE");
 await expect(thread.locator(".ppw-backstage-current-drive")).toContainText("Find their voice");
 await expect(thread.locator(".ppw-backstage-reply-choice")).toHaveCount(3);
 expect(methods.filter(m=>m==="wrestlerProfile")).toHaveLength(1);
 expect(methods.filter(m=>m==="backstage")).toHaveLength(1);
 expect(methods).not.toContain("wrestlerCareer");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});