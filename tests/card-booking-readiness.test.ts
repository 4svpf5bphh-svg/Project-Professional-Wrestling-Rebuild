import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch,assignPerformer} from "../src/ui/card-editor-model.js";
import {newEditorSegment,addSegmentPerson} from "../src/ui/card-segment-model.js";
import {matchCastingReadiness,angleCastingReadiness} from "../src/ui/card-booking-readiness.js";
const p=(id:string)=>({personId:id,contractId:"deal-"+id});
test("unfilled matches and authored angles show specific missing roles before save",()=>{
 let m=newEditorMatch("m","TRIPLE_THREAT");
 assert.equal(matchCastingReadiness(m).label,"NEEDS TALENT");
 for(let i=0;i<3;i++)m=assignPerformer(m,i,0,p("w"+i));
 assert.equal(matchCastingReadiness(m).label,"CAST COMPLETE");
 let a=newEditorSegment("a","ATTACK");
 assert.equal(angleCastingReadiness(a).label,"NEEDS PERFORMER");
 a=addSegmentPerson(a,"actors",p("a"));
 assert.equal(angleCastingReadiness(a).label,"NEEDS TARGET");
 a=addSegmentPerson(a,"targets",p("b"));
 assert.equal(angleCastingReadiness(a).label,"CAST COMPLETE");
});
test("faction decisions, alignment and signing require real choices",()=>{
 let signing=newEditorSegment("signing","CONTRACT_SIGNING");
 signing=addSegmentPerson(signing,"actors",p("a"));
 assert.equal(angleCastingReadiness(signing).label,"NEEDS PERFORMER");
 signing=addSegmentPerson(signing,"actors",p("b"));
 assert.equal(angleCastingReadiness(signing).complete,true);
 let faction=newEditorSegment("faction","STABLE_INVITATION");
 faction=addSegmentPerson(faction,"actors",p("a"));
 faction=addSegmentPerson(faction,"targets",p("b"));
 assert.equal(angleCastingReadiness(faction).label,"CHOOSE FACTION");
 faction={...faction,stableId:"faction-1"};
 assert.equal(angleCastingReadiness(faction).label,"CHOOSE REACTION");
 assert.equal(angleCastingReadiness({...faction,stableDecision:"ACCEPTED"}).complete,true);
 const turn=newEditorSegment("turn","TURN");
 assert.equal(angleCastingReadiness({...turn,actors:[p("a")],turnTargetAlignment:null}).label,
  "CHOOSE ALLEGIANCE");
});

test("preflight catches incompatible scripted finishes and interference before save",()=>{
 let match=newEditorMatch("interference","SINGLES");
 match=assignPerformer(match,0,0,p("winner"));
 match=assignPerformer(match,1,0,p("loser"));
 assert.equal(matchCastingReadiness(match).complete,true);
 match={...match,interference:{personId:"visitor",contractId:"visitor-deal",
  aidedSide:"B",plannedOutcome:"SUCCESS"}};
 assert.equal(matchCastingReadiness(match).label,"CHECK MATCH PLAN");
 assert.match(matchCastingReadiness(match).hint,/support the winner/);
 match={...match,interference:{...match.interference!,aidedSide:"A"}};
 assert.equal(matchCastingReadiness(match).complete,true);
 const multi={...match,plannedFinish:"OVER_THE_TOP_ROPE"};
 assert.equal(matchCastingReadiness(multi).label,"CHECK MATCH PLAN");
});
