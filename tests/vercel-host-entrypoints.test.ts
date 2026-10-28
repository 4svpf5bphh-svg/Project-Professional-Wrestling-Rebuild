import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";

test("every registered host API route has a Vercel function entrypoint",()=>{
 const host=readFileSync("src/web/ppw-host-api.ts","utf8");
 const allowlist=host.match(/if\(!\[(.*?)\]\.includes\(path\)\)/s);
 assert.ok(allowlist,"Find the server's explicit route allowlist");
 const names=[...allowlist[1]!.matchAll(/"\/api\/([a-z-]+)"/g)].map(m=>m[1]!);
 assert.ok(names.length>=13,"The API route allowlist was not fully parsed");
 assert.equal(new Set(names).size,names.length);
 for(const name of names){
  const path="api/"+name+".ts";
  assert.ok(existsSync(path),"Missing Vercel endpoint: /api/"+name);
  const source=readFileSync(path,"utf8");
  assert.match(source,/handleVercelNodeRequest/,"Missing host adapter: "+path);
  assert.match(source,/export default function handler/,"Missing default handler: "+path);
 }
});
