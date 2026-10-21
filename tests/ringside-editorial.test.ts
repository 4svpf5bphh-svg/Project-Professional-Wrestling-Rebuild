import {test} from "node:test";
import assert from "node:assert/strict";
import {ringsideFacts,validateRingsideCopy,RINGSIDE_STYLE_GUIDE} from "../src/domain/ringside-editorial.js";
import type {CompletedShowView} from "../src/db/show-results-view.js";
const example:CompletedShowView={showId:"show-1",showName:"Omega Night",year:1,week:1,
 crowdResponse:83,matchCount:1,angleCount:1,entries:[
  {slotId:"match-1",position:0,type:"MATCH",headline:"Kenny Omega wins",
   summary:"Certified clean pin",outcome:"CLEAN_PIN",crowdResponse:88,actorIds:["omega","x"],targetIds:[],
   matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,sides:[["Kenny Omega"],["Opponent"]],
    winnerNames:["Kenny Omega"],championshipContested:false},
   fallout:{ratingStars:4.25,actualMinutes:17,injuries:[],eliminations:[]},
   performerIdentities:[{personId:"omega",ringName:"Kenny Omega",character:"THE CLEANER",
    style:"ALL_ROUNDER",signatureMoves:["V-Trigger","Snap Dragon Suplex"],
    finishingMoves:["One Winged Angel"],source:"WORLD_RECORD"}]},
  {slotId:"angle-1",position:1,type:"SEGMENT",headline:"A challenge",
   summary:"A challenge happened",outcome:"HAPPENS",crowdResponse:78,
   actorIds:[],targetIds:[],segmentKind:"PROMO"}
 ]};
const valid={showHeadline:"A proper closer",opening:"The audience arrived ready.",
 closing:"An excellent night with a few rough edges.",
 slots:[{slotId:"match-1",headline:"Omega prevails",recap:"A V-Trigger opens the door to the One Winged Angel and a clean pin."},
 {slotId:"angle-1",headline:"The challenge",recap:"The speech left the crowd wanting an answer."}]};
test("facts include all ordered, verified results, moves and certified rating",()=>{
 const packet=ringsideFacts(example);assert.equal(packet.slots.length,2);
 assert.equal(packet.slots[0]?.match?.winnerNames[0],"Kenny Omega");
 assert.equal(packet.slots[0]?.wrestlers[0]?.finishers[0],"One Winged Angel");
 assert.equal(packet.slots[0]?.fallout?.ratingStars,4.25);
});
test("Ringside admits creative wrestling spots but never changes slot ordering",()=>{
 assert.equal(validateRingsideCopy(valid,example).slots.length,2);
 assert.match(RINGSIDE_STYLE_GUIDE,/FLASH_PIN/);
 assert.throws(()=>validateRingsideCopy({...valid,slots:[...valid.slots].reverse()},example));
 assert.throws(()=>validateRingsideCopy({...valid,slots:[{...valid.slots[0],slotId:"forged"},valid.slots[1]]},example));
 assert.throws(()=>validateRingsideCopy({...valid,slots:[valid.slots[0]]},example));
 assert.throws(()=>validateRingsideCopy({...valid,slots:[{...valid.slots[0],recap:"<script>"},valid.slots[1]]},example));
});
test("Move ownership is protected across the whole show",()=>{
 const wrong={...valid,slots:[valid.slots[0],{...valid.slots[1],recap:"The One Winged Angel ended the promo."}]};
 assert.throws(()=>validateRingsideCopy(wrong,example),/unowned/);
});
