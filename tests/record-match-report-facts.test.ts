import {test} from "node:test";
import {strict as assert} from "node:assert";
import {deriveCompletedMatchReportFacts,recordCompletedMatchReportFactsInTransaction}
 from "../src/db/record-match-report-facts.js";
type Input=Parameters<typeof deriveCompletedMatchReportFacts>[0];
const projection={
 worldId:"world",showId:"show",
 projections:[
  {slotId:"singles",score:{criticalRatingStars:4.25,executionQuality:89.5,actualLengthMinutes:17},
   injuryPreview:{injuries:[{personId:"a",severity:"MINOR",weeksOut:2}]},
   multi:null,tag:null},
  {slotId:"tag",score:{criticalRatingStars:3.25,executionQuality:73.2,actualLengthMinutes:24},
   tag:{result:{injury:{injuries:[
    {personId:"c",severity:"MODERATE",weeksOut:3}]}}},
   multi:null,injuryPreview:null},
  {slotId:"battle",score:{criticalRatingStars:2.75,executionQuality:53.1,actualLengthMinutes:38},
   multi:{result:{injuries:[]}},tag:null,injuryPreview:null},
 ],
} as unknown as Input;
test("every match family generates factual non-AI ratings, time and injury records",()=>{
 const facts=deriveCompletedMatchReportFacts(projection);
 assert.deepEqual(facts.map(f=>[f.matchId,f.ratingStars,f.actualMinutes]),
  [["singles",4.25,17],["tag",3.25,24],["battle",2.75,38]]);
 assert.equal(facts[0]!.executionQuality,89.5);
 assert.deepEqual(facts[0]!.injuries,[{personId:"a",severity:"MINOR",weeksOut:2}]);
 assert.deepEqual(facts[1]!.injuries,[{personId:"c",severity:"MODERATE",weeksOut:3}]);
 assert.deepEqual(facts[2]!.injuries,[]);
});
test("one batch write persists all three bouts without per-match SQL",async()=>{
 let calls=0;
 const tx={
  async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
   calls++;
   assert.match(sql,/jsonb_to_recordset/);
   assert.match(sql,/RETURNING match_id/);
   assert.match(sql,/execution_quality/);
   assert.deepEqual(params.slice(0,2),["world","show"]);
   const rows=JSON.parse(String(params[2]));
   assert.equal(rows.length,3);
   assert.equal(rows[0].execution_quality,89.5);
   assert.deepEqual(rows[0].injuries_json,[{person_id:"a",
    injury_severity:"MINOR",injury_weeks_out:2}]);
   return rows.map((row:{match_id:string})=>({match_id:row.match_id})) as unknown as T[];
  },
 } as unknown as Parameters<typeof recordCompletedMatchReportFactsInTransaction>[0];
 await recordCompletedMatchReportFactsInTransaction(tx,projection);
 assert.equal(calls,1);
});
test("malformed medical details and invalid critical scores fail before writes",()=>{
 const invalid={...projection,projections:[{
  slotId:"bad",score:{criticalRatingStars:5.5,executionQuality:60,actualLengthMinutes:18},
  injuryPreview:{injuries:[]},
 }]} as unknown as Input;
 assert.throws(()=>deriveCompletedMatchReportFacts(invalid),/Invalid verified/);
 const badInjury={...projection,projections:[{
  slotId:"bad",score:{criticalRatingStars:3.25,executionQuality:60,actualLengthMinutes:18},
  injuryPreview:{injuries:[{personId:"a",severity:"UNKNOWN",weeksOut:1}]},
 }]} as unknown as Input;
 assert.throws(()=>deriveCompletedMatchReportFacts(badInjury),/Invalid completed/);
});
