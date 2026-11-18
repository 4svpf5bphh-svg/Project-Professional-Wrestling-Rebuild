import {test,expect} from "@playwright/test";

/** Same saved Blueprint, distinct real World signals. Recommendation text is
 * read-only: no angle, fee, alignment or character outcome is invented.
 */
for(const width of [320,390]){
 for(const hold of [false,true]){
  test("Story Blueprint guidance follows certified retaliation"+(hold?" and medical hold":"")+
   " at "+width+"px",async({page})=>{
   await page.setViewportSize({width,height:844});
   const session={worldId:"world",playerId:"booker",csrfToken:"csrf",
    overview:{world:{revision:8,name:"Genesis",year:1,week:7,phase:"OPEN",
     nextLockEpoch:Date.now()/1000+5000,serverEpoch:Date.now()/1000},
     membership:"ACTIVE",promotion:{id:"cwa",name:"CWA",tier:"LOCAL",
      cash:1000000,debt:0}},availablePromotions:[]};
   const programme={
    programmeId:"joe-riddle",status:"ACTIVE",heat:56,repetition:9,
    activityCount:1,matchCount:1,segmentCount:0,
    sideAWins:0,sideBWins:1,draws:0,
    championshipId:null,startedWeekIndex:2,endedWeekIndex:null,
    sideA:[{kind:"PERSON",refId:"joe",name:"Samoa Joe"}],
    sideB:[{kind:"PERSON",refId:"riddle",name:"Matt Riddle"}],
    recentActivity:[{showId:"last-tv",slotId:"main",kind:"MATCH",
     weekIndex:5,crowdResponse:63,winnerSide:"B",segmentKind:null,
     sceneLocation:null,sceneIntensity:null,sceneVisual:null,
     angleOutcome:null,turnAlignment:null,stableDecision:null}],
    plannedActivity:[],
    medicalHolds:hold?[{personId:"joe",name:"Samoa Joe",clearedWeekIndex:11}]:[],
    latestFollowUp:{choice:"PLAN_RETALIATION",showId:"last-tv",slotId:"main",
     weekIndex:5,nextMatchWeekIndex:null,nextAngleWeekIndex:null},
    eligibleCreativePeople:[],creativeAgreements:[],
    creativeIntent:{blueprintId:"JEALOUSY",
     motivation:"Resents the other's spotlight",audienceGoal:"Tension",destination:"PPV"},
    blueprintProgress:{blueprintId:"JEALOUSY",
     played:0,booked:0,available:3,suggestedBeatId:"grudge",
     beats:["grudge","interrupt","attack"].map(beatId=>({
      beatId,status:"AVAILABLE",playedWeekIndex:null,
      crowdResponse:null,bookedAt:null
     }))}
   };
   const calls:string[]=[];
   await page.route("**/api/session",r=>r.fulfill({json:session}));
   await page.route("**/api/card",r=>{
    const body=r.request().postDataJSON() as {method:string};
    calls.push(body.method);
    if(body.method==="programmes")return r.fulfill({json:{
     year:1,week:7,worldRevision:8,canEdit:true,
     people:[],teams:[],championships:[],programmes:[programme]}});
    throw Error("Creative guidance should not call "+body.method);
   });
   await page.goto("/#/programmes");
   await page.getByRole("button",{name:"Plan",exact:true}).click();
   const story=page.locator(".ppw-programme-next-beats");
   await expect(story).toContainText("Jealousy and Obsession");
   await expect(story).toHaveAttribute("data-cue-signal",hold?"medical":"retaliation");
   await expect(story.locator(".ppw-story-beat-cue")).toContainText(
    hold?"Medical absence recorded":"booker chose retaliation");
   const recommended=hold?"grudge":"attack";
   const first=story.locator(".ppw-programme-beat-action").first();
   await expect(first).toHaveAttribute("data-beat-id",recommended);
   await expect(first).toContainText("SUGGESTED NEXT");
   await expect(story.locator('[data-beat-id="'+(hold?"attack":"grudge")+'"]'))
    .toContainText("AVAILABLE");
   expect(calls).toEqual(["programmes"]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
    .toBeLessThanOrEqual(1);
  });
 }
}
