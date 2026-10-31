import test from "node:test";
import assert from "node:assert/strict";
import {rumourFollowup,rumourCaseVeracity,type Veracity} from "../src/domain/wrestling-rumour-cases.js";
const facts={case_key:"rumour:s1",origin_week_index:12,last_followup_week_index:null,
 chapter:0,promotion_id:"p1",promotion_name:"CWA",show_id:"s1",headline:"Title-loss rumours"};
test("rumour continuity gives fiction, distortion and genuine fictional backstage tension separate outcomes",()=>{
 for(const veracity of ["SUBSTANTIATED","DISTORTED","FABRICATED"] as Veracity[]){
  const early=rumourFollowup({...facts,veracity},1,14);
  const late=rumourFollowup({...facts,chapter:1,veracity},1,16);
  assert.equal(early.desk,"DIRT");assert.equal(early.certainty,"SPECULATION");
  assert.equal(early.promotionId,"p1");assert.notEqual(early.title,late.title);
  assert.ok(late.summary.length<=600);
  assert.ok(!JSON.stringify([early,late]).includes("private"));
 }
 assert.equal(rumourCaseVeracity("case"),rumourCaseVeracity("case"));
 assert.match(rumourFollowup({...facts,chapter:1,veracity:"FABRICATED"},1,16).summary,/withdrawn/);
});
