/** Explicit, one-time, isolated Genesis import from an offline original-main
 * fresh-world export. NEVER reads the original database or creates a host route.
 * Source schema and completeness are checked before any PostgreSQL connection.
 */
import {readFile,stat} from "node:fs/promises";
import {postgresPool} from "../src/db/postgres.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {projectOriginalGenesis,type OriginalGenesisSource}
 from "../src/domain/original-genesis-projection.js";
import {requirePreviewGenesisPermission,parsePreviewGenesisArgs}
 from "../src/domain/playtest-genesis-permission.js";

async function main(){
 if(process.argv.includes("--help")){
  console.log("PPW_PLAYTEST_DB_URL=<isolated DSN> PPW_PLAYTEST_WORLD_ID=<id> "+
   "PPW_GENESIS_IMPORT_AUTHORIZED=YES npm run playtest:genesis -- "+
   "--world <id> --source <fresh-original-main-export.json> "+
   "--confirm-world <id> --confirm-host <db-hostname>");
  return;
 }
 const args=parsePreviewGenesisArgs(process.argv.slice(2));
 const dsn=process.env.PPW_PLAYTEST_DB_URL;
 if(!dsn)throw new Error("Missing explicit isolated PPW_PLAYTEST_DB_URL");
 const uri=new URL(dsn);
 if(!["postgres:","postgresql:"].includes(uri.protocol)||!uri.hostname)
  throw new Error("Invalid isolated database URI");
 requirePreviewGenesisPermission({
  worldId:args.worldId,databaseHost:uri.hostname,
  approved:process.env.PPW_GENESIS_IMPORT_AUTHORIZED,
  expectedWorld:process.env.PPW_PLAYTEST_WORLD_ID,
  confirmationWorld:args.confirmationWorld,
  confirmationHost:args.confirmationHost
 });
 const file=await stat(args.source);
 if(!file.isFile()||file.size>16_000_000||file.size<100)
  throw new Error("Fresh Genesis source must be a local JSON file under 16 MB");
 const raw=await readFile(args.source,"utf8");
 const input=JSON.parse(raw) as OriginalGenesisSource;
 if(!input||input.world?.id!==args.worldId)
  throw new Error("Original Genesis source does not match the isolated World");
 const checked=projectOriginalGenesis(input);
 if(checked.people.length<400||checked.promotions.length<4)
  throw new Error("Do not initialise a player preview from a toy/test World");
 // A validated source is not permission to overwrite an existing World.
 // The imported rows are one atomic transaction with a unique World key.
 const db=postgresPool(dsn,2);
 try{
  const created=await importOriginalGenesis(db.pool,input);
  console.log(JSON.stringify({status:"GENESIS_CREATED",databaseHost:uri.hostname,
   worldId:created.worldId,promotions:created.promotions,
   wrestlers:created.people,venues:created.venues,contracts:created.contracts,
   championships:created.championships}));
 }finally{await db.close();}
}
main().catch(e=>{
 console.error(e instanceof Error?e.message:"Genesis import was not completed");
 process.exitCode=1;
});
