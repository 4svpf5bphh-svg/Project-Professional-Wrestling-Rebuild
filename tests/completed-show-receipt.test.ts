import test from "node:test";
import assert from "node:assert/strict";
import {validateCompletedShowReceipt,canonicalCompletedShowReceipt,
 type CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const receipt:CompletedShowReceipt={worldId:"w",promotionId:"p",showId:"s",
 year:1,week:2,resolutionId:"resolution-2",crowdResponse:73.4,
 matches:[{matchId:"m",position:0,crowdResponse:78,actualFinish:"CLEAN_PIN",
  actualWinnerSide:"A"}],
 segments:[{slotId:"angle",position:1,kind:"TURN",outcome:"REFUSED",
  crowdResponse:66}]};
test("completed show receipt preserves authored segment outcome",()=>{
 const r=validateCompletedShowReceipt(receipt);
 assert.equal(r.segments[0]!.outcome,"REFUSED");
 assert.equal(r.crowdResponse,73.4);
});
test("canonical retry payload ignores slot array order",()=>{
 const r={...receipt,matches:[...receipt.matches].reverse(),
  segments:[...receipt.segments].reverse()};
 assert.equal(canonicalCompletedShowReceipt(r),canonicalCompletedShowReceipt(receipt));
});
test("conflicting slot identities and positions fail closed",()=>{
 assert.throws(()=>validateCompletedShowReceipt({...receipt,
  segments:[{...receipt.segments[0]!,position:0}]}));
 assert.throws(()=>validateCompletedShowReceipt({...receipt,
  segments:[{...receipt.segments[0]!,slotId:"m"}]}));
});
test("invalid time and non-finite scores are rejected",()=>{
 assert.throws(()=>validateCompletedShowReceipt({...receipt,week:53}));
 assert.throws(()=>validateCompletedShowReceipt({...receipt,crowdResponse:NaN}));
 assert.throws(()=>validateCompletedShowReceipt({...receipt,matches:[
  {...receipt.matches[0]!,crowdResponse:Infinity}]}));
});
