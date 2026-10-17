
import test from "node:test";
import assert from "node:assert/strict";
import {showBroadcastHighlights} from "../src/domain/show-broadcast-highlights.js";
import {describeMatchFinish} from "../src/domain/show-match-story.js";
import type {ShowResultEntry} from "../src/db/show-results-view.js";
const base={position:0,crowdResponse:75,actorIds:[],targetIds:[]};
test("broadcast highlights respect scripted refusals and show only actual turns",()=>{
 const entries:ShowResultEntry[]=[
  {...base,slotId:"match",type:"MATCH",headline:"Main event",summary:"Pinfall",
   outcome:"CLEAN_PIN",position:0},
  {...base,slotId:"refused",type:"SEGMENT",headline:"Attack",summary:"Does not happen",
   intent:null,outcome:"REFUSED",position:1,crowdResponse:100},
  {...base,slotId:"turn",type:"SEGMENT",headline:"Heel turn",
   summary:"Star turns heel",intent:"TURN_OCCURRED",outcome:"HAPPENS",
   position:2,crowdResponse:88},
 ];
 assert.deepEqual(showBroadcastHighlights(entries).map(x=>x.slotId),["turn","match"]);
 assert.equal(showBroadcastHighlights(entries,1).length,1);
});
test("winner and medically stopped match descriptions use verified finish",()=>{
 const pin=describeMatchFinish({actualFinish:"CLEAN_PIN",actualWinnerSide:"A",
  winnerNames:["Wrestler A"],participants:["Wrestler A","Wrestler B"]});
 assert.match(pin.summary,/clean pinfall/);
 const injury=describeMatchFinish({actualFinish:"INJURY_STOPPAGE",
  actualWinnerSide:null,winnerNames:[],participants:["A","B"]});
 assert.match(injury.summary,/stopped because of an injury/);
 assert.doesNotMatch(injury.summary,/winner/);
});
