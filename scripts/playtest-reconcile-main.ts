/** Trusted operator only: add missing authentic Genesis identities to the
 * already-existing rebuild main World. Does not reset, delete or advance time.
 */
import {readFile,stat} from "node:fs/promises";
import {postgresPool} from "../src/db/postgres.js";
import {reconcileOriginalMainGenesis} from "../src/db/reconcile-original-main-genesis.js";
import {inspectPlaytestPopulation} from "../src/db/playtest-preview-readiness.js";
import {requirePreviewGenesisPermission,parsePreviewGenesisArgs}
 from "../src/domain/playtest-genesis-permission.js";
import type {OriginalGenesisSource} from "../src/domain/original-genesis-projection.js";

async function main(){
 if(process.argv.includes("--help")){
  console.log("PPW_PLAYTEST_DB_URL=<rebuild-main-DSN> "+
   "PPW_PLAYTEST_WORLD_ID=<world> PPW_GENESIS_RECONCILE_AUTHORIZED=YES "+
   "npm run playtest:reconcile-main -- "+
   "--world <world> --source <original-main-fresh-Genesis.json> "+
   "--confirm-world <world> --confirm-host <rebuild-main-DB-hostname>");
  return;
 }
 const args=parsePreviewGenesisArgs(process.argv.slice(2));
 const dsn=process.env.PPW_PLAYTEST_DB_URL??"";
 if(!dsn)throw new Error("Missing dedicated PPW_PLAYTEST_DB_URL");
 const uri=new URL(dsn);
 if(!["postgres:","postgresql:"].includes(uri.protocol)||!uri.hostname)
  throw new Error("Invalid rebuild PostgreSQL URI");
 requirePreviewGenesisPermission({
  worldId:args.worldId,databaseHost:uri.hostname,
  approved:process.env.PPW_GENESIS_RECONCILE_AUTHORIZED,
  expectedWorld:process.env.PPW_PLAYTEST_WORLD_ID,
  confirmationWorld:args.confirmationWorld,confirmationHost:args.confirmationHost
 });
 const info=await stat(args.source);
 if(!info.isFile()||info.size<100||info.size>16_000_000)
  throw new Error("The authentic source file must be under 16 MB");
 const data=JSON.parse(await readFile(args.source,"utf8")) as OriginalGenesisSource;
 if(data.world?.id!==args.worldId)
  throw new Error("Rebuild World and original-main Genesis source differ");
 const db=postgresPool(dsn,2);
 try{
  const restored=await reconcileOriginalMainGenesis(db.pool,data);
  const checked=await inspectPlaytestPopulation(db.pool,args.worldId);
  console.log(JSON.stringify({
   result:"MAIN_WORLD_GENESIS_RECONCILED",databaseHost:uri.hostname,
   ...restored,ready:checked.ready,remainingIssues:checked.issues
  }));
  if(!checked.ready)process.exitCode=2;
 }finally{await db.close();}
}
main().catch(e=>{
 console.error(e instanceof Error?e.message:"Genesis reconciliation failed");
 process.exitCode=1;
});
