import test from "node:test";
import assert from "node:assert/strict";
import {recordedCareerHighlights} from "../src/domain/recorded-career-highlights.js";
const career={status:"ACTIVE",careerStage:"PRIME",summary:{matches:32,wins:20},
 currentChampionships:[{name:"Women's World",promotion:"Crown",startWeekIndex:56,
  defenses:2,holderType:"PERSON" as const,teamName:null}],
 singlesTitles:[{name:"TV Title",promotion:"Crown",startWeekIndex:5,
  endedWeekIndex:31,defenses:4}]};
test("spotlight only real reigning and historically defended belts",()=>{
 const found=recordedCareerHighlights(career);
 assert.deepEqual(found.map(x=>x.headline),[
  "Reigning singles champion","A title reign worth remembering"]);
 assert.match(found[0]!.detail,/Y2 W5 · 2 recorded defences/);
 assert.match(found[1]!.detail,/4 verified defences/);
 assert.ok(!JSON.stringify(found).includes("first title"));
 assert.deepEqual(recordedCareerHighlights({...career,currentChampionships:[],
  singlesTitles:[]}),[]);
});
test("retirement and special attraction are existing recorded states, not unlocks",()=>{
 const found=recordedCareerHighlights({...career,status:"RETIRED",
  careerStage:"SPECIAL_ATTRACTION",currentChampionships:[]});
 assert.equal(found[0]!.headline,"The final bell");
 assert.match(found[0]!.detail,/32 documented bouts/);
 assert.equal(found[2]!.headline,"Special attraction");
 assert.match(found[2]!.detail,/does not grant/);
 assert.equal(recordedCareerHighlights({...career,currentChampionships:[
  {...career.currentChampionships[0]!,startWeekIndex:-1}],
  singlesTitles:[]}).length,0);
});
