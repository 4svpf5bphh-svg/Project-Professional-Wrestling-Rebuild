/** Read-only preview population and multiplayer availability check.
 * It makes no changes and never uses the live application's DATABASE_URL.
 */
import {postgresPool} from "../src/db/postgres.js";
import {inspectPlaytestPopulation} from "../src/db/playtest-preview-readiness.js";
import {parsePlaytestWeekArgs} from "../src/domain/playtest-week-operator.js";

async function main(){
 if(process.argv.includes("--help")){
  console.log("PPW_PLAYTEST_DB_URL=<isolated DSN> npm run playtest:preflight -- --world <id>");
  return;
 }
 const args=parsePlaytestWeekArgs(process.argv.slice(2));
 if(args.resolve)throw new Error("Preflight is read-only; omit resolution options");
 const dsn=process.env.PPW_PLAYTEST_DB_URL;
 if(!dsn)throw new Error("An explicit isolated PPW_PLAYTEST_DB_URL is required");
 const url=new URL(dsn);
 if(!["postgres:","postgresql:"].includes(url.protocol)||!url.hostname)
  throw new Error("Invalid isolated PostgreSQL connection");
 const db=postgresPool(dsn,2);
 try{
  const checked=await inspectPlaytestPopulation(db.pool,args.worldId);
  console.log(JSON.stringify({
   databaseHost:url.hostname,ready:checked.ready,issues:checked.issues,
   world:checked.counts
  },null,2));
  if(!checked.ready)process.exitCode=2;
 }finally{await db.close();}
}
main().catch(e=>{
 console.error(e instanceof Error?e.message:"Preview preflight failed");
 process.exitCode=1;
});
