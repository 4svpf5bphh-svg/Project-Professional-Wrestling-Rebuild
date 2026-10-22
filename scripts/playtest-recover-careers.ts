/** Safe operator-only recovery after applying migration 0085.
 * No API route, auto-run, cron, deployment hook or database reset.
 */
import {readFile,stat} from "node:fs/promises";
import {postgresPool} from "../src/db/postgres.js";
import {recoverOriginalMainCareerBaselines}
 from "../src/db/recover-original-career-baselines.js";
import {requirePreviewGenesisPermission,parsePreviewGenesisArgs}
 from "../src/domain/playtest-genesis-permission.js";
import type {OriginalGenesisSource}
 from "../src/domain/original-genesis-projection.js";
async function main(){
 if(process.argv.includes("--help")){
  console.log("PPW_PLAYTEST_DB_URL=<rebuild-dsn> PPW_PLAYTEST_WORLD_ID=<world>"+
   " PPW_CAREER_BASELINE_RECOVERY_AUTHORIZED=YES npm run playtest:recover-careers"+
   " -- --world <world> --source <fresh-original-main-Genesis.json>"+
   " --confirm-world <world> --confirm-host <rebuild-db-hostname>");
  return;
 }
 const args=parsePreviewGenesisArgs(process.argv.slice(2));
 const dsn=process.env.PPW_PLAYTEST_DB_URL??"";
 if(!dsn)throw new Error("Missing dedicated rebuild PostgreSQL DSN");
 const uri=new URL(dsn);
 if(!["postgres:","postgresql:"].includes(uri.protocol)||!uri.hostname)
  throw new Error("Invalid rebuild PostgreSQL URI");
 requirePreviewGenesisPermission({
  worldId:args.worldId,databaseHost:uri.hostname,
  approved:process.env.PPW_CAREER_BASELINE_RECOVERY_AUTHORIZED,
  expectedWorld:process.env.PPW_PLAYTEST_WORLD_ID,
  confirmationWorld:args.confirmationWorld,
  confirmationHost:args.confirmationHost
 });
 const info=await stat(args.source);
 if(!info.isFile()||info.size<100||info.size>16_000_000)
  throw new Error("Authentic source must be a regular file smaller than 16MB");
 const source=JSON.parse(await readFile(args.source,"utf8")) as OriginalGenesisSource;
 if(source.world?.id!==args.worldId)
  throw new Error("World and original-main source do not match");
 const db=postgresPool(dsn,2);
 try{
  const receipt=await recoverOriginalMainCareerBaselines(db.pool,source);
  console.log(JSON.stringify({result:"ORIGINAL_MAIN_CAREERS_RECOVERED",
   databaseHost:uri.hostname,...receipt}));
 }finally{await db.close();}
}
main().catch(error=>{
 console.error(error instanceof Error?error.message:"Career recovery refused");
 process.exitCode=1;
});
