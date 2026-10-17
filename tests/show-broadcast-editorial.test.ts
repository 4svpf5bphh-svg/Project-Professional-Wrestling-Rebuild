import test from "node:test";
import assert from "node:assert/strict";
import {writeFinalBellEditorial} from "../src/domain/show-broadcast-editorial.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
const base={position:0,crowdResponse:87,actorIds:[],targetIds:[]};
const match=(slotId:string,stars:number,crowd:number):ShowResultEntry=>({
 ...base,slotId,type:"MATCH",headline:"Bout",summary:"Clean win",
 crowdResponse:crowd,outcome:"CLEAN_PIN",
 matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
  sides:[["A"],["B"]],winnerNames:["A"],championshipContested:false},
 fallout:{ratingStars:stars,actualMinutes:19,injuries:[],eliminations:[]},
});
const show=(entries:ShowResultEntry[]):CompletedShowView=>({
 showId:"show",year:2,week:16,crowdResponse:77,entries,
 matchCount:entries.filter(x=>x.type==="MATCH").length,
 angleCount:entries.filter(x=>x.type==="SEGMENT").length,
});
test("final bell uses critical match ratings, not crowd noise, for the standout",()=>{
 const result=writeFinalBellEditorial(show([
  match("loud",2.5,95),match("best",4.5,61),
 ]));
 assert.equal(result.standoutSlotId,"best");
 assert.equal(result.averageCriticalRating,3.5);
 assert.match(result.paragraphs.join(" "),/highest-rated match/i);
 assert.match(result.paragraphs.join(" "),/4\.50\/5/);
 assert.equal(result.paragraphs.length,3);
 assert.deepEqual(writeFinalBellEditorial(show([
  match("loud",2.5,95),match("best",4.5,61)])),result);
});
test("honours a verified belt change and medical incident but never invents an angle",()=>{
 const a=match("title",3.5,70);
 a.fallout!.title={name:"World Title",changed:true,
  winnerName:"A",priorHolderName:"B"};
 a.fallout!.injuries=[{personName:"B",severity:"MAJOR",weeksOut:7,stoppage:false}];
 const refused:ShowResultEntry={...base,slotId:"angle",type:"SEGMENT",
  crowdResponse:91,headline:"Attack",summary:"Refused",outcome:"REFUSED"};
 const result=writeFinalBellEditorial(show([a,refused]));
 assert.match(result.headline,/Gold changes hands/);
 assert.equal(result.championshipChanges,1);
 assert.equal(result.injuryReports,1);
 assert.match(result.paragraphs.join(" "),/A won the World Title/);
 assert.doesNotMatch(result.paragraphs.join(" "),/2 authored angles|1 authored angle went ahead/);
});
test("legacy unrated matches and empty cards do not gain fictitious stars",()=>{
 const old=match("old",2,62);delete old.fallout;
 const result=writeFinalBellEditorial(show([old]));
 assert.equal(result.averageCriticalRating,null);
 assert.match(result.paragraphs[1]!,/crowd's standout/i);
 assert.doesNotMatch(result.paragraphs.join(" "),/official match rating was/i);
 const none=writeFinalBellEditorial(show([]));
 assert.equal(none.standoutSlotId,null);
 assert.equal(none.championshipChanges,0);
 assert.equal(none.paragraphs.length,1);
});
