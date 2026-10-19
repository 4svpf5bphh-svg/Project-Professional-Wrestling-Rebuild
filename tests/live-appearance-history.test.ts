import test from "node:test";
import assert from "node:assert/strict";
import {liveAppearanceStatus,MIN_RETURN_ABSENCE_WEEKS} from "../src/domain/live-appearance-history.js";
test("original live appearance states: 4 full weeks away, cross-year and truthful gaps",()=>{
 assert.equal(MIN_RETURN_ABSENCE_WEEKS,4);
 assert.equal(liveAppearanceStatus(true,null,20),"DEBUT_ELIGIBLE");
 assert.equal(liveAppearanceStatus(true,51,55),"RETURN_ELIGIBLE");
 assert.equal(liveAppearanceStatus(true,51,54),"ESTABLISHED");
 assert.equal(liveAppearanceStatus(true,0,0),"ESTABLISHED");
 assert.equal(liveAppearanceStatus(false,null,52),"UNKNOWN");
 assert.equal(liveAppearanceStatus(false,51,55),"UNKNOWN");
 assert.throws(()=>liveAppearanceStatus(true,53,52),/Invalid appearance history/);
});
