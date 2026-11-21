import {test,expect} from "@playwright/test";
const session={worldId:"world",playerId:"owner",csrfToken:"fixture",
 overview:{world:{revision:4,name:"World",year:2,week:3,phase:"OPEN"},
 membership:"ACTIVE",promotion:{id:"home",name:"CWA",tier:"LOCAL",cash:800000,debt:0}},
 availablePromotions:[]};
const context={programmeId:"story",sideA:"Samoa Joe",sideB:"Matt Riddle",
 precedingMatches:2,precedingAngles:1,previousWinner:"B" as const,
 previousMatchWeek:52,currentWinner:"A" as const};
const show={showId:"fight",showName:"Ascension",bookingClass:"REGULAR",
 year:2,week:3,crowdResponse:84,matchCount:1,angleCount:1,
 staffReport:{reporter:"Alex Stone",staffId:"agent",headline:"A useful chapter",
  praise:"The match was strong.",concern:"Check the timing next week.",
  recommendation:"Keep it focused.",strongestMatchId:"main",reviewedMatches:1},
 entries:[{slotId:"main",position:0,type:"MATCH",headline:"Samoa Joe defeats Matt Riddle",
  summary:"A clean pinfall settled the contest.",outcome:"CLEAN_PIN",
  actorIds:["joe","riddle"],targetIds:[],crowdResponse:85,
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:15,
   sides:[["Samoa Joe"],["Matt Riddle"]],winnerNames:["Samoa Joe"],
   championshipContested:false,isMainEvent:true},
  fallout:{ratingStars:4,actualMinutes:17,injuries:[],eliminations:[],
   linkedProgrammes:1},
  programmeChapters:[context]},
 {slotId:"promo",position:1,type:"SEGMENT",headline:"One more challenge",
  summary:"The confrontation happened.",outcome:"HAPPENS",crowdResponse:76,
  actorIds:["joe"],targetIds:["riddle"],segmentKind:"CHALLENGE",
  programmeChapters:[{...context,currentWinner:null}]}]};
for(const width of [320,390]){
 test("Ringside retains clean match history without redundant rivalry panels at "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  let resultsCalls=0;
  await page.route("**/api/session",route=>route.fulfill({json:session}));
  await page.route("**/api/card",route=>{
   const method=route.request().postDataJSON().method;
   if(method==="results")resultsCalls++;
   return route.fulfill({json:method==="resultsArchive"?{items:[{
    showId:"fight",showName:"Ascension",year:2,week:3,crowdResponse:84,
    matchCount:1,angleCount:1}],nextCursor:null}:show});
  });
  await page.route("**/api/results-commentary",route=>route.fulfill({json:{status:"unavailable"}}));
  await page.goto("/#/results");
  await page.getByRole("button",{name:/Read ringside report/}).click();
  // Story context still anchors the Ringside author, but the public result
  // is not interrupted by two repeated, mechanical feud recap boxes.
  await expect(page.locator(".ppw-rivalry-at-ringside")).toHaveCount(0);
  await expect(page.getByText("THE RIVALRY SO FAR")).toHaveCount(0);
  await expect(page.locator(".ppw-result-headline").first()).toContainText("Samoa Joe defeats Matt Riddle");
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(page.locator(".ppw-post-show-road-agent")).toContainText("The match was strong.");
  await expect(page.locator(".ppw-road-agent-observation")).toHaveCount(0);
  expect(resultsCalls).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
