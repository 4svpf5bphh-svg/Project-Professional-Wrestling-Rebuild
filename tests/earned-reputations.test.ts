
import test from "node:test";
import assert from "node:assert/strict";
import {earnedWrestlerReputations} from "../src/domain/earned-reputations.js";
const base={summary:{matches:0,tag:0,ratedMatches:0,averageStars:null as number|null,
 bestStars:null as number|null},recent:[] as {won:boolean;format:"SINGLES"|"TAG";stars:number|null}[],
 singlesTitles:[] as {defenses:number}[]};
test("reputations require multiple verified results, never one lucky bout",()=>{
 assert.deepEqual(earnedWrestlerReputations(base),[]);
 const card={summary:{matches:16,tag:0,ratedMatches:16,averageStars:3.9,bestStars:4.8},
  recent:Array.from({length:12},(_,i)=>({won:i%2===0,format:"SINGLES" as const,
   stars:i<2?4.2:3.8})),singlesTitles:[]};
 assert.deepEqual(earnedWrestlerReputations(card).map(x=>x.id),["BIG_MATCH_PERFORMER"]);
 assert.deepEqual(earnedWrestlerReputations({...card,summary:{...card.summary,
  averageStars:3.3}}),[]);
 assert.deepEqual(earnedWrestlerReputations({...card,recent:card.recent.map(x=>({
  ...x,stars:3.7}))}),[]);
});
test("tag identity and form change; championship pedigree remains earned",()=>{
 const card={summary:{matches:20,tag:15,ratedMatches:0,averageStars:null,bestStars:null},
  recent:Array.from({length:8},()=>({won:true,format:"TAG" as const,stars:null})),
  singlesTitles:[{defenses:2},{defenses:3}]};
 assert.deepEqual(earnedWrestlerReputations(card).map(x=>x.id),
  ["TAG_SPECIALIST","HOT_STREAK","CHAMPIONSHIP_VETERAN"]);
 assert.deepEqual(earnedWrestlerReputations({...card,recent:
  [{won:false,format:"SINGLES" as const,stars:null},...card.recent.slice(0,3),
   ...card.recent.slice(3).map(x=>({...x,format:"SINGLES" as const}))]}).map(x=>x.id),
  ["CHAMPIONSHIP_VETERAN"]);
});
