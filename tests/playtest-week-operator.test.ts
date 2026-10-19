import test from "node:test";
import assert from "node:assert/strict";
import {parsePlaytestWeekArgs,confirmPlaytestResolution,oneShotResolutionId}
 from "../src/domain/playtest-week-operator.js";
const inspect=parsePlaytestWeekArgs(["--world","rebuild-alpha"]);
const approved=parsePlaytestWeekArgs(["--world","rebuild-alpha","--resolve",
 "--confirm-world","rebuild-alpha","--confirm-host","isolated.db.example"]);
const config={approved:"YES",configuredWorld:"rebuild-alpha",
 actualHost:"isolated.db.example"};
const due={phase:"OPEN",due:true,year:1,week:4};
test("playtest tool is read-only unless a separate explicit resolve flag is given",()=>{
 assert.deepEqual(inspect,{worldId:"rebuild-alpha",resolve:false,
  confirmWorld:null,confirmHost:null});
 assert.throws(()=>confirmPlaytestResolution(inspect,config,due),/Inspect mode/);
 assert.throws(()=>parsePlaytestWeekArgs(["--world","rebuild-alpha","--resolve"]),
  /exact --confirm-world/);
 for(const invalid of [
  ["--world","world","--world","other"],
  ["--world","world","--danger"],
  ["--world","../original"],
  ["--world",""],
 ])assert.throws(()=>parsePlaytestWeekArgs(invalid));
});
test("no unauthorised operator may lock a World or use an unconfirmed database host",()=>{
 assert.doesNotThrow(()=>confirmPlaytestResolution(approved,config,due));
 for(const change of [
  {approved:"NO"},{approved:undefined},
  {configuredWorld:"another"},{actualHost:"other.db.example"}
 ])assert.throws(()=>confirmPlaytestResolution(approved,{...config,...change},due),
  /operator approval/);
 assert.throws(()=>confirmPlaytestResolution({...approved,confirmWorld:"different"},
  config,due),/operator approval/);
});
test("single deadline and World phase cannot be overridden by an operator",()=>{
 assert.throws(()=>confirmPlaytestResolution(approved,config,{...due,due:false}),
  /deadline has not arrived/);
 assert.throws(()=>confirmPlaytestResolution(approved,config,{...due,phase:"CLOSED"}),
  /cannot be manually resolved/);
 assert.doesNotThrow(()=>confirmPlaytestResolution(approved,config,{...due,phase:"LOCKED"}));
 assert.doesNotThrow(()=>confirmPlaytestResolution(approved,config,{...due,phase:"RESOLVING"}));
 assert.throws(()=>confirmPlaytestResolution(approved,config,{...due,week:53}),/Invalid World/);
 assert.equal(oneShotResolutionId("rebuild-alpha",1,4),
  oneShotResolutionId("rebuild-alpha",1,4),
  "A retry reuses the same stage receipt identity");
 assert.notEqual(oneShotResolutionId("rebuild-alpha",1,4),
  oneShotResolutionId("rebuild-alpha",1,5));
});
