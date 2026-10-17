import {test} from "node:test";
import {strict as assert} from "node:assert";
import {showCrowdFlow} from "../src/domain/show-crowd-flow.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
const row=(id:string,position:number,score:number,kind:"MATCH"|"SEGMENT"="MATCH"):
 ShowResultEntry=>({slotId:id,position,type:kind,crowdResponse:score,
 headline:"Result "+id,summary:"Official verdict",outcome:"CLEAN_PIN",
 actorIds:[],targetIds:[]});
const show=(entries:ShowResultEntry[]):CompletedShowView=>({
 showId:"show",year:1,week:2,crowdResponse:77,
 matchCount:entries.filter(x=>x.type==="MATCH").length,
 angleCount:entries.filter(x=>x.type==="SEGMENT").length,entries,
});
test("crowd flow follows published slot positions and preserves match/angle distinction",()=>{
 const flow=showCrowdFlow(show([row("late",3,43),row("early",0,91,"SEGMENT"),
  row("middle",1,76)]));
 assert.deepEqual(flow.map(x=>x.slotId),["early","middle","late"]);
 assert.deepEqual(flow.map(x=>x.crowdResponse),[91,76,43]);
 assert.deepEqual(flow.map(x=>x.kind),["SEGMENT","MATCH","MATCH"]);
 assert.deepEqual(flow.map(x=>x.standout),[true,false,false]);
 assert.deepEqual(flow.map(x=>x.cold),[false,false,true]);
});
test("tie peak chooses first actual card entry and never rewrites results",()=>{
 const data=show([row("x",1,90),row("y",0,90)]);
 assert.equal(showCrowdFlow(data).find(x=>x.standout)?.slotId,"y");
 assert.equal(data.entries[0]!.slotId,"x");
 assert.deepEqual(showCrowdFlow(show([])),[]);
});
test("invalid or duplicate published scores cannot generate invented chart points",()=>{
 const valid=row("x",0,50);
 for(const list of [[valid,{...valid}],[valid,{...valid,slotId:"different"}],
  [{...valid,crowdResponse:NaN}],[{...valid,crowdResponse:101}],
  [{...valid,crowdResponse:-1}],[{...valid,position:-1}]]){
  assert.throws(()=>showCrowdFlow(show(list)),/Invalid completed crowd flow/);
 }
 assert.throws(()=>showCrowdFlow(show(Array.from({length:101},
  (_,i)=>row("x"+i,i,75)))),/slot bound/);
});
