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
 test("Ringside shows verified prior rivalry matches and staff continuity at "+width+"px",async({page})=>{
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
  await page.getByRole("button",{name:"Read the Full Show"}).click();
  const recaps=page.locator(".ppw-rivalry-at-ringside");
  await expect(recaps).toHaveCount(2);
  await expect(recaps.first()).toContainText("Samoa Joe vs Matt Riddle");
  await expect(recaps.first()).toContainText("latest was Year 2, Week 1, won by Matt Riddle");
  await expect(recaps.first()).toContainText("This chapter went to Samoa Joe");
  await expect(recaps.last()).toContainText("on-screen chapter");
  await expect(recaps.last()).not.toContainText("This chapter went to");
  await page.getByRole("button",{name:"Read Post-show Brief"}).click();
  await expect(page.locator(".ppw-road-agent-continuity"))
   .toContainText("Samoa Joe and Matt Riddle have history");
  expect(resultsCalls).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(1);
 });
}
