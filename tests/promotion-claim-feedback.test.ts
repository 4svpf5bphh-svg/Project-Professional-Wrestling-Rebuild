import test from "node:test";
import assert from "node:assert/strict";
import {requireSuccessfulPromotionClaim} from "../src/web/promotion-claim-feedback.js";
test("an applied World command never means a refused takeover succeeded",()=>{
 assert.doesNotThrow(()=>requireSuccessfulPromotionClaim({
  status:"APPLIED",result:{claimed:true}}));
 assert.doesNotThrow(()=>requireSuccessfulPromotionClaim({
  status:"REPLAYED",result:{claimed:true}}));
 for(const reason of ["PROMOTION_TAKEN","PLAYER_HAS_PROMOTION","NOT_MEMBER"]){
  assert.throws(()=>requireSuccessfulPromotionClaim({
   status:"APPLIED",result:{claimed:false,reason}
  }),/promotion|manager|World/i);
 }
});
test("unknown/malformed/stale response cannot pass promotion ownership checks",()=>{
 for(const value of [
  null,{},{"status":"APPLIED"},{"status":"REPLAYED","result":{}},
  {"status":"REJECTED","result":{claimed:true}},
  {"status":"STALE","revision":3},
  {"status":"APPLIED","result":{claimed:false}},
 ])assert.throws(()=>requireSuccessfulPromotionClaim(value));
});
