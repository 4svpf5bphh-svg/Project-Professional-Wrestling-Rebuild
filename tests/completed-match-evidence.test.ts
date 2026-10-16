import test from "node:test";
import assert from "node:assert/strict";
import {validateCompletedMatchEvidence,type CompletedMatchEvidence}
 from "../src/domain/completed-match-evidence.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const receipt:CompletedShowReceipt={worldId:"w",promotionId:"p",showId:"s",
 year:1,week:1,resolutionId:"r",crowdResponse:70,
 matches:[{matchId:"m",position:0,crowdResponse:70,
  actualWinnerSide:"B",actualFinish:"INJURY_STOPPAGE"}],segments:[]};
const evidence:CompletedMatchEvidence={matchId:"m",
 booking:{participants:["a","b"],scriptedWinner:"a",plannedFinish:"CLEAN_PIN"},
 resolution:{actualWinner:"b",actualFinish:"INJURY_STOPPAGE",
  medical:{injuredPersonId:"a",severity:"MAJOR",stoppage:true}}};
test("matching medical evidence validates completed result",()=>{
 assert.doesNotThrow(()=>validateCompletedMatchEvidence(receipt,[evidence]));
});
test("missing, duplicate and contradictory evidence are rejected",()=>{
 assert.throws(()=>validateCompletedMatchEvidence(receipt,[evidence,evidence]),/Duplicate/);
 assert.throws(()=>validateCompletedMatchEvidence(receipt,[{...evidence,matchId:"other"}]),/unknown/);
 assert.throws(()=>validateCompletedMatchEvidence({...receipt,
  matches:[{...receipt.matches[0]!,actualWinnerSide:"A"}]},[evidence]),/contradicts/);
});
