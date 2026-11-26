import test from "node:test";
import assert from "node:assert/strict";
import {
 publicRumourDevelopment,rumourFollowup,rumourCaseVeracity,type RumourCase,type Veracity
} from "../src/domain/wrestling-rumour-cases.js";
import type {WorldNewsStory} from "../src/db/world-news.js";

const origin:RumourCase={
 case_key:"rumour:title:s1:main",origin_week_index:12,last_followup_week_index:null,
 chapter:0,veracity:"DISTORTED",promotion_id:"p1",promotion_name:"CWA",
 show_id:"s1",headline:"How far will Alice Reed take the champion's entrance?"
};
const development:WorldNewsStory={
 key:"title:s2:main",desk:"OFFICIAL",certainty:"CONFIRMED",
 promotionId:"p1",promotionName:"CWA",showId:"s2",sourceKind:"TITLE",
 title:"Bob Ward captures the World Title at Final Clash",summary:"That ends Alice Reed's reign."
};

test("rumour follow-through needs a public development about the same wrestler and promotion",()=>{
 assert.equal(publicRumourDevelopment(origin,[development]),development);
 for(const other of [
  {...development,showId:"s1"},
  {...development,promotionId:"p2"},
  {...development,summary:"That ends Alice Jones's reign."},
  {...development,desk:"DIRT" as const},
  {...development,sourceKind:"EVENT" as const}
 ])assert.equal(publicRumourDevelopment(origin,[other]),undefined);
 assert.equal(publicRumourDevelopment({...origin,case_key:"wild:s1"},[development]),undefined);
});

test("rumour updates cite the public headline and keep the earlier premise speculative",()=>{
 for(const veracity of ["SUBSTANTIATED","DISTORTED","FABRICATED"] as Veracity[]){
  const early=rumourFollowup({...origin,veracity},1,14,development);
  const late=rumourFollowup({...origin,chapter:1,veracity},1,16,development);
  assert.equal(early.desk,"DIRT");
  assert.equal(early.certainty,"SPECULATION");
  assert.equal(early.promotionId,"p1");
  assert.equal(early.showId,"s2");
  assert.notEqual(early.title,late.title);
  assert.ok(late.summary.length<=600&&late.summary.includes(development.title));
 }
 assert.equal(rumourCaseVeracity("case"),rumourCaseVeracity("case"));
 assert.match(rumourFollowup({...origin,chapter:1,veracity:"FABRICATED"},1,16,development).summary,/retiring its earlier theory/);
});
