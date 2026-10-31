import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
const images="test-results/presentation-screenshots";
mkdirSync(images,{recursive:true});
const overview={world:{revision:4,name:"Genesis",year:1,week:5,phase:"OPEN"},
 membership:"ACTIVE",promotion:{id:"aew",name:"AEW",tier:"GLOBAL",cash:5000000,debt:0}};
const session={worldId:"genesis",playerId:"booker",csrfToken:"fixture",
 overview,availablePromotions:[]};
const show={showId:"omega-night",showName:"Dynamite",bookingClass:"REGULAR",
 year:1,week:4,crowdResponse:84,matchCount:1,angleCount:1,
 staffReport:{reporter:"Alex Stone",staffId:"agent",headline:"A strong main event",
  praise:"The main event delivered.",concern:"Keep the next card tighter.",
  recommendation:"Give the rivalry room to grow.",strongestMatchId:"omega-match",reviewedMatches:1},
 entries:[
  {slotId:"omega-match",position:0,type:"MATCH",headline:"Kenny Omega def. Samoa Joe",
   summary:"Omega won by a clean pinfall",crowdResponse:89,outcome:"CLEAN_PIN",
   actorIds:["omega","joe"],targetIds:[],
   matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
    sides:[["Kenny Omega"],["Samoa Joe"]],
    sideParticipants:[[{personId:"omega",name:"Kenny Omega"}],
     [{personId:"joe",name:"Samoa Joe"}]],winnerNames:["Kenny Omega"],
    championshipContested:false,isMainEvent:true},
   fallout:{ratingStars:4.5,actualMinutes:18,injuries:[],eliminations:[]},
   performerIdentities:[{personId:"omega",ringName:"Kenny Omega",character:"The Cleaner",
    style:"ALL_ROUNDER",signatureMoves:["V-Trigger","Snap Dragon Suplex"],
    finishingMoves:["One Winged Angel"],source:"WORLD_RECORD"}]},
  {slotId:"angle",position:1,type:"SEGMENT",headline:"Ringside confrontation",
   summary:"The challenge took place",outcome:"HAPPENS",crowdResponse:74,
   actorIds:[],targetIds:[],segmentKind:"PROMO"}
 ]};
const review={showHeadline:"Omega gives Dynamite its spark",
 opening:"The show built around a heated singles encounter with an undeniable main event.",
 closing:"The main event delivered where the early card occasionally lacked urgency.",
 slots:[{slotId:"omega-match",headline:"Omega takes the win",
  recap:"Joe threw heavy leather, but Omega's V-Trigger opened the door to the One Winged Angel and a clean pin."},
 {slotId:"angle",headline:"A challenge made",recap:"A pointed microphone exchange held the audience's attention."}]};
for(const width of [320,390]){
 test(`Ringside ${width}px: visible finish, editorial and crowd coexist without Booker Breakdown`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let resultReads=0,groqCalls=0;
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method;
   if(method==="results")resultReads++;
   return r.fulfill({json:method==="resultsArchive"?{
    items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
     bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
    nextCursor:null}:show});
  });
  await page.route("**/api/results-commentary",r=>{
   groqCalls++;
   const request=r.request().postDataJSON();
   expect(request).toMatchObject({worldId:"genesis",promotionId:"aew",
    showId:"omega-night"});
   return r.fulfill({json:{status:"ready",review}});
  });
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  await expect(page.getByRole("heading",{name:"Omega gives Dynamite its spark"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"TONIGHT'S HEADLINES"})).toBeVisible();
  await expect(page.locator(".ppw-results-steps")).toHaveCount(0);
  // Editorial follows three chapters via the bottom Next actions.
  await expect(page.getByRole("heading",{name:"HOT TAG"})).toBeHidden();
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await expect(page.getByRole("heading",{name:"THE FULL SHOW"})).toBeVisible();
  await expect(page.locator(".ppw-show-transition")).toHaveCount(0);
  await expect(page.locator(".ppw-results")).toHaveClass(/ppw-editorial-ready/);
   await expect(page.locator(".ppw-results")).not.toHaveAttribute("data-results-skin");
  await expect(page.locator(".ppw-result-meter").first()).toHaveCSS("display","none");
  await expect(page.locator(".ppw-ringside-slot").first()).toContainText("One Winged Angel");
  await expect(page.getByRole("heading",{name:"Omega takes the win"})).toBeVisible();
  await expect(page.locator(".ppw-ringside-conclusion")).toContainText("The main event delivered");
  await expect(page.locator(".ppw-verified-finish-details")).not.toHaveAttribute("open");
  await page.locator(".ppw-verified-finish-details").first().locator("summary").click();
  await expect(page.locator(".ppw-verified-finish-details").first()).toHaveAttribute("open");
  await expect(page.locator(".ppw-final-bell")).not.toContainText("The main event delivered");
  await expect(page.locator(".ppw-result-verdict").first()).toContainText("Kenny Omega");
  await expect(page.locator(".ppw-verified-finish-details")).toBeVisible();
  await expect(page.locator(".ppw-result-lineup .ppw-result-competitor")).toHaveCount(2);
  await expect(page.locator(".ppw-result-competitor-name")).toHaveText(["Kenny Omega","Samoa Joe"]);
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(page.getByRole("heading",{name:"HOT TAG"})).toBeVisible();
  await expect(page.locator(".ppw-crowd-noise-card")).toHaveCount(2);
  await expect(page.locator(".ppw-pop-post .ppw-pop-avatar")).toHaveCount(2);
  await expect(page.locator(".ppw-pop-post .ppw-pop-metrics")).toHaveCount(2);
  await expect(page.locator(".ppw-pop-post .ppw-pop-handle").first()).toContainText("@");
  await expect(page.locator(".ppw-pop-social")).toContainText("Fictional in-game wrestling social media.");
   await expect(page.locator(".ppw-pop-post").first()).toHaveCSS("color","rgb(255, 243, 238)");
   await expect(page.locator(".ppw-pop-post .ppw-pop-copy").first())
    .toHaveCSS("color","rgb(255, 244, 242)");
  await expect(page.getByRole("heading",{name:"POST-SHOW MANAGEMENT BRIEF"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Meet the press"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Alex Stone · Road Agent"})).toBeVisible();
  await expect(page.locator(".ppw-post-show-road-agent")).toHaveCount(1);
  await expect(page.locator(".ppw-results-analysis")).toHaveCount(1);
  await expect(page.locator(".ppw-results-analysis")).not.toHaveAttribute("open");
  await expect(page.locator(".ppw-flow-track")).toHaveCount(2);
  await expect(page.locator(".ppw-booker-breakdown")).toHaveCount(0);
  await expect(page.getByText("Generate AI Review")).toHaveCount(0);
  expect(resultReads).toBe(1);expect(groqCalls).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:images+"/ringside-"+width+".png",fullPage:true});
 });
}
test("Ringside unavailable: canonical facts are readable with no manual generation action",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>r.fulfill({json:r.request().postDataJSON().method==="resultsArchive"?
  {items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",crowdResponse:84,
   matchCount:1,angleCount:1}],nextCursor:null}:show}));
 await page.route("**/api/results-commentary",r=>r.fulfill({json:{status:"unavailable"}}));
 await page.goto("/#/results");
 await page.getByRole("button",{name:/Read ringside report/}).click();
 await page.getByRole("button",{name:"Read the Full Show"}).click();
 await expect(page.locator(".ppw-ringside-slot").first()).toContainText("Kenny Omega");
 await expect(page.locator(".ppw-show-transition")).toHaveCount(2);
 await expect(page.locator(".ppw-results")).not.toHaveClass(/ppw-editorial-ready/);
 await expect(page.locator(".ppw-result-meter").first()).not.toHaveCSS("display","none");
 await expect(page.locator(".ppw-verified-finish-details")).toHaveAttribute("open","");
 await expect(page.locator(".ppw-ringside-conclusion")).toHaveCount(0);
 await expect(page.locator(".ppw-booker-breakdown")).toHaveCount(0);
 await expect(page.locator(".ppw-verified-finish-details")).toBeVisible();
 await expect(page.getByText("Generate AI Review")).toHaveCount(0);
});

test("Fictional fan disagreement links to the certified finish on a 320px iPhone",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 const dirty={...show,entries:[{
  ...show.entries[0],summary:"Omega won on a disqualification",
  outcome:"DISQUALIFICATION",
  fallout:{...show.entries[0]!.fallout,finishCheaterName:"Samoa Joe"}
 },show.entries[1]]};
 let resultsReads=0,providerReads=0;
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  if(r.request().postDataJSON().method==="results")resultsReads++;
  return r.fulfill({json:r.request().postDataJSON().method==="resultsArchive"?{
   items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
    crowdResponse:84,matchCount:1,angleCount:1}],nextCursor:null
  }:dirty});
 });
 await page.route("**/api/results-commentary",r=>{
  providerReads++;return r.fulfill({json:{status:"unavailable"}});
 });
 await page.goto("/#/results");
 await page.getByRole("button",{name:/Read ringside report/}).click();
 await page.getByRole("button",{name:"Read the Full Show"}).click();
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
 const post=page.locator(".ppw-crowd-noise-card").first();
 await expect(post.locator(".ppw-crowd-noise-reply")).toContainText("The result is official");
 await post.click();
 await expect(page.locator(".ppw-result-match")).toHaveAttribute("open","");
 await expect(page.locator(".ppw-verified-finish-details")).toBeVisible();
 expect(resultsReads).toBe(1);expect(providerReads).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

for(const width of [320,390]){
 test(`Post-show handoff ${width}px routes certified medical and title history without extra results reads`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let reads=0;
  const receipt={...show,entries:[{
   ...show.entries[0],
   fallout:{...show.entries[0]!.fallout,
    programmeSignal:"COOL_PROGRAMME",
    injuries:[{personName:"Samoa Joe",severity:"MODERATE",weeksOut:3,
     stoppage:false}],
    title:{name:"World Title",winnerName:"Kenny Omega",
     priorHolderName:"Samoa Joe",changed:true}}
  },show.entries[1]]};
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method;
   if(method==="results")reads++;
   return r.fulfill({json:method==="resultsArchive"?
    {items:[{showId:"omega-night",year:1,week:4,
      showName:"Dynamite",crowdResponse:84,matchCount:1,angleCount:1}],
     nextCursor:null}:receipt});
  });
  await page.route("**/api/results-commentary",r=>r.fulfill({json:{status:"unavailable"}}));
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(page.getByRole("heading",{name:"POST-SHOW MANAGEMENT BRIEF"})).toBeVisible();
  await expect(page.locator(".ppw-next-show-choice")).toHaveCount(4);
  await expect(page.getByRole("button",{name:"Check roster"})).toBeVisible();
  await expect(page.getByRole("button",{name:"View championships"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Review programmes"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Plan a show"})).toBeVisible();
  await expect(page.getByText(/who holds it now before planning/)).toBeVisible();
  await expect(page.locator(".ppw-post-show-road-agent")).toHaveCount(1);
  expect(reads).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
  await page.getByRole("button",{name:"Check roster"}).click();
  await expect(page).toHaveURL(/#\/roster$/);
 });
 test(`Post-show handoff ${width}px gives a useful route for a strong clean card`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const one={...show,entries:[{...show.entries[0],
   fallout:{...show.entries[0]!.fallout,programmeSignal:null}
  },show.entries[1]]};
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>r.fulfill({json:
   r.request().postDataJSON().method==="resultsArchive"?
   {items:[{showId:"omega-night",year:1,week:4,
    showName:"Dynamite",crowdResponse:84,matchCount:1,angleCount:1}],nextCursor:null}:one}));
  await page.route("**/api/results-commentary",r=>r.fulfill({json:{status:"unavailable"}}));
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(page.getByText(/4.50 verified stars/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Plan a show"})).toBeVisible();
  await page.getByRole("button",{name:"Plan a show"}).click();
  await expect(page).toHaveURL(/#\/planner$/);
 });
}

test("premium PPV scrum is opt-in, iPhone sized and permanently records the chosen response",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let reads=0,answers=0,stored:number|null=null;
 const ppv={...show,bookingClass:"PREMIUM",showName:"Starlight PPV"};
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>r.fulfill({json:r.request().postDataJSON().method==="resultsArchive"?
  {items:[{showId:"omega-night",year:1,week:4,showName:"Starlight PPV",
   bookingClass:"PREMIUM",crowdResponse:84,matchCount:1,angleCount:1}],
   nextCursor:null}:ppv}));
 await page.route("**/api/results-commentary",r=>r.fulfill({json:{status:"unavailable"}}));
 await page.route("**/api/media-scrum",r=>{
  const request=r.request().postDataJSON();
  expect(request).toMatchObject({promotionId:"aew",showId:"omega-night"});
  expect(r.request().headers()["x-ppw-csrf"]).toBe("fixture");
  if(request.action==="READ"){
   reads++;
   return r.fulfill({json:{showId:"omega-night",showName:"Starlight PPV",questions:[{
    id:"MAIN_EVENT",journalist:"Ringside Press",
    question:"What did you make of the main event?",
    answers:["The wrestlers spoke for themselves.",
     "There will be conversations backstage.","Tune in next week."],
    answerIndex:stored
   }]}});
  }
  expect(request).toMatchObject({action:"ANSWER",questionId:"MAIN_EVENT",answerIndex:1});
  answers++;stored=1;
  return r.fulfill({json:{
   questionId:"MAIN_EVENT",answerIndex:1,answer:"There will be conversations backstage.",saved:true
  }});
 });
 await page.goto("/#/results");
 await page.getByRole("button",{name:/Read ringside report/}).click();
 await page.getByRole("button",{name:"Read the Full Show"}).click();
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
 await expect(page.getByRole("heading",{name:"The Media Scrum"})).toBeVisible();
 expect(reads).toBe(0); // Results must not fetch the press session until requested.
 await page.getByRole("button",{name:"Meet the press"}).click();
 await expect(page.getByText("What did you make of the main event?")).toBeVisible();
 await page.getByRole("button",{name:"There will be conversations backstage."}).click();
 await expect(page.locator(".ppw-media-scrum-quote")).toContainText("There will be conversations backstage.");
 expect(reads).toBe(1);expect(answers).toBe(1);
 await page.getByRole("button",{name:"Meet the press"}).click();
 await page.getByRole("button",{name:"Meet the press"}).click();
 await expect(page.locator(".ppw-media-scrum-quote")).toBeVisible();
 expect(reads).toBe(1); // The open chapter is cached in the results view.
 expect(answers).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
  .toBeLessThanOrEqual(1);
});

test("Ringside: partial cached article falls back to canonical results",async({page})=>{
 await page.setViewportSize({width:320,height:844});
 let reads=0,commentary=0;
 await page.route("**/api/session",r=>r.fulfill({json:session}));
 await page.route("**/api/card",r=>{
  if(r.request().postDataJSON().method==="results")reads++;
  return r.fulfill({json:r.request().postDataJSON().method==="resultsArchive"?{
   items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
    crowdResponse:84,matchCount:1,angleCount:1}],nextCursor:null}:show});
 });
 await page.route("**/api/results-commentary",r=>{
  commentary++;
  return r.fulfill({json:{status:"ready",review:{
   ...review,slots:[review.slots[0]]
  }}});
 });
 await page.goto("/#/results");
 await page.getByRole("button",{name:/Read ringside report/}).click();
 await expect(page.locator(".ppw-ringside-dispatch")).toHaveAttribute("data-ai-status","fallback");
 await page.getByRole("button",{name:"Read the Full Show"}).click();
 await expect(page.locator(".ppw-show-transition")).toHaveCount(2);
 await expect(page.locator(".ppw-ringside-slot").first()).toContainText("Kenny Omega");
 await expect(page.locator(".ppw-verified-finish-details")).toHaveAttribute("open","");
 await expect(page.locator(".ppw-results")).not.toHaveClass(/ppw-editorial-ready/);
 expect(reads).toBe(1);expect(commentary).toBe(1);
});

for(const width of [320,390]){
 test(`Territory TV ${width}px: dark names on cream, readable HOT TAG, private brief and one results read`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let reads=0,editorials=0;
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const method=r.request().postDataJSON().method;
   if(method==="results")reads++;
   return r.fulfill({json:method==="resultsArchive"?{
    items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
     bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
    nextCursor:null}:{...show,resultsSkin:"TERRITORY_TV"}});
  });
  await page.route("**/api/results-commentary",r=>{
   editorials++;return r.fulfill({json:{status:"ready",review}});
  });
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  const themed=page.locator(".ppw-results[data-results-skin='territory-tv']");
  await expect(themed).toBeVisible();
  await expect(themed.locator(".ppw-territory-station")).toContainText("TERRITORY TELEVISION");
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await expect(page.getByRole("heading",{name:"THE COMPLETE NIGHT"})).toBeVisible();
  const names=page.locator(".ppw-result-competitor-name");
  await expect(names).toHaveText(["Kenny Omega","Samoa Joe"]);
  await expect(names.first()).toHaveCSS("color","rgb(247, 242, 236)");
  await expect(page.locator(".ppw-result-match > summary")).toHaveCSS(
   "background-color","rgb(240, 228, 197)");
  await expect(page.locator(".ppw-ringside-slot").first()).toContainText("One Winged Angel");
  await expect(page.locator(".ppw-result-verdict")).toContainText("Kenny Omega");
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(page.getByRole("heading",{name:"THE AFTERMATH"})).toBeVisible();
  await expect(page.locator(".ppw-pop-social .ppw-pop-post").first()).toHaveCSS(
   "background-color","rgb(37, 51, 74)");
  await expect(page.locator(".ppw-pop-copy").first()).toHaveCSS("color","rgb(255, 241, 221)");
  await expect(page.locator(".ppw-post-show-brief")).toHaveCSS(
   "background-color","rgb(233, 219, 186)");
  await expect(page.locator(".ppw-post-show-road-agent")).toContainText("The main event delivered.");
  expect(reads).toBe(1);expect(editorials).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test(`Fight Night ${width}px: official white report, black wrestler names, red accents and readable HOT TAG`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let resultsReads=0,providerReads=0;
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const method=route.request().postDataJSON().method;
   if(method==="results")resultsReads++;
   return route.fulfill({json:method==="resultsArchive"?{
    items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
     bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
    nextCursor:null}:{...show,resultsSkin:"FIGHT_NIGHT"}});
  });
  await page.route("**/api/results-commentary",route=>{
   providerReads++;return route.fulfill({json:{status:"ready",review}});
  });
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  const report=page.locator(".ppw-results[data-results-skin='fight-night']");
  await expect(report).toBeVisible();
  await expect(report.locator(".ppw-fight-station")).toContainText("FIGHT NIGHT");
  await expect(report.locator(".ppw-result-hero")).toHaveCSS(
   "background-color","rgb(255, 255, 255)");
  await expect(report.getByRole("heading",{name:"Omega gives Dynamite its spark"})).toBeVisible();
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await expect(report.getByRole("heading",{name:"MATCH REPORT"})).toBeVisible();
  const names=report.locator(".ppw-result-competitor-name");
  await expect(names).toHaveText(["Kenny Omega","Samoa Joe"]);
  await expect(names.first()).toHaveCSS("color","rgb(26, 30, 37)");
  await expect(report.locator(".ppw-result-match > summary")).toHaveCSS(
   "background-color","rgb(255, 255, 255)");
  await expect(report.locator(".ppw-result-vs")).toHaveCSS(
   "color","rgb(167, 30, 48)");
  await expect(report.locator(".ppw-ringside-slot").first()).toContainText("One Winged Angel");
  await expect(report.locator(".ppw-result-verdict")).toContainText("Kenny Omega");
  await expect(report.locator(".ppw-verified-finish-details")).toHaveCount(1);
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(report.locator(".ppw-fight-chapter-head").last()).toContainText("AFTER THE BELL");
  await expect(report.locator(".ppw-pop-post").first()).toHaveCSS(
   "background-color","rgb(41, 50, 71)");
  await expect(report.locator(".ppw-pop-copy").first()).toHaveCSS(
   "color","rgb(255, 243, 238)");
  await expect(report.locator(".ppw-post-show-brief")).toHaveCSS(
   "background-color","rgb(255, 255, 255)");
  await expect(report.locator(".ppw-post-show-road-agent")).toContainText(
   "The main event delivered.");
  expect(resultsReads).toBe(1);expect(providerReads).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test(`Underground Zine ${width}px has dark names, readable fan HOT TAG and accurate official results`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let reads=0,commentaries=0;
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const method=route.request().postDataJSON().method;
   if(method==="results")reads++;
   return route.fulfill({json:method==="resultsArchive"?{
    items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
     bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
    nextCursor:null}:{...show,resultsSkin:"UNDERGROUND_ZINE"}});
  });
  await page.route("**/api/results-commentary",route=>{
   commentaries++;return route.fulfill({json:{status:"ready",review}});
  });
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  const report=page.locator(".ppw-results[data-results-skin='underground-zine']");
  await expect(report).toBeVisible();
  await expect(report.locator(".ppw-zine-station")).toContainText("UNDERGROUND REPORT");
  await expect(report.locator(".ppw-result-title-wrap h1")).toContainText("Dynamite");
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await expect(report.getByRole("heading",{name:"EVERY BELL. EVERY BRAWL."})).toBeVisible();
  const names=report.locator(".ppw-result-competitor-name");
  await expect(names).toHaveText(["Kenny Omega","Samoa Joe"]);
  await expect(names.first()).toHaveCSS("color","rgb(27, 27, 27)");
  await expect(report.locator(".ppw-result-match > summary")).toHaveCSS(
   "background-color","rgb(243, 238, 223)");
  await expect(report.locator(".ppw-result-vs")).toHaveCSS("color","rgb(181, 71, 34)");
  await expect(report.locator(".ppw-ringside-slot").first()).toContainText("One Winged Angel");
  await expect(report.locator(".ppw-result-verdict").first()).toContainText("Kenny Omega");
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(report.locator(".ppw-zine-chapter-head").last()).toContainText("AFTER THE BELL!");
  await expect(report.locator(".ppw-pop-post").first()).toHaveCSS(
   "background-color","rgb(41, 49, 70)");
  await expect(report.locator(".ppw-pop-copy").first()).toHaveCSS(
   "color","rgb(255, 242, 232)");
  await expect(report.locator(".ppw-post-show-brief")).toHaveCSS(
   "background-color","rgb(243, 238, 223)");
  await expect(report.locator(".ppw-post-show-road-agent")).toContainText("The main event delivered.");
  expect(reads).toBe(1);expect(commentaries).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

/* Real regression from the owner's 2026-10-31 screenshots:
   navy portrait names, rivalry-history copy and Road Agent prose were almost
   black on navy because the skin paper palette won CSS specificity. */
for(const skin of [
 {value:"TERRITORY_TV",attribute:"territory-tv"},
 {value:"FIGHT_NIGHT",attribute:"fight-night"},
 {value:"UNDERGROUND_ZINE",attribute:"underground-zine"},
]){
 for(const width of [320,390]){
  test(`${skin.value} ${width}px navy inserts: white names, amber rivalry, readable locker room`,async({page})=>{
   await page.setViewportSize({width,height:844});
   const programme={programmeId:"story-1",sideA:"Kenny Omega",sideB:"Samoa Joe",
    precedingMatches:1,precedingAngles:1,previousWinner:"A" as const,
    previousMatchWeek:3,currentWinner:"A" as const};
   const withRivalry={...show,resultsSkin:skin.value,
    entries:show.entries.map(entry=>({...entry,programmeChapters:[programme]}))};
   await page.route("**/api/session",route=>route.fulfill({json:session}));
   await page.route("**/api/card",route=>route.fulfill({json:
    route.request().postDataJSON().method==="resultsArchive"?{
     items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
      bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
     nextCursor:null}:withRivalry}));
   await page.route("**/api/results-commentary",route=>
    route.fulfill({json:{status:"ready",review}}));
   await page.goto("/#/results");
   await page.getByRole("button",{name:/Read ringside report/}).click();
   const root=page.locator(`.ppw-results[data-results-skin="${skin.attribute}"]`);
   await page.getByRole("button",{name:"Read the Full Show"}).click();
   const names=root.locator(".ppw-result-lineup .ppw-result-competitor-name");
   const portraitNameColour=skin.value==="TERRITORY_TV"?"rgb(247, 242, 236)":
    skin.value==="FIGHT_NIGHT"?"rgb(26, 30, 37)":"rgb(27, 27, 27)";
   const vsColour=skin.value==="TERRITORY_TV"?"rgb(255, 179, 125)":
    skin.value==="FIGHT_NIGHT"?"rgb(167, 30, 48)":"rgb(181, 71, 34)";
   await expect(names.first()).toHaveCSS("color",portraitNameColour);
   await expect(root.locator(".ppw-result-lineup .ppw-result-vs")).toHaveCSS(
    "color",vsColour);
   const rivalry=root.locator(".ppw-rivalry-at-ringside").first();
   await expect(rivalry).toBeVisible();
   await expect(rivalry.locator(".ppw-ringside-rivalry-chapter strong"))
    .toHaveCSS("color","rgb(255, 223, 155)");
   await expect(rivalry.locator(".ppw-ringside-rivalry-chapter p"))
    .toHaveCSS("color","rgb(226, 237, 245)");
   await page.getByRole("button",{name:"Read Post-show Brief"}).click();
   const agent=root.locator(".ppw-post-show-road-agent");
   await expect(agent).toContainText("The main event delivered");
   await expect(agent.locator(".ppw-road-agent-voice").first()).toHaveCSS(
    "color","rgb(244, 237, 244)");
   await expect(agent.locator("h3")).toHaveCSS("color","rgb(255, 224, 169)");
   await expect(agent.locator(".ppw-road-agent-continuity")).toHaveCSS(
    "color","rgb(223, 249, 236)");
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
    .toBeLessThanOrEqual(1);
  });
 }
}

/* Retro's blue PC-style panels must never inherit dark ink from grey report paper. */
for(const width of [320,390]){
 test(`Retro Booker 02 ${width}px: certified card, contrast, POP and post-show`,async({page})=>{
  await page.setViewportSize({width,height:844});
  let resultsReads=0,providerReads=0;
  const programme={programmeId:"story-1",sideA:"Kenny Omega",sideB:"Samoa Joe",
   precedingMatches:1,precedingAngles:1,previousWinner:"A" as const,
   previousMatchWeek:3,currentWinner:"A" as const};
  const withRivalry={...show,resultsSkin:"RETRO_BOOKER_02",
   entries:show.entries.map(entry=>({...entry,programmeChapters:[programme]}))};
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const method=route.request().postDataJSON().method;
   if(method==="results")resultsReads++;
   return route.fulfill({json:method==="resultsArchive"?{
    items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
     bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
    nextCursor:null}:withRivalry});
  });
  await page.route("**/api/results-commentary",route=>{
   providerReads++;return route.fulfill({json:{status:"ready",review}});
  });
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  const report=page.locator('.ppw-results[data-results-skin="retro-booker-02"]');
  await expect(report).toBeVisible();
  await expect(report.locator(".ppw-retro-station")).toContainText("BOOKER 2002");
  await expect(report.locator(".ppw-result-title-wrap h1")).toContainText("Dynamite");
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await expect(report.getByRole("heading",{name:"MATCH RESULTS"})).toBeVisible();
  await expect(report.locator(".ppw-result-competitor-name"))
   .toHaveText(["Kenny Omega","Samoa Joe"]);
  await expect(report.locator(".ppw-result-lineup .ppw-result-competitor-name").first())
   .toHaveCSS("color","rgb(244, 247, 255)");
  await expect(report.locator(".ppw-result-lineup .ppw-result-vs"))
   .toHaveCSS("color","rgb(255, 200, 169)");
  await expect(report.locator(".ppw-result-verdict").first()).toContainText("Kenny Omega");
  await expect(report.locator(".ppw-ringside-slot").first()).toContainText("One Winged Angel");
  const rivalry=report.locator(".ppw-rivalry-at-ringside").first();
  await expect(rivalry).toBeVisible();
  await expect(rivalry.locator(".ppw-ringside-rivalry-chapter strong"))
   .toHaveCSS("color","rgb(255, 223, 155)");
  await expect(rivalry.locator(".ppw-ringside-rivalry-chapter p"))
   .toHaveCSS("color","rgb(226, 237, 245)");
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(report.locator(".ppw-retro-chapter-head").last()).toContainText("AFTER THE SHOW");
  await expect(report.locator(".ppw-pop-post").first()).toHaveCSS(
   "background-color","rgb(23, 47, 103)");
  await expect(report.locator(".ppw-pop-copy").first()).toHaveCSS(
   "color","rgb(243, 247, 255)");
  const agent=report.locator(".ppw-post-show-road-agent");
  await expect(agent).toContainText("The main event delivered.");
  await expect(agent.locator(".ppw-road-agent-voice").first()).toHaveCSS(
   "color","rgb(244, 237, 244)");
  expect(resultsReads).toBe(1);expect(providerReads).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}

for(const width of [320,390]){
 test("broadcast opening can be skipped without changing retro results narrative at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let reads=0;
  await page.route("**/api/session",r=>r.fulfill({json:session}));
  await page.route("**/api/card",r=>{
   const request=r.request().postDataJSON() as {method:string};
   if(request.method==="results")reads++;
   return r.fulfill({json:request.method==="resultsArchive"?{
    items:[{showId:"omega-night",year:1,week:4,showName:"Dynamite",
     bookingClass:"REGULAR",crowdResponse:84,matchCount:1,angleCount:1}],
    nextCursor:null
   }:{...show,broadcastPackage:"PRIZEFIGHT",promotionName:"AEW",
    resultsSkin:"RETRO_BOOKER_02"}});
  });
  await page.route("**/api/results-commentary",r=>r.fulfill({json:{status:"unavailable"}}));
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  const opening=page.locator(".ppw-tv-opening-wrap");
  await expect(opening).toBeVisible();
  await expect(opening.locator(".ppw-tv-frame")).toHaveAttribute("data-broadcast-package","prizefight");
  await expect(opening.locator(".ppw-tv-title")).toHaveText("Dynamite");
  await expect(opening.locator(".ppw-tv-promotion")).toHaveText("AEW");
  await expect(page.locator(".ppw-results")).toHaveAttribute("data-results-skin","retro-booker-02");
  await expect(opening.getByRole("button",{name:"Skip opening"})).toHaveCount(0);
  await expect(opening).toBeVisible();
  await expect(page.locator(".ppw-results")).toHaveAttribute("data-results-skin","retro-booker-02");
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await expect(page.getByRole("heading",{name:"THE FULL SHOW"})).toBeVisible();
  await expect(page.locator(".ppw-result-entry").first()).toContainText("Kenny Omega");
  expect(reads).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
