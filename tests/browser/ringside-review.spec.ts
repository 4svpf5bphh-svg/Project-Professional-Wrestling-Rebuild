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
  await expect(page.getByRole("heading",{name:"THE NOISE AFTER THE BELL"})).toBeHidden();
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  await expect(page.getByRole("heading",{name:"THE FULL SHOW"})).toBeVisible();
  await expect(page.locator(".ppw-show-transition")).toHaveCount(2);
  await expect(page.locator(".ppw-ringside-slot").first()).toContainText("One Winged Angel");
  await expect(page.locator(".ppw-finish-winner")).toContainText("Kenny Omega");
  await expect(page.getByRole("region",{name:"Finish replay"})).toBeVisible();
  await expect(page.locator(".ppw-result-lineup .ppw-result-competitor")).toHaveCount(2);
  await expect(page.locator(".ppw-result-competitor-name")).toHaveText(["Kenny Omega","Samoa Joe"]);
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(page.getByRole("heading",{name:"THE NOISE AFTER THE BELL"})).toBeVisible();
  await expect(page.locator(".ppw-crowd-noise-card")).toHaveCount(2);
  await expect(page.getByRole("heading",{name:"POST-SHOW MANAGEMENT BRIEF"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Meet the press"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Alex Stone · Road Agent's Report"})).toBeVisible();
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
 await expect(page.locator(".ppw-booker-breakdown")).toHaveCount(0);
 await expect(page.getByRole("region",{name:"Finish replay"})).toBeVisible();
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
 await page.getByRole("button",{name:"Post-show Brief",exact:true}).click();
 const post=page.locator(".ppw-crowd-noise-card").first();
 await expect(post.locator(".ppw-crowd-noise-reply")).toContainText("The result is official");
 await post.click();
 await expect(page.locator(".ppw-result-match")).toHaveAttribute("open","");
 await expect(page.getByRole("region",{name:"Finish replay"})).toBeVisible();
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
  await page.getByRole("button",{name:"Post-show Brief",exact:true}).click();
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
 await page.getByRole("button",{name:"Post-show Brief",exact:true}).click();
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
