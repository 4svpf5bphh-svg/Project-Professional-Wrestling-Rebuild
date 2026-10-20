import test from "node:test";
import assert from "node:assert/strict";
import {requireIsolatedPreviewHost}
 from "../src/domain/preview-host-isolation.js";

const env={
 VERCEL_ENV:"preview",
 VERCEL_GIT_COMMIT_REF:"alpha/playtest-iphone-20261020",
 PPW_PREVIEW_ISOLATED:"YES",
 PPW_PREVIEW_GIT_BRANCH:"alpha/playtest-iphone-20261020",
 PPW_PREVIEW_DB_HOST:"branch-only.db.example",
 PPW_PREVIEW_DB_NAME:"ppw-playtest",
 PPW_PREVIEW_WORLD_ID:"ppw-playtest-one"
};
const url="postgresql://not-a-secret:placeholder@branch-only.db.example:5432/ppw-playtest";
test("only exactly approved preview branch, database and World can initialise the host",()=>{
 assert.doesNotThrow(()=>requireIsolatedPreviewHost(env,url,"ppw-playtest-one"));
 for(const [change,db,world] of [
  [{PPW_PREVIEW_ISOLATED:undefined},url,"ppw-playtest-one"],
  [{PPW_PREVIEW_WORLD_ID:"another"},url,"ppw-playtest-one"],
  [{PPW_PREVIEW_GIT_BRANCH:"alpha/playtest-another"},url,"ppw-playtest-one"],
  [{VERCEL_GIT_COMMIT_REF:"main"},url,"ppw-playtest-one"],
  [{VERCEL_GIT_COMMIT_REF:"alpha/neon-cost-probe-20261018"},url,"ppw-playtest-one"],
  [{},url,"another-world"],
  [{},url.replace("branch-only.db.example","other.db.example"),"ppw-playtest-one"],
  [{},url.replace("ppw-playtest","live-production"),"ppw-playtest-one"],
  [{},url.replace("branch-only.db.example","localhost"),"ppw-playtest-one"]
 ] as const)assert.throws(()=>requireIsolatedPreviewHost({...env,...change},db,world),
  /isolated preview|database|configuration/i);
});
test("a generic Vercel preview is blocked rather than inheriting production Neon credentials",()=>{
 assert.throws(()=>requireIsolatedPreviewHost({
  VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"alpha/playtest-iphone-20261020"
 },url,"ppw-playtest-one"),/configuration is incomplete/);
});
test("production, CI and local runs are not accidentally reconfigured as preview",()=>{
 for(const mode of [undefined,"development","production"]){
  assert.doesNotThrow(()=>requireIsolatedPreviewHost({
   VERCEL_ENV:mode,VERCEL_GIT_COMMIT_REF:"main"
  },"postgresql://some-other-host/legacy","original-world"));
 }
});
