import test from "node:test";
import assert from "node:assert/strict";
import {assembleArchivedShowResolution}
 from "../src/simulation/assemble-archived-show-resolution.js";
const projection={worldId:"w",promotionId:"p",showId:"s",year:1,week:1,
 projections:[{slotId:"m",position:0,winnerId:"a",personIds:["a","b"],
  plannedFinish:"CLEAN_PIN",
  injuryPreview:{plannedWinnerId:"a",actualWinnerId:"a",
   injuryStoppage:false,injuries:[]},
  interferencePreview:{plannedWinnerId:"a",actualWinnerId:"a",
   plannedFinish:"CLEAN_PIN",actualFinish:"CLEAN_PIN",
   injuryStoppage:false,crowdResponse:80,interference:null}}]};
const segment={segment:{slotId:"angle",position:1,kind:"DEBUT",
 actorIds:["c"],targetIds:[],outcome:"HAPPENS"},
 performers:[{personId:"c",popularity:60,presentation:70,momentum:50}],
 storylineHeat:50,repetitionCount:0};
test("full card produces match, segment, weighted show and evidence",()=>{
 const x=assembleArchivedShowResolution(projection as never,[segment] as never,"resolve-1");
 assert.equal(x.receipt.matches.length,1);
 assert.equal(x.receipt.segments.length,1);
 assert.equal(x.receipt.segments[0]!.outcome,"HAPPENS");
 assert.equal(x.evidence.length,1);
 assert.ok(x.receipt.crowdResponse>0&&x.receipt.crowdResponse<100);
});
test("cross-type duplicate slot or position fails before persistence",()=>{
 assert.throws(()=>assembleArchivedShowResolution(projection as never,
  [{...segment,segment:{...segment.segment,position:0}}] as never,"r"),/Duplicate show slot/);
 assert.throws(()=>assembleArchivedShowResolution(projection as never,
  [{...segment,segment:{...segment.segment,slotId:"m"}}] as never,"r"),/Duplicate show slot/);
});
test("invalid resolver identifier cannot complete a show",()=>{
 assert.throws(()=>assembleArchivedShowResolution(projection as never,[],""),/identifier/);
});
