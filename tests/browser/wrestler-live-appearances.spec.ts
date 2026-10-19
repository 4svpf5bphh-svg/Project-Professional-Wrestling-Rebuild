import {test,expect} from "@playwright/test";
test("iPhone dossier loads accurate in-person debut/return history only on demand",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const overview={world:{revision:4,name:"Genesis",year:2,week:4,phase:"OPEN",
   nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
  membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",
   cash:5000000,debt:0,lastWeeklyNet:null,financialDistress:"HEALTHY"}};
 const session={worldId:"genesis",playerId:"owner",csrfToken:"secret",overview,availablePromotions:[]};
 const directory={view:"ROSTER",year:2,week:4,worldRevision:4,canEdit:true,
  hasMore:false,currentWeekIndex:55,
  people:[{personId:"alice",name:"Alice",ringName:"Alice",division:"WOMEN",
   availability:"YOUR_ROSTER",family:"EXCLUSIVE",remainingDates:null,
   startsInWeeks:0,weeksRemaining:15,weeklyGuarantee:1000,appearanceFee:0,
   popularity:70,recognition:72,momentum:80,inRingQuality:89,matchCraft:83,
   presentation:88,morale:75,pendingOffer:false,roleExpectation:"MAIN_EVENT"}]};
 const dossier={personId:"alice",name:"Alice",division:"WOMEN",status:"ACTIVE",
  careerStage:"REGULAR",popularity:70,recognition:72,momentum:80,morale:75,
  inRingQuality:89,matchCraft:83,presentation:88,stamina:70,safety:85,
  fatigue:0,wear:0,alignment:"FACE",canEdit:false,onYourRoster:true,
  sharedHuman:false,currentWeekIndex:55,worldRevision:4,
  persona:{personaName:"Alice",gimmickId:"AUTHENTIC",primaryStyle:"TECHNICAL",
   secondaryStyle:null,signatureMoves:[],finishingMoves:[]},
  contracts:[],teams:[],stables:[],connections:[],history:[]};
 const career={personId:"alice",summary:{matches:3,wins:2,losses:1,singles:3,
  tag:0,ratedMatches:3,averageStars:3.25,bestStars:4.0,injuries:1},
  injuryHistory:[{showId:"show-2",matchId:"main",year:2,week:3,
   severity:"MODERATE",originalWeeksOut:4,promotion:"AEW",format:"TAG"}],
  currentChampionships:[
   {name:"Women's World Title",promotion:"AEW",holderType:"PERSON",
    teamName:null,startWeekIndex:49,defenses:4},
   {name:"World Tag Titles",promotion:"AEW",holderType:"TEAM",
    teamName:"The Outlaws",startWeekIndex:51,defenses:2}],
  recent:[{showId:"show-2",matchId:"main",showName:"Friday Night Fights",
   promotion:"AEW",year:2,week:3,format:"TAG",won:true,stars:4.5,
   minutes:21,finish:"CLEAN_PIN",injury:null,weeksOut:null,
   partners:["Kate"],opponents:["Bob","Duke"]},
   {showId:"legacy",matchId:"old",showName:"Older Event",
    promotion:"WWE",year:1,week:8,format:"SINGLES",won:false,stars:null,
    minutes:null,finish:"SUBMISSION",injury:null,weeksOut:null,
    partners:null,opponents:null}],singlesTitles:[],
  liveAppearances:[
   {promotionId:"aew",promotion:"AEW",status:"RETURN_ELIGIBLE",
    recordedShows:2,firstWeekIndex:0,lastWeekIndex:51,
    weeksSinceLast:4,historyComplete:true},
   {promotionId:"wwe",promotion:"WWE",status:"UNKNOWN",
    recordedShows:1,firstWeekIndex:20,lastWeekIndex:20,
    weeksSinceLast:35,historyComplete:false}]};
 const calls:string[]=[];
 await page.route("**/api/session",route=>route.fulfill({json:session}));
 await page.route("**/api/card",route=>{
  const req=route.request().postDataJSON() as {method:string};
  calls.push(req.method);
  return route.fulfill({json:req.method==="wrestlerDirectory"?directory:
   req.method==="wrestlerProfile"?dossier:req.method==="wrestlerCareer"?career:{}});
 });
 await page.goto("/#/roster");
 const card=page.locator(".ppw-directory-card").first();
 await card.locator("summary").click();
 await card.getByRole("button",{name:"Wrestler profile →"}).click();
 const dialog=page.getByRole("dialog",{name:"Wrestler dossier"});
 await expect(dialog).toBeVisible();
 expect(calls.filter(x=>x==="wrestlerCareer")).toHaveLength(0);
 await dialog.locator("details.ppw-profile-career > summary").click();
 await expect(dialog.getByRole("heading",{name:"On-screen appearances"})).toBeVisible();
 await expect(dialog.getByText("Return available · 4 weeks since last appearance")).toBeVisible();
 await expect(dialog.getByText("Earlier on-screen history is incomplete")).toBeVisible();
 await expect(dialog.getByText(/Video packages and unused bookings do not/)).toBeVisible();
 await expect(dialog.getByText("First verified: Y1 W1 · Latest verified: Y1 W52")).toBeVisible();
 await expect(dialog.getByRole("heading",{name:"Current championships"})).toBeVisible();
 await expect(dialog.getByText("Women's World Title")).toBeVisible();
 await expect(dialog.getByText(/Tag champions · The Outlaws/)).toBeVisible();
 await expect(dialog.getByRole("heading",{name:"Recorded match injuries"})).toBeVisible();
 await expect(dialog.getByText(/original estimate 4 weeks out/)).toBeVisible();
 await expect(dialog.getByText(/does not establish current recovery or medical clearance/))
  .toBeVisible();
 await expect(dialog.getByText("Tag partners: Kate  /  Opponents: Bob · Duke")).toBeVisible();
 await expect(dialog.getByText("Opponents not verified in older match records.")).toBeVisible();
 expect(calls.filter(x=>x==="wrestlerCareer")).toHaveLength(1);
 const before=calls.filter(x=>x==="wrestlerDirectory").length;
 await dialog.getByRole("button",{name:"‹ Back"}).click();
 await expect(dialog).toHaveCount(0);
 expect(calls.filter(x=>x==="wrestlerDirectory")).toHaveLength(before);
});
