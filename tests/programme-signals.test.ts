import test from "node:test";
import assert from "node:assert/strict";
import {evaluateProgrammeSignals} from "../src/domain/programme-signals.js";
const a=(weekIndex:number,signature="SEGMENT:a|b",impact=80)=>({
 programmeId:"feud",weekIndex,signature,impact});
test("original heat/repetition uses recent actual stories, not lifetime counters",()=>{
 const first=evaluateProgrammeSignals([a(15)],15);
 assert.ok(first.heat!==null&&first.heat>50);
 assert.equal(first.repetition,0);
 const repeated=evaluateProgrammeSignals([a(15),a(16)],16);
 assert.ok(repeated.repetition>0);
 assert.ok(repeated.heat!==null);
 const fresh=evaluateProgrammeSignals([a(15),a(16,"MATCH:a|b")],16);
 assert.equal(fresh.repetition,0);
});
test("invalid future events fail closed and no stories leave heat unknown",()=>{
 assert.equal(evaluateProgrammeSignals([],4).heat,null);
 assert.throws(()=>evaluateProgrammeSignals([a(6)],4),/Invalid completed/);
 assert.ok(evaluateProgrammeSignals([a(0)],9).heat!<50);
});
