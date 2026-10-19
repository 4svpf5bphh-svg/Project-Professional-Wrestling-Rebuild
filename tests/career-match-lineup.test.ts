import test from "node:test";
import assert from "node:assert/strict";
import {careerMatchLineup} from "../src/domain/career-match-lineup.js";
test("exact saved singles opponents, not inferred from wins or names",()=>{
 assert.deepEqual(careerMatchLineup([
  ["alice","Alice","A"],["bob","Bob","B"]],"alice"),
  {partners:[],opponents:["Bob"]});
 assert.deepEqual(careerMatchLineup([
  ["alice","Alice","A"],["bob","Bob","B"]],"bob"),
  {partners:[],opponents:["Alice"]});
});
test("verified tag partners and multi-team rivals retain original sides",()=>{
 const people=[["alice","Alice","A"],["partner","Partner","A"],
  ["bob","Bob","B"],["b","Bill","B"],["extra","Extra","C"],
  ["third","Third","C"]];
 assert.deepEqual(careerMatchLineup(people,"alice"),
  {partners:["Partner"],opponents:["Bob","Bill","Extra","Third"]});
 assert.deepEqual(careerMatchLineup(people,"extra"),
  {partners:["Third"],opponents:["Alice","Partner","Bob","Bill"]});
});
test("historical absence or corrupt lineups stay unknown, never guessed",()=>{
 const unknown={partners:null,opponents:null};
 assert.deepEqual(careerMatchLineup(null,"alice"),unknown);
 assert.deepEqual(careerMatchLineup([],"alice"),unknown);
 assert.deepEqual(careerMatchLineup([["bob","Bob","A"],
  ["carol","Carol","B"]],"alice"),unknown);
 assert.deepEqual(careerMatchLineup([["alice","Alice","A"],
  ["alice","Alice","B"]],"alice"),unknown);
 assert.deepEqual(careerMatchLineup([["alice","Alice","A"],
  ["bob","Bob",null]],"alice"),unknown);
 assert.deepEqual(careerMatchLineup(Array.from({length:31},(_,i)=>[
  "id-"+i,"Name "+i,String(i%2)]),"id-0"),unknown);
});
