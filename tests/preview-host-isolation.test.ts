import test from "node:test";
import assert from "node:assert/strict";
import {requireIsolatedPreviewHost}
 from "../src/domain/preview-host-isolation.js";

const main={
 VERCEL_GIT_COMMIT_REF:"main",
 PPW_MAIN_WORLD_APPROVED:"YES",
 PPW_MAIN_DB_HOST:"rebuild-main.db.example",
 PPW_MAIN_DB_NAME:"neondb",
 PPW_MAIN_WORLD_ID:"world-20261017"
};
const db="postgresql://placeholder@rebuild-main.db.example/neondb";
test("only the exact approved main World, DB host and DB name may start",()=>{
 for(const VERCEL_ENV of ["preview","production"]){
  assert.doesNotThrow(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV},db,"world-20261017"));
  for(const patch of [
   {PPW_MAIN_WORLD_APPROVED:undefined},
   {PPW_MAIN_WORLD_ID:"wrong"},
   {PPW_MAIN_DB_HOST:"old-project.db.example"},
   {PPW_MAIN_DB_NAME:"other"},
   {VERCEL_GIT_COMMIT_REF:"alpha-1a"},
   {VERCEL_GIT_COMMIT_REF:"alpha/playtest-iphone-20261020"},
   {VERCEL_GIT_COMMIT_REF:"alpha/neon-cost-probe-20261018"},
   {VERCEL_GIT_COMMIT_REF:undefined}
  ])assert.throws(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV,...patch},db,"world-20261017"),/hosted main World|hosted main database/);
  assert.throws(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV},db.replace("rebuild-main.db.example","old-project.db.example"),"world-20261017"),/hosted main database/);
  assert.throws(()=>requireIsolatedPreviewHost({...main,VERCEL_ENV},db,"wrong"),/hosted main World/);
 }
});
test("generic Vercel previews and all nonmain Git branches fail closed",()=>{
 for(const ref of ["alpha-1a","feature/something","alpha/playtest-legacy","alpha/neon-cost-probe-20261018","main-old"]){
  assert.throws(()=>requireIsolatedPreviewHost({
   VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:ref,
   PPW_MAIN_WORLD_APPROVED:"YES",PPW_MAIN_WORLD_ID:"world-20261017",
   PPW_MAIN_DB_HOST:"rebuild-main.db.example",PPW_MAIN_DB_NAME:"neondb",
   PPW_PREVIEW_ISOLATED:"YES",PPW_PREVIEW_GIT_BRANCH:ref
  },db,"world-20261017"),/hosted main World/);
 }
 assert.throws(()=>requireIsolatedPreviewHost({
  VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"main"
 },db,"world-20261017"),/hosted main World/);
});
test("CI and local execution remain unrestricted by hosted Vercel guard",()=>{
 for(const mode of [undefined,"development"]){
  assert.doesNotThrow(()=>requireIsolatedPreviewHost({
   VERCEL_ENV:mode,VERCEL_GIT_COMMIT_REF:"main"
  },"postgresql://some-other-host/legacy","disposable-test-world"));
 }
});

test("dedicated benchmark preview only connects to its independently named host",()=>{
 const preview={
  ...main,VERCEL_ENV:"preview",
  VERCEL_GIT_COMMIT_REF:"phase43-ai-benchmark-safe-preview",
  PPW_AI_BENCHMARK_PREVIEW:"YES",
  PPW_AI_BENCHMARK_WORLD_ID:"world-20261017",
  PPW_AI_BENCHMARK_DB_HOST:"isolated-benchmark.db.example",
  PPW_AI_BENCHMARK_DB_NAME:"neondb"
 };
 const isolated="postgresql://test:secret@isolated-benchmark.db.example/neondb?sslmode=require";
 assert.doesNotThrow(()=>requireIsolatedPreviewHost(preview,isolated,"world-20261017"));
 for(const patch of [
  {PPW_AI_BENCHMARK_PREVIEW:undefined},
  {PPW_AI_BENCHMARK_PREVIEW:"NO"},
  {PPW_AI_BENCHMARK_WORLD_ID:"other-world"},
  {PPW_AI_BENCHMARK_DB_HOST:"rebuild-main.db.example"},
  {PPW_AI_BENCHMARK_DB_HOST:undefined},
  {PPW_AI_BENCHMARK_DB_NAME:"other"}
 ])assert.throws(()=>requireIsolatedPreviewHost({...preview,...patch},
  isolated,"world-20261017"),/benchmark/);
 for(const bad of [
  db,"postgresql://test@isolated-benchmark.db.example/wrong",
  "postgresql://test@isolated-benchmark.db.example/neondb?host=rebuild-main.db.example",
  "postgresql://test@isolated-benchmark.db.example/neondb?dbname=other"
 ])assert.throws(()=>requireIsolatedPreviewHost(preview,bad,"world-20261017"),/benchmark/);
 assert.throws(()=>requireIsolatedPreviewHost({...preview,VERCEL_ENV:"production"},
  isolated,"world-20261017"),/hosted main World/);
 assert.throws(()=>requireIsolatedPreviewHost({...preview,
  VERCEL_GIT_COMMIT_REF:"some-other-branch"},isolated,"world-20261017"),/hosted main World/);
});
