import assert from "node:assert/strict";
import test from "node:test";
import {newEditorMatch} from "../src/ui/card-editor-model.js";
import {newEditorSegment,buildEditorSegment} from "../src/ui/card-segment-model.js";
import {bookingChoiceAdvice,applyBookingAdjustment}
 from "../src/domain/booking-choice-advice.js";
import {isAngleScene} from "../src/domain/angle-scene.js";
import {buildBookedMatch} from "../src/ui/card-editor-model.js";
import type {StaffRole} from "../src/domain/world-staff.js";
const crew=new Set<StaffRole>(["ROAD_AGENT","REFEREE","MEDICAL","CREATIVE"]);
const joe={personId:"joe",name:"Samoa Joe",stamina:34,safety:42,fatigue:78,wear:82,
 presentation:44};
const mistico={personId:"mistico",name:"Místico",stamina:92,safety:87,fatigue:5,
 wear:9,presentation:93};
function match(){
 return {...newEditorMatch("main","SINGLES"),teams:[
  [{personId:"joe",contractId:"a"}],[{personId:"mistico",contractId:"b"}]
 ]};
}
function attack(){
 const s=newEditorSegment("scene","ATTACK");
 return {...s,actors:[{personId:"joe",contractId:"a"}],
  targets:[{personId:"mistico",contractId:"b"}]};
}
test("referee suggests lower-risk rules and only a tap changes the scripted finish",()=>{
 const prior={...match(),stipulation:"LADDER" as const,plannedFinish:"RETRIEVAL",
  winnerSide:1,plannedLengthMinutes:35};
 const suggestion=bookingChoiceAdvice(prior,[joe,mistico],crew)!;
 assert.equal(suggestion.role,"REFEREE");
 assert.equal(suggestion.adjustment.kind,"MATCH_RULES");
 assert.equal(prior.plannedFinish,"RETRIEVAL");
 const adjusted=applyBookingAdjustment(prior,suggestion.adjustment);
 assert.ok("teams" in adjusted);
 assert.equal(adjusted.stipulation,"STANDARD");
 assert.equal(adjusted.plannedFinish,"CLEAN_PIN");
 assert.equal(adjusted.winnerSide,1);
 assert.deepEqual(adjusted.teams,prior.teams);
 assert.doesNotThrow(()=>buildBookedMatch(adjusted));
 assert.equal(bookingChoiceAdvice(adjusted,[joe,mistico],crew)?.actionLabel,
  "Shorten to 18 min");
});
test("road agent shortens with legal minimum; iron man never falls below 30",()=>{
 const thirtyFive={...match(),plannedLengthMinutes:35};
 const advised=bookingChoiceAdvice(thirtyFive,[joe,mistico],crew)!;
 assert.equal(advised.role,"ROAD_AGENT");
 assert.equal(advised.actionLabel,"Shorten to 18 min");
 const adjusted=applyBookingAdjustment(thirtyFive,advised.adjustment);
 assert.ok("teams" in adjusted);
 assert.equal(adjusted.plannedLengthMinutes,18);
 assert.equal(adjusted.plannedFinish,thirtyFive.plannedFinish);
 assert.equal(bookingChoiceAdvice(adjusted,[joe,mistico],crew),null);
 const iron={...thirtyFive,stipulation:"IRON_MAN" as const,
  plannedFinish:"MOST_FALLS"};
 const ironAdvice=bookingChoiceAdvice(iron,[joe,mistico],crew)!;
 assert.equal(ironAdvice.actionLabel,"Shorten to 30 min");
 const legal=applyBookingAdjustment(iron,ironAdvice.adjustment);
 assert.ok("teams" in legal);
 assert.equal(legal.plannedLengthMinutes,30);
 assert.equal(legal.plannedFinish,"MOST_FALLS");
 assert.equal(bookingChoiceAdvice(legal,[joe,mistico],crew),null);
});
test("angle safety suggestion changes visual severity without inventing injury or editing outcome",()=>{
 const old=attack();
 const intense={...old,scene:{...old.scene!,intensity:"BRUTAL" as const,
  visual:"BLOODIED" as const},outcome:"REFUSED" as const};
 const advised=bookingChoiceAdvice(intense,[joe,mistico],crew)!;
 assert.equal(advised.role,"MEDICAL");
 assert.equal(advised.actionLabel,"Reduce physical intensity");
 assert.equal(intense.scene.visual,"BLOODIED");
 const adjusted=applyBookingAdjustment(intense,advised.adjustment);
 assert.ok(!("teams" in adjusted));
 assert.equal(adjusted.scene?.intensity,"WARNING");
 assert.equal(adjusted.scene?.visual,"OFFICIALS_SEPARATE");
 assert.equal(adjusted.outcome,"REFUSED");
 assert.equal(adjusted.scene?.purpose,intense.scene.purpose);
 assert.equal(isAngleScene(adjusted.scene,adjusted.kind),true);
 assert.doesNotThrow(()=>buildEditorSegment(adjusted));
 assert.equal(bookingChoiceAdvice(adjusted,[joe,mistico],crew),null);
 assert.equal(bookingChoiceAdvice(intense,[joe,mistico],
  new Set<StaffRole>())?.role,"HOUSE");
});
test("creative tightens a long low-presentation interview only on explicit selection",()=>{
 const prior={...newEditorSegment("interview","INTERVIEW"),
  actors:[{personId:"joe",contractId:"a"}],durationMinutes:20};
 const advice=bookingChoiceAdvice(prior,[joe],crew)!;
 assert.equal(advice.role,"CREATIVE");
 assert.equal(advice.actionLabel,"Shorten scene to 10 min");
 const revised=applyBookingAdjustment(prior,advice.adjustment);
 assert.ok(!("teams" in revised));
 assert.equal(revised.durationMinutes,10);
 assert.deepEqual(revised.actors,prior.actors);
 assert.deepEqual(revised.creativeBeat,prior.creativeBeat);
 assert.equal(bookingChoiceAdvice(revised,[joe],crew),null);
 assert.equal(bookingChoiceAdvice(prior,[joe],
  new Set<StaffRole>()),null);
 assert.equal(bookingChoiceAdvice({...prior,kind:"VIDEO_PACKAGE"},[joe],crew),null);
});
test("creative Why advice aligns an existing feud with its own programme, never creates one",()=>{
 const initial={...attack(),programmeId:"rivalry",
  scene:{...attack().scene!,purpose:"START_RIVALRY" as const}};
 const noFatigue=[{...joe,fatigue:10,wear:5},mistico];
 const proposed=bookingChoiceAdvice(initial,noFatigue,crew)!;
 assert.equal(proposed.role,"CREATIVE");
 assert.equal(proposed.actionLabel,"Escalate linked feud");
 const updated=applyBookingAdjustment(initial,proposed.adjustment);
 assert.ok(!("teams" in updated));
 assert.equal(updated.scene?.purpose,"BUILD_RIVALRY");
 assert.equal(updated.creativeBeat?.kind,"ATTACK");
 if(updated.creativeBeat?.kind==="ATTACK")
  assert.equal(updated.creativeBeat.objective,"ESCALATE_RIVALRY");
 assert.equal(updated.programmeId,"rivalry");
 assert.deepEqual(updated.actors,initial.actors);
 assert.equal(bookingChoiceAdvice(updated,noFatigue,crew),null);
});
test("cast mismatch sends player back to caster, not a fabricated new wrestler",()=>{
 const prior={...newEditorSegment("staged","CONFRONTATION"),
  programmeId:"programme",actors:[{personId:"joe",contractId:"a"}],
  targets:[{personId:"mistico",contractId:"b"}]};
 const advice=bookingChoiceAdvice(prior,[joe,mistico],crew,
  {programmeCast:["other","another"]})!;
 assert.equal(advice.adjustment.kind,"BACK_TO_CAST");
 assert.equal(advice.actionLabel,"Review wrestlers");
 assert.strictEqual(applyBookingAdjustment(prior,advice.adjustment),prior);
 assert.equal(bookingChoiceAdvice(prior,[joe,mistico],crew,
  {programmeCast:["joe","other"]}),null);
});
test("warnings are evidence-driven and reject stale or mismatched edits",()=>{
 const empty={...newEditorMatch("blank","SINGLES"),
  plannedLengthMinutes:35};
 assert.equal(bookingChoiceAdvice(empty,[],crew),null);
 assert.equal(bookingChoiceAdvice(match(),[mistico],crew),null);
 assert.throws(()=>applyBookingAdjustment(match(),{kind:"ANGLE_SOFTEN"}),/does not apply/);
 assert.throws(()=>applyBookingAdjustment(attack(),{kind:"MATCH_RULES"}),/does not apply/);
 const iron={...match(),stipulation:"IRON_MAN" as const,
  plannedLengthMinutes:30,plannedFinish:"MOST_FALLS"};
 assert.throws(()=>applyBookingAdjustment(iron,{kind:"MATCH_LENGTH",minutes:18}),
  /no longer legal/);
});
