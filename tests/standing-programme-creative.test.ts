import test from "node:test";
import assert from "node:assert/strict";
import {normalizeBookableMatch} from "../src/domain/bookable-match.js";
import {standingTermsCoverMatch,type StandingTerms}
 from "../src/domain/standing-programme-creative.js";
const a={personId:"alice",contractId:"a"},b={personId:"bob",contractId:"b"};
const terms:StandingTerms={
 showId:"show",slotId:"bout",personId:"alice",contractId:"a",
 startWeekIndex:4,expiresWeekIndex:8,matchType:"SINGLES",
 permittedOutcome:"WIN_OR_PROTECTED_LOSS",
 ownPeople:["alice"],opponentPeople:["bob"],
 currentOwn:["alice"],currentOpponents:["bob"],approved:true
};
const match=(winner="A",finish="CLEAN_PIN",interference?:unknown)=>
 normalizeBookableMatch({matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[a]},{sideId:"B",participants:[b]}],
  participants:[a,b],scriptedWinnerSide:winner,
  intent:"COMPETITIVE",plannedFinish:finish,
  plannedLengthMinutes:18,...(interference?{interference}:{})});
test("the agreed rivalry scope permits a win or a protected loss but never a clean loss",()=>{
 assert.equal(standingTermsCoverMatch(terms,match(),4),true);
 assert.equal(standingTermsCoverMatch(terms,match("B","PROTECTED_FINISH"),5),true);
 assert.equal(standingTermsCoverMatch(terms,match("B","FLASH_PIN"),7),true);
 assert.equal(standingTermsCoverMatch(terms,match("B"),7),false);
 assert.equal(standingTermsCoverMatch({
  ...terms,permittedOutcome:"WIN_ONLY"},match("B","PROTECTED_FINISH"),7),false);
 assert.equal(standingTermsCoverMatch({...terms,approved:false},match(),7),false);
 assert.equal(standingTermsCoverMatch(terms,match(),8),false);
 assert.equal(standingTermsCoverMatch(terms,match(),3),false);
 assert.equal(standingTermsCoverMatch({...terms,currentOpponents:["new-person"]},
  match(),5),false);
});
test("tag agreement cannot be transplanted into another pairing",()=>{
 const c={personId:"carol",contractId:"c"},d={personId:"dan",contractId:"d"};
 const tag=normalizeBookableMatch({
  matchType:"TAG",family:"TEAMS",
  sides:[{sideId:"A",participants:[a,c]},{sideId:"B",participants:[b,d]}],
  participants:[a,c,b,d],scriptedWinnerSide:"B",
  plannedFinish:"PROTECTED_FINISH",intent:"COMPETITIVE",
  plannedLengthMinutes:18
 });
 const tagged:StandingTerms={...terms,matchType:"TAG",
  ownPeople:["alice","carol"],opponentPeople:["bob","dan"],
  currentOwn:["alice","carol"],currentOpponents:["bob","dan"]};
 assert.equal(standingTermsCoverMatch(tagged,tag,5),true);
 assert.equal(standingTermsCoverMatch({...tagged,ownPeople:["alice"]},tag,5),false);
 assert.equal(standingTermsCoverMatch({...tagged,currentOwn:["alice","new"]},tag,5),false);
 assert.equal(standingTermsCoverMatch(terms,tag,5),false);
});
