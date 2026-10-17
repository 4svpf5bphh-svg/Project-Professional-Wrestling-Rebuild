import test from "node:test";
import assert from "node:assert/strict";
import {projectVerifiedBroadcastFallout,type RecordedMatchFalloutRow}
 from "../src/domain/verified-broadcast-fallout.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const names=new Map([["a","Alice"],["b","Bob"],["c","Carol"],["d","Dave"]]);
const name=(id:string)=>names.get(id)??id;
const sides=new Map<string,readonly string[]>([["A",["Alice"]],["B",["Bob"]]]);
const bare=(matchId="bout"):RecordedMatchFalloutRow=>({
 match_id:matchId,evidence_json:null,championship_name:null,
 title_changed:null,title_winner_name:null,title_prior_holder_name:null,injuries:[],
});
const receipt=(finish:string,side:string):CompletedShowReceipt=>({
 worldId:"world",promotionId:"promotion",showId:"show",year:1,week:1,
 resolutionId:"resolution",crowdResponse:82,
 matches:[{matchId:"bout",position:0,crowdResponse:82,
  actualFinish:finish,actualWinnerSide:side}],segments:[],
});
test("a protected finish records outside interference without inventing a belt transfer",()=>{
 const show=receipt("PROTECTED_FINISH","A"),m=show.matches[0]!;
 const row:RecordedMatchFalloutRow={...bare(),championship_name:"World Title",
  title_changed:false,title_winner_name:"Alice",
  title_prior_holder_name:"Bob",
  evidence_json:{matchId:"bout",
   booking:{participants:["a","b"],scriptedWinner:"a",plannedFinish:"CLEAN_PIN",
    interferencePlannedOutcome:"SUCCESS"},
   resolution:{actualWinner:"a",actualFinish:"PROTECTED_FINISH",
    interference:{plannedOutcome:"SUCCESS",actualOutcome:"SUCCESS"}}},
 };
 const fallout=projectVerifiedBroadcastFallout(row,show,m,name,sides,"c");
 assert.equal(fallout.title?.changed,false);
 assert.equal(fallout.title?.winnerName,"Alice");
 assert.deepEqual(fallout.interference,{personName:"Carol",outcome:"SUCCESS"});
 assert.deepEqual(fallout.injuries,[]);
});
test("stoppage names the verified injured wrestler without inventing recovery time",()=>{
 const show=receipt("INJURY_STOPPAGE","B"),m=show.matches[0]!;
 const row:RecordedMatchFalloutRow={...bare(),
  evidence_json:{matchId:"bout",
   booking:{participants:["a","b"],scriptedWinner:"a",plannedFinish:"CLEAN_PIN"},
   resolution:{actualWinner:"b",actualFinish:"INJURY_STOPPAGE",
    medical:{injuredPersonId:"a",severity:"SEVERE",stoppage:true}}},
 };
 const fallout=projectVerifiedBroadcastFallout(row,show,m,name,sides,null);
 assert.deepEqual(fallout.injuries,[{personName:"Alice",severity:"SEVERE",
  weeksOut:null,stoppage:true}]);
 assert.equal(fallout.title,undefined);
});
test("tag career injury days merge with medical stoppage and verified eliminations",()=>{
 const show=receipt("CLEAN_PIN","A"),m=show.matches[0]!;
 const row:RecordedMatchFalloutRow={...bare(),
  evidence_json:{matchId:"bout",
   booking:{family:"TEAMS",sides:[{sideId:"A",participants:["a","b"]},
    {sideId:"B",participants:["c","d"]}],scriptedWinnerSide:"A",
    ruleset:"ELIMINATION",eliminationOrder:["B"],plannedFinish:"CLEAN_PIN"},
   resolution:{actualWinnerSide:"A",actualFinish:"CLEAN_PIN",
    completedEliminationOrder:["B"]}},
  injuries:[{person_id:"c",injury_severity:"MODERATE",injury_weeks_out:3}]};
 const teamSides=new Map<string,readonly string[]>([
  ["A",["Alice","Bob"]],["B",["Carol","Dave"]]]);
 const fallout=projectVerifiedBroadcastFallout(row,show,m,name,teamSides,null);
 assert.deepEqual(fallout.eliminations,["Carol & Dave"]);
 assert.deepEqual(fallout.injuries,[{personName:"Carol",severity:"MODERATE",
  weeksOut:3,stoppage:false}]);
});
test("unsupported historic evidence is rejected rather than turned into fictitious action",()=>{
 const show=receipt("CLEAN_PIN","A"),m=show.matches[0]!;
 assert.deepEqual(projectVerifiedBroadcastFallout(undefined,show,m,name,sides,null),
  {injuries:[],eliminations:[]});
 assert.throws(()=>projectVerifiedBroadcastFallout({...bare(),
  evidence_json:{matchId:"other"}},show,m,name,sides,null),/Invalid historic match/);
 assert.throws(()=>projectVerifiedBroadcastFallout({...bare(),
  injuries:[{person_id:"a",injury_severity:"IMPOSSIBLE",injury_weeks_out:2}]},
  show,m,name,sides,null),/Invalid historic medical/);
});

test("only an eligible clean match result can be called a title change",()=>{
 const show=receipt("CLEAN_PIN","A"),m=show.matches[0]!;
 const title:RecordedMatchFalloutRow={...bare(),championship_name:"World Title",
  title_changed:true,title_winner_name:"Alice",title_prior_holder_name:"Bob",
  report_rating_stars:"4.25",report_actual_minutes:22};
 const fact=projectVerifiedBroadcastFallout(title,show,m,name,sides,null);
 assert.equal(fact.title?.changed,true);
 assert.equal(fact.ratingStars,4.25);
 assert.equal(fact.actualMinutes,22);
 assert.throws(()=>projectVerifiedBroadcastFallout({...title},
  receipt("PROTECTED_FINISH","A"),
  receipt("PROTECTED_FINISH","A").matches[0]!,name,sides,null),
  /Title change contradicts/);
});

test("match programme facts are validated and never assumed from the booking",()=>{
 const show=receipt("CLEAN_PIN","A"),m=show.matches[0]!;
 const row:RecordedMatchFalloutRow={...bare(),report_linked_programmes:2,
  report_programme_signal:"PROGRAMME_REPETITION",
  report_execution_quality:83.5};
 const f=projectVerifiedBroadcastFallout(row,show,m,name,sides,null);
 assert.equal(f.linkedProgrammes,2);
 assert.equal(f.programmeSignal,"PROGRAMME_REPETITION");
 assert.equal(f.executionQuality,83.5);
 assert.throws(()=>projectVerifiedBroadcastFallout({...row,
  report_linked_programmes:0},show,m,name,sides,null),/Invalid certified/);
 assert.throws(()=>projectVerifiedBroadcastFallout({...row,
  report_programme_signal:"MADE_UP_PLOT"},show,m,name,sides,null),
  /Invalid certified programme signal/);
});
