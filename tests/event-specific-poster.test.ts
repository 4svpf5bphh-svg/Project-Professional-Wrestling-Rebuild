import test from "node:test";
import assert from "node:assert/strict";
import {validateKpAction} from "../src/db/kayfabe-points.js";
test("per-PPV poster choices are typed and reject unowned-style substitution",()=>{
 const set={kind:"SET_SERIES_EVENT_POSTER" as const,seriesId:"armageddon",
  sku:"POSTER_THUNDER_STRIKE" as const,requestId:"set-ppv-1"};
 assert.deepEqual(validateKpAction(set),set);
 const clear={kind:"CLEAR_SERIES_EVENT_POSTER" as const,seriesId:"armageddon",
  requestId:"clear-ppv-1"};
 assert.deepEqual(validateKpAction(clear),clear);
 assert.throws(()=>validateKpAction({...set,sku:"POSTER_FAKE" as never}),/Unknown animated/);
 assert.throws(()=>validateKpAction({...set,seriesId:""}),/Unknown premium/);
});
