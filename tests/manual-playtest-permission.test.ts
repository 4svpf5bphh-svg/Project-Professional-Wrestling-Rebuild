import assert from "node:assert/strict";
import test from "node:test";
import {manualPlaytestEnabled} from "../src/domain/manual-playtest-permission.js";

const env:Record<string,string|undefined>={
 VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"main",
 PPW_MANUAL_ADVANCE_ENABLED:"YES",PPW_MAIN_WORLD_APPROVED:"YES",
 PPW_MAIN_WORLD_ID:"world-20261017",PPW_MANUAL_OPERATOR_ID:"owner"
};
test("only the verified rebuild main preview operator can manually resolve a week",()=>{
 assert.equal(manualPlaytestEnabled(env,"world-20261017","owner"),true);
 for(const variation of [
  {VERCEL_ENV:"production"},
  {VERCEL_ENV:"development"},
  {VERCEL_GIT_COMMIT_REF:"alpha-1a"},
  {PPW_MANUAL_ADVANCE_ENABLED:undefined},
  {PPW_MANUAL_ADVANCE_ENABLED:"NO"},
  {PPW_MAIN_WORLD_APPROVED:undefined},
  {PPW_MAIN_WORLD_ID:"original-world"},
  {PPW_MANUAL_OPERATOR_ID:undefined}
 ])assert.equal(manualPlaytestEnabled({...env,...variation},"world-20261017","owner"),false);
 for(const actor of ["guest","anonymous",""])
  assert.equal(manualPlaytestEnabled(env,"world-20261017",actor),false);
 assert.equal(manualPlaytestEnabled(env,"other-world","owner"),false);
});
