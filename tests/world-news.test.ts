import test from "node:test";
import assert from "node:assert/strict";
import {chooseWeeklyAwards,composeWorldNews,composeTournamentVictory,type TournamentFinal} from "../src/db/world-news.js";
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
 assert.equal(new Set(out.map(x=>x.key)).size,out.length,
  "Official stories and speculation need distinct durable IDs");
 assert.ok(out.filter(x=>x.desk==="OFFICIAL").every(x=>x.certainty==="CONFIRMED"));
 assert.ok(rumour.some(x=>/not been established|has not been corroborated|not been independently verified/i.test(x.summary)));
 assert.ok(out.some(x=>/replay queue/.test(x.summary)));
 assert.ok(out.every(x=>!x.summary.includes("/100")),
  "The newspaper should not sound like a dashboard or disclose sim scales");
 assert.ok(!JSON.stringify(out).includes("NEVER LEAK"));
 assert.ok(!JSON.stringify(out).includes("REFUSED"));
});

const verifiedCup: TournamentFinal={
 ...pub("s1","human",84),
 tournament_id:"cup-2026",tournament_name:"King's Crown",
 division:"MEN",winner_name:"Alice",winner_person_id:"a",entrants_count:8,
 slot_id:"m1",final_rating_stars:4.6,series_years:[3,2,1],prior_editions:2
};
test("certified tournament victory is Official News and three earned years define annual tradition",()=>{
 const proof=composeTournamentVictory(verifiedCup);
 assert.match(proof.title,/Alice wins King's Crown at Fight Night/);
 assert.match(proof.summary,/three consecutive World seasons/);
 assert.match(proof.summary,/4\.60 verified stars/);
 const news=composeWorldNews([],[],[pub("s1","human")],[],names,[verifiedCup]);
 const trophy=news.find(n=>n.key==="tournament:cup-2026");
 assert.equal(trophy?.sourceKind,"EVENT");
 assert.equal(trophy?.desk,"OFFICIAL");
 assert.equal(trophy?.certainty,"CONFIRMED");
 assert.equal(news.filter(n=>n.sourceKind==="EVENT"&&n.desk==="OFFICIAL").length,1,
  "Official tournament history must not treat online gossip as certified");
 assert.equal(new Set(news.map(n=>n.key)).size,news.length);
 assert.ok(!JSON.stringify(news).includes("NEVER LEAK"));
});
test("repeated cup in one year, gaps, cancellations or missing ratings never invent annual prestige",()=>{
 const sameSeason=composeTournamentVictory({...verifiedCup,
  series_years:[1,1,1],prior_editions:2,final_rating_stars:null});
 assert.doesNotMatch(sameSeason.summary,/consecutive World seasons/);
 assert.doesNotMatch(sameSeason.summary,/stars/);
 const gaps=composeTournamentVictory({...verifiedCup,
  series_years:[1,3,5],prior_editions:2});
 assert.doesNotMatch(gaps.summary,/consecutive World seasons/);
 const first=composeTournamentVictory({...verifiedCup,series_years:[1],
  prior_editions:0,entrants_count:4,division:"WOMEN",
  final_rating_stars:NaN});
 assert.match(first.summary,/four-wrestler|4-wrestler/);
 assert.match(first.summary,/women's bracket/);
 assert.doesNotMatch(first.summary,/stars/);
 const rest=composeWorldNews([],[],[],[],names);
 assert.deepEqual(rest,[]);
});

test("prospect dirt-sheet speculation is grounded in a completed standout match, never a confidential push",()=>{
 const stages=new Map([["a","PROSPECT"]]);
 const stories=composeWorldNews([{...b1,rating_stars:4.8}],[],[],[],names,[],stages);
 const rumour=stories.find(s=>s.key.startsWith("rumour:breakout:"));
 assert.equal(rumour?.desk,"DIRT");
 assert.equal(rumour?.certainty,"SPECULATION");
 assert.match(rumour?.title??"",/Alice/);
 assert.match(rumour?.summary??"",/question, not an announced plan/);
 assert.ok(!JSON.stringify(stories).includes("NEVER LEAK"));
 assert.ok(!JSON.stringify(stories).includes("private"));
 const cold=composeWorldNews([{...b1,rating_stars:3.0}],[],[],[],names,[],stages);
 assert.equal(cold.filter(s=>s.desk==="DIRT").length,0);
});
test("certified title transfers announce the recorded winner, but not invented first champions",()=>{
 const singles={...pub("s1","human"),slot_id:"m1",title_name:"World Crown",
  winner_name:"Alice",prior_reign_id:"prior"};
 const vacant={...pub("s2","ai"),slot_id:"m2",title_name:"Women's World",
  winner_name:"Cara",prior_reign_id:null};
 const teams={...pub("s2","ai"),slot_id:"m3",title_name:"Tag Gold",
  winner_name:"The Wolves",prior_reign_id:"old"};
 const stories=composeWorldNews([],[],[],[singles,vacant,teams],names)
  .filter(s=>s.sourceKind==="TITLE");
 assert.equal(stories.length,3);
 assert.ok(stories.some(s=>/Alice captures World Crown/.test(s.title)));
 assert.ok(stories.some(s=>/Cara captures Women's World/.test(s.title)&&
  /title was vacant/.test(s.summary)));
 assert.ok(stories.some(s=>/The Wolves captures Tag Gold/.test(s.title)));
 assert.ok(stories.every(s=>s.certainty==="CONFIRMED"));
 assert.ok(stories.every(s=>!/first champion|inaugural/i.test(s.summary)));
 const unknown=composeWorldNews([],[],[],[
  {...singles,winner_name:null}],names)[0]!;
 assert.match(unknown.summary,/unidentified winner is not guessed/);
});
test("a certified exceptional bout spotlights a real prospect without claiming a solo victory",()=>{
 const stages=new Map([["a","PROSPECT"],["c","VETERAN"]]);
 const match={...b1,rating_stars:4.7};
 const hit=composeWorldNews([match],[],[],[],names,[],stages)[0]!;
 assert.match(hit.title,/Alice in the spotlight/);
 assert.match(hit.summary,/Prospect Alice was part of Alice vs Bob/);
 assert.match(hit.summary,/stars belong to the match/);
 assert.doesNotMatch(hit.summary,/wins|won|signed|improved skills/i);
 assert.doesNotMatch(composeWorldNews([{...match,rating_stars:4.0}],
  [],[],[],names,[],stages)[0]!.title,/Alice in the spotlight/);
 assert.doesNotMatch(composeWorldNews([match],[],[],[],names)[0]!.title,/Alice in the spotlight/);
});

test("one completely invented and explicitly unverified rumour complements a real week, never becoming World truth",()=>{
 const verified=[pub("s1","human",80),pub("s2","ai",90)];
 const stories=composeWorldNews([b1,b2],angles,verified,[],names);
 const wild=stories.find(x=>x.key.startsWith("wild:"));
 assert.equal(wild?.certainty,"SPECULATION");
 assert.equal(wild?.desk,"DIRT");
 assert.ok(wild?.title);
 assert.match(wild?.summary??"",
  /no independently verified|no verified backstage|no release request|no evidence|no booking refusal|no evidence|no confrontation|no backstage incident|no one has established|no booking|no one independently/i);
 assert.equal(stories.filter(x=>x.desk==="DIRT").length,2,
  "At most one result-anchored report and one explicitly disputed tabloid claim per World week");
 assert.ok(!JSON.stringify(stories).includes("NEVER LEAK"));
 assert.ok(!JSON.stringify(stories).includes("privatePromise"));
 assert.deepEqual(composeWorldNews([b2,b1],angles.slice().reverse(),
  verified.slice().reverse(),[],names),stories,
  "Story selection and identity are independent of SQL row ordering");
 const empty=composeWorldNews([],[],[],[],names);
 assert.deepEqual(empty,[],"No show means no invented actual event or gossip");
 const only=composeWorldNews([],[],[pub("s1","human",80)],[],names);
 assert.equal(only.filter(x=>x.desk==="DIRT").length,1,
  "Entirely speculative wrestling gossip is possible from a certified broadcast");
 assert.ok(only.every(x=>x.certainty!=="CONFIRMED"||x.desk==="OFFICIAL"));
});

test("dirt sheet reporting remains event-linked, authored only at certification and contains no confidential data",()=>{
 const publicShows=[pub("s1","human",88),pub("s2","ai",79)];
 const title={...pub("s1","human"),slot_id:"m1",title_name:"World Title",
  winner_name:"Alice",prior_reign_id:"previous"};
 const out=composeWorldNews([b1],angles,publicShows,[title],names);
 const dirt=out.filter(x=>x.desk==="DIRT");
 assert.equal(dirt.length,2);
 assert.ok(dirt.some(x=>x.key.startsWith("rumour:title:")));
 assert.ok(dirt.every(x=>x.certainty==="SPECULATION"));
 assert.ok(dirt.every(x=>/anonymous|alleg|whisper|account|insider|claim/i.test(x.summary)));
 assert.ok(dirt.every(x=>/not|no |never|disagree|denie|doubt|dispute|unverified|question/i.test(x.summary)));
 assert.ok(!/NEVER LEAK|privatePromise|HIDDEN CONTRACT/i.test(JSON.stringify(out)));
 assert.ok(!/wellness violation|drug test|failed drug|criminal|arrested/i.test(JSON.stringify(out)));
 assert.deepEqual(out,composeWorldNews([b1],angles,publicShows,[title],names));
});
