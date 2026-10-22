import test from "node:test";
import assert from "node:assert/strict";
import {originalWeeklyMorale} from "../src/domain/living-career.js";
test("a popular but repeatedly unused main eventer loses morale",()=>{
 const base={morale:80,momentum:50,fatigue:10,injured:false,
  contracts:[{role:"MAIN_EVENT" as const,used:false,hadVerifiedShow:true,
   distress:"HEALTHY" as const,inactive:false}]};
 assert.ok(originalWeeklyMorale(base)<80);
 assert.ok(originalWeeklyMorale({...base,contracts:[{...base.contracts[0]!,used:true}]})>
  originalWeeklyMorale(base));
});
test("injured performers do not suffer artificial no-show penalty",()=>{
 const contract={role:"MAIN_EVENT" as const,used:false,hadVerifiedShow:true,
  distress:"HEALTHY" as const,inactive:false};
 const a=originalWeeklyMorale({morale:60,momentum:50,fatigue:20,injured:true,
  contracts:[contract]});
 const b=originalWeeklyMorale({morale:60,momentum:50,fatigue:20,injured:true,
  contracts:[]});
 assert.equal(a,b);
});
