import test from "node:test";
import assert from "node:assert/strict";
import {rankEarnedContenders,type ContenderCandidate,
 type CertifiedContenderResult} from "../src/domain/earned-contenders.js";

const candidates:ContenderCandidate[]=[
 {id:"champ",name:"Champion",format:"SINGLES",division:"MEN",momentum:88,popularity:88},
 {id:"star",name:"Big Star",format:"SINGLES",division:"MEN",momentum:98,popularity:99},
 {id:"worker",name:"Rising Worker",format:"SINGLES",division:"MEN",momentum:54,popularity:43},
 {id:"struggler",name:"Lower Card",format:"SINGLES",division:"MEN",momentum:50,popularity:40},
 {id:"woman",name:"Women's Ace",format:"SINGLES",division:"WOMEN",momentum:70,popularity:71},
 {id:"team",name:"Tag Specialists",format:"TAG",division:"MEN",momentum:60,popularity:62},
 {id:"team2",name:"New Challengers",format:"TAG",division:"MEN",momentum:44,popularity:54}
];
const result=(id:string,won:boolean,weekIndex:number,
 rest:Partial<CertifiedContenderResult>={}):CertifiedContenderResult=>({
 id,won,weekIndex,format:"SINGLES",opponentStrength:55,ratingStars:3.3,
 titleMatch:false,majorEvent:false,...rest});
const board=(results:CertifiedContenderResult[],division:"MEN"|"WOMEN"="MEN")=>
 rankEarnedContenders({candidates,results,currentWeekIndex:30,
  format:"SINGLES",division,championId:"champ"});
test("recent verified wins outrank an unbooked celebrity; the champion cannot challenge themselves",()=>{
 const results=[result("worker",true,30,{opponentStrength:87,ratingStars:4.4,
   majorEvent:true}),result("worker",true,28,{opponentStrength:79}),
   result("star",false,30,{opponentStrength:40}),result("champ",true,30)];
 const contenders=board(results);
 assert.deepEqual(contenders.map(c=>c.id),["worker","star"]);
 assert.deepEqual(contenders[0]&&[contenders[0].wins,contenders[0].losses],[2,0]);
 assert.equal(contenders[0]?.rank,1);
 assert.equal(contenders[0]?.lastResultWeek,30);
 assert.equal(contenders.find(c=>c.id==="champ"),undefined);
 assert.deepEqual(board([...results].reverse()),contenders);
});
test("a documented major-event title victory helps; old form expires after 26 weeks",()=>{
 const latest=[result("worker",true,30,{titleMatch:true,majorEvent:true,
   ratingStars:4.6,opponentStrength:93}),
   result("struggler",true,1,{titleMatch:true,ratingStars:5,
    opponentStrength:100})];
 const contenders=board(latest);
 assert.deepEqual(contenders.map(c=>c.id),["worker"]);
 assert.equal(contenders[0]?.titleMatches,1);
 assert.equal(contenders[0]?.wins,1);
 assert.equal(board([]).length,0,"No results means no invented title contenders");
});
test("women's and tag divisions stay independent, team records require authentic team results",()=>{
 const results=[result("woman",true,29,{opponentStrength:60}),
  result("worker",true,29),result("team",true,30,{format:"TAG"}),
  result("team2",false,30,{format:"TAG"})];
 assert.deepEqual(board(results,"WOMEN").map(c=>c.id),["woman"]);
 const tags=rankEarnedContenders({candidates,results,currentWeekIndex:30,
   format:"TAG",division:"MEN"});
 assert.deepEqual(tags.map(c=>c.id),["team","team2"]);
 assert.ok(tags[0]!.score>tags[1]!.score);
});
test("reject forged scored facts and unbounded requests rather than fabricating rankings",()=>{
 assert.throws(()=>board([result("worker",true,30,{ratingStars:6})]),/Invalid/);
 assert.throws(()=>board([result("worker",true,30,{opponentStrength:110})]),/Invalid/);
 assert.throws(()=>rankEarnedContenders({candidates,results:[],currentWeekIndex:30,
  format:"SINGLES",division:"MEN",limit:100}),/Invalid/);
 assert.throws(()=>rankEarnedContenders({candidates:[candidates[0]!,candidates[0]!],
  results:[],currentWeekIndex:30,format:"SINGLES",division:"MEN"}),/Invalid/);
});
