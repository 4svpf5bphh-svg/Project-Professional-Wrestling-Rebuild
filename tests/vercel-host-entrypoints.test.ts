import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync,readdirSync} from "node:fs";

test("all host routes are deployed and the Hobby plan stays below twelve functions",()=>{
 const host=readFileSync("src/web/ppw-host-api.ts","utf8");
 const match=host.match(/if\(!\[(.*?)\]\.includes\(path\)\)/s);
 assert.ok(match,"Find the server's explicit API allowlist");
 const names=[...match[1]!.matchAll(/"\/api\/([a-z-]+)"/g)].map(x=>x[1]!);
 assert.ok(names.length>=13,"Host routes not completely parsed");
 assert.equal(new Set(names).size,names.length);

 const config=JSON.parse(readFileSync("vercel.json","utf8")) as {
  rewrites?:Array<{source:string;destination:string}>;
 };
 const functions=readdirSync("api").filter(x=>x.endsWith(".ts")&&!x.endsWith(".d.ts"));
 assert.ok(functions.length<=12,
  "Vercel Hobby supports at most twelve serverless functions: "+functions.length);
 for(const route of names){
  const pathname="/api/"+route;
  const direct="api/"+route+".ts";
  let handler=direct;
  if(!existsSync(direct)){
   const rewrite=config.rewrites?.find(x=>x.source===pathname);
   assert.ok(rewrite,"Missing Vercel function or rewrite for "+pathname);
   const target=new URL(rewrite.destination,"https://ppw.test");
   assert.equal(target.pathname,"/api/identity");
   assert.equal(target.searchParams.get("route"),route,
    "Each rewritten identity request must retain its exact authorised route");
   handler="api/identity.ts";
  }
  assert.ok(existsSync(handler),"Missing Vercel function: "+handler);
  const code=readFileSync(handler,"utf8");
  assert.match(code,/handleVercelNodeRequest/);
  assert.match(code,/export default function handler/);
 }
 assert.match(host,/searchParams\.get\("route"\)/,
  "Shared Vercel function must restore the original authorised route");
});

test("AI benchmark preview has a fixture-only admin path; non-benchmark writes remain blocked",()=>{
 const host=readFileSync("src/web/ppw-host-api.ts","utf8");
 assert.match(host,/benchmarkOperator&&body\.action!=="RATE_AI_LAB_RUN"/);
 assert.match(host,/benchmarkOperator&&\(typeof body\.benchmarkId!=="string"/);
 assert.match(host,/!normalOperator&&!benchmarkOperator/);
 assert.match(host,/if\(!manualPlaytestEnabled\(process\.env,cfg\.worldId,user\.playerId\)\)/,
  "Manual World advancement must retain the main-only permission");
 const deployment=JSON.parse(readFileSync("vercel.json","utf8")) as {
  git?:{deploymentEnabled?:Record<string,boolean>}};
 assert.equal(deployment.git?.deploymentEnabled?.["**"],false,
  "Feature branches must not deploy automatically");
});
