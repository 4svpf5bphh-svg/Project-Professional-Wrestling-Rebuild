import test from "node:test";
import assert from "node:assert/strict";
import {projectRatingsWarWeek,type RatingsWarEpisode} from "../src/domain/ratings-war-settlement.js";
const e=(showId:string,promotionId:string,day:number,hour:number,
 householdRating:number,crowdResponse=80):RatingsWarEpisode=>({
 showId,promotionId,day,hour,householdRating,
 estimatedViewers:Math.round(householdRating*1_685_000/1000)*1000,crowdResponse
});
test("same-day same-hour television redistributes viewers without adding or losing them",()=>{
 const episodes=[e("a","a",5,20,3.2),e("b","b",5,20,2.5)];
 const out=projectRatingsWarWeek(episodes);
 assert.equal(out.length,2);
 assert.equal(out[0]!.opponents,1);
 assert.equal(out[1]!.opponents,1);
 assert.ok(out[0]!.change>0&&out[1]!.change<0);
 assert.equal(out[0]!.change,-out[1]!.change);
 assert.equal(Math.round((out[0]!.householdRating+out[1]!.householdRating)*10),57);
 assert.ok(out[0]!.estimatedViewers>episodes[0]!.estimatedViewers);
 assert.ok(out[1]!.estimatedViewers<episodes[1]!.estimatedViewers);
 assert.equal(JSON.stringify(episodes),JSON.stringify([e("a","a",5,20,3.2),e("b","b",5,20,2.5)]));
});
test("different days or network time windows are league rivals, not head-to-head",()=>{
 const episodes=[e("a","a",2,20,3.0),e("b","b",4,20,1.8),e("c","c",2,21,2.2)];
 const out=projectRatingsWarWeek(episodes);
 assert.ok(out.every(x=>x.change===0&&x.opponents===0));
 assert.deepEqual(projectRatingsWarWeek([...episodes].reverse()).sort((a,b)=>
  a.promotionId.localeCompare(b.promotionId)),out);
});
test("strong performers can win an even-airtime contest without promotion-order advantage",()=>{
 const list=[e("low","underdog",3,20,2.4,96),e("high","incumbent",3,20,2.5,57)];
 const result=projectRatingsWarWeek(list);
 assert.ok(result.find(x=>x.promotionId==="underdog")!.change>0);
 assert.ok(result.find(x=>x.promotionId==="incumbent")!.change<0);
 assert.deepEqual(projectRatingsWarWeek([...list].reverse()),result,
  "World show order does not change the certified audience contest");
});
test("same-slot ties, small local audiences and solo weekly events do not fabricate a battle",()=>{
 const tied=projectRatingsWarWeek([e("a","a",4,20,1.9),e("b","b",4,20,1.9)]);
 assert.ok(tied.every(x=>x.change===0&&x.opponents===1));
 const tiny=projectRatingsWarWeek([e("a","a",4,20,.2),e("b","b",4,20,1.9)]);
 assert.ok(tiny.every(x=>x.change===0));
 assert.deepEqual(projectRatingsWarWeek([e("solo","solo",7,18,2.9)])[0]!.change,0);
});
test("a crowded ratings night remains zero sum, capped and deterministic",()=>{
 const input=Array.from({length:12},(_,i)=>e("episode-"+i,"promotion-"+i,6,21,
  0.9+i*.3,52+i*3));
 const out=projectRatingsWarWeek(input);
 assert.equal(out.reduce((s,x)=>s+Math.round(x.change*10),0),0);
 for(const x of out){
  assert.ok(Math.abs(x.change)<=Math.floor(x.baseRating*2)/10);
  assert.equal(x.opponents,11);
  assert.ok(x.householdRating>=0);
 }
 assert.deepEqual(projectRatingsWarWeek([...input].reverse()),out);
});
test("malformed broadcasts, duplicate companies and unbounded worlds fail closed",()=>{
 assert.throws(()=>projectRatingsWarWeek([e("one","p",1,20,1),e("two","p",1,20,2)]),/Invalid/);
 assert.throws(()=>projectRatingsWarWeek([e("one","p",0,20,1)]),/Invalid/);
 assert.throws(()=>projectRatingsWarWeek([e("one","p",1,24,1)]),/Invalid/);
 assert.throws(()=>projectRatingsWarWeek([e("one","p",1,20,-1)]),/Invalid/);
 assert.throws(()=>projectRatingsWarWeek([e("one","p",1,20,1.55)]),/Invalid/);
 assert.throws(()=>projectRatingsWarWeek(Array.from({length:129},(_,i)=>
  e("s"+i,"p"+i,1,20,1))),/bounded/);
});
