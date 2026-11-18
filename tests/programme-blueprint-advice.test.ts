import test from "node:test";
import assert from "node:assert/strict";
import {storyBlueprint} from "../src/domain/story-blueprints.js";
import {readProgrammeBlueprintProgress}
 from "../src/domain/programme-blueprint-progress.js";
import {readProgrammeCrowdTrend}
 from "../src/domain/programme-crowd-trend.js";
import {recommendProgrammeBlueprintBeat}
 from "../src/domain/programme-blueprint-advice.js";
type Choice="PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
function scene(id:string,options:{
 performed?:readonly string[];booked?:readonly string[];
 heat?:number|null;repetition?:number;medicalHolds?:number;
 direction?:Choice;nextMatchWeekIndex?:number|null;
 nextAngleWeekIndex?:number|null;
 crowd?:readonly {weekIndex:number;crowdResponse:number}[];
 latestChapter?:{kind:string;segmentKind:string|null;winnerSide:"A"|"B"|null}|null;
}={}){
 const blueprint=storyBlueprint(id)!;
 const progress=readProgrammeBlueprintProgress(blueprint,
  (options.performed??[]).map((beatId,i)=>({
   beatId,weekIndex:4+i,crowdResponse:70+i
  })),
  (options.booked??[]).map((beatId,i)=>{
   const beat=blueprint.beats.find(x=>x.id===beatId)!;
   return {showId:"show-"+i,slotId:"slot-"+i,kind:"SEGMENT",
    segmentKind:beat.kind,scenePurpose:beat.purpose,
    year:1,week:10+i,showName:"CWA Ascension",status:"DRAFT" as const};
  }));
 const crowdTrend=readProgrammeCrowdTrend(options.crowd??[]);
 return recommendProgrammeBlueprintBeat({
  blueprint,progress,heat:options.heat??null,
  repetition:options.repetition??0,medicalHolds:options.medicalHolds??0,
  crowdTrend,latestChapter:options.latestChapter??null,
  latestFollowUp:options.direction?{
   choice:options.direction,nextMatchWeekIndex:options.nextMatchWeekIndex??null,
   nextAngleWeekIndex:options.nextAngleWeekIndex??null
  }:null
 });
}
test("first scene is only an optional opening cue",()=>{
 const next=scene("UNDERDOG");
 assert.equal(next.signal,"OPENING");
 assert.equal(next.beatId,"struggle");
 assert.match(next.reason,/optional scene/i);
});
test("an unfulfilled certified retaliation choice suggests a real ambush or confrontation",()=>{
 const next=scene("JEALOUSY",{direction:"PLAN_RETALIATION"});
 assert.equal(next.signal,"RETALIATION");
 assert.equal(next.beatId,"attack");
 const after=scene("JEALOUSY",{direction:"PLAN_RETALIATION",
  nextAngleWeekIndex:12});
 assert.notEqual(after.signal,"RETALIATION",
  "Actual later action must retire the old retaliation cue");
});
test("an unfulfilled rematch decision points to a challenge, not a booked result",()=>{
 const next=scene("TITLE_CHASE",{direction:"PURSUE_REMATCH"});
 assert.equal(next.signal,"REMATCH");
 assert.equal(next.beatId,"challenge");
 assert.match(next.reason,/booked separately/i);
});
test("medical holds override physical escalation even with a retaliation decision",()=>{
 const next=scene("JEALOUSY",{medicalHolds:1,direction:"PLAN_RETALIATION"});
 assert.equal(next.signal,"MEDICAL");
 assert.equal(next.beatId,"grudge");
 const blocked=scene("SLOW_BURN_VILLAIN",{
  performed:["resent"],medicalHolds:1
 });
 assert.equal(blocked.signal,"MEDICAL");
 assert.equal(blocked.beatId,null,
  "No physical beat should be automatically recommended under a medical hold");
});
test("cooling crowd reaction prioritises new context rather than an automatic turn",()=>{
 const next=scene("TITLE_CHASE",{
  performed:["stakes"],heat:90,
  crowd:[{weekIndex:1,crowdResponse:75},{weekIndex:2,crowdResponse:49}]
 });
 assert.equal(next.signal,"COOLING");
 assert.equal(next.beatId,"build");
});
test("repetitive scenes suggest changing presentation, not another assault",()=>{
 const next=scene("TITLE_CHASE",{repetition:66});
 assert.equal(next.signal,"REPETITION");
 assert.equal(next.beatId,"build");
});
test("a hot slow burn can recommend a voluntary turn only after two real played chapters",()=>{
 const next=scene("SLOW_BURN_VILLAIN",{
  heat:88,performed:["resent","line"]
 });
 assert.equal(next.signal,"HOT");
 assert.equal(next.beatId,"turn");
 const early=scene("SLOW_BURN_VILLAIN",{heat:88});
 assert.notEqual(early.signal,"HOT");
 assert.equal(early.beatId,"resent");
});
test("draws and scene repetition can motivate a more relevant available chapter",()=>{
 const unresolved=scene("UNDERDOG",{latestChapter:{
  kind:"MATCH",segmentKind:null,winnerSide:null
 }});
 assert.equal(unresolved.signal,"UNRESOLVED");
 assert.equal(unresolved.beatId,"chance");
 const variety=scene("UNDERDOG",{latestChapter:{
  kind:"SEGMENT",segmentKind:"INTERVIEW",winnerSide:null
 }});
 assert.equal(variety.signal,"VARIETY");
 assert.equal(variety.beatId,"defy");
});
test("booked or completed beats are never recommended again as unused",()=>{
 const next=scene("JEALOUSY",{booked:["attack"],direction:"PLAN_RETALIATION"});
 assert.notEqual(next.beatId,"attack");
 const complete=scene("BETRAYAL",{performed:["hint","trust","choice"]});
 assert.equal(complete.signal,"COMPLETE");
 assert.equal(complete.beatId,null);
});
test("mismatched blueprint progress is rejected rather than attributing another story's facts",()=>{
 const blueprint=storyBlueprint("UNDERDOG")!;
 const wrong=readProgrammeBlueprintProgress(storyBlueprint("BETRAYAL")!,[],[]);
 assert.throws(()=>recommendProgrammeBlueprintBeat({
  blueprint,progress:wrong,heat:40,repetition:0,crowdTrend:null,medicalHolds:0
 }),/not for this authored story/);
});
