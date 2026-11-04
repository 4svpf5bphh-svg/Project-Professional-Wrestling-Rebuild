import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch} from "../src/ui/card-editor-model.js";
import {newEditorSegment} from "../src/ui/card-segment-model.js";
import {forecastBookingAirtime} from "../src/ui/card-airtime-preview.js";
test("new match and angle previews include one proposed slot without changing the card",()=>{
 const first={...newEditorMatch("first","SINGLES"),plannedLengthMinutes:60};
 const extra={...newEditorSegment("extra","PROMO"),durationMinutes:12};
 const proposed={...newEditorMatch("new","TAG"),plannedLengthMinutes:40};
 assert.deepEqual(forecastBookingAirtime("new",proposed,[first],[extra],"REGULAR"),
  {total:112,limit:120,overBy:0,remaining:8});
 assert.deepEqual(forecastBookingAirtime("extra",extra,[first,proposed],
  [extra],"REGULAR"),{total:112,limit:120,overBy:0,remaining:8},
  "An already committed slot must not count twice when reopened");
});
test("review warns on exact TV overrun, while premium events have no imposed TV cap",()=>{
 const first={...newEditorMatch("first","SINGLES"),plannedLengthMinutes:90};
 const proposed={...newEditorSegment("angle","ATTACK"),durationMinutes:35};
 assert.deepEqual(forecastBookingAirtime("angle",proposed,[first],[],
  "REGULAR"),{total:125,limit:120,overBy:5,remaining:0});
 assert.deepEqual(forecastBookingAirtime("angle",proposed,[first],[],
  "PREMIUM"),{total:125,limit:null,overBy:0,remaining:null});
});
