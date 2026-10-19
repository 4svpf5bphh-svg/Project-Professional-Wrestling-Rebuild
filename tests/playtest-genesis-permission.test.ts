import test from "node:test";
import assert from "node:assert/strict";
import {parsePreviewGenesisArgs,requirePreviewGenesisPermission}
 from "../src/domain/playtest-genesis-permission.js";
const args=["--world","rebuild-fresh","--source","/tmp/genesis.json",
 "--confirm-world","rebuild-fresh","--confirm-host","isolated.example"];
const scope={worldId:"rebuild-fresh",databaseHost:"isolated.example",
 approved:"YES",expectedWorld:"rebuild-fresh",
 confirmationWorld:"rebuild-fresh",confirmationHost:"isolated.example"};
test("offline import requires the specific file, World and database host",()=>{
 assert.deepEqual(parsePreviewGenesisArgs(args),{
  worldId:"rebuild-fresh",source:"/tmp/genesis.json",
  confirmationWorld:"rebuild-fresh",confirmationHost:"isolated.example"});
 assert.doesNotThrow(()=>requirePreviewGenesisPermission(scope));
 for(const invalid of [
  args.slice(0,6),
  [...args,"--source","another.json"],
  ["--world","original","--source","x","--confirm-world","original",
   "--confirm-host","isolated.example","--unexpected","Y"],
 ])assert.throws(()=>parsePreviewGenesisArgs(invalid));
});
test("import never silently falls back to the live application database or another World",()=>{
 for(const change of [
  {approved:undefined},{approved:"NO"},
  {expectedWorld:"original"},{confirmationWorld:"different"},
  {confirmationHost:"original.example"},
  {databaseHost:"another.example"},{worldId:"../bad"}
 ])assert.throws(()=>requirePreviewGenesisPermission({...scope,...change}),
  /explicit Genesis import approval/);
});
