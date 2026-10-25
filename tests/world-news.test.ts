import test from "node:test";
import assert from "node:assert/strict";
import {chooseWeeklyAwards,composeWorldNews} from "../src/db/world-news.js";
const names=new Map([["a","Alice"],["b","Bob"],["c","Cara"],["d","Drew"]]);
const pub=(show_id:string,promotion_id:string,crowd_response=86)=>({
 show_id,promotion_id,promotion_name:promotion_id==="human"?"Human Pro":"AI Elite",
 show_name:show_id==="s1"?"Fight Night":"Final Clash",
 crowd_response,booking_class:"REGULAR"
});
const payload=(a:string,b:string)=>({matchType:"SINGLES",
 participants:[{personId:a,contractId:"contract-"+a},
 {personId:b,contractId:"contract-"+b}],scriptedWinner:a,
 secretInstruction:"NEVER LEAK PRIVATE WINNER"});
const b1={...pub("s1","human"),slot_id:"m1",position:2,
 rating_stars:4.5,match_crowd:80,payload:payload("a","b")};
const b2={...pub("s2","ai"),slot_id:"m2",position:1,
 rating_stars:4.5,match_crowd:91,payload:payload("c","d")};
const angles=[{...pub("s1","human"),slot_id:"angle1",position:1,
 kind:"TURN",authored_outcome:"HAPPENS",angle_crowd:85,
 story_json:{actorIds:["a"],targetIds:["b"],privatePromise:"NEVER LEAK PRIVATE PROMISE"}},
 {...pub("s2","ai"),slot_id:"angle2",position:3,
 kind:"ATTACK",authored_outcome:"HAPPENS",angle_crowd:95,
 story_json:{actorIds:["c"],targetIds:["d"]}},
 {...pub("s2","ai"),slot_id:"angle3",position:5,
 kind:"TURN",authored_outcome:"REFUSED",angle_crowd:100,
 story_json:{actorIds:["d"],targetIds:["c"]}}];
test("world-wide awards prefer verified stars and executed angle reception across human and AI",()=>{
 const awards=chooseWeeklyAwards([b1,b2],angles,names);
 assert.equal(awards.length,2);
 assert.deepEqual(awards.map(x=>x.promotionId),["ai","ai"]);
 assert.equal(awards[0]!.title,"Cara vs Drew");
 assert.equal(awards[0]!.rating,4.5);
 assert.equal(awards[1]!.ratingUnit,"CROWD");
 assert.equal(awards[1]!.title,"Cara · Drew — Attack");
 assert.equal(chooseWeeklyAwards([b2,b1],angles.slice().reverse(),names)[0]!.slotId,"m2");
 const fallback=chooseWeeklyAwards([{...b1,rating_stars:null}],[],names);
 assert.deepEqual(fallback,[]);
});
test("deterministic tie-breaks never depend on insert order or author identities",()=>{
 const equal={...b2,match_crowd:80};
 assert.equal(chooseWeeklyAwards([equal,b1],[],names)[0]!.promotionId,"ai");
 assert.equal(chooseWeeklyAwards([b1,equal],[],names)[0]!.promotionId,"ai");
 const audience=angles.map(a=>({...a,angle_crowd:86}));
 assert.equal(chooseWeeklyAwards([],audience,names)[0]!.slotId,"angle1");
});
test("official stories describe events while dirt sheet claims remain explicitly speculative",()=>{
 const shows=[pub("s1","human",38),pub("s2","ai",90)];
 const out=composeWorldNews([b1,b2],angles,shows,[],names);
 assert.ok(out.some(x=>x.desk==="OFFICIAL"&&x.sourceKind==="MATCH"));
 assert.ok(out.some(x=>x.desk==="OFFICIAL"&&x.sourceKind==="ANGLE"));
 const rumour=out.filter(x=>x.desk==="DIRT");
 assert.ok(rumour.length>0);
 assert.ok(rumour.every(x=>x.certainty==="SPECULATION"));
 assert.ok(out.filter(x=>x.desk==="OFFICIAL").every(x=>x.certainty==="CONFIRMED"));
 assert.ok(rumour.some(x=>/not a report from backstage/.test(x.summary)));
 assert.ok(!JSON.stringify(out).includes("NEVER LEAK"));
 assert.ok(!JSON.stringify(out).includes("REFUSED"));
});
