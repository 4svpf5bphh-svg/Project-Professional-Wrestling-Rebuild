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
  /hosted World|hosted database|configuration/i);
});
test("a generic Vercel preview is blocked rather than inheriting production Neon credentials",()=>{
 assert.throws(()=>requireIsolatedPreviewHost({
  VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"alpha/playtest-iphone-20261020"
 },url,"ppw-playtest-one"),/configuration is incomplete/);
});
test("production and preview on main require explicit approval of the same World and database",()=>{
 const main={
  VERCEL_GIT_COMMIT_REF:"main",
  PPW_MAIN_WORLD_APPROVED:"YES",
  PPW_MAIN_DB_HOST:"rebuild-main.db.example",
  PPW_MAIN_DB_NAME:"neondb",
  PPW_MAIN_WORLD_ID:"world-20261017"
 };
 const db="postgresql://placeholder@rebuild-main.db.example/neondb";
 for(const VERCEL_ENV of ["preview","production"]){
  assert.doesNotThrow(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV},db,"world-20261017"));
  for(const patch of [
   {PPW_MAIN_WORLD_APPROVED:undefined},
   {PPW_MAIN_WORLD_ID:"wrong"},
   {PPW_MAIN_DB_HOST:"old-project.db.example"},
   {PPW_MAIN_DB_NAME:"other"},
   {VERCEL_GIT_COMMIT_REF:"alpha-1a"}
  ])assert.throws(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV,...patch},db,"world-20261017"),/hosted World|hosted database/);
  assert.throws(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV},db.replace("rebuild-main.db.example","old-project.db.example"),"world-20261017"),/hosted database/);
  assert.throws(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV},db,"wrong"),/hosted World/);
 }
});
test("unknown production Git branches and generic previews cannot access the main World",()=>{
 for(const branch of ["alpha-1a","feature/experiment","alpha/playtest-legacy"]){
  assert.throws(()=>requireIsolatedPreviewHost({
   VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:branch,
   PPW_MAIN_WORLD_APPROVED:"YES",PPW_MAIN_WORLD_ID:"world-20261017",
   PPW_MAIN_DB_HOST:"rebuild-main.db.example",PPW_MAIN_DB_NAME:"neondb"
  },"postgresql://placeholder@rebuild-main.db.example/neondb","world-20261017"),/hosted World/);
 }
});
test("CI and local execution remain free of hosted deployment restrictions",()=>{
 for(const mode of [undefined,"development"]){
  assert.doesNotThrow(()=>requireIsolatedPreviewHost({
   VERCEL_ENV:mode,VERCEL_GIT_COMMIT_REF:"main"
  },"postgresql://some-other-host/legacy","disposable-test-world"));
 }
});
